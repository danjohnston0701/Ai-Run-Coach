// Seeds the LOCAL throwaway DB (port 54329) with a demo group run via the real local API (5055).
const { Client } = require("/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/node_modules/pg");
const fs = require("fs");
const API = "http://localhost:5055";
const OUT = process.argv[2] || __dirname + "/seed.json"; // contains demo tokens — keep out of git
const DB = "postgresql://demo:demo@localhost:54329/airuncoach?sslmode=no-verify";

const RUNNERS = [
  { key: "alex", name: "Alex" },     // the filming account (logged in on the emulator)
  { key: "priya", name: "Priya" },
  { key: "sam", name: "Sam" },
  { key: "jordan", name: "Jordan" },
  { key: "mia", name: "Mia" },
];
const PASSWORD = "DemoRun2026x";

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", "X-App-Platform": "android", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return json;
}

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const out = { users: {} };
  for (const u of RUNNERS) {
    const email = `${u.key}@demo.airuncoach.test`;
    try { await api("/api/auth/register", { method: "POST", body: { email, password: PASSWORD, name: u.name, platform: "android" } }); }
    catch (e) { if (!String(e).includes("already registered")) throw e; }
    // Local demo DB only: verified, onboarded, entitled — so the app goes straight to the dashboard.
    await db.query(`UPDATE users SET email_verified = true, onboarding_completed_at = NOW(),
      subscription_tier = 'premium', subscription_status = 'active', entitlement_type = 'admin promo',
      entitlement_expires_at = NOW() + interval '60 days', fitness_level = 'intermediate',
      gender = 'female', weight = '62', height = '168', dob = '1992-05-01'
      WHERE email = $1`, [email]).catch(async (e) => {
        console.warn("full update failed, minimal:", e.message);
        await db.query(`UPDATE users SET email_verified = true, onboarding_completed_at = NOW(), subscription_tier = 'premium', subscription_status = 'active' WHERE email = $1`, [email]);
      });
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    out.users[u.key] = { email, token: login.token, id: login.user?.id ?? login.userId ?? login.id, name: u.name };
  }
  const host = out.users.alex;
  const start = new Date(); start.setMinutes(start.getMinutes() + 5);
  const gr = await api("/api/group-runs", { method: "POST", token: host.token, body: {
    name: "Sunday Social 5K", description: "Easy-ish 5K round the lake, coffee after.",
    meetingPoint: "Hamilton Lake, Innes Common", meetingLat: -37.8037, meetingLng: 175.2787,
    distance: 5.0, dateTime: start.toISOString(), maxParticipants: 10, isPublic: false } });
  out.groupRunId = gr.id;
  const others = ["priya", "sam", "jordan", "mia"].map(k => out.users[k].id);
  await api(`/api/group-runs/${gr.id}/invite`, { method: "POST", token: host.token, body: { userIds: others } });
  for (const k of ["priya", "sam", "jordan", "mia"]) {
    await api(`/api/group-runs/${gr.id}/respond`, { method: "POST", token: out.users[k].token, body: { response: "accepted" } });
    await api(`/api/group-runs/${gr.id}/ready`, { method: "POST", token: out.users[k].token });
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const check = await api(`/api/group-runs/${gr.id}`, { token: host.token });
  console.log("group", gr.id, check.participants.map(p => `${p.userName}:${p.invitationStatus}/${p.runStatus}`).join(", "));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
