import { storage } from "../storage";
import { InsertSystemLog } from "@shared/schema";

export class Logger {
  static async log(level: 'info' | 'warning' | 'error' | 'success', message: string, component: string, metadata?: any) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] [${component}] ${message}`);
    
    try {
      await storage.createSystemLog({
        level,
        message,
        component,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
    } catch (error) {
      console.error('Failed to save log to database:', error);
    }
  }

  static async info(message: string, component: string, metadata?: any) {
    return this.log('info', message, component, metadata);
  }

  static async success(message: string, component: string, metadata?: any) {
    return this.log('success', message, component, metadata);
  }

  static async warning(message: string, component: string, metadata?: any) {
    return this.log('warning', message, component, metadata);
  }

  static async error(message: string, component: string, metadata?: any) {
    return this.log('error', message, component, metadata);
  }
}
