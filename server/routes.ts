import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SchedulerService } from "./services/scheduler";
import { Logger } from "./services/logger";

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

      // Start automation in background
      scheduler.runAutomation('manual').catch(error => {
        Logger.error(`Manual automation failed: ${error}`, 'api');
      });

      res.json({ message: "Manual automation started" });
    } catch (error) {
      res.status(500).json({ error: "Failed to trigger automation" });
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
      
      // Parse with OCR
      const { OCRHelper } = await import('./services/ocr-helper');
      const extractedText = await OCRHelper.extractTextFromPDF(pdfBuffer);
      await Logger.info(`Extracted text length: ${extractedText.length} characters`, 'test');
      await Logger.info(`First 500 chars of extracted text: ${extractedText.substring(0, 500)}`, 'test');
      
      const ocrData = OCRHelper.parseTextForLienInfo(extractedText);
      await Logger.info(`OCR extraction complete: Found debtor: ${ocrData.debtorName}, Amount: ${ocrData.amount}`, 'test');
      
      // Create lien if data was extracted
      if (ocrData.debtorName && ocrData.debtorName !== 'Unknown' && ocrData.amount > 20000) {
        const lien = {
          recordingNumber,
          recordingDate: new Date().toISOString(),
          county: 'Maricopa County',
          state: 'Arizona',
          debtorName: ocrData.debtorName,
          debtorAddress: ocrData.debtorAddress || '',
          creditorName: '',
          amount: ocrData.amount,
          documentType: 'MEDICAL LIEN',
          pdfUrl,
          ocrConfidence: 0.9,
          isEnriched: false,
          isAirtableSynced: false
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
        extractedText: extractedText.substring(0, 1000), // First 1000 chars for debugging
        extractedTextLength: extractedText.length,
        ocrData: {
          debtorName: ocrData.debtorName,
          debtorAddress: ocrData.debtorAddress,
          amount: ocrData.amount
        },
        message: ocrData.amount <= 20000 ? 'Amount below $20,000 threshold' : 'OCR data incomplete'
      });
      
    } catch (error) {
      await Logger.error(`Test recording failed: ${error}`, 'test');
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
