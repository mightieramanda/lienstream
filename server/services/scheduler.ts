import * as cron from 'node-cron';
import moment from 'moment-timezone';
import { AirtableService } from './airtable';
import { Logger } from './logger';
import { createCountyScraper, PuppeteerCountyScraper } from './county-scraper';
import { storage } from '../storage';

export class SchedulerService {
  private airtableService: AirtableService;
  private isRunning = false;
  private scheduledTask: any | null = null;
  private currentSchedule = '0 5 * * *'; // Default: 1:00 AM ET (5:00 AM UTC)
  private currentTimezone = 'ET'; // Default: Eastern Time
  private currentScrapers: PuppeteerCountyScraper[] = [];
  private currentRunId: string | null = null;
  private shouldStop = false;

  constructor() {
    this.airtableService = new AirtableService();
  }

  async start() {
    // Load saved schedule if exists
    const savedSchedule = await storage.getScheduleConfig();
    if (savedSchedule) {
      this.currentSchedule = savedSchedule.cronExpression;
      this.currentTimezone = savedSchedule.timezone || 'ET';
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
    // Important: node-cron runs in the system's local time (UTC on server)
    this.scheduledTask = cron.schedule(this.currentSchedule, async () => {
      await this.runAutomation('scheduled');
    });
  }

  async updateSchedule(hour: number, minute: number, timezone: string = 'ET'): Promise<void> {
    // Map timezone abbreviations to timezone names
    const timezoneMap: { [key: string]: string } = {
      'ET': 'America/New_York'
    };
    
    const tzName = timezoneMap[timezone] || 'America/New_York';
    
    // Get current date in the specified timezone
    const now = moment.tz(tzName);
    
    // Set the desired time
    const scheduledTime = now.clone().hour(hour).minute(minute).second(0);
    
    // If the time has already passed today, schedule for tomorrow
    if (scheduledTime.isBefore(now)) {
      scheduledTime.add(1, 'day');
    }
    
    // Convert to UTC for the cron job
    const utcTime = scheduledTime.clone().utc();
    const utcHour = utcTime.hour();
    const utcMinute = utcTime.minute();
    
    // Create cron expression using UTC time (since server runs in UTC)
    const cronExpression = `${utcMinute} ${utcHour} * * *`;
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid schedule time');
    }

    // Store the schedule
    this.currentSchedule = cronExpression;
    this.currentTimezone = timezone;
    
    // Save to storage with original local time
    await storage.saveScheduleConfig({ 
      cronExpression,
      hour,  // Original hour in selected timezone
      minute, // Original minute in selected timezone
      timezone,
      updatedAt: new Date()
    });

    // Reschedule the task
    this.scheduleTask();
    
    // Log both local time and UTC time for clarity
    const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    const isPM = hour >= 12;
    const localTime = `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'} ${timezone}`;
    const utcTimeStr = `${utcHour}:${utcMinute.toString().padStart(2, '0')} UTC`;
    await Logger.info(`Schedule updated to ${localTime} (runs at ${utcTimeStr})`, 'scheduler');
  }

  async getScheduleInfo(): Promise<{ cronExpression: string; hour: number; minute: number; timezone: string; humanReadable: string }> {
    // Get the saved schedule config to return the original local time
    const savedConfig = await storage.getScheduleConfig();
    
    if (savedConfig && savedConfig.hour !== undefined && savedConfig.minute !== undefined) {
      return {
        cronExpression: this.currentSchedule,
        hour: savedConfig.hour,
        minute: savedConfig.minute,
        timezone: this.currentTimezone,
        humanReadable: this.getHumanReadableSchedule()
      };
    }
    
    // Fallback: convert UTC cron time back to local timezone
    const parts = this.currentSchedule.split(' ');
    const utcMinute = parseInt(parts[0]);
    const utcHour = parseInt(parts[1]);
    
    const timezoneMap: { [key: string]: string } = {
      'PT': 'America/Los_Angeles',
      'CT': 'America/Chicago',
      'ET': 'America/New_York'
    };
    
    const tzName = timezoneMap[this.currentTimezone] || 'America/Los_Angeles';
    const utcTime = moment.utc().hour(utcHour).minute(utcMinute);
    const localTime = utcTime.tz(tzName);
    
    return {
      cronExpression: this.currentSchedule,
      hour: localTime.hour(),
      minute: localTime.minute(),
      timezone: this.currentTimezone,
      humanReadable: this.getHumanReadableSchedule()
    };
  }

  private getHumanReadableSchedule(): string {
    const parts = this.currentSchedule.split(' ');
    const minute = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    
    // Convert to 12-hour format with AM/PM
    const isPM = hour >= 12;
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12; // Handle midnight (0) and noon (12)
    
    const timeStr = `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
    return `daily runs at ${timeStr}`;
  }

  async runAutomation(type: 'scheduled' | 'manual', fromDate?: string, toDate?: string): Promise<void> {
    if (this.isRunning) {
      await Logger.warning('Automation already running, skipping', 'scheduler');
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.currentScrapers = [];
    
    // For scheduled runs, automatically use yesterday's date
    if (type === 'scheduled' && !fromDate && !toDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      toDate = fromDate; // Same date for both to get just that day's records
      await Logger.info(`Scheduled run: Processing records from ${fromDate}`, 'scheduler');
    }
    
    const runId = await storage.createAutomationRun({
      type,
      status: 'running',
      startTime: new Date(),
      metadata: JSON.stringify({ startedBy: type, fromDate, toDate })
    });
    
    this.currentRunId = runId;

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
        // Check if stop was requested
        if (this.shouldStop) {
          await Logger.info('Stopping automation as requested', 'scheduler');
          break;
        }
        
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
          this.currentScrapers.push(scraper);
          
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
      this.shouldStop = false;
      this.currentScrapers = [];
      this.currentRunId = null;
    }
  }

  isAutomationRunning(): boolean {
    return this.isRunning;
  }

  async stopAutomation(): Promise<void> {
    if (!this.isRunning) {
      await Logger.warning('No automation running to stop', 'scheduler');
      return;
    }

    this.shouldStop = true;
    await Logger.info('Stop requested - stopping automation gracefully', 'scheduler');

    // Close all scrapers
    for (const scraper of this.currentScrapers) {
      try {
        if (scraper.cleanup) {
          await scraper.cleanup();
        }
      } catch (error) {
        await Logger.error(`Error closing scraper: ${error}`, 'scheduler');
      }
    }

    // Update the current run status
    if (this.currentRunId) {
      await storage.updateAutomationRun(this.currentRunId, {
        status: 'stopped',
        endTime: new Date(),
        errorMessage: 'Stopped by user'
      });
    }

    // Reset state
    this.isRunning = false;
    this.shouldStop = false;
    this.currentScrapers = [];
    this.currentRunId = null;

    await Logger.info('Automation stopped successfully', 'scheduler');
  }

  getAutomationStatus() {
    return storage.getLatestAutomationRun();
  }
}
