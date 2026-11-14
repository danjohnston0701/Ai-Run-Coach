import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Brain,
  CalendarRange,
  Check,
  Headphones,
  HeartPulse,
  LineChart,
  MapPinned,
  Menu,
  Mountain,
  Radio,
  ShieldCheck,
  Sparkles,
  Timer,
  UsersRound,
  Watch,
  X,
} from "lucide-react";
import { APP_STORE_URL, GARMIN_STORE_URL, Logo, PLAY_STORE_URL } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Store badges ─────────────────────────────────────────────────────────── */

function AppleGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.08-.9.95-1.98 1.5-3.15 1.4a3.2 3.2 0 0 1-.02-.39c0-1.09.47-2.26 1.31-3.17.42-.46.95-.84 1.6-1.15.65-.3 1.26-.47 1.84-.5.02.24.03.49.03.73Zm4.5 15.98c-.35.82-.77 1.57-1.26 2.27-.67.95-1.22 1.6-1.64 1.97-.65.6-1.35.9-2.1.92-.54 0-1.19-.15-1.95-.46-.76-.31-1.46-.46-2.1-.46-.67 0-1.39.15-2.16.46-.77.31-1.39.48-1.86.49-.72.03-1.44-.28-2.15-.94-.46-.4-1.03-1.08-1.71-2.04-.73-1.03-1.33-2.22-1.8-3.57-.5-1.46-.76-2.87-.76-4.24 0-1.57.34-2.92 1.02-4.06a5.97 5.97 0 0 1 5.03-2.98c.57 0 1.32.18 2.25.52.92.35 1.51.52 1.77.52.2 0 .86-.2 1.98-.62 1.06-.38 1.95-.54 2.68-.48 1.98.16 3.47.94 4.46 2.35-1.77 1.07-2.65 2.58-2.63 4.51.02 1.5.56 2.76 1.63 3.75.48.46 1.02.82 1.62 1.07-.13.38-.27.74-.42 1.09Z" />
    </svg>
  );
}
function PlayGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path fill="#00d4ff" d="M3.6 1.8 13.8 12 3.6 22.2c-.4-.2-.6-.6-.6-1.1V2.9c0-.5.2-.9.6-1.1Z" />
      <path fill="#00e676" d="m17.2 8.6-3.4 3.4-10.2-10.2c.2-.1.5-.1.8 0l12.8 6.8Z" />
      <path fill="#ffb300" d="m17.2 15.4-12.8 6.8c-.3.1-.6.1-.8 0L13.8 12l3.4 3.4Z" />
      <path fill="#ff6b35" d="M20.4 10.3c.8.5.8 1.9 0 2.4l-3.2 1.7L13.8 12l3.4-3.4 3.2 1.7Z" />
    </svg>
  );
}

export function StoreButtons({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white px-5 py-2.5 text-root transition-transform hover:-translate-y-0.5">
        <AppleGlyph className="h-7 w-7" />
        <span className="text-left leading-tight">
          <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">Download on the</span>
          <span className="block text-base font-semibold">App Store</span>
        </span>
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 px-5 py-2.5 text-ink transition-transform hover:-translate-y-0.5">
        <PlayGlyph className="h-6 w-6" />
        <span className="text-left leading-tight">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-3">Get it on</span>
          <span className="block text-base font-semibold">Google Play</span>
        </span>
      </a>
    </div>
  );
}

/* ── Building blocks ──────────────────────────────────────────────────────── */

function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("relative rounded-[44px] border border-white/10 bg-[#05080f] p-2.5 shadow-[0_40px_120px_-30px_rgba(0,212,255,0.45)]", className)}>
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-[36px]" />
    </div>
  );
}

function Rings({ className }: { className?: string }) {
  // The brand's activity rings (App Store header), as ambient decoration.
  const rings = [
    ["#00e676", 0, 0],
    ["#00d4ff", 1, 0],
    ["#ffb300", 0, 1],
    ["#ff5252", 1, 1],
  ] as const;
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      {rings.map(([c, x, y], i) => (
        <circle key={i} cx={60 + x * 120} cy={60 + y * 120} r="48" fill="none" stroke={c} strokeOpacity="0.18" strokeWidth="9" />
      ))}
    </svg>
  );
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 sm:px-6", className)}>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{children}</div>;
}

const CUES = [
  { t: "0:42", tag: "Start", text: "Nice and relaxed for this first kilometre — we’re building into it, not racing it." },
  { t: "4:51", tag: "Km 1", text: "First split 4:51, right on your target. Heart rate’s settled in zone 2. Keep that rhythm." },
  { t: "9:12", tag: "Hill", text: "Climb coming up for the next 300 metres. Shorten your stride, keep your cadence up and let the pace drop a little." },
  { t: "14:30", tag: "Pace", text: "You’ve drifted 12 seconds per km quicker than plan. Ease off a touch — the last two kilometres are where this pays off." },
  { t: "22:05", tag: "Finish", text: "Final 500 metres. Everything you’ve got left — tall posture, quick feet, bring it home!" },
];

function LiveCueDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % CUES.length), 3800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-3">
      {CUES.map((c, idx) => (
        <div
          key={idx}
          className={cn(
            "flex gap-3 rounded-2xl border p-4 transition-all duration-500",
            idx === i ? "border-brand/50 bg-brand/10 shadow-[0_10px_40px_-15px_rgba(0,212,255,0.6)]" : "border-line/70 bg-surface/60 opacity-55",
          )}
        >
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", idx === i ? "bg-brand text-root" : "bg-surface-2 text-ink-3")}>
            <Headphones className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="num font-semibold text-brand">{c.t}</span>
              <span className="rounded-full border border-line px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-3">{c.tag}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink">{c.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = [
    ["#coach", "Live coaching"],
    ["#plans", "Training plans"],
    ["#insights", "Insights"],
    ["#watches", "Watches"],
    ["#together", "Run together"],
  ];
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors", scrolled || open ? "border-b border-line/60 bg-root/85 backdrop-blur-xl" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-ink-2 lg:flex">
          {links.map(([h, l]) => (
            <a key={h} href={h} className="hover:text-ink">
              {l}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <a href="#download">Get the app</a>
          </Button>
        </div>
        <button className="rounded-lg p-2 text-ink-2 sm:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="space-y-1 border-t border-line/60 px-4 pb-5 pt-3 sm:hidden">
          {links.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-ink-2 hover:bg-surface-2">
              {l}
            </a>
          ))}
          <div className="flex gap-2 pt-3">
            <Button asChild variant="secondary" className="flex-1">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="flex-1">
              <a href="#download" onClick={() => setOpen(false)}>
                Get the app
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-root text-ink">
      <Nav />

      {/* Hero */}
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,212,255,0.18),transparent)]" />
          <div className="absolute right-[-10%] top-[30%] h-[500px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(0,230,118,0.12),transparent)]" />
          <Rings className="absolute -left-24 top-28 hidden w-72 opacity-80 md:block" />
          <Rings className="absolute -right-20 bottom-0 hidden w-64 opacity-60 lg:block" />
        </div>
        <Section className="grid items-center gap-12 pb-20 pt-28 sm:pt-36 lg:grid-cols-[1.1fr_1fr] lg:pb-28">
          <div>
            <Eyebrow>
              <Sparkles className="h-3.5 w-3.5" /> iPhone · Android · Apple Watch · Garmin · Galaxy Watch
            </Eyebrow>
            <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              Your AI
              <br />
              <span className="text-gradient">running coach.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
              Live in your ear, every run. Ai Run Coach watches your pace, heart rate, hills and cadence as you move — and talks you through it like a real coach would. Then it explains every run and builds the plan for the next one.
            </p>
            <StoreButtons className="mt-8" />
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-3">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-green" /> 30-day free trial
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-green" /> No card needed
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-green" /> Runs and walks
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[400px]">
            <Phone src="/marketing/ios-run-coach.jpg" alt="A run in progress with a live coaching message" className="mx-auto w-[78%] rotate-[2deg]" />
            <div className="absolute -left-2 bottom-24 w-56 rounded-2xl border border-brand/40 bg-surface/95 p-3.5 shadow-2xl backdrop-blur sm:-left-10">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand">
                <Headphones className="h-3.5 w-3.5" /> Coach · km 3
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink">Split 4:58 — right on target. Hill ahead: shorten your stride and keep the cadence up.</p>
            </div>
            <div className="absolute -right-2 top-16 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-2xl backdrop-blur sm:-right-8">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Heart rate</div>
              <div className="num flex items-baseline gap-1 text-2xl font-bold">
                148 <span className="text-xs font-medium text-ink-3">bpm · Z3</span>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* Pillars */}
      <Section className="pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Headphones, title: "Coached as you run", text: "Real-time voice coaching on pace, heart rate, hills, cadence and turns — timed to the moment, never a pre-recorded script." },
            { icon: CalendarRange, title: "Plans that adapt", text: "Training plans built from your own recent running, checked against proven load rules, and adjusted after every session." },
            { icon: Brain, title: "Insights that explain", text: "After each run your coach tells you what went well, where you struggled and exactly what to do next." },
          ].map((p) => (
            <div key={p.title} className="panel p-6 sm:p-7">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand/25 to-brand-green/15 text-brand">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-bold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Live coaching */}
      <Section id="coach" className="grid items-center gap-12 py-20 lg:grid-cols-2">
        <div>
          <Eyebrow>
            <Radio className="h-3.5 w-3.5" /> Live coaching
          </Eyebrow>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">A coach that’s actually out there with you.</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Most apps read out numbers. Ai Run Coach reads the run. It knows your target, your heart-rate zones, the hill in front of you and how your last run on this route went — and it speaks up when it matters.
          </p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              [Timer, "Pace and target-time guidance"],
              [HeartPulse, "Heart-rate zone coaching"],
              [Mountain, "Hill and terrain cues"],
              [MapPinned, "Turn-by-turn route navigation"],
            ].map(([I, t]: any) => (
              <li key={t} className="flex items-center gap-3 text-sm text-ink">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-brand">
                  <I className="h-4 w-4" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-3">Choose your coach’s voice, accent and personality — from zen to tough love.</p>
        </div>
        <LiveCueDemo />
      </Section>

      {/* Plans */}
      <Section id="plans" className="py-20">
        <div className="panel relative overflow-hidden p-6 sm:p-10 lg:p-14">
          <div aria-hidden className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-green/10 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <Eyebrow>
                <CalendarRange className="h-3.5 w-3.5" /> Adaptive training plans
              </Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">From your first 5K to race day.</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-2">
                Tell your coach the goal. It reads the last 30 days of your running, sets a safe starting load, and writes a week-by-week plan with the paces and heart-rate zones that fit you — not a template.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  "Built from your own runs — never invented numbers",
                  "Safe progression rules on volume, long runs and rest days",
                  "Every session gets its own phase-by-phase coaching plan",
                  "Missed a week? The plan moves with you",
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3 text-sm text-ink">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" /> {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                ["Mon", "Easy Run", "5 km · Zone 2", "green"],
                ["Wed", "Tempo Run", "6 km · 3 km at 5:05/km", "orange"],
                ["Fri", "Intervals", "6 × 400 m · 90 s recovery", "red"],
                ["Sun", "Long Run", "10 km · conversational", "cyan"],
              ].map(([d, n, s, c]) => (
                <div key={d} className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2/60 px-4 py-3.5">
                  <span className="w-10 text-xs font-bold uppercase text-ink-3">{d}</span>
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ background: { green: "#00e676", orange: "#ff6b35", red: "#ff5252", cyan: "#00d4ff" }[c as string] }}
                  />
                  <div>
                    <div className="font-semibold">{n}</div>
                    <div className="text-xs text-ink-3">{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Insights */}
      <Section id="insights" className="grid items-center gap-12 py-20 lg:grid-cols-[1fr_1.1fr]">
        <div className="relative mx-auto flex w-full max-w-md justify-center gap-4">
          <Phone src="/marketing/ios-ai-review.jpg" alt="AI run review" className="w-1/2 -rotate-[3deg]" />
          <Phone src="/marketing/ios-splits.jpg" alt="Km splits" className="mt-12 w-1/2 rotate-[3deg]" />
        </div>
        <div>
          <Eyebrow>
            <LineChart className="h-3.5 w-3.5" /> Post-run insights
          </Eyebrow>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Every run, understood.</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Splits, pace, heart-rate zones, elevation and running dynamics — plus a written review from your coach on your pacing, effort and what to change next time. Personal bests, race predictions and long-term trends build up automatically.
          </p>
          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              ["82", "Performance score"],
              ["−14 s", "Negative split"],
              ["Z3", "Mostly in zone"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl border border-line bg-surface p-4">
                <div className="num text-2xl font-bold text-gradient">{v}</div>
                <div className="mt-1 text-xs text-ink-3">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Watches */}
      <Section id="watches" className="py-20">
        <div className="text-center">
          <Eyebrow>
            <Watch className="h-3.5 w-3.5" /> On your wrist
          </Eyebrow>
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">Leave the phone behind — or don’t.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">
            Start a coached session from your watch. Your watch’s own sensors drive the coaching, and everything lands in the same history and insights.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ["Apple Watch", "Included with the iPhone app.", APP_STORE_URL],
            ["Garmin", "Free on the Connect IQ Store, for Forerunner, Fēnix, Venu, vívoactive and more.", GARMIN_STORE_URL],
            ["Galaxy Watch", "Included with the Android app, for Wear OS watches.", PLAY_STORE_URL],
          ].map(([n, d, href]) => (
            <a key={n} href={href} target="_blank" rel="noreferrer" className="panel group flex flex-col p-6 transition-colors hover:border-brand/40">
              <Watch className="h-6 w-6 text-brand" />
              <div className="mt-4 text-lg font-bold">{n}</div>
              <p className="mt-1 flex-1 text-sm text-ink-2">{d}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                Get it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </div>
      </Section>

      {/* Together */}
      <Section id="together" className="py-20">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-7 sm:p-10">
            <UsersRound className="h-7 w-7 text-orange" />
            <h3 className="mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">Group runs, wherever you are.</h3>
            <p className="mt-3 text-ink-2">Plan a run with friends, start together and get coached individually — then compare times, pace and heart rate on a shared leaderboard.</p>
          </div>
          <div className="panel p-7 sm:p-10">
            <Radio className="h-7 w-7 text-brand" />
            <h3 className="mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">Share your run live.</h3>
            <p className="mt-3 text-ink-2">Send a link and friends or family can follow your run on a map in their browser — your position, pace and the coach’s latest message. No app needed.</p>
          </div>
        </div>
      </Section>

      {/* Web companion */}
      <Section className="py-20">
        <div className="relative overflow-hidden rounded-[32px] border border-brand/25 bg-gradient-to-br from-brand/15 via-surface to-brand-green/10 p-8 sm:p-14">
          <Rings className="absolute -right-16 -top-16 w-72 opacity-70" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Your training, on the big screen.</h2>
            <p className="mt-4 text-lg text-ink-2">Sign in on the web to review runs in full detail, explore your trends and personal bests, manage your plan, goals and group runs — all in sync with the app.</p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/login">
                Sign in to the web app <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Section>

      {/* Download */}
      <Section id="download" className="py-24 text-center">
        <img src="/marketing/app-icon.png" alt="" className="mx-auto h-20 w-20 rounded-[22px] shadow-[0_0_60px_-8px_rgba(0,212,255,0.7)]" />
        <h2 className="mx-auto mt-8 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Run with a coach <span className="text-gradient">today.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-2">30 days free, no card needed. Set up in a couple of minutes — your coach takes it from there.</p>
        <StoreButtons className="mt-9 justify-center" />
      </Section>

      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo compact />
          <p className="mt-2 text-xs text-ink-3">© {new Date().getFullYear()} Ai Run Coach.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
