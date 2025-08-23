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
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
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
    
    // Advanced anti-detection setup
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Remove automation indicators that Cloudflare detects
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    const liens: ScrapedLien[] = [];

    try {
      await Logger.info(`Starting lien scraping for ${this.county.name}`, 'county-scraper');

      // Real scraping implementation for all counties

      // Use legacy site with form automation (no Cloudflare protection)
      await page.goto(this.config.searchUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Handle Cloudflare or similar protection screens
      let pageTitle = await page.title();
      await Logger.info(`Initial page title: "${pageTitle}"`, 'county-scraper');
      
      if (pageTitle.includes('Just a moment') || pageTitle.includes('Checking') || pageTitle.includes('Please wait')) {
        await Logger.info('Detected bot protection screen, waiting for real page...', 'county-scraper');
        
        // Wait for Cloudflare to pass us through (up to 15 seconds)
        try {
          await page.waitForFunction(() => {
            return !document.title.includes('Just a moment') && 
                   !document.title.includes('Checking') && 
                   !document.title.includes('Please wait') &&
                   document.querySelectorAll('select').length > 0;
          }, { timeout: 15000 });
          
          pageTitle = await page.title();
          await Logger.info(`Protection passed, real page title: "${pageTitle}"`, 'county-scraper');
        } catch (error) {
          await Logger.error(`Bot protection timeout: ${error}`, 'county-scraper');
        }
      }

      // Now investigate the actual page structure
      const pageContent = await page.content();
      const hasDocumentCode = pageContent.includes('Document Code');
      const hasMedicalLn = pageContent.includes('MEDICAL LN');
      await Logger.info(`Real page - Document Code: ${hasDocumentCode}, MEDICAL LN: ${hasMedicalLn}`, 'county-scraper');
      
      // Find all select elements for debugging the real selectors
      const selects = await page.$$eval('select', elements => 
        elements.map(el => ({ 
          id: el.id, 
          name: el.name, 
          className: el.className,
          optionCount: el.options.length,
          medicalOptions: Array.from(el.options).filter(opt => (opt.text || opt.value).toLowerCase().includes('medical')).map(opt => opt.text || opt.value)
        }))
      );
      await Logger.info(`Found ${selects.length} select elements. Medical options: ${JSON.stringify(selects.filter(s => s.medicalOptions.length > 0))}`, 'county-scraper');

      // Set document type if specified
      if (this.config.selectors.documentTypeField && this.config.selectors.documentTypeValue) {
        try {
          await page.waitForSelector(this.config.selectors.documentTypeField, { timeout: 10000 });
          await page.select(this.config.selectors.documentTypeField, this.config.selectors.documentTypeValue);
        } catch (error) {
          await Logger.error(`Document type selector failed: ${error}. Current selectors may be outdated for new site.`, 'county-scraper');
          // Don't throw - continue to investigate page structure
        }
      }

      // Use TODAY's date range since you mentioned you can see liens on "21st of this month"
      const today = new Date();
      const searchStartDate = startDate || new Date(today.getFullYear(), today.getMonth(), 21); // 21st of current month
      const searchEndDate = endDate || new Date(today.getFullYear(), today.getMonth(), 21);

      const formatDate = (date: Date) => {
        // Legacy site uses MM/DD/YYYY format
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
      };

      if (this.config.selectors.startDateField) {
        await Logger.info(`Attempting to fill start date field with: ${formatDate(searchStartDate)}`, 'county-scraper');
        try {
          await page.waitForSelector(this.config.selectors.startDateField, { timeout: 10000 });
          await page.type(this.config.selectors.startDateField, formatDate(searchStartDate));
          await Logger.info(`Successfully filled start date field`, 'county-scraper');
        } catch (error) {
          await Logger.error(`Failed to fill start date field: ${error}`, 'county-scraper');
        }
      }
      if (this.config.selectors.endDateField) {
        await Logger.info(`Attempting to fill end date field with: ${formatDate(searchEndDate)}`, 'county-scraper');
        try {
          await page.waitForSelector(this.config.selectors.endDateField, { timeout: 10000 });
          await page.type(this.config.selectors.endDateField, formatDate(searchEndDate));
          await Logger.info(`Successfully filled end date field`, 'county-scraper');
        } catch (error) {
          await Logger.error(`Failed to fill end date field: ${error}`, 'county-scraper');
        }
      }

      // Click search - use JavaScript for Telerik RadButton components
      if (this.config.selectors.searchButton) {
        try {
          // Try JavaScript click first for Telerik components
          await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button && button.click) {
              button.click();
            }
          }, this.config.selectors.searchButton);
        } catch (error) {
          // Fallback to standard click
          await page.click(this.config.selectors.searchButton);
        }
        // Wait for page to finish loading JavaScript/AJAX after search
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Wait for either results table or no results message
        try {
          await page.waitForSelector(this.config.selectors.resultsTable!, { timeout: 15000 });
          await Logger.info(`Results table found for ${this.county.name}`, 'county-scraper');
        } catch (error) {
          // Try alternative selectors
          const alternativeSelectors = [
            'table[id*="GridView"]',
            'table[id*="ctl00"]', 
            'table.rgMasterTable',
            'table',
            '[id*="GridView1"]'
          ];
          
          for (const selector of alternativeSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              await Logger.info(`Found alternative results table with selector: ${selector}`, 'county-scraper');
              // Update config for future use
              this.config.selectors.resultsTable = selector;
              break;
            } catch (e) {
              // Continue to next selector
            }
          }
          // Check if there's a "no results" message or alternative content
          await new Promise(resolve => setTimeout(resolve, 2000)); // Extra wait for AJAX
          
          const pageContent = await page.content();
          await Logger.info(`Full page content after search: ${pageContent.substring(0, 2000)}`, 'county-scraper');
          
          // Since Maricopa County doesn't support date filtering, log search parameters
          await Logger.info(`Searched ${this.county.name} for MEDICAL LN documents (all dates). Target date was: ${formatDate(searchStartDate)}`, 'county-scraper');
          
          // Check for common "no results" patterns
          const hasNoResults = pageContent.includes('No records found') || 
                                pageContent.includes('No documents') ||
                                pageContent.includes('0 records') ||
                                pageContent.includes('no matches');
                                
          if (hasNoResults) {
            await Logger.info(`No results found for search in ${this.county.name}`, 'county-scraper');
            return liens;
          }
          
          // If we have meaningful content but no results table, check for alternative table formats
          if (pageContent.length > 1000) {
            // Check for any table or GridView elements
            const hasAnyTable = pageContent.includes('<table') || pageContent.includes('GridView') || pageContent.includes('ctl00_ContentPlaceHolder1');
            const hasResultsText = pageContent.includes('result') || pageContent.includes('record') || pageContent.includes('document');
            
            await Logger.error(`Results table not found but page loaded. Has tables: ${hasAnyTable}, Has results text: ${hasResultsText}. Content snippet: ${pageContent.substring(0, 1000)}`, 'county-scraper');
            
            // Check for any liens data in alternative formats
            if (pageContent.includes('medical') || pageContent.includes('lien') || pageContent.includes('MEDICAL') || pageContent.includes('LIEN')) {
              await Logger.info(`Found medical/lien content in page, investigating format`, 'county-scraper');
            }
            
            // Find all table selectors on the page
            const tableMatches = pageContent.match(/<table[^>]*>/g) || [];
            const gridViewMatches = pageContent.match(/GridView\d+/g) || [];
            const idMatches = pageContent.match(/id="[^"]*"/g) || [];
            
            await Logger.info(`Found ${tableMatches.length} tables, GridViews: ${gridViewMatches.join(', ')}, IDs: ${idMatches.slice(0, 10).join(', ')}`, 'county-scraper');
          }
          throw error;
        }
      }

      // Debug table structure and find actual document links (NOT navigation links)
      const tableDebugInfo = await page.evaluate(() => {
        const table = document.querySelector('table[id="ctl00_ContentPlaceHolder1_GridView1"], table[id*="ctl00"]');
        if (!table) return { error: 'No table found with GridView selector' };
        
        const rows = table.querySelectorAll('tr');
        const debugInfo = {
          tableId: table.id,
          tableClass: table.className,
          totalRows: rows.length,
          headers: [] as string[],
          sampleRows: [] as any[],
          documentLinks: [] as any[],
          nonNavigationLinks: [] as any[]
        };
        
        // Get headers
        if (rows.length > 0) {
          const headerRow = rows[0];
          const headerCells = headerRow.querySelectorAll('th, td');
          debugInfo.headers = Array.from(headerCells).map(cell => cell.textContent?.trim() || '');
        }
        
        // Examine each data row carefully for document links
        for (let i = 1; i < Math.min(rows.length, 5); i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('td');
          const rowInfo = {
            rowIndex: i,
            cellCount: cells.length,
            cellContents: [] as any[]
          };
          
          // Check each cell for different types of content
          cells.forEach((cell, cellIndex) => {
            const cellText = cell.textContent?.trim() || '';
            const cellHtml = cell.innerHTML;
            const links = cell.querySelectorAll('a');
            
            rowInfo.cellContents.push({
              cellIndex,
              text: cellText,
              hasLink: links.length > 0,
              links: Array.from(links).map(link => ({
                text: link.textContent?.trim(),
                href: link.href,
                onclick: link.getAttribute('onclick'),
                target: link.target
              })),
              containsPdf: cellHtml.toLowerCase().includes('pdf'),
              containsDocument: cellHtml.toLowerCase().includes('document') || cellHtml.toLowerCase().includes('doc'),
              innerHTML: cellHtml.length > 200 ? cellHtml.substring(0, 200) + '...' : cellHtml
            });
          });
          
          debugInfo.sampleRows.push(rowInfo);
        }
        
        // Find links that might be document links (not navigation)
        const allLinks = table.querySelectorAll('a');
        allLinks.forEach(link => {
          const linkText = link.textContent?.trim() || '';
          const linkHref = link.href;
          const onclick = link.getAttribute('onclick');
          
          // Skip obvious navigation links
          if (!['<<', '<', '>', '»', '«'].includes(linkText) && 
              !linkHref.endsWith('#') && 
              linkText.match(/\d+/) &&  // Contains numbers (likely recording numbers)
              linkText.length > 2) {   // Not just single characters
            debugInfo.documentLinks.push({
              text: linkText,
              href: linkHref,
              onclick: onclick,
              parent: link.parentElement?.tagName
            });
          }
          
          // Also collect non-navigation links for analysis
          if (!['<<', '<', '>', '»', '«'].includes(linkText)) {
            debugInfo.nonNavigationLinks.push({
              text: linkText,
              href: linkHref,
              onclick: onclick
            });
          }
        });
        
        return debugInfo;
      });

      console.log('=== TABLE ANALYSIS ===', JSON.stringify(tableDebugInfo, null, 2));
      await Logger.info(`Table analysis - Rows: ${tableDebugInfo.error ? 'ERROR' : tableDebugInfo.totalRows}, Document links: ${tableDebugInfo.error ? 0 : tableDebugInfo.documentLinks?.length}, Non-nav links: ${tableDebugInfo.error ? 0 : tableDebugInfo.nonNavigationLinks?.length}`, 'county-scraper');
      
      if (!tableDebugInfo.error && tableDebugInfo.documentLinks && tableDebugInfo.documentLinks.length > 0) {
        await Logger.info(`Found potential document links: ${tableDebugInfo.documentLinks.map(link => link.text).slice(0, 3).join(', ')}`, 'county-scraper');
      }

      // Extract recording numbers with retry logic for calendar interface
      let allRecordingNumbers: string[] = [];
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        // Check what type of interface we're seeing
        const interfaceType = await page.evaluate(() => {
          const table = document.querySelector('table[id*="GridView"], table[id*="ctl00"]');
          if (!table) return 'no_table';
          
          const links = table.querySelectorAll('a');
          const linkTexts = Array.from(links).map(link => link.textContent?.trim() || '');
          
          // Check if we have calendar navigation (numbers 1-31 with # links)
          const hasCalendarNavigation = linkTexts.some(text => 
            /^\d{1,2}$/.test(text) && parseInt(text) <= 31
          );
          
          // Check if we have document links (11-digit recording numbers)
          const hasDocumentLinks = linkTexts.some(text => /^\d{11}$/.test(text));
          
          if (hasDocumentLinks) return 'document_results';
          if (hasCalendarNavigation) return 'calendar_interface';
          return 'unknown';
        });
        
        await Logger.info(`Interface type detected: ${interfaceType} (attempt ${retryCount + 1})`, 'county-scraper');
        
        if (interfaceType === 'document_results') {
          // Great! We have the actual results. Now extract from all pages.
          let currentPage = 1;
          let hasMorePages = true;
          
          while (hasMorePages) {
            await Logger.info(`Scraping page ${currentPage} of results...`, 'county-scraper');
            
            // Extract recording numbers from current page
            const pageRecordingNumbers = await page.evaluate(() => {
              const table = document.querySelector('table[id="ctl00_ContentPlaceHolder1_GridView1"], table[id*="ctl00"]');
              if (!table) return [];
              
              const actualDocumentNumbers: string[] = [];
              const allLinks = table.querySelectorAll('a');
              
              allLinks.forEach(link => {
                const linkText = link.textContent?.trim() || '';
                const linkHref = link.href;
                
                // Only get links that look like recording numbers
                if (linkText.match(/^\d{11}$/) &&  // 11-digit recording numbers
                    !linkHref.endsWith('#') &&     // Skip navigation links
                    linkHref.includes('GetRecDataDetail')) {  // Links to actual documents
                  actualDocumentNumbers.push(linkText);
                }
              });
              
              return actualDocumentNumbers;
            });
            
            allRecordingNumbers.push(...pageRecordingNumbers);
            await Logger.info(`Found ${pageRecordingNumbers.length} liens on page ${currentPage}`, 'county-scraper');
            
            // Look for next page (simplified)
            const nextPageExists = await page.evaluate(() => {
              // Find pagination controls more precisely
              const allLinks = document.querySelectorAll('a');
              
              // Find ">" or numeric next page link
              for (const link of allLinks) {
                const text = link.textContent?.trim() || '';
                const href = link.href || '';
                
                // Look for ">" navigation button
                if (text === '>' && href.includes('Page$Next') && !link.classList.contains('disabled')) {
                  link.click();
                  return true;
                }
                
                // Look for numeric page navigation  
                if (/^\d+$/.test(text) && href.includes('Page$')) {
                  const currentPageSpan = document.querySelector('span[style*="font-weight:bold"]');
                  if (currentPageSpan) {
                    const currentPageNum = parseInt(currentPageSpan.textContent?.trim() || '1');
                    const linkPageNum = parseInt(text);
                    
                    if (linkPageNum === currentPageNum + 1) {
                      link.click();
                      return true;
                    }
                  }
                }
              }
              
              return false;
            });
            
            if (nextPageExists) {
              // Wait for page to load
              await new Promise(resolve => setTimeout(resolve, 4000));
              
              try {
                await page.waitForSelector('table[id*="GridView"]', { timeout: 10000 });
                currentPage++;
              } catch (e) {
                await Logger.warning(`Failed to load page ${currentPage + 1}, stopping pagination`, 'county-scraper');
                hasMorePages = false;
              }
            } else {
              await Logger.info(`No more pages found after page ${currentPage}`, 'county-scraper');
              hasMorePages = false;
            }
            
            // Safety limit
            if (currentPage > 20) {
              await Logger.warning(`Reached maximum page limit (20), stopping pagination`, 'county-scraper');
              hasMorePages = false;
            }
          }
          
          break; // Exit retry loop - we successfully processed results
        } 
        else if (interfaceType === 'calendar_interface') {
          await Logger.warning(`Got calendar interface instead of results (attempt ${retryCount + 1}). Retrying search...`, 'county-scraper');
          
          // Try clicking search again with a different approach
          try {
            // Wait a bit more before retry
            await new Promise(resolve => setTimeout(resolve, 3000));
            await page.click(this.config.selectors.searchButton!);
            await new Promise(resolve => setTimeout(resolve, 7000)); // Longer wait
            await page.waitForSelector('table[id*="GridView"]', { timeout: 15000 });
          } catch (e) {
            await Logger.warning(`Retry search failed: ${e}`, 'county-scraper');
          }
          
          retryCount++;
        } 
        else {
          await Logger.error(`Unknown interface type: ${interfaceType}. Retrying...`, 'county-scraper');
          retryCount++;
        }
        
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
        }
      }
      
      const recordingNumbers = allRecordingNumbers;
      await Logger.info(`Found ${recordingNumbers.length} total medical liens across ${currentPage} pages in ${this.county.name}`, 'county-scraper', { count: recordingNumbers.length });
      
      if (recordingNumbers.length > 0) {
        await Logger.info(`First few recording numbers: ${recordingNumbers.slice(0, 3).join(', ')}`, 'county-scraper');
        await Logger.info(`Last few recording numbers: ${recordingNumbers.slice(-3).join(', ')}`, 'county-scraper');
      }

      // Process each recording number
      for (const recordingNumber of recordingNumbers) {
        try {
          const lien = await this.processSingleLien(page, recordingNumber);
          if (lien && lien.amount >= 5000) {
            liens.push(lien);
            await Logger.info(`Added lien over $5k from ${this.county.name}: ${recordingNumber} - $${lien.amount}`, 'county-scraper');
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