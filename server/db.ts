import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// In production (deployment), use EXTERNAL_DATABASE_URL (Neon) where user data lives
// In development, use DATABASE_URL (Replit's local PostgreSQL)
const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
const databaseUrl = isProduction 
  ? (process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL)
  : (process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL);

if (!databaseUrl) {
  throw new Error("DATABASE_URL or EXTERNAL_DATABASE_URL environment variable is required");
}

console.log(`Database mode: ${isProduction ? 'Production' : 'Development'}`);
console.log(`Using: ${isProduction && process.env.EXTERNAL_DATABASE_URL ? 'EXTERNAL_DATABASE_URL (Neon)' : 'DATABASE_URL'}`);

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
