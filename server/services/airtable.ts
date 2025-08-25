import { Logger } from './logger';
import { Lien } from '@shared/schema';
import { storage } from '../storage';
import { pdfStorage } from './pdf-storage';

interface AirtableRecord {
  fields: {
    'Status'?: string;
    'County Name'?: string;
    'Document ID'?: string;
    'Scrape Batch ID'?: string;
    'Grantor/Grantee Names'?: string;
    'Lien Amount'?: number;
    [key: string]: any; // Allow additional fields
  };
}

export class AirtableService {
  private apiKey: string;
  private baseId: string;
  private tableId: string;

  constructor() {
    this.apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';
    this.baseId = process.env.AIRTABLE_BASE_ID || '';
    this.tableId = process.env.AIRTABLE_TABLE_ID || '';
    
    if (!this.apiKey || !this.baseId) {
      Logger.warning('Airtable credentials not configured', 'airtable');
    }
  }

  async syncLiensToAirtable(liens: any[]): Promise<void> {
    if (!this.apiKey || !this.baseId || !this.tableId) {
      await Logger.error('Airtable not configured - skipping sync', 'airtable');
      return;
    }

    try {
      await Logger.info(`Starting Airtable sync for ${liens.length} liens to base: ${this.baseId}, table: ${this.tableId}`, 'airtable');

      // Generate batch ID for this scrape session
      const batchId = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Get base URL for serving PDFs
      const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
        `https://${process.env.REPLIT_DEV_DOMAIN}` : 
        'http://localhost:5000';
      
      const records: AirtableRecord[] = liens.map((lien) => {
        // Get county name from lien or default
        const countyName = 'Maricopa County';
        const stateName = 'Arizona';
        
        // If we have a PDF buffer, store it and get the serving URL
        let pdfAttachment;
        if (lien.pdfBuffer) {
          const pdfId = pdfStorage.storePdf(lien.pdfBuffer, lien.recordingNumber);
          const pdfUrl = `${baseUrl}/api/pdf/${pdfId}`;
          pdfAttachment = [{
            url: pdfUrl,
            filename: `${lien.recordingNumber}.pdf`
          }];
          Logger.info(`Stored PDF for ${lien.recordingNumber} at ${pdfUrl}`, 'airtable');
        } else {
          // Fallback to original URL if no buffer
          const originalUrl = lien.documentUrl || `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${lien.recordingNumber}.pdf`;
          pdfAttachment = [{
            url: originalUrl,
            filename: `${lien.recordingNumber}.pdf`
          }];
        }
        
        // Convert recording number to number
        const recordNumber = parseInt(lien.recordingNumber, 10);
        Logger.info(`Converting recording number: "${lien.recordingNumber}" to ${recordNumber} (type: ${typeof recordNumber}, value check: ${!isNaN(recordNumber)})`, 'airtable');
        
        return {
          fields: {
            'Status': 'New',
            'County Name': countyName,
            'Record Number': recordNumber, // Convert to number for Airtable number field
            'Recorded Date/Time': lien.recordingDate ? new Date(lien.recordingDate).toISOString() : new Date().toISOString(),
            'PDF Link': pdfAttachment, // Now an attachment field
            'Scrape Batch ID': batchId
          }
        };
      });

      // Batch create records (Airtable allows up to 10 records per request)
      const batches = this.chunkArray(records, 10);
      let syncedCount = 0;

      for (const batch of batches) {
        try {
          const payload = { records: batch };
          await Logger.info(`Sending to Airtable: ${JSON.stringify(payload.records[0].fields)}`, 'airtable');
          
          const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${this.tableId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Airtable API error: ${response.status} - ${error}`);
          }

          const result = await response.json();
          
          syncedCount += batch.length;
          await Logger.info(`Synced batch to Airtable: ${batch.length} records`, 'airtable');
          
        } catch (error) {
          await Logger.error(`Failed to sync batch to Airtable: ${error}`, 'airtable');
        }
      }

      await Logger.success(`Successfully synced ${syncedCount} liens to Airtable`, 'airtable');

    } catch (error) {
      await Logger.error(`Airtable sync failed: ${error}`, 'airtable');
      throw error;
    }
  }

  async updateLienWithEnrichment(recordingNumber: string, phoneNumber?: string, email?: string): Promise<void> {
    if (!this.apiKey || !this.baseId) {
      return;
    }

    try {
      const lien = await storage.getLienByRecordingNumber(recordingNumber);
      if (!lien?.airtableRecordId) {
        return;
      }

      const updateFields: any = {};
      if (phoneNumber) {
        updateFields['Phone'] = phoneNumber;
        updateFields['Phone (All)'] = phoneNumber; // Could be enhanced to append multiple numbers
      }
      if (email) {
        updateFields['Email'] = email;
        updateFields['Email (All)'] = email; // Could be enhanced to append multiple emails
      }
      
      // Update confidence score when enrichment data is added
      if (phoneNumber || email) {
        updateFields['Confidence Score'] = 95; // Higher confidence with contact info
      }
      
      // Always update the Last Updated timestamp
      updateFields['Last Updated'] = new Date().toISOString();

      if (Object.keys(updateFields).length === 0) {
        return;
      }

      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${this.tableId}/${lien.airtableRecordId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: updateFields })
      });

      if (!response.ok) {
        throw new Error(`Failed to update Airtable record: ${response.status}`);
      }

      await Logger.success(`Updated Airtable record with enrichment data: ${recordingNumber}`, 'airtable');

    } catch (error) {
      await Logger.error(`Failed to update Airtable record: ${error}`, 'airtable');
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
