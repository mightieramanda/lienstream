import { Logger } from './logger';
import { Lien } from '@shared/schema';
import { storage } from '../storage';

interface AirtableRecord {
  fields: {
    'Name and Lien Amount': string;
    'Status': string;
    'County Name': string;
    'State (by County)': string;
    'Document ID': string;
    'Scrape Batch ID': string;
    'Recorded Date/Time': string;
    'Doc Type': string;
    'Grantor/Grantee Names': string;
    'Address': string;
    'Lien Amount': string;
    'Detail URL': string;
    'PDF Link': string;
    'Creditor Name': string;
    'Phone': string;
    'Phone (All)': string;
    'Email': string;
    'Email (All)': string;
    'Confidence Score': number;
    'Direct Mail Status': string;
    'Email Status': string;
    'Dialer Status': string;
    'Notes/Errors': string;
    'Last Updated': string;
  };
}

export class AirtableService {
  private apiKey: string;
  private baseId: string;
  private tableId: string;

  constructor() {
    this.apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';
    this.baseId = process.env.AIRTABLE_BASE_ID || '';
    this.tableId = 'All Medical Liens'; // Updated to match user's table name
    
    if (!this.apiKey || !this.baseId) {
      Logger.warning('Airtable credentials not configured', 'airtable');
    }
  }

  async syncLiensToAirtable(liens: Lien[]): Promise<void> {
    if (!this.apiKey || !this.baseId) {
      await Logger.error('Airtable not configured - skipping sync', 'airtable');
      return;
    }

    try {
      await Logger.info(`Starting Airtable sync for ${liens.length} liens`, 'airtable');

      // Generate batch ID for this scrape session
      const batchId = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const records: AirtableRecord[] = await Promise.all(liens.map(async (lien) => {
        // Get county information
        const county = await storage.getCounty(lien.countyId);
        const countyName = county?.name || 'Unknown County';
        const stateName = county?.state || 'Unknown State';
        
        // Format lien amount as currency
        const formattedAmount = `$${parseFloat(lien.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        
        return {
          fields: {
            'Status': 'New',
            'County Name': countyName,
            'Document ID': lien.recordingNumber,
            'Scrape Batch ID': batchId,
            'Grantor/Grantee Names': `${lien.debtorName}${lien.creditorName ? ` / ${lien.creditorName}` : ''}`,
            'Lien Amount': parseFloat(lien.amount)
          }
        };
      }));

      // Batch create records (Airtable allows up to 10 records per request)
      const batches = this.chunkArray(records, 10);
      let syncedCount = 0;

      for (const batch of batches) {
        try {
          const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${this.tableId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records: batch })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Airtable API error: ${response.status} - ${error}`);
          }

          const result = await response.json();
          
          // Update local records with Airtable IDs
          for (let i = 0; i < result.records.length; i++) {
            const airtableRecord = result.records[i];
            const originalRecordingNumber = batch[i].fields['Document ID'];
            
            await storage.updateLienAirtableId(originalRecordingNumber, airtableRecord.id);
          }

          syncedCount += batch.length;
          await Logger.info(`Synced batch to Airtable: ${batch.length} records`, 'airtable');
          
        } catch (error) {
          await Logger.error(`Failed to sync batch to Airtable: ${error}`, 'airtable');
        }
      }

      // Update status for all successfully synced liens
      for (const lien of liens) {
        if (lien.airtableRecordId) {
          await storage.updateLienStatus(lien.recordingNumber, 'synced');
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
