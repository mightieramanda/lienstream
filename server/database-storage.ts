import { 
  users,
  liens,
  automationRuns,
  systemLogs,
  counties,
  countyRuns,
  type User, 
  type InsertUser, 
  type Lien, 
  type InsertLien,
  type AutomationRun,
  type InsertAutomationRun,
  type SystemLog,
  type InsertSystemLog,
  type County,
  type InsertCounty,
  type CountyRun,
  type InsertCountyRun
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql, or } from "drizzle-orm";
import { IStorage } from "./storage";
import { randomUUID } from "crypto";

export class DatabaseStorage implements IStorage {
  private scheduleConfig: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null = null;

  constructor() {
    // Initialize default counties if not exists
    this.initializeDefaultCounties();
  }

  // Schedule configuration (kept in memory for now)
  async getScheduleConfig(): Promise<{ cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null> {
    return this.scheduleConfig;
  }

  async saveScheduleConfig(config: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date }): Promise<void> {
    this.scheduleConfig = config;
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  // Lien methods
  async getLien(id: string): Promise<Lien | undefined> {
    const [lien] = await db.select().from(liens).where(eq(liens.id, id));
    return lien;
  }

  async getLienById(id: string): Promise<Lien | undefined> {
    const [lien] = await db.select().from(liens).where(eq(liens.id, id));
    return lien;
  }

  async getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined> {
    const [lien] = await db.select().from(liens).where(eq(liens.recordingNumber, recordingNumber));
    return lien;
  }

  async getLiensByStatus(status: string): Promise<Lien[]> {
    return await db.select().from(liens).where(eq(liens.status, status));
  }

  async createLien(lien: InsertLien): Promise<Lien> {
    try {
      // Check if lien already exists
      const existing = await this.getLienByRecordingNumber(lien.recordingNumber);
      if (existing) {
        console.log(`[Storage] Lien ${lien.recordingNumber} already exists`);
        return existing;
      }
      
      // Ensure countyId is set
      const lienData = {
        ...lien,
        id: randomUUID(),
        countyId: lien.countyId || 'maricopa-county',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      console.log(`[Storage] Creating lien ${lien.recordingNumber} with county ${lienData.countyId}`);
      
      const [newLien] = await db.insert(liens).values(lienData).returning();
      console.log(`[Storage] Successfully saved lien ${lien.recordingNumber}`);
      return newLien;
    } catch (error) {
      console.error(`[Storage] Error creating lien ${lien.recordingNumber}:`, error);
      throw error;
    }
  }

  async updateLienStatus(recordingNumber: string, status: string): Promise<void> {
    await db.update(liens)
      .set({ status, updatedAt: new Date() })
      .where(eq(liens.recordingNumber, recordingNumber));
  }

  async updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void> {
    await db.update(liens)
      .set({ airtableRecordId, status: 'synced', updatedAt: new Date() })
      .where(eq(liens.recordingNumber, recordingNumber));
  }

  async getRecentLiens(limit: number): Promise<Lien[]> {
    return await db.select()
      .from(liens)
      .orderBy(desc(liens.recordDate))
      .limit(limit);
  }

  async getLiensCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(liens);
    return Number(result?.count || 0);
  }

  async getTodaysLiensCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(gte(liens.createdAt, today));
    return Number(result?.count || 0);
  }

  // Automation run methods
  async createAutomationRun(run: InsertAutomationRun): Promise<string> {
    const id = randomUUID();
    await db.insert(automationRuns).values({
      ...run,
      id,
      startTime: new Date(),
      liensFound: 0,
      liensProcessed: 0,
      liensOver20k: 0
    });
    return id;
  }

  async updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void> {
    await db.update(automationRuns)
      .set(updates)
      .where(eq(automationRuns.id, id));
  }

  async getRecentAutomationRuns(limit: number): Promise<AutomationRun[]> {
    return await db.select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startTime))
      .limit(limit);
  }

  async getLatestAutomationRun(): Promise<AutomationRun | undefined> {
    const [run] = await db.select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startTime))
      .limit(1);
    return run;
  }

  // System log methods
  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const [newLog] = await db.insert(systemLogs).values({
      ...log,
      id: randomUUID(),
      timestamp: new Date()
    }).returning();
    return newLog;
  }

  async getRecentSystemLogs(limit: number): Promise<SystemLog[]> {
    return await db.select()
      .from(systemLogs)
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit);
  }

  // County methods
  async getCounty(id: string): Promise<County | undefined> {
    const [county] = await db.select().from(counties).where(eq(counties.id, id));
    return county;
  }

  async getCountiesByState(state: string): Promise<County[]> {
    return await db.select().from(counties).where(eq(counties.state, state));
  }

  async getActiveCounties(): Promise<County[]> {
    return await db.select().from(counties).where(eq(counties.isActive, true));
  }

  async createCounty(county: InsertCounty): Promise<County> {
    const [newCounty] = await db.insert(counties).values({
      ...county
    }).returning();
    return newCounty;
  }

  async updateCounty(id: string, updates: Partial<County>): Promise<void> {
    await db.update(counties)
      .set(updates)
      .where(eq(counties.id, id));
  }

  // County run methods
  async createCountyRun(run: InsertCountyRun): Promise<string> {
    const id = randomUUID();
    await db.insert(countyRuns).values({
      ...run,
      id,
      startTime: new Date(),
      liensFound: 0,
      liensProcessed: 0
    });
    return id;
  }

  async updateCountyRun(id: string, updates: Partial<CountyRun>): Promise<void> {
    await db.update(countyRuns)
      .set(updates)
      .where(eq(countyRuns.id, id));
  }

  async getCountyRunsByAutomationRun(automationRunId: string): Promise<CountyRun[]> {
    return await db.select()
      .from(countyRuns)
      .where(eq(countyRuns.automationRunId, automationRunId));
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }> {
    const todaysLiens = await this.getTodaysLiensCount();
    
    const [syncedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(eq(liens.status, 'synced'));
    const airtableSynced = Number(syncedResult?.count || 0);
    
    const [mailerResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(or(
        eq(liens.status, 'mailer_sent'),
        eq(liens.status, 'completed')
      ));
    const mailersSent = Number(mailerResult?.count || 0);
    
    const [activeResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(and(
        eq(liens.status, 'synced'),
        gte(liens.createdAt, sql`now() - interval '30 days'`)
      ));
    const activeLeads = Number(activeResult?.count || 0);
    
    return {
      todaysLiens,
      airtableSynced,
      mailersSent,
      activeLeads
    };
  }

  private async initializeDefaultCounties() {
    try {
      // Check if Maricopa County already exists
      const existingCounties = await this.getCountiesByState("Arizona");
      
      if (existingCounties.length === 0) {
        // Initialize Maricopa County
        await this.createCounty({
          name: "Maricopa County",
          state: "Arizona",
          isActive: true,
          config: {
            scrapeType: 'puppeteer',
            baseUrl: 'https://legacy.recorder.maricopa.gov',
            searchUrl: 'https://legacy.recorder.maricopa.gov/recdocdata/',
            documentUrlPattern: 'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf',
            selectors: {
              documentTypeField: 'select[name="ctl00$ContentPlaceHolder1$ddlDocCodes"]',
              documentTypeValue: 'MEDICAL LN-FOR MOSTMEDICAL/HOSP/CHIRO LIENTYPES',
              startDateField: '#ctl00_ContentPlaceHolder1_RadDateInputBegin',
              endDateField: '#ctl00_ContentPlaceHolder1_RadDateInputEnd',
              searchButton: '#ctl00_ContentPlaceHolder1_btnSearch2',
              resultsTable: 'table[id="ctl00_ContentPlaceHolder1_GridView1"], table[id*="ctl00"]',
              recordingNumberLinks: 'table[id="ctl00_ContentPlaceHolder1_GridView1"] tr td:first-child a[href*="pdf"]'
            },
            parsing: {
              amountPattern: 'Amount claimed due for care of patient as of date of recording[:\\s]*\\$?([\\d,]+\\.?\\d*)',
              debtorPattern: 'Debtor[:\\s]*(.*?)(?:\\n|Address|$)',
              creditorPattern: 'Creditor[:\\s]*(.*?)(?:\\n|Address|$)',
              addressPattern: 'Address[:\\s]*(.*?)(?:\\n|$)'
            }
          }
        });
        
        console.log('[Storage] Initialized Maricopa County');
      }
    } catch (error) {
      console.error('[Storage] Error initializing counties:', error);
    }
  }
}