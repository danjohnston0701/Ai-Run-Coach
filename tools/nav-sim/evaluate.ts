/**
 * Scores navigation transcripts against the truth in the fixtures.
 *
 *   npx tsx tools/nav-sim/evaluate.ts [android|ios|both] [--verbose] [--only=<fixture id substring>]
 *
 * Reads app/src/test/resources/nav/*.json (fixtures) and app/build/nav-sim/<platform>/*.json
 * (transcripts). For every turn: how far before it (TRUE along-route metres, not GPS) the warning
 * and the "now" cue were spoken. Plus off-route cues, missed turns, and Android/iOS agreement.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const FIX = join(ROOT, "app/src/test/resources/nav");
const args = process.argv.slice(2);
const platforms = (args.find(a => !a.startsWith("--")) ?? "both") === "both" ? ["android", "ios"] : [args[0]];
const verbose = args.includes("--verbose");
const only = args.find(a => a.startsWith("--only="))?.slice(7);

type Cue = { t: number; kind: string; text: string; turnIndex: number | null; s: number | null };
const pct = (xs: number[], p: number) => { if (!xs.length) return NaN; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; };
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : "–");

const transcripts: Record<string, Record<string, Cue[]>> = {};
for (const p of platforms) {
  const dir = join(ROOT, "app/build/nav-sim", p);
  transcripts[p] = {};
  if (!existsSync(dir)) { console.log(`(no ${p} transcripts at ${dir})`); continue; }
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    transcripts[p][j.id] = j.cues;
  }
}

for (const p of platforms) {
  const warnD: number[] = [], nowD: number[] = [];
  let turnsTotal = 0, noWarn = 0, noNow = 0, falseOff = 0, lateNow = 0;
  const rejoinChecks: string[] = []; let rejoinWrong = 0;
  const rows: string[] = [];
  for (const file of readdirSync(FIX).filter(f => f.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(join(FIX, file), "utf8"));
    if (only && !fx.id.includes(only)) continue;
    const cues: Cue[] | undefined = transcripts[p][fx.id];
    if (!cues) continue;
    // True s at time t (interpolated from the fixture), for cues on fixes where s was null.
    const sAt = (t: number) => fx.fixes.find((x: any) => x.t === t)?.s ?? null;
    const offRoute = cues.filter(c => c.kind === "OFF_ROUTE");
    if (!fx.expectOffRoute) falseOff += offRoute.length;
    const perTurn: string[] = [];
    fx.turns.forEach((turn: any, i: number) => {
      turnsTotal++;
      const w = cues.find(c => c.turnIndex === i && (c.kind === "WARNING" || c.kind === "REORIENT" || c.kind === "REJOIN"));
      const n = cues.find(c => c.turnIndex === i && c.kind === "TURN_NOW");
      // A turn chained into the previous one ("…, then …") legitimately has no warning of its own.
      const chained = i > 0 && turn.distance - fx.turns[i - 1].distance < 60;
      const wd = w ? turn.distance - (sAt(w.t) ?? NaN) : NaN;
      const nd = n ? turn.distance - (sAt(n.t) ?? NaN) : NaN;
      if (w && Number.isFinite(wd) && w.kind === "WARNING") warnD.push(wd);
      if (n && Number.isFinite(nd)) { nowD.push(nd); if (nd < -15) lateNow++; }
      if (!w && !chained) noWarn++;
      if (!n) noNow++;
      perTurn.push(`    [${String(i).padStart(2)}] ${String(turn.distance).padStart(5)} m  warn ${w ? f0(wd).padStart(4) + " m" : chained ? " (chained)" : "  NONE  "}  now ${n ? f0(nd).padStart(4) + " m" : " NONE"}  ${turn.text}`);
    });
    // Rejoin direction check: back at a MISSED turn the original left is now a right (and vice
    // versa); back from a WRONG turn they should simply carry on.
    if (fx.deviationTurn !== null && fx.deviationTurn !== undefined) {
      const orig = /\bleft\b/i.test(fx.turns[fx.deviationTurn].text.split(", then")[0]) ? "left" : /\bright\b/i.test(fx.turns[fx.deviationTurn].text.split(", then")[0]) ? "right" : null;
      const rejoin = cues.find(c => c.kind === "REJOIN");
      const now = rejoin?.text.split("Next:")[0] ?? "";   // the "which way now" part, not the next turn
      const said = rejoin ? (/turn left/i.test(now) ? "left" : /turn right/i.test(now) ? "right" : "straight") : "none";
      const expected = fx.behaviour === "missed_turn" ? (orig === "left" ? "right" : orig === "right" ? "left" : "?") : "straight";
      const ok = said === expected || expected === "?";
      rejoinChecks.push(`  ${ok ? "✓" : "✗"} ${fx.id}: turn was "${orig}", rejoin said "${said}", expected "${expected}"`);
      if (!ok) rejoinWrong++;
    }
    const kinds = cues.reduce((m: Record<string, number>, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
    rows.push(`  ${fx.id.padEnd(28)} turns=${fx.turns.length} ${Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    if (verbose || offRoute.length || cues.some(c => c.kind === "REJOIN")) {
      for (const c of cues.filter(c => !["WARNING", "TURN_NOW"].includes(c.kind))) {
        rows.push(`      t=${f0(c.t / 1000).padStart(5)}s s=${c.s === null ? "off" : f0(c.s)}  ${c.kind}: ${c.text}`);
      }
    }
    if (verbose) rows.push(...perTurn);
  }
  console.log(`\n══ ${p.toUpperCase()} ══`);
  console.log(rows.join("\n"));
  console.log(`\n  Turns: ${turnsTotal} | no warning (unchained): ${noWarn} | no "now" cue: ${noNow} | "now" >15 m late: ${lateNow}`);
  console.log(`  Warning distance before turn (true): p10 ${f0(pct(warnD, 10))} m, median ${f0(pct(warnD, 50))} m, p90 ${f0(pct(warnD, 90))} m`);
  console.log(`  "Now" cue distance before turn (true): p10 ${f0(pct(nowD, 10))} m, median ${f0(pct(nowD, 50))} m, p90 ${f0(pct(nowD, 90))} m`);
  console.log(`  False off-route cues (runs that never left the route): ${falseOff}`);
  console.log(`  Rejoin directions wrong: ${rejoinWrong} of ${rejoinChecks.length}`);
  if (verbose || rejoinWrong) console.log(rejoinChecks.join("\n"));
}

if (platforms.length === 2) {
  let same = 0, diff = 0;
  for (const id of Object.keys(transcripts.android ?? {})) {
    const a = transcripts.android[id], i = transcripts.ios?.[id];
    if (!i) continue;
    const key = (cs: Cue[]) => cs.map(c => `${c.t}|${c.kind}|${c.text}`).join("\n");
    if (key(a) === key(i)) same++; else { diff++; if (verbose) console.log(`  differs: ${id}`); }
  }
  console.log(`\nAndroid vs iOS: ${same} identical transcripts, ${diff} differ`);
}
