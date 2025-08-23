import puppeteer, { Browser, Page } from 'puppeteer';
import { Logger } from './logger';
import { storage } from '../storage';
import { County, CountyConfig, InsertLien } from '@shared/schema';

interface ScrapedLien {
  recordingNumber: string;
  recordDate: Date;
  debtorName: string;
  debtorAddress?: string;
  amount: number;
  creditorName?: string;
  creditorAddress?: string;
  documentUrl: string;
}

export abstract class CountyScraper {
  protected county: County;
  protected config: CountyConfig;

  constructor(county: County) {
    this.county = county;
    this.config = county.config as CountyConfig;
  }

  abstract scrapeCountyLiens(startDate?: Date, endDate?: Date): Promise<ScrapedLien[]>;
  
  async saveLiens(liens: ScrapedLien[]): Promise<void> {
    try {
      for (const lien of liens) {
        await storage.createLien({
          countyId: this.county.id,
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordDate,
          debtorName: lien.debtorName,
          debtorAddress: lien.debtorAddress,
          amount: lien.amount.toString(),
          creditorName: lien.creditorName,
          creditorAddress: lien.creditorAddress,
          documentUrl: lien.documentUrl,
          status: 'pending'
        });
      }
      await Logger.success(`Saved ${liens.length} liens from ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to save liens from ${this.county.name}: ${error}`, 'county-scraper');
      throw error;
    }
  }
}

export class PuppeteerCountyScraper extends CountyScraper {
  private browser: Browser | null = null;

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ]
      });
      await Logger.info(`Puppeteer browser initialized for ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to initialize browser for ${this.county.name}: ${error}`, 'county-scraper');
      throw error;
    }
  }

  async scrapeCountyLiens(startDate?: Date, endDate?: Date): Promise<ScrapedLien[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const liens: ScrapedLien[] = [];

    try {
      await Logger.info(`Starting lien scraping for ${this.county.name}`, 'county-scraper');

      // Navigate to the search page
      await page.goto(this.config.searchUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Set document type if specified
      if (this.config.selectors.documentTypeField && this.config.selectors.documentTypeValue) {
        await page.waitForSelector(this.config.selectors.documentTypeField, { timeout: 10000 });
        await page.select(this.config.selectors.documentTypeField, this.config.selectors.documentTypeValue);
      }

      // Set date range (default to yesterday if not provided)
      const searchStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const searchEndDate = endDate || new Date();

      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      };

      if (this.config.selectors.startDateField) {
        await page.type(this.config.selectors.startDateField, formatDate(searchStartDate));
      }
      if (this.config.selectors.endDateField) {
        await page.type(this.config.selectors.endDateField, formatDate(searchEndDate));
      }

      // Click search
      if (this.config.selectors.searchButton) {
        await page.click(this.config.selectors.searchButton);
        await page.waitForSelector(this.config.selectors.resultsTable!, { timeout: 15000 });
      }

      // Get all recording numbers from search results
      const recordingNumbers = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        const numbers: string[] = [];
        
        elements.forEach(element => {
          if (element.textContent) {
            numbers.push(element.textContent.trim());
          }
        });
        
        return numbers;
      }, this.config.selectors.recordingNumberLinks!);

      await Logger.info(`Found ${recordingNumbers.length} potential medical liens in ${this.county.name}`, 'county-scraper', { count: recordingNumbers.length });

      // Process each recording number
      for (const recordingNumber of recordingNumbers) {
        try {
          const lien = await this.processSingleLien(page, recordingNumber);
          if (lien && lien.amount >= 20000) {
            liens.push(lien);
            await Logger.info(`Added lien over $20k from ${this.county.name}: ${recordingNumber} - $${lien.amount}`, 'county-scraper');
          } else if (lien) {
            await Logger.info(`Skipped lien under $20k from ${this.county.name}: ${recordingNumber} - $${lien.amount}`, 'county-scraper');
          }
        } catch (error) {
          await Logger.warning(`Failed to process lien ${recordingNumber} from ${this.county.name}: ${error}`, 'county-scraper');
        }
      }

      await Logger.success(`Scraping completed for ${this.county.name}. Found ${liens.length} liens over $20,000`, 'county-scraper');
      return liens;

    } catch (error) {
      await Logger.error(`Scraping failed for ${this.county.name}: ${error}`, 'county-scraper');
      throw error;
    } finally {
      await page.close();
    }
  }

  private async processSingleLien(page: Page, recordingNumber: string): Promise<ScrapedLien | null> {
    try {
      // Construct PDF URL using the pattern
      const pdfUrl = this.config.documentUrlPattern.replace('{recordingNumber}', recordingNumber);
      
      // Navigate to PDF
      await page.goto(pdfUrl, { timeout: 15000 });
      
      // Wait for PDF to load
      await new Promise(resolve => setTimeout(resolve, this.config.delays.pdfLoad));
      
      // Extract text content from PDF
      const textContent = await page.evaluate(() => {
        return document.body.innerText;
      });

      // Parse the lien information from the text
      const lien = await this.parseLienFromText(textContent, recordingNumber, pdfUrl);
      
      return lien;
    } catch (error) {
      await Logger.warning(`Failed to process PDF for ${recordingNumber} from ${this.county.name}: ${error}`, 'county-scraper');
      return null;
    }
  }

  private async parseLienFromText(text: string, recordingNumber: string, documentUrl: string): Promise<ScrapedLien | null> {
    try {
      // Look for amount pattern
      const amountMatch = text.match(new RegExp(this.config.parsing.amountPattern, 'i'));
      if (!amountMatch) {
        return null;
      }

      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      
      // Extract debtor name
      const debtorMatch = text.match(new RegExp(this.config.parsing.debtorPattern, 'i'));
      const debtorName = debtorMatch ? debtorMatch[1].trim() : 'Unknown';
      
      // Extract creditor name
      const creditorMatch = text.match(new RegExp(this.config.parsing.creditorPattern, 'i'));
      const creditorName = creditorMatch ? creditorMatch[1].trim() : 'Unknown';
      
      // Extract addresses
      const addressMatches = text.match(new RegExp(this.config.parsing.addressPattern, 'gi'));
      const debtorAddress = addressMatches?.[0] || undefined;
      const creditorAddress = addressMatches?.[1] || undefined;

      return {
        recordingNumber,
        recordDate: new Date(), // Would parse actual record date from document
        debtorName,
        debtorAddress,
        amount,
        creditorName,
        creditorAddress,
        documentUrl
      };
    } catch (error) {
      await Logger.error(`Failed to parse lien text for ${recordingNumber} from ${this.county.name}: ${error}`, 'county-scraper');
      return null;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      await Logger.info(`Browser cleanup completed for ${this.county.name}`, 'county-scraper');
    }
  }
}

export class CountyScraperFactory {
  static createScraper(county: County): CountyScraper {
    const config = county.config as CountyConfig;
    
    switch (config.scrapeType) {
      case 'puppeteer':
        return new PuppeteerCountyScraper(county);
      case 'api':
        // TODO: Implement API-based scraper for counties with APIs
        throw new Error(`API scraping not implemented yet for ${county.name}`);
      case 'selenium':
        // TODO: Implement Selenium-based scraper for complex sites
        throw new Error(`Selenium scraping not implemented yet for ${county.name}`);
      default:
        throw new Error(`Unknown scrape type: ${config.scrapeType} for ${county.name}`);
    }
  }
}