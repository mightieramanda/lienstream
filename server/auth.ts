import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Extend Express Request to include session
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function initializeAdmin() {
  try {
    // Check if admin user exists
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, 'Admin'));
    
    if (!existingAdmin) {
      // Hash the password
      const hashedPassword = await bcrypt.hash('@M1ght13r2025!!', 10);
      
      // Create admin user
      await db.insert(users).values({
        username: 'Admin',
        password: hashedPassword
      });
      
      console.log('[Auth] Admin user created successfully');
    } else {
      console.log('[Auth] Admin user already exists');
    }
  } catch (error) {
    console.error('[Auth] Error initializing admin:', error);
  }
}

export async function authenticate(username: string, password: string): Promise<string | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    
    if (!user) {
      return null;
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function requireAuthPage(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}