/**
 * Cost Tracking Service
 *
 * Logs every paid external API call (OpenAI, AWS Polly, GraphHopper) to the
 * api_cost_logs table so the admin dashboard can show real spend.
 *
 * Pricing constants (update these when vendor pricing changes):
 *   OpenAI GPT-4o-mini chat  — $0.15 / 1M input tokens, $0.60 / 1M output tokens
 *   OpenAI TTS (gpt-4o-mini-tts) — $15.00 / 1M characters
 *   AWS Polly Neural          — $16.00 / 1M characters
 *   GraphHopper               — $0.01 per route request (approximate; free tier has 500 req/day)
 */

import { db } from "./db";
import { apiCostLogs } from "@shared/schema";
import type { InsertApiCostLog } from "@shared/schema";

// ── Pricing constants (USD) ───────────────────────────────────────────────────

export const PRICING = {
  openai: {
    inputTokensPerMillionUsd: 0.15,
    outputTokensPerMillionUsd: 0.60,
    ttsPerMillionCharsUsd: 15.0,
  },
  polly: {
    neuralPerMillionCharsUsd: 16.0,
  },
  graphhopper: {
    perRequestUsd: 0.01,
  },
} as const;

// ── Cost calculators ──────────────────────────────────────────────────────────

export function calcOpenAIChatCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICING.openai.inputTokensPerMillionUsd +
    (outputTokens / 1_000_000) * PRICING.openai.outputTokensPerMillionUsd
  );
}

export function calcOpenAITtsCost(characters: number): number {
  return (characters / 1_000_000) * PRICING.openai.ttsPerMillionCharsUsd;
}

export function calcPollyTtsCost(characters: number): number {
  return (characters / 1_000_000) * PRICING.polly.neuralPerMillionCharsUsd;
}

export function calcGraphHopperCost(requests: number = 1): number {
  return requests * PRICING.graphhopper.perRequestUsd;
}

// ── Internal insert helper ────────────────────────────────────────────────────

function insertCostLog(row: InsertApiCostLog): void {
  (db.insert(apiCostLogs).values(row as any) as any).catch((err: any) => {
    console.error("[CostTracking] DB insert failed:", err?.message);
  });
}

// ── Logging functions — all fire-and-forget ───────────────────────────────────

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

/**
 * Log an OpenAI chat completion call.
 * Call this immediately after openai.chat.completions.create() succeeds.
 */
export function trackOpenAIChatCost(
  usage: OpenAIUsage,
  userId: string | null | undefined,
  operation: string
): void {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const cost = calcOpenAIChatCost(inputTokens, outputTokens);

  insertCostLog({
    userId: userId ?? null,
    service: "openai_chat",
    operation,
    inputTokens,
    outputTokens,
    estimatedCostUsd: cost,
  });
}

/**
 * Log an OpenAI TTS call.
 * Call this immediately after openai.audio.speech.create() succeeds.
 */
export function trackOpenAITtsCost(
  text: string,
  userId: string | null | undefined
): void {
  const characters = text.length;
  const cost = calcOpenAITtsCost(characters);

  insertCostLog({
    userId: userId ?? null,
    service: "openai_tts",
    operation: "tts",
    characters,
    estimatedCostUsd: cost,
  });
}

/**
 * Log an AWS Polly TTS call.
 * Call this immediately after SynthesizeSpeechCommand succeeds.
 */
export function trackPollyCost(
  text: string,
  userId: string | null | undefined
): void {
  const characters = text.length;
  const cost = calcPollyTtsCost(characters);

  insertCostLog({
    userId: userId ?? null,
    service: "polly",
    operation: "tts",
    characters,
    estimatedCostUsd: cost,
  });
}

/**
 * Log a GraphHopper route generation call.
 */
export function trackGraphHopperCost(
  userId: string | null | undefined,
  operation: string = "route_generation",
  requests: number = 1
): void {
  const cost = calcGraphHopperCost(requests);

  insertCostLog({
    userId: userId ?? null,
    service: "graphhopper",
    operation,
    requests,
    estimatedCostUsd: cost,
  });
}
