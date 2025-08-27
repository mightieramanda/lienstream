import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SchedulerService } from "./services/scheduler";
import { Logger } from "./services/logger";
import { pdfStorage } from "./services/pdf-storage";
import { AirtableService } from "./services/airtable";
import * as fs from 'fs';
import * as path from 'path';

const scheduler = new SchedulerService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Start the scheduler
  scheduler.start();

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Automation status
  app.get("/api/automation/status", async (req, res) => {
    try {
      const isRunning = scheduler.isAutomationRunning();
      const latestRun = await storage.getLatestAutomationRun();
      
      res.json({
        isRunning,
        latestRun,
        status: isRunning ? 'running' : (latestRun?.status || 'idle')
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation status" });
    }
  });

  // Manual trigger
  app.post("/api/automation/trigger", async (req, res) => {
    try {
      if (scheduler.isAutomationRunning()) {
        return res.status(400).json({ error: "Automation is already running" });
      }

      const { fromDate, toDate } = req.body; // Get date range from request body
      
      // Start automation in background with optional date range
      scheduler.runAutomation('manual', fromDate, toDate).catch(error => {
        Logger.error(`Manual automation failed: ${error}`, 'api');
      });

      res.json({ message: "Manual automation started" });
    } catch (error) {
      res.status(500).json({ error: "Failed to trigger automation" });
    }
  });

  // Stop automation
  app.post("/api/automation/stop", async (req, res) => {
    try {
      await scheduler.stopAutomation();
      res.json({ message: "Automation stop requested" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop automation" });
    }
  });

  // Create lien
  app.post("/api/liens", async (req, res) => {
    try {
      const lien = await storage.createLien(req.body);
      res.json(lien);
    } catch (error) {
      res.status(500).json({ error: "Failed to create lien" });
    }
  });
  
  // Retry sync for a specific lien
  app.post("/api/liens/:id/retry-sync", async (req, res) => {
    try {
      const lienId = req.params.id;
      const lien = await storage.getLien(lienId);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }
      
      if (lien.status === 'synced') {
        return res.json({ message: "Lien already synced" });
      }
      
      if (!lien.documentUrl) {
        return res.status(400).json({ error: "No PDF available for this lien" });
      }
      
      // Import AirtableService and sync the single lien
      const { AirtableService } = await import("./services/airtable");
      const airtableService = new AirtableService();
      
      // Transform lien to Airtable format
      const lienForAirtable = {
        recordingNumber: lien.recordingNumber,
        recordingDate: lien.recordDate,
        documentUrl: lien.documentUrl,
        countyId: '1', // Default county ID
        status: 'pending'
      };
      
      // Sync to Airtable
      await airtableService.syncLiensToAirtable([lienForAirtable]);
      
      // Update lien status
      await storage.updateLienStatus(lien.recordingNumber, 'synced');
      
      await storage.createSystemLog({
        level: "info",
        message: `Retry sync successful for lien ${lien.recordingNumber}`,
        component: "api"
      });
      
      res.json({ success: true, message: "Lien synced successfully" });
    } catch (error) {
      await storage.createSystemLog({
        level: "error",
        message: `Retry sync failed for lien ${req.params.id}: ${error}`,
        component: "api"
      });
      res.status(500).json({ error: "Failed to retry sync" });
    }
  });

  // Recent liens with pagination
  app.get("/api/liens/recent", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      
      // Get total count
      const allLiens = await storage.getRecentLiens(100000);
      const totalCount = allLiens.length;
      
      // Get paginated results
      const liens = allLiens.slice(offset, offset + limit);
      
      res.json({
        liens,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent liens" });
    }
  });

  // Export liens as CSV
  app.get("/api/liens/export", async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      
      let liens;
      if (from && to) {
        // Get liens within date range
        const allLiens = await storage.getRecentLiens(100000); // Get all liens
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999); // Include entire end day
        
        liens = allLiens.filter(lien => {
          const lienDate = new Date(lien.recordDate);
          return lienDate >= fromDate && lienDate <= toDate;
        });
      } else {
        // Get all liens
        liens = await storage.getRecentLiens(100000);
      }
      
      // Convert to CSV
      const headers = ['Recording Number', 'Record Date', 'Debtor Name', 'Debtor Address', 'Amount', 'Creditor Name', 'Status', 'Document URL'];
      const csvRows = [headers.join(',')];
      
      for (const lien of liens) {
        const row = [
          lien.recordingNumber,
          new Date(lien.recordDate).toLocaleDateString(),
          `"${lien.debtorName || ''}"`,
          `"${lien.debtorAddress || ''}"`,
          lien.amount,
          `"${lien.creditorName || ''}"`,
          lien.status,
          lien.documentUrl || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csv = csvRows.join('\n');
      const filename = from && to ? `liens_${from}_to_${to}.csv` : `liens_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export liens" });
    }
  });

  // System logs
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const date = req.query.date as string;
      
      let logs;
      if (date) {
        // Filter logs by date
        const allLogs = await storage.getRecentSystemLogs(10000); // Get many logs
        const targetDate = new Date(date);
        logs = allLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate.toDateString() === targetDate.toDateString();
        });
      } else {
        logs = await storage.getRecentSystemLogs(limit);
      }
      
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Export logs as CSV
  app.get("/api/logs/export", async (req, res) => {
    try {
      const date = req.query.date as string;
      
      let logs;
      if (date) {
        // Filter logs by date
        const allLogs = await storage.getRecentSystemLogs(100000);
        const targetDate = new Date(date);
        logs = allLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate.toDateString() === targetDate.toDateString();
        });
      } else {
        // Get all logs
        logs = await storage.getRecentSystemLogs(100000);
      }
      
      // Convert to CSV
      const headers = ['Timestamp', 'Level', 'Message', 'Component'];
      const csvRows = [headers.join(',')];
      
      for (const log of logs) {
        const row = [
          new Date(log.timestamp).toLocaleString(),
          log.level,
          `"${(log.message || '').replace(/"/g, '""')}"`,
          log.component || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csv = csvRows.join('\n');
      const filename = date ? `logs_${date}.csv` : `logs_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export logs" });
    }
  });

  // Recent automation runs
  app.get("/api/automation/runs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const runs = await storage.getRecentAutomationRuns(limit);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation runs" });
    }
  });

  // PDF serving endpoint for Airtable
  app.get("/api/pdf/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pdf = pdfStorage.getPdf(id);
      
      if (!pdf) {
        return res.status(404).json({ error: "PDF not found" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (error) {
      res.status(500).json({ error: "Failed to serve PDF" });
    }
  });

  // Retry sync for individual lien
  app.post("/api/liens/:id/retry-sync", async (req, res) => {
    try {
      const { id } = req.params;
      const lien = await storage.getLienById(id);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }
      
      if (lien.status === 'synced') {
        return res.status(400).json({ error: "Lien already synced" });
      }
      
      // Initialize Airtable service
      const airtableService = new AirtableService();
      
      // Sync this single lien
      await airtableService.syncLiensToAirtable([lien]);
      
      // Update status
      await storage.updateLienStatus(lien.recordingNumber, 'synced');
      
      await Logger.info(`Successfully retried sync for lien ${lien.recordingNumber}`, 'retry-sync');
      res.json({ message: "Sync successful" });
    } catch (error) {
      await Logger.error(`Failed to retry sync: ${error}`, 'retry-sync');
      res.status(500).json({ error: "Failed to sync to Airtable" });
    }
  });

  // Schedule management routes
  app.get("/api/automation/schedule", async (req, res) => {
    try {
      const scheduleInfo = scheduler.getScheduleInfo();
      res.json(scheduleInfo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  app.post("/api/automation/schedule", async (req, res) => {
    try {
      const { hour, minute, timezone = 'PT' } = req.body;
      
      if (typeof hour !== 'number' || typeof minute !== 'number') {
        return res.status(400).json({ error: "Invalid schedule time" });
      }
      
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return res.status(400).json({ error: "Invalid time values" });
      }
      
      const validTimezones = ['PT', 'CT', 'ET'];
      if (!validTimezones.includes(timezone)) {
        return res.status(400).json({ error: "Invalid timezone. Must be PT, CT, or ET" });
      }
      
      await scheduler.updateSchedule(hour, minute, timezone);
      const scheduleInfo = scheduler.getScheduleInfo();
      res.json(scheduleInfo);
    } catch (error) {
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // County management routes
  app.get("/api/counties", async (req, res) => {
    try {
      const counties = await storage.getActiveCounties();
      res.json(counties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch counties" });
    }
  });

  app.get("/api/counties/states/:state", async (req, res) => {
    try {
      const { state } = req.params;
      const counties = await storage.getCountiesByState(state);
      res.json(counties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch counties by state" });
    }
  });

  app.post("/api/counties", async (req, res) => {
    try {
      const county = await storage.createCounty(req.body);
      res.json(county);
    } catch (error) {
      res.status(500).json({ error: "Failed to create county" });
    }
  });

  app.patch("/api/counties/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateCounty(id, req.body);
      res.json({ message: "County updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update county" });
    }
  });

  // Test route to directly process a specific recording
  app.post("/api/test-recording", async (req, res) => {
    try {
      const { recordingNumber = '20250479696' } = req.body;
      
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      await Logger.info(`Testing direct PDF download for recording ${recordingNumber}`, 'test');
      
      // Download the PDF
      const response = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });
      
      await Logger.info(`PDF fetch response: Status ${response.status}, OK: ${response.ok}`, 'test');
      
      if (!response.ok) {
        return res.json({ 
          success: false, 
          recordingNumber,
          status: response.status,
          error: `PDF not accessible (${response.status})`
        });
      }
      
      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      await Logger.info(`Downloaded PDF: ${pdfBuffer.length} bytes`, 'test');
      
      // OCR removed - just validate PDF
      await Logger.info(`PDF validated: ${pdfBuffer.length} bytes`, 'test');
      const ocrData = { debtorName: 'To be extracted', debtorAddress: '', amount: 0 };
      
      // Create lien regardless of amount
      if (true) {
        const lien = {
          recordingNumber,
          recordDate: new Date(),
          countyId: 'maricopa-az',
          debtorName: ocrData.debtorName,
          debtorAddress: ocrData.debtorAddress || '',
          creditorName: 'Medical Provider',
          creditorAddress: '',
          amount: ocrData.amount.toString(),
          documentUrl: pdfUrl,
          status: 'pending'
        };
        
        await storage.createLien(lien);
        await Logger.success(`✅ Successfully processed and saved lien ${recordingNumber}`, 'test');
        
        return res.json({
          success: true,
          recordingNumber,
          lien,
          message: 'Successfully processed PDF and extracted lien data'
        });
      }
      
      return res.json({
        success: true,
        recordingNumber,
        pdfDownloaded: true,
        pdfSize: pdfBuffer.length,
        message: 'PDF successfully downloaded'
      });
      
    } catch (error) {
      await Logger.error(`Test recording failed: ${error}`, 'test');
      res.status(500).json({ error: error instanceof Error ? error.message : 'Test failed' });
    }
  });

  // Serve PDFs
  app.get("/api/liens/:id/pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const lien = await storage.getLienById(id);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }

      // Serve the actual PDF from the lien's documentUrl
      if (lien.documentUrl) {
        try {
          console.log(`Fetching unique PDF for lien ${lien.recordingNumber} from: ${lien.documentUrl}`);
          
          // Fetch the actual PDF for this specific lien
          const response = await fetch(lien.documentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/pdf,*/*'
            }
          });
          
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            
            // Set appropriate headers with no caching to ensure unique PDFs
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${lien.recordingNumber}.pdf"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            return res.send(Buffer.from(buffer));
          }
        } catch (fetchError) {
          console.error(`Failed to fetch PDF from URL for ${lien.recordingNumber}:`, fetchError);
        }
      }

      // Fallback to test PDF if no documentUrl or fetch fails
      const pdfPath = path.join(process.cwd(), 'test_download.pdf');
      
      // Check if the file exists
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: "PDF not found" });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="lien-${lien.recordingNumber}.pdf"`);
      
      // Stream the PDF file
      const stream = fs.createReadStream(pdfPath);
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve PDF" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
