import Tesseract from 'tesseract.js';
import { PDFDocument } from 'pdf-lib';
import * as canvas from 'canvas';
import { Logger } from './logger';

export class OCRHelper {
  static async extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
    try {
      // First try regular text extraction
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(Buffer.from(pdfBuffer));
        
        if (data.text && data.text.length > 100) {
          // If we got meaningful text, return it
          await Logger.info(`Extracted ${data.text.length} characters via text parsing`, 'ocr-helper');
          return data.text;
        }
      } catch (textError) {
        await Logger.info(`Text extraction failed, will use OCR`, 'ocr-helper');
      }
      
      // If text extraction failed, use OCR on the PDF as image
      await Logger.info(`Using OCR to extract text from scanned PDF`, 'ocr-helper');
      
      // Use Puppeteer to convert PDF to image first
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      let ocrText = '';
      
      try {
        const page = await browser.newPage();
        
        // Convert PDF buffer to base64 data URL
        const base64 = Buffer.from(pdfBuffer).toString('base64');
        const pdfDataUrl = `data:application/pdf;base64,${base64}`;
        
        // Set viewport for consistent rendering
        await page.setViewport({ width: 1200, height: 1600 });
        
        // Create an HTML page that displays the PDF
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { margin: 0; padding: 0; }
              embed { width: 100vw; height: 100vh; }
            </style>
          </head>
          <body>
            <embed src="${pdfDataUrl}" type="application/pdf" />
          </body>
          </html>
        `;
        
        await page.setContent(html);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for PDF to render
        
        // Take a screenshot of the PDF
        const screenshotBuffer = await page.screenshot({ 
          fullPage: false,
          type: 'png'
        });
        
        await Logger.info(`Captured PDF as image: ${screenshotBuffer.length} bytes`, 'ocr-helper');
        
        // Now run OCR on the image
        const worker = await Tesseract.createWorker('eng');
        
        try {
          const { data } = await worker.recognize(screenshotBuffer);
          ocrText = data.text;
          await Logger.info(`OCR extracted ${ocrText.length} characters`, 'ocr-helper');
        } catch (ocrError) {
          await Logger.error(`OCR processing failed: ${ocrError}`, 'ocr-helper');
        } finally {
          await worker.terminate();
        }
        
      } finally {
        await browser.close();
      }
      
      return ocrText;
    } catch (error) {
      await Logger.error(`OCR extraction failed: ${error}`, 'ocr-helper');
      return '';
    }
  }
  
  static parseTextForLienInfo(text: string): { debtorName: string; debtorAddress: string; amount: number } {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let debtorName = 'Unknown';
    let debtorAddress = 'Not Available';
    let amount = 0;
    
    // Enhanced patterns for Arizona medical lien documents
    
    // Look for debtor/patient name
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();
      
      // Look for patient name pattern in medical liens
      if (upperLine.includes('NAME AND ADDRESS OF PATIENT')) {
        // Patient name is typically on the next line or same line after colon
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          // Check if it's a name pattern (not an address or organization)
          if (nextLine && !nextLine.match(/^\d+/) && !nextLine.toUpperCase().includes('MEDICAL') && !nextLine.toUpperCase().includes('CLINIC')) {
            debtorName = nextLine;
            break;
          }
        }
      }
      // Check for labeled name fields
      else if (upperLine.includes('DEBTOR:') || upperLine.includes('PATIENT:')) {
        const namePart = line.split(/[:]/)[1]?.trim();
        if (namePart && namePart.length > 3 && namePart.length < 100) {
          debtorName = namePart;
          break;
        }
      }
    }
    
    // Look for address after finding name
    if (debtorName !== 'Unknown') {
      const nameIndex = lines.findIndex(line => line.includes(debtorName));
      if (nameIndex >= 0) {
        // Check next 5 lines for address
        for (let j = 1; j <= 5 && nameIndex + j < lines.length; j++) {
          const addrLine = lines[nameIndex + j];
          
          // Look for street address pattern
          if (addrLine.match(/^\d+\s+.*(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)/i)) {
            debtorAddress = addrLine;
            
            // Look for city, state, zip in next line
            if (nameIndex + j + 1 < lines.length) {
              const cityLine = lines[nameIndex + j + 1];
              if (cityLine.match(/^.+,\s*AZ\s+\d{5}/) || cityLine.match(/Arizona\s+\d{5}/i)) {
                debtorAddress += ', ' + cityLine;
              }
            }
            break;
          }
        }
      }
    }
    
    // Look for amount - enhanced patterns for medical liens
    const amountPatterns = [
      /Amount\s+claimed[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /Amount\s+of\s+lien[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /Principal\s+amount[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /Total\s+amount[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /For\s+the\s+sum\s+of[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /In\s+the\s+amount\s+of[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      /AMOUNT[:\s]+\$?([\d,]+(?:\.\d{2})?)/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 1000) { // Medical liens are typically over $1000
          amount = value;
          break;
        }
      }
    }
    
    // If no amount found with patterns, look for largest reasonable dollar amount
    if (amount === 0) {
      const dollarPattern = /\$\s?([\d,]+(?:\.\d{2})?)/g;
      const dollarMatches = [...text.matchAll(dollarPattern)];
      let maxAmount = 0;
      
      for (const match of dollarMatches) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > maxAmount && value >= 1000 && value <= 10000000) {
          maxAmount = value;
        }
      }
      
      if (maxAmount > 0) {
        amount = maxAmount;
      }
    }
    
    return {
      debtorName: debtorName.substring(0, 100),
      debtorAddress: debtorAddress.substring(0, 200),
      amount
    };
  }
}