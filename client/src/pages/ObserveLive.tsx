import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertCircle, CheckCircle2, Gauge, Heart, Loader2, LocateFixed, MapPin, MessageCircle,
  Pause, Smartphone, Timer, Users, WifiOff,
} from "lucide-react";
import { decodePolyline } from "@/components/RouteMap";

/**
 * Web live-run viewer at https://airuncoach.live/observe/{code} — the browser version of the
 * apps' observer screen (Android ObserverRunSessionScreen/ViewModel, iOS ObserverRunSessionScreen),
 * so whoever gets an invite can watch without installing anything. No login.
 *
 * Flow: GET /api/observe/{code} once to turn the invite code into a session (that endpoint is
 * rate-limited per IP+code, so it must never be polled), then poll GET /api/live-sessions/{id}
 * like the apps do — every 2 s while running, 3 s while waiting for the start, slower while the
 * tab is hidden — until the session ends. Polling that endpoint is also what counts this viewer
 * in the runner's "N watching" pill.
 */

const APP_STORE_URL = "https://apps.apple.com/nz/app/ai-run-coach/id6762181649";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach";

const POLL_LIVE_MS = 2000;
const POLL_WAITING_MS = 3000;
const POLL_HIDDEN_MS = 15000;
const STALE_AFTER_SECS = 20;
const POLLING_ALIVE_MS = 10000;
const TEAL = "#00BFFF";

interface GpsPoint { lat: number; lng: number }
interface CoachingNote { timeMs: number; message: string }

interface LiveSession {
  id: string;
  runnerName: string | null;
  currentLat: number | null;
  currentLng: number | null;
  distanceCovered: number;
  elapsedTime: number;
  currentPace: string | null;
  currentHeartRate: number | null;
  hasStarted: boolean;
  isActive: boolean;
  isPaused: boolean;
  gpsTrack: GpsPoint[];
  routePolyline: string | null;
  coachingNotes: CoachingNote[];
  observerCount: number;
  lastSyncedAt: string | null;
}

type Phase = "loading" | "invalid" | "rate_limited" | "error" | "ready";

// The session row arrives with numbers as numbers or strings, and iOS sends JSONB series as
// JSON strings — parse tolerantly, as the Android ViewModel does.
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const jsonList = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

function parseSession(raw: any): LiveSession {
  return {
    id: String(raw.id),
    runnerName: raw.runnerName ?? raw.runner_name ?? null,
    currentLat: num(raw.currentLat),
    currentLng: num(raw.currentLng),
    distanceCovered: num(raw.distanceCovered) ?? 0,
    elapsedTime: Math.max(0, Math.round(num(raw.elapsedTime) ?? 0)),
    currentPace: typeof raw.currentPace === "string" ? raw.currentPace : null,
    currentHeartRate: num(raw.currentHeartRate),
    hasStarted: raw.hasStarted === true,
    isActive: raw.isActive !== false,
    isPaused: raw.isPaused === true,
    gpsTrack: jsonList(raw.gpsTrack)
      .map((p: any) => ({ lat: num(p?.lat), lng: num(p?.lng) }))
      .filter((p): p is GpsPoint => p.lat !== null && p.lng !== null && !(p.lat === 0 && p.lng === 0)),
    routePolyline: typeof raw.routePolyline === "string" && raw.routePolyline ? raw.routePolyline : null,
    coachingNotes: jsonList(raw.recentCoachingNotes)
      .map((n: any) => ({ timeMs: num(n?.time) ?? 0, message: typeof n?.message === "string" ? n.message.trim() : "" }))
      .filter((n) => n.message),
    observerCount: num(raw.observer_count) ?? 0,
    lastSyncedAt: raw.lastSyncedAt ?? null,
  };
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function formatPace(pace: string | null): string {
  const p = pace?.trim();
  if (!p || p === "0:00" || p === "--:--" || p === "--") return "--:--";
  return p;
}

const platform = (() => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("android")) return "android";
  return "desktop";
})();

export default function ObserveLive() {
  const [, params] = useRoute("/observe/:code");
  const code = (params?.code ?? "").trim();

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [endedWithoutSession, setEndedWithoutSession] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [failures, setFailures] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lookupAttempt, setLookupAttempt] = useState(0);

  // Observer-clock bookkeeping — see ObserverRunSessionViewModel. Staleness is measured from
  // when the server's lastSyncedAt last ADVANCED on our own clock, and only while our own
  // polling is alive, so clock skew or a backgrounded tab can't blame the runner.
  const lastSeenSyncedAt = useRef<string | null>(null);
  const lastRunnerUpdateSeenAt = useRef<number | null>(null);
  const lastFetchedAt = useRef<number | null>(null);
  // Smooth elapsed clock: the runner syncs every ~5 s, so tick locally between polls and only
  // re-anchor when the server is ahead of our prediction or more than 3 s behind it.
  const elapsedBase = useRef(0);
  const elapsedBaseAt = useRef(0);
  const elapsedTicking = useRef(false);

  const runnerName = session?.runnerName || lookupName || "The runner";

  // 1. Resolve the invite code (once — this endpoint is rate-limited).
  useEffect(() => {
    if (!code) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    (async () => {
      try {
        const res = await fetch(`/api/observe/${encodeURIComponent(code)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body?.sessionData?.id) {
          setLookupName(body.sessionData.runnerName ?? null);
          setSessionId(body.sessionData.id);
          setPhase("ready");
        } else if (res.status === 410) {
          setLookupName(body?.runnerName ?? null);
          if (body?.sessionId) setSessionId(body.sessionId);
          else setEndedWithoutSession(true);
          setPhase("ready");
        } else if (res.status === 429) {
          setPhase("rate_limited");
        } else if (res.status === 400 || res.status === 404) {
          setPhase("invalid");
        } else {
          setPhase("error");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lookupAttempt]);

  const applySession = useCallback((raw: any) => {
    const now = Date.now();
    const s = parseSession(raw);
    lastFetchedAt.current = now;
    if (s.lastSyncedAt !== lastSeenSyncedAt.current) {
      lastSeenSyncedAt.current = s.lastSyncedAt;
      lastRunnerUpdateSeenAt.current = now;
    }
    const shouldTick = s.hasStarted && !s.isPaused && s.isActive;
    if (!shouldTick) {
      elapsedBase.current = s.elapsedTime;
      elapsedBaseAt.current = now;
      elapsedTicking.current = false;
    } else {
      const predicted = elapsedTicking.current
        ? elapsedBase.current + Math.floor((now - elapsedBaseAt.current) / 1000)
        : s.elapsedTime;
      if (!elapsedTicking.current || s.elapsedTime > predicted || predicted - s.elapsedTime > 3) {
        elapsedBase.current = s.elapsedTime;
        elapsedBaseAt.current = now;
      }
      elapsedTicking.current = true;
    }
    setSession(s);
    return s;
  }, []);

  // 2. Poll the session until it ends.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: LiveSession | null = null;

    const schedule = () => {
      if (cancelled || stopped) return;
      const delay = document.hidden
        ? POLL_HIDDEN_MS
        : latest?.hasStarted ? POLL_LIVE_MS : POLL_WAITING_MS;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      timer = undefined;
      try {
        const res = await fetch(`/api/live-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          stopped = true;
          setPhase("invalid");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        latest = applySession(await res.json());
        setFailures(0);
        // The runner's final distance/time/pace arrive in the same sync that ends the
        // session, so there's nothing more to wait for once it's inactive.
        if (!latest.isActive) stopped = true;
      } catch {
        if (!cancelled) setFailures((f) => f + 1);
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.hidden || stopped || cancelled) return;
      if (timer) clearTimeout(timer);
      void tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, applySession]);

  // 1 s tick for the running clock and the staleness line.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ended = endedWithoutSession || session?.isActive === false;
  const live = !!session && session.isActive && session.hasStarted;
  const displayedElapsed = elapsedTicking.current
    ? Math.max(elapsedBase.current, elapsedBase.current + Math.floor((nowMs - elapsedBaseAt.current) / 1000))
    : elapsedBase.current;

  // Tab title doubles as a glanceable ticker when the page is in a background tab.
  useEffect(() => {
    if (live && session) {
      document.title = `${session.distanceCovered.toFixed(2)} km · ${runnerName} — Live`;
    } else if (ended) {
      document.title = `${runnerName}'s run has finished — AI Run Coach`;
    } else {
      document.title = `Watch ${runnerName}'s live run — AI Run Coach`;
    }
  }, [live, ended, session?.distanceCovered, runnerName]);

  let staleSecs: number | null = null;
  if (live && session && !session.isPaused && lastRunnerUpdateSeenAt.current !== null) {
    const age = Math.floor((nowMs - lastRunnerUpdateSeenAt.current) / 1000);
    const pollingAlive = lastFetchedAt.current !== null && nowMs - lastFetchedAt.current < POLLING_ALIVE_MS;
    if (age >= STALE_AFTER_SECS && pollingAlive) staleSecs = age;
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Header runnerName={runnerName} live={live} paused={!!session?.isPaused} watching={live ? session!.observerCount : 0} />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pb-6 flex flex-col">
        {phase === "loading" || (phase === "ready" && !session && !endedWithoutSession) ? (
          failures > 2 ? (
            <CenteredMessage icon={<WifiOff className="w-10 h-10 text-muted-foreground" />} title="Can't reach AI Run Coach"
              body="Check your connection. This page keeps trying automatically." />
          ) : (
            <CenteredMessage icon={<Loader2 className="w-10 h-10 text-primary animate-spin" />} title="Loading live run…" />
          )
        ) : phase === "invalid" ? (
          <CenteredMessage icon={<AlertCircle className="w-10 h-10 text-muted-foreground" />} title="Live run not found"
            body="We couldn't find a live run for this link. Check the code in your invitation, or ask the runner to send a new one." />
        ) : phase === "rate_limited" ? (
          <CenteredMessage icon={<AlertCircle className="w-10 h-10 text-muted-foreground" />} title="Too many attempts"
            body="Please wait a minute and try again."
            action={<button className="mt-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-semibold" onClick={() => setLookupAttempt((n) => n + 1)}>Try again</button>} />
        ) : phase === "error" ? (
          <CenteredMessage icon={<WifiOff className="w-10 h-10 text-muted-foreground" />} title="Couldn't load the live run"
            body="Check your connection and try again."
            action={<button className="mt-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-semibold" onClick={() => setLookupAttempt((n) => n + 1)}>Try again</button>} />
        ) : ended ? (
          <FinishedView runnerName={runnerName} session={session} />
        ) : session && !session.hasStarted ? (
          <CenteredMessage icon={<Loader2 className="w-10 h-10 text-primary animate-spin" />}
            title={`Waiting for ${runnerName} to start`}
            body="Keep this page open. Their live location and stats will appear here as soon as they begin." />
        ) : session ? (
          <LiveView session={session} runnerName={runnerName} elapsed={displayedElapsed} staleSecs={staleSecs} reconnecting={failures >= 3} />
        ) : null}
      </main>

      <AppFooter code={code} />
    </div>
  );
}

function Header({ runnerName, live, paused, watching }: { runnerName: string; live: boolean; paused: boolean; watching: number }) {
  return (
    <header className="border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo-runner.png" alt="" className="w-8 h-8" />
          <span className="font-display text-xl tracking-wide hidden sm:inline">AI RUN COACH</span>
        </a>
        <div className="flex-1 min-w-0 text-right sm:text-left sm:pl-4">
          <p className="font-display text-xl sm:text-2xl leading-none truncate">{runnerName}'s run</p>
        </div>
        {live && watching > 1 && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" /> {watching} watching
          </span>
        )}
        {live && (
          paused ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-300 px-2.5 py-1 text-xs font-semibold">
              <Pause className="w-3 h-3" /> PAUSED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 text-red-400 px-2.5 py-1 text-xs font-semibold">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-red-500" />
              </span>
              LIVE
            </span>
          )
        )}
      </div>
    </header>
  );
}

function LiveView({ session, runnerName, elapsed, staleSecs, reconnecting }: {
  session: LiveSession; runnerName: string; elapsed: number; staleSecs: number | null; reconnecting: boolean;
}) {
  const notes = session.coachingNotes.slice(-3).reverse();
  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-4 pt-4">
      <div className="lg:flex-1 h-[52dvh] lg:h-auto lg:min-h-[560px] rounded-xl overflow-hidden relative bg-card">
        <LiveMap session={session} runnerName={runnerName} follow />
      </div>

      <div className="lg:w-[380px] flex flex-col gap-3">
        {session.isPaused && (
          <Banner tone="warn"><Pause className="w-4 h-4 shrink-0" /> {runnerName} has paused</Banner>
        )}
        {reconnecting ? (
          <Banner tone="warn"><WifiOff className="w-4 h-4 shrink-0" /> Reconnecting…</Banner>
        ) : staleSecs !== null && (
          <Banner tone="warn"><AlertCircle className="w-4 h-4 shrink-0" /> Last update {formatTime(staleSecs)} ago. {runnerName} may have lost signal.</Banner>
        )}

        <StatGrid
          distance={session.distanceCovered}
          elapsed={elapsed}
          pace={session.currentPace}
          heartRate={session.currentHeartRate}
        />

        {notes.length > 0 && (
          <section className="rounded-xl bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-sans font-semibold mb-3">
              <MessageCircle className="w-3.5 h-3.5" /> Coach → {runnerName}
            </h2>
            <ul className="space-y-2.5">
              {notes.map((n, i) => (
                <li key={`${n.timeMs}-${i}`} className="flex gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums pt-0.5 w-10 shrink-0">{formatTime(n.timeMs / 1000)}</span>
                  <p className={i === 0 ? "text-sm leading-relaxed" : "text-sm leading-relaxed text-muted-foreground line-clamp-2"}>{n.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted-foreground text-center lg:text-left">Updates automatically every couple of seconds.</p>
      </div>
    </div>
  );
}

function StatGrid({ distance, elapsed, pace, heartRate }: { distance: number; elapsed: number; pace: string | null; heartRate: number | null }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat icon={<MapPin className="w-3.5 h-3.5" />} label="Distance" value={distance.toFixed(2)} unit="km" />
      <Stat icon={<Timer className="w-3.5 h-3.5" />} label="Time" value={formatTime(elapsed)} />
      <Stat icon={<Gauge className="w-3.5 h-3.5" />} label="Pace" value={formatPace(pace)} unit={formatPace(pace) === "--:--" || pace?.includes("/") ? undefined : "/km"} />
      {heartRate && heartRate > 0
        ? <Stat icon={<Heart className="w-3.5 h-3.5" />} label="Heart rate" value={String(Math.round(heartRate))} unit="bpm" />
        : <Stat icon={<Heart className="w-3.5 h-3.5" />} label="Heart rate" value="--" />}
    </div>
  );
}

function Stat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">{icon}{label}</p>
      <p className="mt-1 font-display text-4xl leading-none text-primary tabular-nums">
        {value}{unit && <span className="ml-1 text-lg text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function FinishedView({ runnerName, session }: { runnerName: string; session: LiveSession | null }) {
  const ran = !!session && session.hasStarted && (session.distanceCovered > 0 || session.elapsedTime > 0);
  return (
    <div className="flex-1 flex flex-col items-center pt-8 gap-5 max-w-xl w-full mx-auto">
      <CheckCircle2 className="w-14 h-14 text-primary" />
      <div className="text-center">
        <h1 className="text-4xl">{ran ? `${runnerName} has finished!` : "This live run has ended"}</h1>
        <p className="text-muted-foreground mt-1">
          {ran ? "Thanks for cheering them on. Here's how it went." : `${runnerName}'s live session is no longer running.`}
        </p>
      </div>
      {ran && session && (
        <>
          <div className="w-full">
            <StatGrid distance={session.distanceCovered} elapsed={session.elapsedTime} pace={session.currentPace} heartRate={null} />
          </div>
          {session.gpsTrack.length > 1 && (
            <div className="w-full h-72 rounded-xl overflow-hidden bg-card relative">
              <LiveMap session={session} runnerName={runnerName} follow={false} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LiveMap({ session, runnerName, follow }: { session: LiveSession; runnerName: string; follow: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const trackLine = useRef<L.Polyline | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const centred = useRef(false);
  const [following, setFollowing] = useState(follow);
  const followingRef = useRef(follow);
  followingRef.current = following;

  const routePoints = useMemo(
    () => (session.routePolyline ? decodePolyline(session.routePolyline) : null),
    [session.routePolyline],
  );

  const position: [number, number] | null =
    session.currentLat !== null && session.currentLng !== null && !(session.currentLat === 0 && session.currentLng === 0)
      ? [session.currentLat, session.currentLng]
      : session.gpsTrack.length
        ? [session.gpsTrack[session.gpsTrack.length - 1].lat, session.gpsTrack[session.gpsTrack.length - 1].lng]
        : null;

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true }).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);
    // The observer dragging the map pauses follow mode so they can look around the route.
    m.on("dragstart", () => setFollowing(false));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      trackLine.current = routeLine.current = null;
      marker.current = null;
      centred.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (routePoints && routePoints.length > 1) {
      if (!routeLine.current) {
        routeLine.current = L.polyline(routePoints, { color: "#1e293b", weight: 4, opacity: 0.7, dashArray: "6 8" }).addTo(m);
      } else {
        routeLine.current.setLatLngs(routePoints);
      }
    }

    const track = session.gpsTrack.map((p) => [p.lat, p.lng] as [number, number]);
    if (track.length > 1) {
      if (!trackLine.current) {
        trackLine.current = L.polyline(track, { color: TEAL, weight: 5, opacity: 0.95 }).addTo(m);
      } else {
        trackLine.current.setLatLngs(track);
      }
    }

    if (position && follow) {
      if (!marker.current) {
        marker.current = L.marker(position, {
          icon: L.divIcon({
            className: "",
            html: `<div style="position:relative;width:22px;height:22px">
              <div style="position:absolute;inset:0;border-radius:9999px;background:${TEAL};opacity:.35;animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite"></div>
              <div style="position:absolute;inset:4px;border-radius:9999px;background:${TEAL};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>
            </div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
          title: runnerName,
        }).addTo(m);
      } else {
        marker.current.setLatLng(position);
      }
    }

    if (!follow) {
      if (!centred.current && track.length > 1) {
        m.fitBounds(L.latLngBounds(track), { padding: [24, 24] });
        centred.current = true;
      }
      return;
    }
    if (position) {
      if (!centred.current) {
        m.setView(position, 16);
        centred.current = true;
      } else if (followingRef.current) {
        m.panTo(position, { animate: true });
      }
    } else if (!centred.current && routePoints && routePoints.length > 1) {
      m.fitBounds(L.latLngBounds(routePoints), { padding: [24, 24] });
    }
  }, [session, routePoints, position?.[0], position?.[1], follow, runnerName]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0 z-0" />
      {follow && !position && (
        <div className="absolute inset-x-0 top-3 z-[500] flex justify-center pointer-events-none">
          <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">Waiting for GPS signal…</span>
        </div>
      )}
      {follow && position && !following && (
        <button
          className="absolute right-3 bottom-6 z-[500] inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow-lg"
          onClick={() => {
            setFollowing(true);
            map.current?.setView(position, Math.max(map.current.getZoom(), 15));
          }}
        >
          <LocateFixed className="w-4 h-4 text-primary" /> Follow {runnerName}
        </button>
      )}
      <style>{`@keyframes ping{75%,100%{transform:scale(2.4);opacity:0}}`}</style>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${tone === "warn" ? "bg-amber-400/10 text-amber-300" : ""}`}>
      {children}
    </div>
  );
}

function CenteredMessage({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16 max-w-md mx-auto">
      {icon}
      <h1 className="text-3xl">{title}</h1>
      {body && <p className="text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

function AppFooter({ code }: { code: string }) {
  const stores = platform === "ios"
    ? [{ label: "App Store", href: APP_STORE_URL }]
    : platform === "android"
      ? [{ label: "Google Play", href: PLAY_STORE_URL }]
      : [{ label: "App Store", href: APP_STORE_URL }, { label: "Google Play", href: PLAY_STORE_URL }];
  return (
    <footer className="border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          <Smartphone className="inline w-4 h-4 mr-1 -mt-0.5" />
          Your own AI running coach, in your ear on every run.
        </p>
        <div className="flex flex-wrap gap-2">
          {platform !== "desktop" && code && (
            <a href={`airuncoach://observe/${encodeURIComponent(code)}`} className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold">
              Open in app
            </a>
          )}
          {stores.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
