import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Always prioritize EXTERNAL_DATABASE_URL (Neon) when available - this is where user data lives
// Fall back to DATABASE_URL (Replit's built-in) only if EXTERNAL_DATABASE_URL is not set
const databaseUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or EXTERNAL_DATABASE_URL environment variable is required");
}

const isUsingNeon = !!process.env.EXTERNAL_DATABASE_URL;
console.log("Using database:", isUsingNeon ? "External (Neon)" : "Replit built-in");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("EXTERNAL_DATABASE_URL exists:", !!process.env.EXTERNAL_DATABASE_URL);
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

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
