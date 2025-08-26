import * as cron from 'node-cron';
import { AirtableService } from './airtable';
import { Logger } from './logger';
import { createCountyScraper, PuppeteerCountyScraper } from './county-scraper';
import { storage } from '../storage';

export class SchedulerService {
  private airtableService: AirtableService;
  private isRunning = false;
  private scheduledTask: any | null = null;
  private currentSchedule = '0 6 * * *'; // Default: 6:00 AM daily
  private currentTimezone = 'PT'; // Default: Pacific Time

  constructor() {
    this.airtableService = new AirtableService();
  }

  async start() {
    // Load saved schedule if exists
    const savedSchedule = await storage.getScheduleConfig();
    if (savedSchedule) {
      this.currentSchedule = savedSchedule.cronExpression;
      this.currentTimezone = savedSchedule.timezone || 'PT';
    }

    // Schedule the task
    this.scheduleTask();
    
    const scheduleTime = this.getHumanReadableSchedule();
    await Logger.info(`Scheduler started - ${scheduleTime}`, 'scheduler');
  }

  private scheduleTask() {
    // Stop existing task if any
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    // Create new scheduled task
    this.scheduledTask = cron.schedule(this.currentSchedule, async () => {
      await this.runAutomation('scheduled');
    });
  }

  async updateSchedule(hour: number, minute: number, timezone: string = 'PT'): Promise<void> {
    // Create cron expression (minute hour * * *)
    const cronExpression = `${minute} ${hour} * * *`;
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid schedule time');
    }

    // Update the schedule
    this.currentSchedule = cronExpression;
    this.currentTimezone = timezone;
    
    // Save to storage
    await storage.saveScheduleConfig({ 
      cronExpression,
      hour,
      minute,
      timezone,
      updatedAt: new Date()
    });

    // Reschedule the task
    this.scheduleTask();
    
    const scheduleTime = this.getHumanReadableSchedule();
    await Logger.info(`Schedule updated to ${scheduleTime} ${timezone}`, 'scheduler');
  }

  getScheduleInfo(): { cronExpression: string; hour: number; minute: number; timezone: string; humanReadable: string } {
    // Parse the cron expression to get hour and minute
    const parts = this.currentSchedule.split(' ');
    const minute = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    
    return {
      cronExpression: this.currentSchedule,
      hour,
      minute,
      timezone: this.currentTimezone,
      humanReadable: this.getHumanReadableSchedule()
    };
  }

  private getHumanReadableSchedule(): string {
    const parts = this.currentSchedule.split(' ');
    const minute = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    return `daily runs at ${timeStr}`;
  }

  async runAutomation(type: 'scheduled' | 'manual', fromDate?: string, toDate?: string): Promise<void> {
    if (this.isRunning) {
      await Logger.warning('Automation already running, skipping', 'scheduler');
      return;
    }

    this.isRunning = true;
    
    const runId = await storage.createAutomationRun({
      type,
      status: 'running',
      startTime: new Date(),
      metadata: JSON.stringify({ startedBy: type, fromDate, toDate })
    });

    try {
      await Logger.info(`Starting ${type} automation run`, 'scheduler', { runId });

      // Step 1: Get active counties
      const activeCounties = await storage.getActiveCounties();
      if (activeCounties.length === 0) {
        await Logger.warning('No active counties configured', 'scheduler');
        await storage.updateAutomationRun(runId, {
          status: 'completed',
          endTime: new Date(),
          liensFound: 0,
          liensProcessed: 0,
          liensOver20k: 0
        });
        return;
      }

      let totalLiensFound = 0;
      let totalLiensProcessed = 0;
      const allScrapers: any[] = [];

      // Step 2: Scrape each county
      for (const county of activeCounties) {
        try {
          await Logger.info(`Starting lien scraping for ${county.name}, ${county.state}`, 'scheduler');
          
          // Create county run record
          const countyRunId = await storage.createCountyRun({
            countyId: county.id,
            automationRunId: runId,
            status: 'running',
            startTime: new Date(),
            metadata: JSON.stringify({ county: county.name, state: county.state })
          });

          // Create appropriate scraper for this county
          const countyConfigData = county.config as any || {};
          const countyConfig = {
            url: countyConfigData.baseUrl || 'https://legacy.recorder.maricopa.gov',
            searchUrl: countyConfigData.searchUrl || 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx',
            selectors: countyConfigData.selectors || {}
          };
          
          // Convert county to expected format for scraper
          const scrapingCounty = {
            id: county.id,
            name: county.name,
            state: county.state,
            website: countyConfigData.baseUrl || 'https://legacy.recorder.maricopa.gov',
            scraperEnabled: county.isActive,
            searchUrl: countyConfigData.searchUrl || 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx',
            selectors: countyConfigData.selectors || {}
          };
          
          const scraper = createCountyScraper(scrapingCounty, countyConfig) as PuppeteerCountyScraper;
          allScrapers.push(scraper);
          
          // Initialize the scraper
          await scraper.initialize();

          const scrapedLiens = await scraper.scrapeCountyLiens(fromDate, toDate);
          
          if (scrapedLiens.length > 0) {
            totalLiensFound += scrapedLiens.length;
            
            // Save liens to storage
            await scraper.saveLiens(scrapedLiens);
            
            // Update county run
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: scrapedLiens.length,
              liensProcessed: scrapedLiens.length
            });
          } else {
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: 0,
              liensProcessed: 0
            });
          }

        } catch (error) {
          await Logger.error(`Failed to scrape ${county.name}: ${error}`, 'scheduler');
          // Continue with other counties even if one fails
        }
      }

      // Step 3: Get all scraped liens for Airtable sync
      let allLiens: any[] = [];
      for (const scraper of allScrapers) {
        if (scraper.liens && scraper.liens.length > 0) {
          allLiens = allLiens.concat(scraper.liens);
        }
      }
      totalLiensProcessed = allLiens.length;

      // Step 4: Sync to Airtable
      if (allLiens.length > 0) {
        await Logger.info(`Syncing ${allLiens.length} liens to Airtable`, 'scheduler');
        
        // Transform liens to match Airtable service expectations
        const liensForAirtable = allLiens.map((lien: any) => ({
          recordingNumber: lien.recordingNumber,
          recordingDate: lien.recordingDate,
          documentUrl: lien.documentUrl,
          countyId: '1', // Use default county ID for now
          status: 'pending'
        }));
        
        await this.airtableService.syncLiensToAirtable(liensForAirtable);
      }

      // Step 5: Update automation run status
      await storage.updateAutomationRun(runId, {
        status: 'completed',
        endTime: new Date(),
        liensFound: totalLiensFound,
        liensProcessed: totalLiensProcessed,
        liensOver20k: 0 // Not tracking amounts anymore
      });

      await Logger.success(`Automation completed successfully. Found ${totalLiensFound} liens across ${activeCounties.length} counties, pushed ${totalLiensProcessed} to Airtable`, 'scheduler');

      // Cleanup all scrapers
      for (const scraper of allScrapers) {
        if (scraper.cleanup) {
          await scraper.cleanup();
        }
      }

      // TODO: Send Slack notification
      // TODO: Generate mailers for liens with addresses

    } catch (error) {
      await Logger.error(`Automation failed: ${error}`, 'scheduler');
      
      await storage.updateAutomationRun(runId, {
        status: 'failed',
        endTime: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });

    } finally {
      this.isRunning = false;
    }
  }

  isAutomationRunning(): boolean {
    return this.isRunning;
  }
}
