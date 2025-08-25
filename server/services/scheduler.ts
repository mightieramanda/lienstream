import cron from 'node-cron';
import { AirtableService } from './airtable';
import { Logger } from './logger';
import { createCountyScraper, PuppeteerCountyScraper } from './county-scraper';
import { storage } from '../storage';

export class SchedulerService {
  private airtableService: AirtableService;
  private isRunning = false;

  constructor() {
    this.airtableService = new AirtableService();
  }

  async start() {
    // Schedule daily run at 6:00 AM
    cron.schedule('0 6 * * *', async () => {
      await this.runAutomation('scheduled');
    });

    await Logger.info('Scheduler started - daily runs at 6:00 AM', 'scheduler');
  }

  async runAutomation(type: 'scheduled' | 'manual', searchDate?: string): Promise<void> {
    if (this.isRunning) {
      await Logger.warning('Automation already running, skipping', 'scheduler');
      return;
    }

    this.isRunning = true;
    
    const runId = await storage.createAutomationRun({
      type,
      status: 'running',
      startTime: new Date(),
      metadata: JSON.stringify({ startedBy: type, searchDate })
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
          const countyConfig = {
            url: county.website,
            searchUrl: county.searchUrl,
            selectors: county.selectors || {}
          };
          const scraper = createCountyScraper(county, countyConfig) as PuppeteerCountyScraper;
          allScrapers.push(scraper);
          
          // Initialize the scraper
          await scraper.initialize();

          const scrapedLiens = await scraper.scrapeCountyLiens(searchDate);
          
          if (scrapedLiens.length > 0) {
            totalLiensFound += scrapedLiens.length;
            
            // Save liens to storage
            await scraper.saveLiens(scrapedLiens);
            
            // Update county run
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: scrapedLiens.length,
              liensProcessed: scrapedLiens.filter(l => l.amount >= 20000).length
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

      // Step 3: Get all scraped liens over $20,000 for Airtable sync
      let allLiensOver20k: any[] = [];
      for (const scraper of allScrapers) {
        if (scraper.liens && scraper.liens.length > 0) {
          const liensOver20k = scraper.liens.filter(l => l.amount >= 20000);
          allLiensOver20k = allLiensOver20k.concat(liensOver20k);
        }
      }
      totalLiensProcessed = allLiensOver20k.length;

      // Step 4: Sync to Airtable
      if (allLiensOver20k.length > 0) {
        await Logger.info(`Syncing ${allLiensOver20k.length} liens to Airtable`, 'scheduler');
        
        // Transform liens to match Airtable service expectations
        const liensForAirtable = allLiensOver20k.map(lien => ({
          recordingNumber: lien.recordingNumber,
          recordingDate: lien.recordingDate,
          amount: lien.amount.toString(),
          debtorName: lien.debtorName,
          creditorName: lien.creditorName,
          countyId: this.isRunning ? '1' : '1', // Use default county ID for now
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
        liensOver20k: totalLiensProcessed
      });

      await Logger.success(`Automation completed successfully. Found ${totalLiensFound} liens across ${activeCounties.length} counties, processed ${totalLiensProcessed} over $20k`, 'scheduler');

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
