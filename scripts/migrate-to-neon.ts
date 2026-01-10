import pkg from "pg";
const { Pool } = pkg;

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.EXTERNAL_DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  console.error("Both DATABASE_URL and EXTERNAL_DATABASE_URL are required");
  process.exit(1);
}

const sourcePool = new Pool({ connectionString: sourceUrl });
const targetPool = new Pool({ connectionString: targetUrl });

const tables = [
  "users",
  "coupon_codes",
  "pre_registrations",
  "ai_coach_description",
  "ai_coach_instructions",
  "ai_coach_knowledge",
  "ai_coach_faq",
  "routes",
  "user_coupons",
  "friends",
  "runs",
  "goals",
  "live_run_sessions",
  "garmin_data",
  "friend_requests",
  "push_subscriptions",
  "notifications",
  "route_ratings",
  "group_runs",
  "group_run_participants",
  "run_analyses",
];

async function migrateTable(tableName: string) {
  try {
    const sourceResult = await sourcePool.query(`SELECT * FROM ${tableName}`);
    const rows = sourceResult.rows;
    
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows (empty)`);
      return 0;
    }

    const targetCheck = await targetPool.query(`SELECT id FROM ${tableName} LIMIT 1`);
    const columns = Object.keys(rows[0]);
    
    let inserted = 0;
    for (const row of rows) {
      const exists = await targetPool.query(
        `SELECT 1 FROM ${tableName} WHERE id = $1`,
        [row.id]
      );
      
      if (exists.rows.length === 0) {
        const values = columns.map((_, i) => `$${i + 1}`).join(", ");
        const columnNames = columns.map(c => `"${c}"`).join(", ");
        
        try {
          await targetPool.query(
            `INSERT INTO ${tableName} (${columnNames}) VALUES (${values})`,
            columns.map(c => row[c])
          );
          inserted++;
        } catch (err: any) {
          console.error(`  Error inserting into ${tableName}:`, err.message);
        }
      }
    }
    
    console.log(`  ${tableName}: ${inserted}/${rows.length} rows migrated`);
    return inserted;
  } catch (err: any) {
    console.error(`  Error migrating ${tableName}:`, err.message);
    return 0;
  }
}

async function main() {
  console.log("Starting migration from Replit DB to Neon...\n");
  
  console.log("Source (Replit):", sourceUrl?.substring(0, 30) + "...");
  console.log("Target (Neon):", targetUrl?.substring(0, 30) + "...\n");
  
  let totalMigrated = 0;
  
  for (const table of tables) {
    const migrated = await migrateTable(table);
    totalMigrated += migrated;
  }
  
  console.log(`\nMigration complete! Total rows migrated: ${totalMigrated}`);
  
  await sourcePool.end();
  await targetPool.end();
}

main().catch(console.error);
