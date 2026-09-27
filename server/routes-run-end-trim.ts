/**
 * "Forgot to stop" end trim — Run Summary endpoints. Detection/patch logic lives in
 * server/run-end-trim.ts; see its header for the algorithm and the worked example.
 *
 *   GET  /api/runs/:id/end-trim          → { status: "none" | "suggested" | "applied" | "dismissed", suggestion?, applied? }
 *   POST /api/runs/:id/end-trim/apply    → trims to the (server-recomputed) suggestion; { run, endTrim }
 *   POST /api/runs/:id/end-trim/dismiss  → keep the run as recorded; the card won't come back
 *   POST /api/runs/:id/end-trim/undo     → restore the pre-trim run verbatim; { run, endTrim }
 *
 * Owner-only. Apply never trusts client-supplied numbers — it re-runs detection on the stored
 * track. Both apply and undo trigger the usual stats/PB recompute (onRunSaved).
 */
import type { Express, Response } from "express";
import { authMiddleware, type AuthenticatedRequest } from "./auth";
import { storage } from "./storage";
import { onRunSaved } from "./user-stats-cache";
import { detectEndTrim, buildEndTrimPatch, buildEndTrimUndoPatch, type EndTrimState } from "./run-end-trim";

function kmOf(distance: number): number {
  return distance > 200 ? distance / 1000 : distance;
}
function secOf(duration: number): number {
  return duration > 86400 ? Math.round(duration / 1000) : duration;
}

/** What the Run Summary needs to render the card for this run's current state. */
function endTrimView(run: any) {
  const state = run.endTrim as EndTrimState | null;
  if (state?.status === "applied") {
    const o = state.original ?? {};
    return {
      status: "applied" as const,
      applied: {
        removedSeconds: state.removedSeconds ?? 0,
        removedMeters: state.removedMeters ?? 0,
        originalDistanceKm: o.distance != null ? Math.round(kmOf(Number(o.distance)) * 1000) / 1000 : null,
        originalDurationSec: o.duration != null ? secOf(Number(o.duration)) : null,
        originalAvgPace: o.avgPace ?? null,
      },
    };
  }
  if (state?.status === "dismissed") return { status: "dismissed" as const };
  const suggestion = detectEndTrim(run);
  if (!suggestion) return { status: "none" as const };
  const { keepThroughIndex: _omit, ...publicSuggestion } = suggestion;
  return {
    status: "suggested" as const,
    suggestion: {
      ...publicSuggestion,
      originalDistanceKm: Math.round(kmOf(Number(run.distance)) * 1000) / 1000,
      originalDurationSec: secOf(Number(run.duration)),
      originalAvgPace: run.avgPace ?? null,
    },
  };
}

async function loadOwnedRun(req: AuthenticatedRequest, res: Response): Promise<any | null> {
  const run = await storage.getRun(req.params.id);
  if (!run || run.userId !== req.user!.userId) {
    res.status(404).json({ error: "Run not found" });
    return null;
  }
  return run;
}

export function registerRunEndTrimRoutes(app: Express, transformRun: (run: any) => any) {
  app.get("/api/runs/:id/end-trim", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await loadOwnedRun(req, res);
      if (!run) return;
      res.json(endTrimView(run));
    } catch (error: any) {
      console.error(`[GET /api/runs/${req.params.id}/end-trim]`, error);
      res.status(500).json({ error: "Failed to check run end" });
    }
  });

  app.post("/api/runs/:id/end-trim/apply", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await loadOwnedRun(req, res);
      if (!run) return;
      if ((run as any).endTrim?.status === "applied") {
        return res.status(409).json({ error: "Run already trimmed" });
      }
      const suggestion = detectEndTrim(run);
      if (!suggestion) return res.status(409).json({ error: "No trim suggested for this run" });

      const updated = await storage.updateRun(run.id, buildEndTrimPatch(run, suggestion) as any);
      if (!updated) return res.status(404).json({ error: "Run not found" });
      console.log(`[end-trim] Run ${run.id} trimmed: -${suggestion.removedSeconds}s -${suggestion.removedMeters}m ` +
        `→ ${suggestion.newDistanceKm}km ${suggestion.newDurationSec}s (${suggestion.tailKind})`);
      onRunSaved(run.userId, updated as any).catch(err => console.error("[end-trim] onRunSaved failed:", err));
      res.json({ run: transformRun(updated), endTrim: endTrimView(updated) });
    } catch (error: any) {
      console.error(`[POST /api/runs/${req.params.id}/end-trim/apply]`, error);
      res.status(500).json({ error: "Failed to trim run" });
    }
  });

  app.post("/api/runs/:id/end-trim/dismiss", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await loadOwnedRun(req, res);
      if (!run) return;
      if ((run as any).endTrim?.status === "applied") {
        return res.status(409).json({ error: "Run is trimmed — use undo" });
      }
      const state: EndTrimState = { status: "dismissed", at: new Date().toISOString() };
      await storage.updateRun(run.id, { endTrim: state } as any);
      res.json({ status: "dismissed" });
    } catch (error: any) {
      console.error(`[POST /api/runs/${req.params.id}/end-trim/dismiss]`, error);
      res.status(500).json({ error: "Failed to dismiss" });
    }
  });

  app.post("/api/runs/:id/end-trim/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const run = await loadOwnedRun(req, res);
      if (!run) return;
      const patch = buildEndTrimUndoPatch(run);
      if (!patch) return res.status(409).json({ error: "Run is not trimmed" });
      const updated = await storage.updateRun(run.id, patch as any);
      if (!updated) return res.status(404).json({ error: "Run not found" });
      console.log(`[end-trim] Run ${run.id} trim undone`);
      onRunSaved(run.userId, updated as any).catch(err => console.error("[end-trim] onRunSaved failed:", err));
      res.json({ run: transformRun(updated), endTrim: endTrimView(updated) });
    } catch (error: any) {
      console.error(`[POST /api/runs/${req.params.id}/end-trim/undo]`, error);
      res.status(500).json({ error: "Failed to undo trim" });
    }
  });
}
