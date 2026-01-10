import { defineConfig } from "drizzle-kit";

if (!process.env.EXTERNAL_DATABASE_URL) {
  throw new Error("EXTERNAL_DATABASE_URL is required");
}

export default defineConfig({
  out: "./migrations-neon",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.EXTERNAL_DATABASE_URL,
  },
});
