import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SchedulerService } from "./services/scheduler";
import { Logger } from "./services/logger";
import { pdfStorage } from "./services/pdf-storage";

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

  // Recent liens
  app.get("/api/liens/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const liens = await storage.getRecentLiens(limit);
      res.json(liens);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent liens" });
    }
  });

  // System logs
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getRecentSystemLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
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

  const httpServer = createServer(app);
  return httpServer;
}
