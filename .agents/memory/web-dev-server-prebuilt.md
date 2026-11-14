---
name: Web dev server serves prebuilt output
description: Why edits to client/ don't show up until you rebuild; how to test the React web app locally.
---

The `Start application` workflow runs `npm run server:dev` (Express via tsx). In dev it does **not** run a live Vite dev server with HMR for the React web app — it serves the **prebuilt** static bundle from `dist/public` (log line: "Web app: Serving from .../dist/public").

**Consequence:** editing anything under `client/` has **no effect** on the running site until you run `npx vite build` (outputs to `dist/public`). There is no hot reload for the web frontend.

**How to apply:** rebuild current source before browser checks, including after Git synchronization. Use aliases matching Vite when type-checking web code rather than interpreting unrelated root Expo alias errors. Vite bundles TypeScript but does not type-check missing JSX identifiers. A successful bundle is not proof that a page renders.

**Why:** a working prebuilt Preview masked source with a missing icon import; publishing rebuilt the broken source. Verify the changed route and uncaught browser errors against a fresh build, not just HTTP status or an old Preview.

**Also:** the `app_preview` screenshot tool sometimes returns `ERR_CONNECTION_REFUSED` for this app even when `curl localhost:3000` returns 200 — don't assume the server is down; verify with curl.
