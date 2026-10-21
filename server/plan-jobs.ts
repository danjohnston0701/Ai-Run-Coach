// Background plan generation. A plan written by Claude takes 2–2.5 minutes, longer than the
// apps wait on one request (iOS 90 s, Android 120 s). Apps that send `async: true` to
// POST /api/training-plans/generate get a job id straight away and poll
// GET /api/training-plans/jobs/:jobId until it is ready or failed.
//
// Jobs live in the database, not memory: autoscale may answer a poll from another instance.
// Raw pool queries — the table is created by auto-migrate.ts and isn't in the Drizzle schema.
import { pool } from "./db";

/** A job still "generating" after this long has died with its instance — report it failed. */
const STALE_MS = 8 * 60 * 1000;

export interface PlanJob {
  id: string;
  userId: string;
  status: "generating" | "ready" | "failed";
  planId: string | null;
  error: string | null;
  errorCode: string | null;
  createdAt: Date;
}

const toJob = (r: any): PlanJob => ({
  id: r.id, userId: r.user_id, status: r.status, planId: r.plan_id, error: r.error,
  errorCode: r.error_code, createdAt: new Date(r.created_at),
});

async function failIfStale(job: PlanJob): Promise<PlanJob> {
  if (job.status !== "generating" || Date.now() - job.createdAt.getTime() < STALE_MS) return job;
  const error = "Building your plan took too long. Please try again.";
  await failPlanJob(job.id, error, "PLAN_JOB_TIMEOUT");
  return { ...job, status: "failed", error, errorCode: "PLAN_JOB_TIMEOUT" };
}

export async function createPlanJob(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO plan_generation_jobs (user_id) VALUES ($1) RETURNING id`, [userId]);
  return rows[0].id;
}

export async function finishPlanJob(jobId: string, planId: string): Promise<void> {
  await pool.query(
    `UPDATE plan_generation_jobs SET status = 'ready', plan_id = $2, updated_at = NOW() WHERE id = $1`, [jobId, planId]);
}

export async function failPlanJob(jobId: string, error: string, errorCode: string | null = null): Promise<void> {
  await pool.query(
    `UPDATE plan_generation_jobs SET status = 'failed', error = $2, error_code = $3, updated_at = NOW() WHERE id = $1`,
    [jobId, error.slice(0, 500), errorCode]);
}

/** The runner's own job, or null. */
export async function getPlanJob(jobId: string, userId: string): Promise<PlanJob | null> {
  const { rows } = await pool.query(
    `SELECT * FROM plan_generation_jobs WHERE id = $1 AND user_id = $2`, [jobId, userId]);
  return rows[0] ? failIfStale(toJob(rows[0])) : null;
}

/** A job of this runner's still being generated (any instance), or null. */
export async function getGeneratingPlanJob(userId: string): Promise<PlanJob | null> {
  const { rows } = await pool.query(
    `SELECT * FROM plan_generation_jobs WHERE user_id = $1 AND status = 'generating' ORDER BY created_at DESC LIMIT 1`, [userId]);
  if (!rows[0]) return null;
  const job = await failIfStale(toJob(rows[0]));
  return job.status === "generating" ? job : null;
}
