// Resets the demo group run in the LOCAL throwaway DB so a take can be re-shot.
//   node reset.cjs <seed.json>
const { Client } = require("/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/node_modules/pg");
const seed = require(require("path").resolve(process.argv[2]));
const DB = process.env.DEMO_DB || "postgresql://demo:demo@localhost:54329/airuncoach?sslmode=no-verify";
if (!DB.includes("localhost")) throw new Error("refusing: demo reset only runs against a localhost DB");
(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const ids = Object.values(seed.users).map((u) => u.id);
  const runs = await db.query("SELECT id FROM runs WHERE group_run_id = $1", [seed.groupRunId]);
  await db.query("UPDATE group_run_participants SET run_id = NULL, started_at = NULL, completed_at = NULL WHERE group_run_id = $1", [seed.groupRunId]);
  for (const r of runs.rows) await db.query("DELETE FROM runs WHERE id = $1", [r.id]).catch((e) => console.warn("run", r.id, e.message));
  await db.query("UPDATE group_runs SET status = 'upcoming', started_at = NULL, completed_at = NULL WHERE id = $1", [seed.groupRunId]);
  console.log(`reset: removed ${runs.rows.length} runs; ${ids.length} participants cleared`);
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
