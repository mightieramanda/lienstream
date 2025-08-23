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

  const httpServer = createServer(app);
  return httpServer;
}
