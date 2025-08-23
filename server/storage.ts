import { 
  type User, 
  type InsertUser, 
  type Lien, 
  type InsertLien,
  type AutomationRun,
  type InsertAutomationRun,
  type SystemLog,
  type InsertSystemLog
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Lien methods
  getLien(id: string): Promise<Lien | undefined>;
  getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined>;
  getLiensByStatus(status: string): Promise<Lien[]>;
  createLien(lien: InsertLien): Promise<Lien>;
  updateLienStatus(recordingNumber: string, status: string): Promise<void>;
  updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void>;
  getRecentLiens(limit: number): Promise<Lien[]>;
  getLiensCount(): Promise<number>;
  getTodaysLiensCount(): Promise<number>;
  
  // Automation run methods
  createAutomationRun(run: InsertAutomationRun): Promise<string>;
  updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void>;
  getRecentAutomationRuns(limit: number): Promise<AutomationRun[]>;
  getLatestAutomationRun(): Promise<AutomationRun | undefined>;
  
  // System log methods
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  getRecentSystemLogs(limit: number): Promise<SystemLog[]>;
  
  // Dashboard stats
  getDashboardStats(): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private liens: Map<string, Lien>;
  private automationRuns: Map<string, AutomationRun>;
  private systemLogs: Map<string, SystemLog>;

  constructor() {
    this.users = new Map();
    this.liens = new Map();
    this.automationRuns = new Map();
    this.systemLogs = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Lien methods
  async getLien(id: string): Promise<Lien | undefined> {
    return this.liens.get(id);
  }

  async getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined> {
    return Array.from(this.liens.values()).find(
      (lien) => lien.recordingNumber === recordingNumber
    );
  }

  async getLiensByStatus(status: string): Promise<Lien[]> {
    return Array.from(this.liens.values()).filter(
      (lien) => lien.status === status
    );
  }

  async createLien(insertLien: InsertLien): Promise<Lien> {
    const id = randomUUID();
    const now = new Date();
    const lien: Lien = {
      ...insertLien,
      id,
      status: insertLien.status || 'pending',
      airtableRecordId: null,
      enrichmentData: null,
      debtorAddress: insertLien.debtorAddress || null,
      creditorName: insertLien.creditorName || null,
      creditorAddress: insertLien.creditorAddress || null,
      documentUrl: insertLien.documentUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.liens.set(id, lien);
    return lien;
  }

  async updateLienStatus(recordingNumber: string, status: string): Promise<void> {
    const lien = await this.getLienByRecordingNumber(recordingNumber);
    if (lien) {
      lien.status = status;
      lien.updatedAt = new Date();
      this.liens.set(lien.id, lien);
    }
  }

  async updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void> {
    const lien = await this.getLienByRecordingNumber(recordingNumber);
    if (lien) {
      lien.airtableRecordId = airtableRecordId;
      lien.updatedAt = new Date();
      this.liens.set(lien.id, lien);
    }
  }

  async getRecentLiens(limit: number): Promise<Lien[]> {
    return Array.from(this.liens.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getLiensCount(): Promise<number> {
    return this.liens.size;
  }

  async getTodaysLiensCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from(this.liens.values()).filter(
      (lien) => lien.createdAt >= today
    ).length;
  }

  // Automation run methods
  async createAutomationRun(insertRun: InsertAutomationRun): Promise<string> {
    const id = randomUUID();
    const run: AutomationRun = {
      ...insertRun,
      id,
      endTime: null,
      liensFound: insertRun.liensFound || 0,
      liensProcessed: insertRun.liensProcessed || 0,
      liensOver20k: insertRun.liensOver20k || 0,
      errorMessage: null,
      metadata: insertRun.metadata || null,
    };
    this.automationRuns.set(id, run);
    return id;
  }

  async updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void> {
    const run = this.automationRuns.get(id);
    if (run) {
      Object.assign(run, updates);
      this.automationRuns.set(id, run);
    }
  }

  async getRecentAutomationRuns(limit: number): Promise<AutomationRun[]> {
    return Array.from(this.automationRuns.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async getLatestAutomationRun(): Promise<AutomationRun | undefined> {
    const runs = await this.getRecentAutomationRuns(1);
    return runs[0];
  }

  // System log methods
  async createSystemLog(insertLog: InsertSystemLog): Promise<SystemLog> {
    const id = randomUUID();
    const log: SystemLog = {
      ...insertLog,
      id,
      metadata: insertLog.metadata || null,
      timestamp: new Date(),
    };
    this.systemLogs.set(id, log);
    return log;
  }

  async getRecentSystemLogs(limit: number): Promise<SystemLog[]> {
    return Array.from(this.systemLogs.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }> {
    const todaysLiens = await this.getTodaysLiensCount();
    const syncedLiens = await this.getLiensByStatus('synced');
    const mailerSentLiens = await this.getLiensByStatus('mailer_sent');
    const allLiens = Array.from(this.liens.values());
    
    return {
      todaysLiens,
      airtableSynced: syncedLiens.length,
      mailersSent: mailerSentLiens.length,
      activeLeads: allLiens.filter(l => l.status === 'synced' || l.status === 'mailer_sent').length,
    };
  }
}

export const storage = new MemStorage();
