# Replit → Railway cutover plan

Moving the Ai Run Coach server and `airuncoach.live` website off Replit with **no downtime**.
Written 2026-11-15. Tick items off as they're done.

**The idea:** both servers can safely run at the same time, because they use the same Neon database.
So the switch is: get Railway fully ready on the real database → move the background jobs →
point the domain at Railway → keep Replit running untouched as the instant fallback for a week.
Nothing is deleted until Railway has run cleanly for 7 days.

## Where things stand

| | Status |
|---|---|
| Server code ready for any host | ✅ merged to `main` (PR #1, `fb6c18a9`) and **live on Replit** since 2026-11-15 (deploy `b2e06617`), no behaviour change |
| Railway service (US East, `ai-run-coach-production.up.railway.app`) | ✅ deploys from `main` (auto-deploy on push), on a **test copy** of the database, jobs off |
| All 47 secrets on Railway, checked against the code | ✅ |
| Every page and API response matches live Replit | ✅ login ~25% faster server-side |
| Domain DNS can point at Railway | ⏳ Cloudflare zone ready (all 15 records verified); waiting on Replit Support to switch nameservers (0.3) |
| Live production | Still 100% on Replit |

## Phase 0: Move the domain's DNS off Replit (start now, takes days)

**Why this is needed:** Railway needs a CNAME-style record on the bare domain `airuncoach.live`.
Replit's DNS editor only offers A / TXT / MX / CNAME, and a plain CNAME can't sit on the bare
domain next to your email records. Also, the domain is **registered through Replit**: closing the
Replit account without moving it first would lose the domain.

**Recommended:** move DNS, then the registration, to **Cloudflare** (free DNS, at-cost renewals,
supports the bare-domain CNAME that Railway needs).

- [x] **0.1** Create a Cloudflare account and add `airuncoach.live` (free plan). Done 2026-11-15.
      **Cloudflare nameservers: `desi.ns.cloudflare.com` and `ray.ns.cloudflare.com`.**
- [x] **0.2** Check that Cloudflare has **all 15 records** below, exactly. Set every record to **DNS only (grey cloud)**.
      The `A @` record stays pointing at Replit for now, so nothing changes yet.
      Done 2026-11-15: the scan missed `zb10269481`, `171847._domainkey` and `_railway-verify` (added by hand) and had
      proxied `@` and `www` (switched to DNS only). Querying `desi.ns.cloudflare.com` directly gives answers identical to
      the current name.com nameservers for every record. DNSSEC is off (no DS record), so nothing to disable first.
- [ ] **0.3** Contact **Replit Support** and ask them to either change the nameservers to the two Cloudflare gives you,
      or unlock the domain and send the transfer (EPP/auth) code. Ask for both; nameservers first is fastest.
      Message to send:
      > Hi, I own the domain **airuncoach.live**, registered through Replit Domains on this account. I'm moving its DNS to Cloudflare.
      > Could you please (1) change the domain's nameservers to `desi.ns.cloudflare.com` and `ray.ns.cloudflare.com`
      > (replacing the current name.com ones),
      > and (2) unlock the domain and send me the transfer authorisation (EPP) code so I can transfer the registration afterwards?
      > My deployment should keep running unchanged; I've already copied every DNS record to Cloudflare. Thanks!
- [ ] **0.4** Once the nameservers are on Cloudflare (24–48 h to settle), check that the site, app, `support@` email and app emails all work.
- [ ] **0.5** Transfer the registration to Cloudflare Registrar (about 5–7 days; the site keeps working throughout).

**Records to carry over (as of 2026-11-15)**, skipping long key values:

| Type | Name | Value | Used for |
|---|---|---|---|
| A | `@` | `34.111.179.208` | **The site/API (Replit)**: changes at cutover |
| CNAME | `www` | `ikpmc3ex.up.railway.app` | Old, never worked: replaced at cutover |
| TXT | `_railway-verify` | `railway-verify=9f82dd…` | Old Railway attempt: replaced at cutover |
| TXT | `@` | `replit-verify=27b2c8ff…` | Replit: delete after Replit is gone |
| MX | `@` | `mx.zoho.com.au` (10), `mx2.zoho.com.au` (20), `mx3.zoho.com` (50) | **Zoho email** (`support@`) |
| TXT | `@` | `v=spf1 include:zohomail.com.au ~all` | Zoho email |
| TXT | `default._domainkey` | `v=DKIM1; k=rsa; p=MIGf…` | Zoho email signing |
| CNAME | `zb10269481` | `zmverify.zoho.com` | Zoho verification |
| TXT | `171847._domainkey` | `k=rsa; p=MIGf…` | Email signing (another sender) |
| TXT | `resend._domainkey` | `p=MIGf…` | **Resend** (app emails) |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` (10) | Resend bounces |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; pct=100;` | Email protection |
| TXT | `@` | `google-site-verification=46CtKDMo…` | Google |

> Spotted while checking: Resend normally also needs `TXT send` = `v=spf1 include:amazonses.com ~all`, and
> it's missing. Worth adding (check the Resend dashboard for the exact value). With DMARC set to *reject*,
> it reduces the chance of app emails being bounced.

## Phase 1: Put the prep code live on Replit (no behaviour change)

Production then runs the same code Railway will run, so the switch only changes *where* it runs.

- [x] **1.1** Open a PR `migration/railway-prep` → `main`, review, merge.
- [x] **1.2** Replit: **Git → Pull**, then **Republish**. Check:
  - `https://airuncoach.live/health/ready` shows `"db":"ok"`
  - a test email (support form) arrives — **not yet tried**; email config didn't change in practice (Replit already used `RESEND_API_KEY`)
  - the app works normally
- [x] **1.3** Railway: switch the service's branch from `migration/railway-prep` to `main`.
      Decide: **auto-deploy on push to `main`** (simple, and how Claude would ship fixes) or turn auto-deploy off and deploy by hand.

## Phase 2: Railway on the real database, still no traffic (day before switch)

- [ ] **2.1** Railway plan → **Hobby**. Raise the memory limit to at least 2 GB (Replit gives 4 GB; the trial caps at 1 GB).
- [ ] **2.2** Railway variables: set `EXTERNAL_DATABASE_URL` back to **production** (`ep-restless-grass-ahppspy3-pooler`).
      Keep `CRON_ENABLED=false`. Deploy, then check `/health/ready` and the logs for errors.
- [ ] **2.3** Railway → Settings → Networking → **Custom Domain**: add `airuncoach.live` and `www.airuncoach.live`.
      Add the verification records it shows in **Cloudflare** (harmless; traffic doesn't move yet).
      Delete the old `_railway-verify` record.
- [ ] **2.4** Cloudflare: set the TTL on `@` and `www` to the minimum (60 s or "Auto"), so the switch and any rollback spread fast.

## Phase 3: Move the background jobs (rehearsal, low risk)

Jobs only need the database, so they can move before any traffic does. This proves Railway runs them properly.

- [ ] **3.1** Replit Secrets: add `CRON_ENABLED=false` → **Republish**. Replit's jobs stop.
- [ ] **3.2** Railway: set `CRON_ENABLED=true` → deploy. Its logs should show `[Scheduler]` start lines instead of "OFF".
- [ ] **3.3** Watch for an hour: lifecycle email sweep (every 10 min), hourly sweeps at :15/:25/:40/:50, no repeated errors.
- **Rollback:** reverse 3.2, then 3.1. A gap of a few minutes is harmless; jobs catch up on their next run.

## Phase 4: Switch traffic (quiet hour)

- [ ] **4.1** Pick the quietest hour. From 60 days of runs and user activity (checked 2026-11-15), the quietest window is
      **23:00–01:00 UTC** (noon–2 pm NZDT, 10 am–noon AEDT): 2–3 runs in progress in that hour across 60 days, against 30+ at the
      09:00 and 19:00 UTC peaks. Avoid weekends (parkrun) and Neon's maintenance window (**Tuesday 06:00–07:00 UTC**).
- [ ] **4.2** Cloudflare: point `@` and `www` at the Railway targets from step 2.3 (DNS only, grey cloud, so Railway can issue the certificate).
- [ ] **4.3** Within about 5 minutes, traffic shifts as caches expire. Requests landing on either server work, because both use the same database.
- [ ] **4.4** Check Railway logs: traffic climbing, no new error patterns. Check the certificate: `https://airuncoach.live` and `https://www.airuncoach.live` both load, and `www` lands on the site.
- [ ] **4.5** Test the real thing on your phone:
  - log in
  - run history and My Data
  - a short run with coaching
  - Garmin and Galaxy Watch prepare/send
  - post-run summary
  - an observer link
  - password reset email
  - support form
  - a push notification
- [ ] **4.6** Over the next hours: watch Replit's request count fall towards zero. Webhooks from Strava, Garmin, Apple and Google follow the domain automatically; no setting changes needed.

**Rollback (at any point in the first week):** point `@` back to A `34.111.179.208` in Cloudflare, and if jobs were moved, reverse Phase 3.
Replit keeps running untouched, so it takes over again within minutes.

**Known one-off blips:** a Garmin or Strava *connect* screen started on Replit and finished on Railway fails once (the state is held in memory); retrying works.
In-memory rate limits reset. Nothing else is held in server memory.

## Phase 5: After 7 clean days

- [ ] **5.1** Reset the Neon `neondb_owner` password (it was exposed in chat) and update it **on Railway only**.
- [ ] **5.2** Change `ADMIN_API_KEY` to a long random value. No app sends it; only admin tools use it.
- [ ] **5.3** Railway: delete the `GITHUB_TOKEN`, `VAPID_*`, `EXPO_PUBLIC_API_URL`, `Garmin_Companion_Update_Shell`, `Open_Weather_API` and `STRAVA_NEW_CONNECTIONS_ENABLE` variables (none are used).
      Narrow Railway's GitHub access to just `Ai-Run-Coach`.
- [ ] **5.4** Delete the Neon test branch `migration-test-2026-11-14` and the `replit-sync` GitHub branch.
- [ ] **5.5** Code tidy-up: remove `REPLIT_*` handling and `.replit`, update `CLAUDE.md` → Deployment (Railway, how deploys happen).
- [ ] **5.6** Once the domain **transfer to Cloudflare is complete**: stop the Replit deployment, remove the `replit-verify` record, then cancel Replit.
      **Not before the transfer completes**, or the domain goes with the account.
- [ ] **5.7** Set up Claude error monitoring on Railway's logs (scheduled check, flags new errors and error spikes).

## Decisions to make
- ~~Auto-deploy on push to `main`?~~ Yes (2026-11-15). Until cutover Railway only uses the test database, so a bad push can't affect users.
  After cutover, every push to `main` goes live, the same as a Replit republish.
- **One Railway instance or two?** Replit Autoscale could run several; Railway starts with one and restarts it on a crash. Two replicas in US East add redundancy for roughly double the compute cost.
- **Longer term:** Replit's production server runs in **Australia**, while Neon is in US East, so every Replit query crosses the Pacific
  (`/health/ready` reports ~200 ms there against ~2 ms from Railway). Railway in US East removes that hop. Most users are likely in NZ/Australia. Moving both the database (Neon Sydney) and the server (Railway Singapore) closer to them would cut response times further. It's a separate project, after this migration.
