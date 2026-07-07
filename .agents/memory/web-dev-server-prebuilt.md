---
name: Web dev server serves prebuilt output
description: Why edits to client/ don't show up until you rebuild; how to test the React web app locally.
---

The `Start application` workflow runs `npm run server:dev` (Express via tsx). In dev it does **not** run a live Vite dev server with HMR for the React web app — it serves the **prebuilt** static bundle from `dist/public` (log line: "Web app: Serving from .../dist/public").

**Consequence:** editing anything under `client/` has **no effect** on the running site until you run `npx vite build` (outputs to `dist/public`). There is no hot reload for the web frontend.

**How to apply:** after changing web (`client/`) code, run `npx vite build`, then the change is live on port 3000. The build also doubles as the real type/alias compile check (root `tsconfig.json` misconfigures `@/*` → `./client/*` instead of `./client/src/*`, so `tsc --noEmit` reports false "Cannot find module '@/...'" errors — trust the Vite build, not `npm run check:types`, for `@/` imports).

**Also:** the `app_preview` screenshot tool sometimes returns `ERR_CONNECTION_REFUSED` for this app even when `curl localhost:3000` returns 200 — don't assume the server is down; verify with curl.
