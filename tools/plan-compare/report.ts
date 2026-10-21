// Side-by-side report from compare.ts outputs: how good each provider's first attempt was,
// what the quality gate had to fix, cost/time, and the final plans next to each other.
//   npx tsx tools/plan-compare/report.ts report.html verdict.html|- out-openai.json out-anthropic.json [more.json …]
import fs from "node:fs";

const [outPath, verdictPath, ...inputs] = process.argv.slice(2);
if (!outPath || inputs.length === 0) throw new Error("usage: report.ts report.html verdict.html|- a.json [b.json …]");
const runs: any[] = inputs.flatMap(f => JSON.parse(fs.readFileSync(f, "utf8")));

const ENGINE_NAMES: Record<string, string> = { openai: "OpenAI", anthropic: "Claude", hybrid: "Hybrid: OpenAI writes, Claude reviews" };
const engineName = (p: string) => ENGINE_NAMES[p] ?? p;

// List price per million tokens (input, output) — for a rough cost column only.
const PRICE: Record<string, [number, number]> = {
  "gpt-4.1": [2, 8], "gpt-4o": [2.5, 10], "claude-sonnet-5-5": [3, 15],
};
const cost = (r: any) => (r.calls ?? []).reduce((s: number, c: any) => {
  const [i, o] = PRICE[c.model] ?? [0, 0];
  return s + (c.in * i + c.out * o) / 1e6;
}, 0);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const providers = [...new Set(runs.map(r => r.provider))];
const labels = [...new Set(runs.map(r => r.label))];

const summaryRows = labels.flatMap(label => providers.map(p => {
  const rs = runs.filter(r => r.label === label && r.provider === p);
  const ok = rs.filter(r => !r.error);
  return `<tr><td>${esc(label)}</td><td class="prov ${p}">${esc(engineName(p))}</td>
    <td class="num">${ok.length}/${rs.length}</td>
    <td class="num">${avg(ok.map(r => r.firstAttemptViolations)).toFixed(1)}</td>
    <td class="num">${avg(ok.map(r => r.correctionRounds)).toFixed(1)}</td>
    <td class="num">${avg(ok.map(r => r.repairs)).toFixed(1)}</td>
    <td class="num">${ok.filter(r => r.stillFlagged).length}</td>
    <td class="num">${avg(ok.map(r => r.reviewRewrites)).toFixed(1)}</td>
    <td class="num">${Math.round(avg(ok.map(r => r.seconds)))} s</td>
    <td class="num">$${avg(ok.map(cost)).toFixed(3)}</td></tr>`;
})).join("");

const fmtMin = (s: number | null) => (s ? `${Math.round(s / 60)} min` : "");
const sessionCell = (w: any) => {
  const reps = w.interval_count ? ` · ${w.interval_count}×${w.interval_distance_meters ? `${w.interval_distance_meters} m` : fmtMin(w.interval_duration_seconds)}` : "";
  return `<div class="s"><div class="h"><b>${esc(w.date)}</b> ${esc(w.workout_type)} · ${w.distance ?? "–"} km${w.duration ? ` · ${fmtMin(w.duration)}` : ""}${w.target_pace ? ` · ${esc(w.target_pace)}/km` : ""} · ${esc(w.intensity)}${w.hr_zone_min_bpm ? ` ${w.hr_zone_min_bpm}–${w.hr_zone_max_bpm}` : ""}${reps}</div>
    <div class="d">${esc(w.description)}</div><div class="i">${esc(w.instructions)}</div></div>`;
};
const planColumn = (r: any | undefined) => {
  if (!r) return "";
  const head = `<h3 class="prov ${r.provider}">${esc(engineName(r.provider))}</h3>`;
  if (r.error) return `<div class="col ${r.provider}">${head}<p class="err">Failed: ${esc(r.error)}</p></div>`;
  const byWeek = new Map<number, any[]>();
  for (const w of r.workouts) byWeek.set(w.week_number, [...(byWeek.get(w.week_number) ?? []), w]);
  const weeks = r.weeks.map((wk: any) => `<div class="wk"><div class="wkh">Week ${wk.week_number} · ${wk.total_distance} km</div>${(byWeek.get(wk.week_number) ?? []).map(sessionCell).join("")}</div>`).join("");
  const gate = r.gateLog?.length ? `<details><summary>Quality gate (${r.firstAttemptViolations} first-attempt problems, ${r.repairs} repairs)</summary><pre>${esc(r.gateLog.join("\n"))}</pre></details>` : `<p class="pass">Passed the load rules first time</p>`;
  const review = r.reviewConcerns ? `<details><summary>Reviewer concerns</summary><pre>${esc(r.reviewConcerns)}</pre></details>` : "";
  return `<div class="col ${r.provider}">${head}${gate}${review}${weeks}</div>`;
};
const planSections = labels.map(label => {
  const first = providers.map(p => runs.find(r => r.label === label && r.provider === p && r.repeat === 1));
  return `<section class="runner"><h2>${esc(label)}</h2><div class="cols">${first.map(planColumn).join("")}</div></section>`;
}).join("");

const verdict = verdictPath && verdictPath !== "-" && fs.existsSync(verdictPath) ? fs.readFileSync(verdictPath, "utf8") : "";

// A page fragment (no html/head/body): the artifact publisher wraps it.
fs.writeFileSync(outPath, `<title>Plan Engine Trial</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: a race-results sheet — verdict, results table, then the two plans side by side per runner. */
:root{
  --bg:#f3f5f7; --surface:#ffffff; --fg:#16202a; --muted:#5a6876; --line:#d6dde4;
  --oa:#0e7c86; --an:#b4532a; --hy:#5b4fb0; --good:#1d7a3e; --bad:#b3261e;
  --display:"Barlow Condensed","Arial Narrow",sans-serif; --body:"Source Sans 3",system-ui,sans-serif; --mono:"JetBrains Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1419;--surface:#151d24;--fg:#e4eaef;--muted:#93a2b0;--line:#26323c;--oa:#3cc3cf;--an:#ec8a5c;--hy:#a99cf2;--good:#55c27c;--bad:#f2786f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e1419;--surface:#151d24;--fg:#e4eaef;--muted:#93a2b0;--line:#26323c;--oa:#3cc3cf;--an:#ec8a5c;--hy:#a99cf2;--good:#55c27c;--bad:#f2786f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.5 var(--body);padding-block:28px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1280px;margin-inline:auto;display:grid;gap:28px}
h1,h2{font-family:var(--display);font-weight:700;letter-spacing:.01em;text-wrap:balance;margin:0;line-height:1.1}
h1{font-size:clamp(30px,5vw,44px)}h2{font-size:26px}
.lead{color:var(--muted);max-width:68ch;margin:6px 0 0}
.verdict{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:18px 20px;max-width:80ch}
.verdict h2{font-size:22px;margin-bottom:6px}.verdict p,.verdict li{margin:6px 0}
.wrap{overflow-x:auto;min-width:0}
table{border-collapse:collapse;width:100%;background:var(--surface);font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{font:600 12px/1.3 var(--body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
td.num{font-family:var(--mono);font-size:14px}
.prov{font-weight:600}.prov.openai{color:var(--oa)}.prov.anthropic{color:var(--an)}.prov.hybrid{color:var(--hy)}
.runner{display:grid;gap:10px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px}
.col{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--line);border-radius:6px;padding:14px 16px;min-width:0}
.col.openai{border-top-color:var(--oa)}.col.anthropic{border-top-color:var(--an)}.col.hybrid{border-top-color:var(--hy)}
.col h3{margin:0 0 6px;font:700 18px/1.2 var(--display);letter-spacing:.02em;text-transform:uppercase}
.wk{margin-top:12px}.wkh{font:600 13px/1.3 var(--mono);color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:3px}
.s{margin:8px 0 10px}.h{font:13px/1.4 var(--mono)}.d{font-weight:600}.i{color:var(--muted);font-size:14.5px;max-width:65ch}
.err{color:var(--bad)}.pass{color:var(--good);font-weight:600}
details{margin:4px 0}summary{cursor:pointer;color:var(--muted);font-size:14px}summary:focus-visible{outline:2px solid var(--oa);outline-offset:2px}
pre{white-space:pre-wrap;font:12.5px/1.45 var(--mono);color:var(--muted);margin:6px 0}
</style>
<main>
<header><h1>Plan engine trial</h1>
<p class="lead">The same three real runners, the same inputs, the same quality gate. "First-attempt problems" are load-rule breaks in the model's own plan before anything corrects them. Fewer is better. Each runner was generated twice per engine; plans shown are the first run. Costs are approximate list prices.</p></header>
${verdict ? `<section class="verdict">${verdict}</section>` : ""}
<section><h2>Results</h2><div class="wrap"><table><tr><th>Runner</th><th>Engine</th><th>Plans made</th><th>First-attempt problems</th><th>Correction rounds</th><th>Code repairs</th><th>Shipped with breaks</th><th>Review rewrites</th><th>Time</th><th>Cost / plan</th></tr>${summaryRows}</table></div></section>
${planSections}
</main>`);
console.log(`Report written to ${outPath}`);
