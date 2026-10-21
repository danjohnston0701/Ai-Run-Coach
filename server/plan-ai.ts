// One entry point for every AI call that writes or changes a training plan: block 1,
// next blocks, load-rule corrections, enrichment, adaptations, reassessments and the
// plan review. PLAN_AI_PROVIDER picks the model family (read on every call, so a
// comparison run can switch it): "openai" (default) or "anthropic"; see planAiProvider()
// for per-task overrides.
//
// Returns the OpenAI chat-completion shape the call sites already parse
// (choices[0].message.content / finish_reason "length" when truncated), so moving a call
// site here is a one-line change.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type PlanAiProvider = "openai" | "anthropic";

/** Claude model for every plan task. */
export const CLAUDE_PLAN_MODEL = "claude-sonnet-5-5";

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

/**
 * PLAN_AI_PROVIDER sets every task; PLAN_AI_PROVIDER_<TASK> overrides one (task name in
 * capitals, dashes as underscores — e.g. PLAN_AI_PROVIDER_PLAN_BLOCK_1=openai keeps the
 * block the runner waits for on the faster model while everything else uses Claude).
 */
export function planAiProvider(task?: string): PlanAiProvider {
  const override = task ? process.env[`PLAN_AI_PROVIDER_${task.toUpperCase().replace(/-/g, "_")}`] : undefined;
  return String(override ?? process.env.PLAN_AI_PROVIDER ?? "").toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

export interface PlanChatMessage { role: "system" | "user" | "assistant"; content: string }

export interface PlanChatRequest {
  /** What the call is for — shown in logs and the usage record. */
  task: string;
  /** Model used when the provider is OpenAI (the call site's existing choice). */
  openaiModel: string;
  messages: PlanChatMessage[];
  temperature?: number;
  maxTokens: number;
}

export interface PlanChatResponse {
  choices: Array<{ message: { content: string }; finish_reason: "stop" | "length" }>;
  provider: PlanAiProvider;
  model: string;
}

/** Per-process record of calls — read by the provider comparison (tools). */
export const planAiUsage: Array<{ task: string; provider: PlanAiProvider; model: string; ms: number; inputTokens: number; outputTokens: number }> = [];

const JSON_ONLY = "Respond with one valid JSON object only — no prose before or after it, no code fences.";

/** The JSON object in a reply that may carry stray text or fences around it. */
function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```json\n?/g, "").replace(/\n?```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

export async function planChat(req: PlanChatRequest): Promise<PlanChatResponse> {
  const provider = planAiProvider(req.task);
  const started = Date.now();

  if (provider === "anthropic") {
    anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = [...req.messages.filter(m => m.role === "system").map(m => m.content), JSON_ONLY].join("\n\n");
    const messages = req.messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    // Streamed: long plan replies can exceed the SDK's non-streaming time limit.
    const msg = await anthropicClient.messages
      .stream({ model: CLAUDE_PLAN_MODEL, max_tokens: req.maxTokens, system, messages })
      .finalMessage();
    const text = msg.content.map(b => (b.type === "text" ? b.text : "")).join("");
    planAiUsage.push({
      task: req.task, provider, model: CLAUDE_PLAN_MODEL, ms: Date.now() - started,
      inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens,
    });
    return {
      provider, model: CLAUDE_PLAN_MODEL,
      choices: [{ message: { content: extractJsonObject(text) }, finish_reason: msg.stop_reason === "max_tokens" ? "length" : "stop" }],
    };
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openaiClient.chat.completions.create({
    model: req.openaiModel,
    messages: req.messages,
    response_format: { type: "json_object" },
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
    max_tokens: req.maxTokens,
  });
  planAiUsage.push({
    task: req.task, provider, model: req.openaiModel, ms: Date.now() - started,
    inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0,
  });
  return {
    provider, model: req.openaiModel,
    choices: [{
      message: { content: res.choices[0]?.message?.content ?? "{}" },
      finish_reason: res.choices[0]?.finish_reason === "length" ? "length" : "stop",
    }],
  };
}
