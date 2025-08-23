import { Logger } from './logger';
import { Lien } from '@shared/schema';
import { storage } from '../storage';

interface AirtableRecord {
  fields: {
    'Recording Number': string;
    'Record Date': string;
    'Debtor Name': string;
    'Debtor Address': string;
    'Amount': number;
    'Creditor Name': string;
    'Creditor Address': string;
    'Document URL': string;
    'Status': string;
    'Phone Number': string;
    'Email': string;
  };
}

export class AirtableService {
  private apiKey: string;
  private baseId: string;
  private tableId: string;

  constructor() {
    this.apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';
    this.baseId = process.env.AIRTABLE_BASE_ID || '';
    this.tableId = process.env.AIRTABLE_TABLE_ID || 'Leads';
    
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

      const records: AirtableRecord[] = liens.map(lien => ({
        fields: {
          'Recording Number': lien.recordingNumber,
          'Record Date': lien.recordDate.toISOString().split('T')[0],
          'Debtor Name': lien.debtorName,
          'Debtor Address': lien.debtorAddress || '',
          'Amount': parseFloat(lien.amount),
          'Creditor Name': lien.creditorName || '',
          'Creditor Address': lien.creditorAddress || '',
          'Document URL': lien.documentUrl || '',
          'Status': lien.status,
          'Phone Number': '',
          'Email': ''
        }
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
            const originalRecordingNumber = batch[i].fields['Recording Number'];
            
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
      if (phoneNumber) updateFields['Phone Number'] = phoneNumber;
      if (email) updateFields['Email'] = email;

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
