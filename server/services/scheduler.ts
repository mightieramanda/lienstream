import cron from 'node-cron';
import { ScraperService } from './scraper';
import { AirtableService } from './airtable';
import { Logger } from './logger';
import { storage } from '../storage';

export class SchedulerService {
  private scraperService: ScraperService;
  private airtableService: AirtableService;
  private isRunning = false;

  constructor() {
    this.scraperService = new ScraperService();
    this.airtableService = new AirtableService();
  }

  async start() {
    // Schedule daily run at 6:00 AM
    cron.schedule('0 6 * * *', async () => {
      await this.runAutomation('scheduled');
    });

    await Logger.info('Scheduler started - daily runs at 6:00 AM', 'scheduler');
  }

  async runAutomation(type: 'scheduled' | 'manual'): Promise<void> {
    if (this.isRunning) {
      await Logger.warning('Automation already running, skipping', 'scheduler');
      return;
    }

    this.isRunning = true;
    
    const runId = await storage.createAutomationRun({
      type,
      status: 'running',
      startTime: new Date(),
      metadata: JSON.stringify({ startedBy: type })
    });

    try {
      await Logger.info(`Starting ${type} automation run`, 'scheduler', { runId });

      // Step 1: Scrape liens
      await Logger.info('Starting lien scraping', 'scheduler');
      const scrapedLiens = await this.scraperService.scrapeMaricopaCountyLiens();
      
      if (scrapedLiens.length === 0) {
        await Logger.info('No liens found during scraping', 'scheduler');
        await storage.updateAutomationRun(runId, {
          status: 'completed',
          endTime: new Date(),
          liensFound: 0,
          liensProcessed: 0,
          liensOver20k: 0
        });
        return;
      }

      // Step 2: Save liens to database
      await this.scraperService.saveLiens(scrapedLiens);

      // Step 3: Get saved liens for processing
      const savedLiens = await storage.getLiensByStatus('pending');
      const liensOver20k = savedLiens.filter(l => parseFloat(l.amount) >= 20000);

      // Step 4: Sync to Airtable
      if (liensOver20k.length > 0) {
        await Logger.info(`Syncing ${liensOver20k.length} liens to Airtable`, 'scheduler');
        await this.airtableService.syncLiensToAirtable(liensOver20k);
      }

      // Step 5: Update automation run status
      await storage.updateAutomationRun(runId, {
        status: 'completed',
        endTime: new Date(),
        liensFound: scrapedLiens.length,
        liensProcessed: liensOver20k.length,
        liensOver20k: liensOver20k.length
      });

      await Logger.success(`Automation completed successfully. Found ${scrapedLiens.length} liens, processed ${liensOver20k.length} over $20k`, 'scheduler');

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
      await this.scraperService.cleanup();
      this.isRunning = false;
    }
  }

  isAutomationRunning(): boolean {
    return this.isRunning;
  }
}
