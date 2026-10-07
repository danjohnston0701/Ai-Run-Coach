// The other four runners in the demo group, driven through the real API of the LOCAL demo
// server while Alex runs on the emulator. Everyone starts together; each finishes after their
// own run's duration (so wall-clock finish order == the times in the table).
//   node crew.cjs <seed.json> [apiBase]
const seed = require(require("path").resolve(process.argv[2]));
const API = process.argv[3] || "http://localhost:5055";
const U = seed.users, GR = seed.groupRunId;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function api(path, token, method = "GET", body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

// km, seconds, avg HR, cadence, elevation gain — plausible 5K efforts around Alex's ~5:20/km.
// Sam/Jordan/Mia finish 3–5 min after Alex so their arrivals land while his summary is on screen.
const CREW = {
  priya:  { km: 5.02, sec: 1501, hr: 162, cad: 178, elev: 14 },
  sam:    { km: 5.04, sec: 1790, hr: 151, cad: 168, elev: 13 },
  jordan: { km: 5.01, sec: 1838, hr: 165, cad: 164, elev: 15 },
  mia:    { km: 5.03, sec: 1892, hr: 148, cad: 171, elev: 12 },
};

(async () => {
  // Wait for Alex's app to report its start (POST /started from the real run screen).
  let t0;
  for (;;) {
    const g = await api(`/api/group-runs/${GR}`, U.alex.token);
    const alex = g.participants.find((p) => p.userId === U.alex.id);
    // Anchor on when we SAW the start (or T0 env, epoch ms): the local demo Postgres runs in
    // local time, so its startedAt reads back hours off when parsed as UTC.
    if (alex?.startedAt) { t0 = Number(process.env.T0) || Date.now(); break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log("Alex started", new Date(t0).toISOString());
  for (const k of Object.keys(CREW)) await api(`/api/group-runs/${GR}/started`, U[k].token, "POST");
  log("crew recording");

  await Promise.all(Object.entries(CREW).map(async ([k, c]) => {
    const wait = t0 + c.sec * 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const pace = c.sec / c.km;
    await api("/api/runs", U[k].token, "POST", {
      distance: c.km, duration: c.sec, startTime: t0, completedAt: new Date().toISOString(),
      avgPace: `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, "0")}`,
      avgHeartRate: c.hr, maxHeartRate: c.hr + 14, minHeartRate: c.hr - 38, cadence: c.cad, maxCadence: c.cad + 9,
      elevationGain: c.elev, elevationLoss: c.elev - 1, calories: Math.round(c.km * 64), sessionType: "run",
      groupRunId: GR,
    });
    log(`${U[k].name} finished ${c.km} km in ${Math.floor(c.sec / 60)}:${String(c.sec % 60).padStart(2, "0")}`);
  }));
  log("crew done");
})().catch((e) => { console.error(e); process.exit(1); });
