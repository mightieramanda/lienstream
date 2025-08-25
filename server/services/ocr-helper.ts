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
      
      // Convert PDF buffer to base64 for Tesseract
      const base64 = Buffer.from(pdfBuffer).toString('base64');
      const dataUri = `data:application/pdf;base64,${base64}`;
      
      // Load the PDF document
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      
      if (pages.length === 0) {
        throw new Error('PDF has no pages');
      }
      
      // For medical liens, the important info is usually on the first page
      // We'll process just the first page for efficiency
      let ocrText = '';
      
      // Convert first page to image and run OCR
      // Since we can't directly convert PDF pages to images with the current setup,
      // we'll use a simpler approach with Tesseract directly on the PDF
      
      const worker = await Tesseract.createWorker('eng');
      
      try {
        // Try to process the PDF directly with Tesseract
        // This works for some PDF formats
        const { data } = await worker.recognize(dataUri);
        ocrText = data.text;
        await Logger.info(`OCR extracted ${ocrText.length} characters`, 'ocr-helper');
      } catch (ocrError) {
        await Logger.error(`Direct PDF OCR failed: ${ocrError}`, 'ocr-helper');
        // Fall back to returning empty text
        ocrText = '';
      } finally {
        await worker.terminate();
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
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();
      
      // Check for labeled name fields
      if (upperLine.includes('DEBTOR:') || upperLine.includes('PATIENT:') || upperLine.includes('NAME:')) {
        const namePart = line.split(/[:]/)[1]?.trim();
        if (namePart && namePart.length > 3 && namePart.length < 100) {
          debtorName = namePart;
          break;
        }
      }
      // Check for all-caps name at top of document (common in legal docs)
      else if (i < 10 && line.match(/^[A-Z][A-Z\s,.-]+$/) && line.length > 5 && line.length < 50 && !line.includes('LIEN') && !line.includes('MEDICAL')) {
        debtorName = line;
        break;
      }
      // Standard name format
      else if (i < 15 && line.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)) {
        debtorName = line;
        break;
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