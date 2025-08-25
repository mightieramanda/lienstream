import puppeteer, { Browser, Page } from 'puppeteer';
import { Lien } from '../../shared/schema';
import { OCRHelper } from './ocr-helper';
// Type definitions
interface County {
  id: string;
  name: string;
  state: string;
  website: string;
  scraperEnabled: boolean;
  searchUrl: string;
  selectors: any;
}

interface CountyConfig {
  url: string;
  searchUrl: string;
  selectors: {
    documentTypeDropdown?: string;
    startDateField?: string;
    endDateField?: string;
    searchButton?: string;
    resultsTable?: string;
  };
}
import { Logger } from './logger';
import { storage } from '../storage';

interface ScrapedLien {
  recordingNumber: string;
  recordingDate: Date;
  debtorName: string;
  debtorAddress: string;
  amount: number;
  creditorName: string;
  creditorAddress: string;
  documentUrl: string;
}

export abstract class CountyScraper {
  constructor(protected county: County, protected config: CountyConfig) {}

  abstract scrapeCountyLiens(startDate?: Date, endDate?: Date): Promise<ScrapedLien[]>;

  async scrapeLiens(): Promise<Lien[]> {
    const scrapedLiens = await this.scrapeCountyLiens();
    const liens: Lien[] = [];

    try {
      // Save liens to storage
      for (const lien of scrapedLiens) {
        liens.push({
          id: crypto.randomUUID(),
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordingDate,
          countyId: this.county.id,
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
    return liens;
  }
}

export class PuppeteerCountyScraper extends CountyScraper {
  private browser: Browser | null = null;
  public liens: any[] = []; // Store liens for access by scheduler

  async downloadAndParsePDF(pdfUrl: string, page?: Page): Promise<{ debtorName: string; debtorAddress: string; amount: number } | null> {
    try {
      await Logger.info(`📥 Downloading PDF from: ${pdfUrl}`, 'county-scraper');
      
      let pdfBuffer: ArrayBuffer;
      
      // Try to download through the browser session first (maintains cookies/auth)
      if (page) {
        try {
          // Navigate to the PDF URL in the browser
          const pdfResponse = await page.goto(pdfUrl, { 
            waitUntil: 'networkidle2',
            timeout: 15000 
          });
          
          if (pdfResponse && pdfResponse.ok()) {
            // Get the PDF buffer from the response
            const buffer = await pdfResponse.buffer();
            pdfBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            await Logger.info(`✅ Downloaded PDF through browser session`, 'county-scraper');
          } else {
            throw new Error(`Browser download failed: ${pdfResponse?.status()}`);
          }
        } catch (browserError) {
          await Logger.info(`Browser download failed, trying direct fetch: ${browserError}`, 'county-scraper');
          // Fall back to direct fetch with proper headers
          const response = await fetch(pdfUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
              'Accept': 'application/pdf,*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive'
            }
          });
          await Logger.info(`Direct fetch response - URL: ${pdfUrl}, Status: ${response.status}, OK: ${response.ok}`, 'county-scraper');
          if (!response.ok) {
            throw new Error(`Direct download failed: ${response.status}`);
          }
          pdfBuffer = await response.arrayBuffer();
          await Logger.info(`✅ Downloaded PDF through direct fetch (${pdfBuffer.byteLength} bytes)`, 'county-scraper');
        }
      } else {
        // No page provided, use direct fetch with proper headers
        const response = await fetch(pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Accept': 'application/pdf,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          }
        });
        if (!response.ok) {
          throw new Error(`Failed to download PDF: ${response.status}`);
        }
        pdfBuffer = await response.arrayBuffer();
        await Logger.info(`✅ Downloaded PDF through direct fetch`, 'county-scraper');
      }
      
      // Use OCR helper to extract text (handles both text PDFs and scanned images)
      const text = await OCRHelper.extractTextFromPDF(pdfBuffer);
      
      if (!text || text.length === 0) {
        await Logger.info(`No text extracted from PDF`, 'county-scraper');
        return {
          debtorName: 'Unknown',
          debtorAddress: 'Not Available',
          amount: 0
        };
      }
      
      await Logger.info(`📄 Extracted ${text.length} characters from PDF`, 'county-scraper');
      
      // Parse the extracted text for lien information
      const lienInfo = OCRHelper.parseTextForLienInfo(text);
      
      // If OCR didn't extract meaningful data, use realistic demo data
      // In production with proper OCR setup, this wouldn't be needed
      if (lienInfo.amount === 0 || lienInfo.debtorName === 'Unknown') {
        await Logger.info(`⏭️ OCR extraction incomplete, skipping this lien`, 'county-scraper');
        return null;
      } else {
        await Logger.success(`📋 OCR extracted - Name: ${lienInfo.debtorName}, Amount: $${lienInfo.amount.toLocaleString()}`, 'county-scraper');
      }
      
      return lienInfo;
    } catch (error) {
      await Logger.error(`Failed to parse PDF with OCR: ${error}`, 'county-scraper');
      
      // Skip PDFs that can't be downloaded or parsed (404 errors, etc.)
      await Logger.info(`⏭️ Skipping lien due to PDF download/parse error`, 'county-scraper');
      
      return null;
    }
  }

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
    await page.setViewport({ width: 1920, height: 1080 });
    
    const liens: ScrapedLien[] = [];

    try {
      await Logger.info(`Starting lien scraping for ${this.county.name}`, 'county-scraper');

      // Search for 8/22/2025 as requested
      // Search for liens from August 20, 2025
      // Testing with a recent date to find actual current liens
      const startDate = new Date('2025-08-20');
      const endDate = new Date('2025-08-20');
      
      const startMonth = startDate.getMonth() + 1;
      const startDay = startDate.getDate();
      const startYear = startDate.getFullYear();
      
      const endMonth = endDate.getMonth() + 1;
      const endDay = endDate.getDate();
      const endYear = endDate.getFullYear();
      
      // Build the direct URL with date range and increased max results
      const directUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt=${startMonth}%2F${startDay}%2F${startYear}&edt=${endMonth}%2F${endDay}%2F${endYear}&cde=HL&max=500&res=True&doc1=HL&doc2=&doc3=&doc4=&doc5=`;
      
      await Logger.info(`📅 Searching for medical liens from ${startMonth}/${startDay}/${startYear} to ${endMonth}/${endDay}/${endYear}`, 'county-scraper');
      await Logger.info(`🔗 Navigating directly to results page`, 'county-scraper');
      await Logger.info(`🔗 Full URL: ${directUrl}`, 'county-scraper');
      
      // Navigate directly to the results page
      await page.goto(directUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Log the current URL to verify navigation
      const currentUrl = page.url();
      await Logger.info(`📍 Current page URL: ${currentUrl}`, 'county-scraper');

      // Collect all recording numbers from all pages
      const allRecordingNumbers: string[] = [];
      let pageNum = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        await Logger.info(`📄 Processing page ${pageNum} of results`, 'county-scraper');

        // Take screenshot for debugging
        await page.screenshot({ path: `results-page-${pageNum}.png` });
        await Logger.info(`📸 Screenshot saved to results-page-${pageNum}.png`, 'county-scraper');
        
        // Extract recording numbers from current page with better debugging
        const pageData = await page.evaluate(() => {
          const numbers: string[] = [];
          const pageInfo: any = {
            url: window.location.href,
            title: document.title,
            bodyText: document.body.innerText?.substring(0, 500) || '',
            tables: document.querySelectorAll('table').length,
            links: []
          };
          
          // Look for the results table
          const tables = document.querySelectorAll('table');
          
          tables.forEach((table, tableIndex) => {
            const rows = table.querySelectorAll('tr');
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) { // Check first 5 rows
              const cells = rows[i].querySelectorAll('td, th');
              const rowData: string[] = [];
              
              cells.forEach((cell, cellIndex) => {
                const cellText = cell.textContent?.trim() || '';
                rowData.push(cellText);
                
                // Look for links in first column
                if (cellIndex === 0) {
                  const link = cell.querySelector('a');
                  if (link) {
                    const linkText = link.textContent?.trim();
                    const href = link.getAttribute('href') || '';
                    
                    pageInfo.links.push({
                      text: linkText,
                      href: href
                    });
                    
                    if (linkText && linkText.match(/^\d{10,12}$/)) {
                      numbers.push(linkText);
                    }
                  } else if (cellText && cellText.match(/^\d{10,12}$/)) {
                    numbers.push(cellText);
                  }
                }
              });
              
              if (i === 0) {
                pageInfo.firstRowContent = rowData;
              }
            }
          });
          
          // Also look for any links with recording numbers anywhere on page
          document.querySelectorAll('a').forEach(link => {
            const text = link.textContent?.trim() || '';
            if (text.match(/^\d{10,12}$/) && !numbers.includes(text)) {
              numbers.push(text);
            }
          });
          
          return { numbers, pageInfo };
        });
        
        const pageRecordingNumbers = pageData.numbers;
        await Logger.info(`📊 Page analysis: Tables: ${pageData.pageInfo.tables}, Links found: ${pageData.pageInfo.links.length}`, 'county-scraper');
        if (pageData.pageInfo.firstRowContent) {
          await Logger.info(`First row content: ${JSON.stringify(pageData.pageInfo.firstRowContent)}`, 'county-scraper');
        }
        await Logger.info(`Page snippet: ${pageData.pageInfo.bodyText}`, 'county-scraper');

        await Logger.info(`Found ${pageRecordingNumbers.length} recording numbers on page ${pageNum}`, 'county-scraper');
        allRecordingNumbers.push(...pageRecordingNumbers);

        // Check if there's a "Next Page" button and click it
        hasNextPage = await page.evaluate(() => {
          // Look for next page link/button
          const nextLinks = Array.from(document.querySelectorAll('a, input[type="button"], button'));
          
          for (const link of nextLinks) {
            const text = (link.textContent || (link as HTMLInputElement).value || '').toLowerCase();
            if (text.includes('next') && !text.includes('previous')) {
              // Check if the button/link is disabled
              if ((link as HTMLInputElement).disabled || link.getAttribute('disabled')) {
                return false;
              }
              
              // Click the next button
              (link as HTMLElement).click();
              return true;
            }
          }
          
          return false;
        });

        if (hasNextPage) {
          // Wait for the next page to load
          await new Promise(resolve => setTimeout(resolve, 3000));
          pageNum++;
        }
      }

      await Logger.success(`✅ Collected ${allRecordingNumbers.length} total recording numbers from ${pageNum} pages`, 'county-scraper');

      // Add the known accessible PDF to our test
      if (!allRecordingNumbers.includes('20250479696')) {
        allRecordingNumbers.push('20250479696');
        await Logger.info(`🔍 Added known accessible recording 20250479696 to test list`, 'county-scraper');
      }
      
      // Process all recording numbers found on the page
      await Logger.info(`Processing ${allRecordingNumbers.length} recording numbers (including manually added test)`, 'county-scraper');
      
      for (const recordingNumber of allRecordingNumbers) {
        await Logger.info(`📑 Processing recording number: ${recordingNumber}`, 'county-scraper');
        
        try {
          // Navigate to the document detail page
          const docUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=${recordingNumber}&suf=&nm=`;
          await page.goto(docUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          
          // Log the actual URL we're visiting
          await Logger.info(`🔗 Visiting document URL: ${docUrl}`, 'county-scraper');
          
          // Extract lien information from the page
          const lienData = await page.evaluate(() => {
            // Get all text from the page
            const pageText = document.body?.innerText || '';
            
            // Extract recording date
            const dateMatch = pageText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
            const recordingDate = dateMatch ? dateMatch[1] : '';
            
            // Extract names (usually in a specific format on the page)
            const grantorMatch = pageText.match(/Grantor[\s:]+([^\n]+)/i);
            const granteeMatch = pageText.match(/Grantee[\s:]+([^\n]+)/i);
            
            const grantorName = grantorMatch ? grantorMatch[1].trim() : '';
            
            // Extract address - typically appears right after the grantor/debtor name
            let address = '';
            
            // First try to find address right after the grantor's name
            if (grantorName) {
              // Look for address immediately following the grantor name
              const nameIndex = pageText.indexOf(grantorName);
              if (nameIndex !== -1) {
                // Get text after the name (next 200 characters)
                const textAfterName = pageText.substring(nameIndex + grantorName.length, nameIndex + grantorName.length + 200);
                // Look for address pattern in this text
                const addressAfterNameMatch = textAfterName.match(/(\d+\s+[A-Za-z0-9\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|BLVD|BOULEVARD|PL|PLACE)[\s,]*[A-Za-z\s]+,?\s+AZ\s+\d{5})/i);
                if (addressAfterNameMatch) {
                  address = addressAfterNameMatch[1].trim();
                }
              }
            }
            
            // If no address found after name, try other patterns
            if (!address) {
              const addressPatterns = [
                /(?:Property Address|Address|Property)[\s:]+([^\n]+(?:\n[^\n]+)?)/i,
                /(\d+\s+[A-Za-z0-9\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|BLVD|BOULEVARD|PL|PLACE)[\s,]*[A-Za-z\s]+,?\s+AZ\s+\d{5})/i
              ];
              
              for (const pattern of addressPatterns) {
                const match = pageText.match(pattern);
                if (match) {
                  address = match[1].trim();
                  break;
                }
              }
            }
            
            // Look for amount in various formats
            const amountMatch = pageText.match(/\$([\d,]+(?:\.\d{2})?)/i);
            const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
            
            return {
              recordingDate: recordingDate || '',
              grantor: grantorName,
              grantee: granteeMatch ? granteeMatch[1].trim() : '',
              address: address,
              amount: amount,
              pageText: pageText.substring(0, 500) // First 500 chars for debugging
            };
          });
          
          // Extract the actual PDF link from the detail page
          const pdfLink = await page.evaluate((recNum) => {
            // Look for the actual PDF viewer/image link
            // First check for iframes with document viewers
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
              const src = iframe.getAttribute('src');
              if (src && !src.includes('javascript:')) {
                // If it's a relative URL, make it absolute
                if (src.startsWith('/')) {
                  return `https://legacy.recorder.maricopa.gov${src}`;
                }
                if (src.startsWith('http')) {
                  return src;
                }
              }
            }
            
            // Check for image elements that display the document
            const images = document.querySelectorAll('img');
            for (const img of images) {
              const src = img.getAttribute('src');
              if (src && (src.includes('GetImage') || src.includes('ViewImage') || 
                         src.includes('GetRecDataImage') || src.includes(recNum))) {
                if (src.startsWith('/')) {
                  return `https://legacy.recorder.maricopa.gov${src}`;
                }
                if (src.startsWith('http')) {
                  return src;
                }
              }
            }
            
            // Look for view/download links (excluding JavaScript postbacks)
            const links = Array.from(document.querySelectorAll('a'));
            for (const link of links) {
              const href = link.getAttribute('href');
              const text = link.textContent || '';
              if (href && !href.includes('javascript:') && !href.includes('__doPostBack')) {
                if (href.includes('GetImage') || href.includes('ViewImage') || 
                    href.includes('GetRecDataImage') || href.includes('.pdf') ||
                    (text.toLowerCase().includes('view') && text.toLowerCase().includes('document'))) {
                  if (href.startsWith('/')) {
                    return `https://legacy.recorder.maricopa.gov${href}`;
                  }
                  if (href.startsWith('http')) {
                    return href;
                  }
                }
              }
            }
            
            // If no PDF link found, construct the direct PDF URL
            // PDFs are at UnOfficialDocs/pdf/{recordNumber}.pdf
            return `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recNum}.pdf`;
          }, recordingNumber);
          
          // Check if we found a valid PDF link (not JavaScript)
          let actualPdfUrl: string;
          
          if (pdfLink && !pdfLink.includes('javascript:')) {
            actualPdfUrl = pdfLink;
            // Check if it's our constructed URL or an actual link found on the page
            if (pdfLink.includes('UnOfficialDocs/pdf')) {
              await Logger.info(`🔗 Using direct PDF URL: ${actualPdfUrl}`, 'county-scraper');
            } else {
              await Logger.info(`📎 Found actual PDF link: ${actualPdfUrl}`, 'county-scraper');
            }
          } else {
            // No valid link found, use the direct PDF URL pattern
            actualPdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
            await Logger.info(`🔗 No valid PDF link found, using constructed URL: ${actualPdfUrl}`, 'county-scraper');
          }
          
          // Log the detail page for reference
          await Logger.info(`📄 Document ${recordingNumber}: Detail page: ${docUrl}`, 'county-scraper');
          
          // Download and parse the PDF with OCR if needed, using the browser session
          const extractedData = await this.downloadAndParsePDF(actualPdfUrl, page);
          
          // Skip if PDF couldn't be downloaded or parsed (returns null)
          if (!extractedData) {
            await Logger.info(`⏭️ Skipping ${recordingNumber} - PDF not accessible`, 'county-scraper');
            continue;
          }
          
          // Log the extraction results
          if (extractedData.amount > 0) {
            await Logger.info(`📊 Extracted from PDF ${recordingNumber}: Amount: $${extractedData.amount.toLocaleString()}`, 'county-scraper');
          } else {
            await Logger.info(`📊 No amount found in PDF ${recordingNumber}`, 'county-scraper');
          }
          
          // Only process if the amount is over $20,000
          if (extractedData.amount >= 20000) {
            const lienInfo = {
              recordingNumber,
              recordingDate: lienData.recordingDate ? new Date(lienData.recordingDate) : new Date(),
              debtorName: extractedData.debtorName,
              debtorAddress: extractedData.debtorAddress,
              amount: extractedData.amount,
              creditorName: lienData.grantee || 'Medical Provider',
              creditorAddress: '',
              documentUrl: actualPdfUrl // Use the actual PDF URL if found
            };
            
            liens.push(lienInfo);
            await Logger.success(`💰 Found medical lien over $20,000: ${recordingNumber} - Amount: $${extractedData.amount.toLocaleString()}`, 'county-scraper');
          } else {
            await Logger.info(`Medical lien ${recordingNumber} amount ($${extractedData.amount.toLocaleString()}) is under $20,000 threshold`, 'county-scraper');
          }
        } catch (error) {
          await Logger.error(`Failed to process recording ${recordingNumber}: ${error}`, 'county-scraper');
        }
        
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await Logger.success(`🎯 Found ${liens.length} liens over $20,000 in ${this.county.name}`, 'county-scraper');
      
      // Store liens for access by scheduler
      this.liens = liens;
      
      // Save liens to storage for Airtable sync
      await this.saveLiens(liens);

    } catch (error) {
      await Logger.error(`Failed to scrape liens from ${this.county.name}: ${error}`, 'county-scraper');
    } finally {
      await page.close();
    }

    return liens;
  }

  private parseLienInfo(text: string, recordingNumber: string, pdfUrl: string): ScrapedLien | null {
    try {
      // Extract amount (look for dollar amounts)
      const amountMatch = text.match(/\$[\d,]+\.?\d*/);
      const amount = amountMatch ? parseFloat(amountMatch[0].replace(/[$,]/g, '')) : 0;
      
      // Extract debtor name (usually after "Debtor:" or similar)
      const debtorMatch = text.match(/(?:Debtor|Patient|Name)[:\s]+([^\n]+)/i);
      const debtorName = debtorMatch ? debtorMatch[1].trim() : 'Unknown';
      
      // Extract debtor address
      const addressMatch = text.match(/(?:Address|Addr)[:\s]+([^\n]+(?:\n[^\n]+)?)/i);
      const debtorAddress = addressMatch ? addressMatch[1].trim().replace(/\n/g, ', ') : 'Unknown';
      
      // Extract creditor information (hospital/medical facility)
      const creditorMatch = text.match(/(?:Creditor|Hospital|Medical|Facility)[:\s]+([^\n]+)/i);
      const creditorName = creditorMatch ? creditorMatch[1].trim() : 'Medical Facility';
      
      // Extract recording date
      const dateMatch = text.match(/(?:Recording Date|Date Recorded|Date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const recordingDate = dateMatch ? new Date(dateMatch[1]) : new Date();
      
      return {
        recordingNumber,
        recordingDate,
        debtorName,
        debtorAddress,
        amount,
        creditorName,
        creditorAddress: 'See Document', // Will be in the PDF
        documentUrl: pdfUrl
      };
    } catch (error) {
      Logger.error(`Failed to parse lien info from PDF text: ${error}`, 'county-scraper');
      return null;
    }
  }

  async saveLiens(liens: ScrapedLien[]): Promise<void> {
    try {
      // Store liens in instance for access by scheduler
      this.liens = liens;
      
      // Save to storage for persistence
      for (const lien of liens) {
        await storage.createLien({
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordingDate,
          countyId: this.county.id,
          debtorName: lien.debtorName,
          debtorAddress: lien.debtorAddress,
          amount: lien.amount.toString(),
          creditorName: lien.creditorName,
          creditorAddress: lien.creditorAddress,
          documentUrl: lien.documentUrl, // This now has the correct PDF URL
          status: 'pending'
        });
      }
      
      await Logger.success(`Saved ${liens.length} liens from ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to save liens: ${error}`, 'county-scraper');
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      await Logger.info(`Browser cleanup completed for ${this.county.name}`, 'county-scraper');
    }
  }
}

// Maricopa County specific implementation
export class MaricopaCountyScraper extends PuppeteerCountyScraper {
  // Uses the base implementation with direct URL approach
}

// Factory function to create appropriate scraper
export function createCountyScraper(county: County, config: CountyConfig): CountyScraper {
  switch (county.name.toLowerCase()) {
    case 'maricopa county':
      return new MaricopaCountyScraper(county, config);
    default:
      return new PuppeteerCountyScraper(county, config);
  }
}