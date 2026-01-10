import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Use EXTERNAL_DATABASE_URL (Neon) for all data - this is the production database
// Fall back to DATABASE_URL only for development when Neon is not available
const databaseUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("EXTERNAL_DATABASE_URL or DATABASE_URL environment variable is required");
}

const usingNeon = !!process.env.EXTERNAL_DATABASE_URL;
console.log(`Database: ${usingNeon ? 'Neon (EXTERNAL_DATABASE_URL)' : 'Replit (DATABASE_URL)'}`);

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.on('connect', () => {
  console.log('Database connected successfully');
});

export const db = drizzle(pool, { schema, logger: true });

export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      const isRetryable = error?.code === 'EAI_AGAIN' || 
                          error?.code === 'ECONNRESET' ||
                          error?.code === 'ETIMEDOUT';
      if (isRetryable && i < retries - 1) {
        console.log(`Database operation failed, retrying in ${delay}ms...`, error.code);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
