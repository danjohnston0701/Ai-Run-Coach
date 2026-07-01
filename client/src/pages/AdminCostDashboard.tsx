import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  ArrowLeft, DollarSign, TrendingUp, Users, Server, Cpu,
  RefreshCw, ChevronDown, ChevronUp, Database, Zap, Map, Mic,
  AlertCircle, Info, Edit2, Check, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatUsd(value: number, decimals = 4): string {
  if (value === 0) return "$0.00";
  if (value < 0.0001) return "<$0.0001";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(decimals > 2 ? 2 : decimals)}`;
}

function formatUsdShort(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function monthOptions(): { label: string; value: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    options.push({ label, value });
  }
  return options;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Colour palette ─────────────────────────────────────────────────────────────
const SERVICE_COLOURS: Record<string, string> = {
  openai_chat: "#00D4FF",
  openai_tts: "#7C3AED",
  polly: "#F59E0B",
  graphhopper: "#10B981",
  replit: "#FF6B35",
  neon: "#3B82F6",
  other: "#6B7280",
};

const SERVICE_LABELS: Record<string, string> = {
  openai_chat: "OpenAI (Chat AI)",
  openai_tts: "OpenAI (TTS fallback)",
  polly: "AWS Polly (TTS)",
  graphhopper: "GraphHopper (Routes)",
  replit: "Replit (Hosting)",
  neon: "Neon (Database)",
  other: "Other",
};

const TIER_COLOURS: Record<string, string> = {
  free: "#6B7280",
  lite: "#10B981",
  standard: "#00D4FF",
  premium: "#7C3AED",
  null: "#4A5568",
};

// ── API helpers ────────────────────────────────────────────────────────────────
function getUserProfile() {
  try {
    const raw = localStorage.getItem("userProfile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const profile = getUserProfile();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-user-profile": JSON.stringify(profile),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  colour = "#00D4FF",
  highlight = false,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  colour?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`bg-gray-900 border-gray-800 ${highlight ? "ring-1 ring-cyan-500/40" : ""}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${colour}22` }}>
            <Icon className="w-5 h-5" style={{ color: colour }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostPieChart({ data }: { data: { name: string; value: number; colour: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.colour} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [formatUsd(v), ""]}
          contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, color: "#fff" }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={18} fontWeight="bold">
          {formatUsdShort(total)}
        </text>
        <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#718096" fontSize={11}>
          total
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

function InfraEditCard({
  yearMonth,
  initialValues,
  onSaved,
}: {
  yearMonth: string;
  initialValues: { replitCostUsd: number; neonCostUsd: number; otherCostUsd: number; notes: string };
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [replit, setReplit] = useState(String(initialValues.replitCostUsd ?? 0));
  const [neon, setNeon] = useState(String(initialValues.neonCostUsd ?? 0));
  const [other, setOther] = useState(String(initialValues.otherCostUsd ?? 0));
  const [notes, setNotes] = useState(initialValues.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReplit(String(initialValues.replitCostUsd ?? 0));
    setNeon(String(initialValues.neonCostUsd ?? 0));
    setOther(String(initialValues.otherCostUsd ?? 0));
    setNotes(initialValues.notes ?? "");
  }, [initialValues]);

  async function handleSave() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/costs/infra", {
        method: "POST",
        body: JSON.stringify({
          yearMonth,
          replitCostUsd: parseFloat(replit) || 0,
          neonCostUsd: parseFloat(neon) || 0,
          otherCostUsd: parseFloat(other) || 0,
          notes,
        }),
      });
      toast.success("Infrastructure costs saved");
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base">Infrastructure Costs</CardTitle>
            <CardDescription className="text-gray-400 text-xs mt-0.5">
              Enter your monthly Replit, Neon &amp; other bills manually
            </CardDescription>
          </div>
          {!editing ? (
            <Button size="sm" variant="outline" className="border-gray-700 text-gray-300 hover:text-white"
              onClick={() => setEditing(true)}>
              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-400"
                onClick={() => setEditing(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={handleSave} disabled={saving}>
                <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[
          { label: "Replit (hosting / compute)", value: replit, setter: setReplit, colour: SERVICE_COLOURS.replit },
          { label: "Neon (PostgreSQL database)", value: neon, setter: setNeon, colour: SERVICE_COLOURS.neon },
          { label: "Other (domains, misc)", value: other, setter: setOther, colour: SERVICE_COLOURS.other },
        ].map(({ label, value, setter, colour }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
            <span className="text-sm text-gray-300 flex-1">{label}</span>
            {editing ? (
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={e => setter(e.target.value)}
                  className="pl-6 h-8 bg-gray-800 border-gray-700 text-white text-sm"
                />
              </div>
            ) : (
              <span className="text-sm font-semibold text-white w-28 text-right">
                {formatUsd(parseFloat(value) || 0, 2)}
              </span>
            )}
          </div>
        ))}
        {editing && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Replit Core plan, Neon Scale"
              className="bg-gray-800 border-gray-700 text-white text-sm"
            />
          </div>
        )}
        {!editing && notes && (
          <p className="text-xs text-gray-500 italic">{notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminCostDashboard() {
  const [, setLocation] = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth());
  const [overview, setOverview] = useState<any>(null);
  const [userCosts, setUserCosts] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [infra, setInfra] = useState<any>({ replitCostUsd: 0, neonCostUsd: 0, otherCostUsd: 0, notes: "" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Check admin
  useEffect(() => {
    const profile = getUserProfile();
    if (!profile) { setLocation("/login"); return; }
    fetch(`/api/users/${profile.id}`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("authToken")}` },
    })
      .then(r => r.json())
      .then(u => {
        if (!u.isAdmin) { setLocation("/"); return; }
        setIsAdmin(true);
      })
      .catch(() => setLocation("/"));
  }, []);

  const loadData = useCallback(async (month = selectedMonth) => {
    try {
      const [ov, uc, tl, inf] = await Promise.all([
        adminFetch(`/api/admin/costs/overview?yearMonth=${month}`),
        adminFetch(`/api/admin/costs/users?yearMonth=${month}`),
        adminFetch(`/api/admin/costs/timeline?days=30`),
        adminFetch(`/api/admin/costs/infra?yearMonth=${month}`),
      ]);
      setOverview(ov);
      setUserCosts(uc);
      setTimeline(tl);
      setInfra(inf);
    } catch (e: any) {
      toast.error("Failed to load cost data: " + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (isAdmin) { setLoading(true); loadData(selectedMonth); }
  }, [isAdmin, selectedMonth]);

  function handleRefresh() {
    setRefreshing(true);
    loadData(selectedMonth);
  }

  if (isAdmin === false) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading cost data…</p>
        </div>
      </div>
    );
  }

  const months = monthOptions();
  const s = overview?.summary ?? {};

  // Pie chart data — all cost centres
  const pieData = [
    { name: SERVICE_LABELS.openai_chat, value: s.openaiChatUsd ?? 0, colour: SERVICE_COLOURS.openai_chat },
    { name: SERVICE_LABELS.openai_tts, value: s.openaiTtsUsd ?? 0, colour: SERVICE_COLOURS.openai_tts },
    { name: SERVICE_LABELS.polly, value: s.pollyUsd ?? 0, colour: SERVICE_COLOURS.polly },
    { name: SERVICE_LABELS.graphhopper, value: s.graphhopperUsd ?? 0, colour: SERVICE_COLOURS.graphhopper },
    { name: SERVICE_LABELS.replit, value: s.replitUsd ?? 0, colour: SERVICE_COLOURS.replit },
    { name: SERVICE_LABELS.neon, value: s.neonUsd ?? 0, colour: SERVICE_COLOURS.neon },
    { name: SERVICE_LABELS.other, value: s.otherUsd ?? 0, colour: SERVICE_COLOURS.other },
  ].filter(d => d.value > 0);

  // Tier breakdown for user summary
  const tierData = (overview?.users?.byTier ?? []).map((t: any) => ({
    name: t.tier ?? "Unknown",
    count: Number(t.count),
    colour: TIER_COLOURS[t.tier ?? "null"] ?? TIER_COLOURS.null,
  }));

  // Cost per active user
  const activeUsers = overview?.users?.activeThisMonth ?? 0;
  const costPerActiveUser = activeUsers > 0 ? s.totalCostUsd / activeUsers : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/admin/ai-config")}
              className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-300" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Cost Dashboard</h1>
              <p className="text-xs text-gray-400">Admin · Usage & Spend Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-gray-200 text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {months.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-gray-200 focus:bg-gray-700">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline"
              className="border-gray-700 text-gray-300 hover:text-white h-9"
              onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Zero-data notice */}
        {s.totalApiCostUsd === 0 && s.totalInfraCostUsd === 0 && (
          <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-medium">No cost data tracked yet for this month</p>
              <p className="text-amber-400/70 mt-0.5">
                API costs are recorded automatically as your users generate AI coaching, TTS audio, and routes.
                Data will appear here in real time. Enter your Replit &amp; Neon costs manually below.
              </p>
            </div>
          </div>
        )}

        {/* Top KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={DollarSign} label="Total Spend" value={formatUsdShort(s.totalCostUsd ?? 0)}
            sub={`API $${(s.totalApiCostUsd ?? 0).toFixed(2)} + Infra $${(s.totalInfraCostUsd ?? 0).toFixed(2)}`}
            colour="#00D4FF" highlight />
          <StatCard icon={TrendingUp} label="Cost / Active User" value={formatUsdShort(costPerActiveUser)}
            sub={`${activeUsers} active users this month`} colour="#10B981" />
          <StatCard icon={Users} label="Total Users" value={String(overview?.users?.total ?? 0)}
            sub={`${activeUsers} ran this month`} colour="#7C3AED" />
          <StatCard icon={Zap} label="AI Coaching" value={formatUsdShort((s.openaiChatUsd ?? 0) + (s.pollyUsd ?? 0) + (s.openaiTtsUsd ?? 0))}
            sub="Chat + voice synthesis" colour="#F59E0B" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">
              Per User
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">
              Timeline
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ── */}
          <TabsContent value="overview" className="space-y-5 mt-4">
            <div className="grid md:grid-cols-2 gap-5">

              {/* Cost breakdown pie */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Spend by Service</CardTitle>
                  <CardDescription className="text-gray-400 text-xs">{selectedMonth}</CardDescription>
                </CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <>
                      <CostPieChart data={pieData} />
                      <div className="space-y-2 mt-2">
                        {pieData.map(d => (
                          <div key={d.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.colour }} />
                              <span className="text-gray-300">{d.name}</span>
                            </div>
                            <span className="text-white font-medium">{formatUsd(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
                      No spend data yet
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* API spend detail */}
              <div className="space-y-3">
                {[
                  {
                    icon: Zap,
                    label: "OpenAI Chat (AI Coaching)",
                    value: s.openaiChatUsd ?? 0,
                    colour: SERVICE_COLOURS.openai_chat,
                    detail: (() => {
                      const r = overview?.serviceBreakdown?.find((x: any) => x.service === "openai_chat");
                      if (!r) return "No calls recorded";
                      return `${Number(r.totalInputTokens).toLocaleString()} input + ${Number(r.totalOutputTokens).toLocaleString()} output tokens · ${Number(r.callCount)} calls`;
                    })(),
                    pricing: "$0.15 / 1M input · $0.60 / 1M output",
                  },
                  {
                    icon: Mic,
                    label: "AWS Polly (Voice Synthesis)",
                    value: s.pollyUsd ?? 0,
                    colour: SERVICE_COLOURS.polly,
                    detail: (() => {
                      const r = overview?.serviceBreakdown?.find((x: any) => x.service === "polly");
                      if (!r) return "No calls recorded";
                      return `${Number(r.totalCharacters).toLocaleString()} characters synthesised · ${Number(r.callCount)} calls`;
                    })(),
                    pricing: "$16.00 / 1M characters (Neural)",
                  },
                  {
                    icon: Mic,
                    label: "OpenAI TTS (fallback)",
                    value: s.openaiTtsUsd ?? 0,
                    colour: SERVICE_COLOURS.openai_tts,
                    detail: (() => {
                      const r = overview?.serviceBreakdown?.find((x: any) => x.service === "openai_tts");
                      if (!r) return "No calls recorded";
                      return `${Number(r.totalCharacters).toLocaleString()} characters · ${Number(r.callCount)} calls`;
                    })(),
                    pricing: "$15.00 / 1M characters",
                  },
                  {
                    icon: Map,
                    label: "GraphHopper (Route Generation)",
                    value: s.graphhopperUsd ?? 0,
                    colour: SERVICE_COLOURS.graphhopper,
                    detail: (() => {
                      const r = overview?.serviceBreakdown?.find((x: any) => x.service === "graphhopper");
                      if (!r) return "No calls recorded";
                      return `${Number(r.totalRequests).toLocaleString()} routes generated`;
                    })(),
                    pricing: "$0.01 / route request",
                  },
                ].map(({ icon: Icon, label, value, colour, detail, pricing }) => (
                  <Card key={label} className="bg-gray-900 border-gray-800">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg mt-0.5" style={{ backgroundColor: `${colour}22` }}>
                          <Icon className="w-4 h-4" style={{ color: colour }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-200">{label}</p>
                            <p className="text-base font-bold text-white whitespace-nowrap">{formatUsd(value)}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
                          <p className="text-xs text-gray-600 mt-0.5 font-mono">{pricing}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Infrastructure costs */}
            <div className="grid md:grid-cols-2 gap-5">
              <InfraEditCard yearMonth={selectedMonth} initialValues={infra} onSaved={() => loadData(selectedMonth)} />

              {/* User tier breakdown */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Users by Tier</CardTitle>
                  <CardDescription className="text-gray-400 text-xs">All time</CardDescription>
                </CardHeader>
                <CardContent>
                  {tierData.length > 0 ? (
                    <div className="space-y-3">
                      {tierData.map((t: any) => (
                        <div key={t.name} className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.colour }} />
                          <span className="text-sm text-gray-300 flex-1 capitalize">{t.name ?? "No tier"}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-800 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.round((t.count / (overview?.users?.total || 1)) * 100)}%`,
                                backgroundColor: t.colour
                              }} />
                            </div>
                            <span className="text-sm font-semibold text-white w-8 text-right">{t.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center text-gray-500 text-sm">No tier data</div>
                  )}
                  <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Cost / active user / month</span>
                    <span className="text-sm font-bold text-cyan-400">{formatUsd(costPerActiveUser, 2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pricing reference card */}
            <Card className="bg-gray-900/60 border-gray-800">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-gray-400" />
                  <CardTitle className="text-gray-300 text-sm font-medium">Vendor Pricing Reference</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-400">
                  {[
                    { label: "OpenAI GPT-4o-mini", lines: ["Input: $0.15 / 1M tokens", "Output: $0.60 / 1M tokens"] },
                    { label: "OpenAI TTS", lines: ["$15.00 / 1M characters", "(gpt-4o-mini-tts fallback)"] },
                    { label: "AWS Polly Neural", lines: ["$16.00 / 1M characters", "(primary TTS engine)"] },
                    { label: "GraphHopper", lines: ["~$0.01 / route request", "500 req/day free tier"] },
                  ].map(({ label, lines }) => (
                    <div key={label} className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-200 font-medium mb-1">{label}</p>
                      {lines.map(l => <p key={l} className="font-mono">{l}</p>)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PER USER TAB ── */}
          <TabsContent value="users" className="mt-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Cost per User — {selectedMonth}</CardTitle>
                <CardDescription className="text-gray-400 text-xs">
                  Sorted by estimated spend. Direct API costs tracked per-call; usage-based estimates derived from your monthly usage counters.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {(userCosts?.users ?? []).length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No user data available</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {(userCosts?.users ?? []).slice(0, 100).map((u: any) => {
                      const total = u.combinedTotalUsd ?? 0;
                      const isExpanded = expandedUser === u.id;
                      return (
                        <div key={u.id}>
                          <button
                            className="w-full text-left px-5 py-3.5 hover:bg-gray-800/50 transition-colors"
                            onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                            data-testid={`user-row-${u.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-white">
                                  {(u.name ?? "?")[0]?.toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-white">{u.name ?? "Unknown"}</span>
                                  <Badge variant="outline" className="text-xs border-gray-700 text-gray-400 capitalize">
                                    {u.subscriptionTier ?? "free"}
                                  </Badge>
                                  {u.subscriptionStatus === "active" && (
                                    <Badge className="text-xs bg-green-900/50 text-green-400 border-green-800">Active</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-white">{formatUsd(total)}</p>
                                <p className="text-xs text-gray-500">est. spend</p>
                              </div>
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-5 pb-4 bg-gray-800/30">
                              <div className="grid sm:grid-cols-2 gap-4 pt-3">
                                <div>
                                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Usage This Month</p>
                                  <div className="space-y-1.5">
                                    {[
                                      { label: "AI coaching km", value: `${(u.usage?.aiCoachingKm ?? 0).toFixed(1)} km` },
                                      { label: "Routes generated", value: u.usage?.routesGenerated ?? 0 },
                                      { label: "Post-run analyses", value: u.usage?.postRunAnalyses ?? 0 },
                                      { label: "Training plans", value: u.usage?.trainingPlansGenerated ?? 0 },
                                    ].map(({ label, value }) => (
                                      <div key={label} className="flex justify-between text-xs">
                                        <span className="text-gray-400">{label}</span>
                                        <span className="text-gray-200 font-medium">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Estimated Cost Breakdown</p>
                                  <div className="space-y-1.5">
                                    {[
                                      { label: "TTS (voice coaching)", value: u.usage?.estimatedTtsCostUsd ?? 0, colour: SERVICE_COLOURS.polly },
                                      { label: "Route generation", value: u.usage?.estimatedRouteCostUsd ?? 0, colour: SERVICE_COLOURS.graphhopper },
                                      { label: "Post-run AI analysis", value: u.usage?.estimatedAnalysisCostUsd ?? 0, colour: SERVICE_COLOURS.openai_chat },
                                      { label: "Training plan AI", value: u.usage?.estimatedPlanCostUsd ?? 0, colour: SERVICE_COLOURS.openai_chat },
                                    ].map(({ label, value, colour }) => (
                                      <div key={label} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colour }} />
                                          <span className="text-gray-400">{label}</span>
                                        </div>
                                        <span className="text-gray-200 font-medium">{formatUsd(value)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between items-center text-xs border-t border-gray-700 pt-1.5 mt-1">
                                      <span className="text-gray-300 font-medium">Total estimated</span>
                                      <span className="text-white font-bold">{formatUsd(u.estimatedTotalUsd ?? 0)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 pt-2 border-t border-gray-700">
                                <p className="text-xs text-gray-500">
                                  User ID: <span className="font-mono text-gray-400">{u.id.slice(0, 8)}…</span>
                                  {" · "}Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "unknown"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TIMELINE TAB ── */}
          <TabsContent value="timeline" className="mt-4 space-y-5">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base">Daily API Spend — Last 30 Days</CardTitle>
                <CardDescription className="text-gray-400 text-xs">
                  Tracked from api_cost_logs. Grows as users run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(timeline?.timeline ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={timeline.timeline} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                      <defs>
                        {Object.entries(SERVICE_COLOURS).slice(0, 4).map(([key, colour]) => (
                          <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colour} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={colour} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="date" tick={{ fill: "#718096", fontSize: 11 }}
                        tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: "#718096", fontSize: 11 }}
                        tickFormatter={v => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`} />
                      <Tooltip
                        formatter={(v: number, name: string) => [formatUsd(v), SERVICE_LABELS[name] ?? name]}
                        contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, color: "#fff" }}
                        labelStyle={{ color: "#a0aec0" }}
                      />
                      <Legend formatter={(v: string) => <span style={{ color: "#a0aec0", fontSize: 12 }}>{SERVICE_LABELS[v] ?? v}</span>} />
                      {["openai_chat", "polly", "openai_tts", "graphhopper"].map(key => (
                        <Area key={key} type="monotone" dataKey={key} stackId="1"
                          stroke={SERVICE_COLOURS[key]} fill={`url(#grad-${key})`}
                          strokeWidth={2} dot={false} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-500">
                    <TrendingUp className="w-10 h-10 text-gray-700" />
                    <p className="text-sm">No daily data yet — costs will appear here as users run</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base">Calls per Service — Last 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                {(timeline?.timeline ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={timeline.timeline} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="date" tick={{ fill: "#718096", fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: "#718096", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, color: "#fff" }}
                        labelStyle={{ color: "#a0aec0" }}
                      />
                      <Legend formatter={(v: string) => <span style={{ color: "#a0aec0", fontSize: 12 }}>{SERVICE_LABELS[v] ?? v}</span>} />
                      {["openai_chat", "polly", "openai_tts", "graphhopper"].map(key => (
                        <Bar key={key} dataKey={key} stackId="a" fill={SERVICE_COLOURS[key]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-500 text-sm">No call data yet</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
