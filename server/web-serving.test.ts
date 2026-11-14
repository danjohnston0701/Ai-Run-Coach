import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import express from "express";
import { configureWebServing } from "./web-serving";

const html = '<html><div id="root">AI Run Coach web app</div></html>';
let root: string;
let server: Server;
let base: string;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "airuncoach-web-serving-"));
  for (const dir of ["dist/public/assets", "static-build/ios", "attached_assets/generated_images", "assets"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, "dist/public/index.html"), html);
  writeFileSync(join(root, "dist/public/assets/app.js"), "window.webApp = true;");
  // Leftover files must never bring the retired testing app back.
  writeFileSync(join(root, "dist/index.html"), "Download Expo Go");
  writeFileSync(join(root, "static-build/index.html"), "Download Expo Go");
  writeFileSync(join(root, "static-build/ios/manifest.json"), '{"retiredExpoManifest":true}');
  writeFileSync(join(root, "assets/guide.txt"), "native app guide");
  writeFileSync(join(root, "attached_assets/generated_images/logo.txt"), "logo");

  const app = express();
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  configureWebServing(app, root);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (root) rmSync(root, { recursive: true, force: true });
});

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const clients = {
  Safari: `${iphone} Version/18.0 Mobile/15E148 Safari/604.1`,
  Chrome: `${iphone} CriOS/130.0 Mobile/15E148 Safari/604.1`,
  Firefox: `${iphone} FxiOS/132.0 Mobile/15E148 Safari/605.1.15`,
  Edge: `${iphone} EdgiOS/130.0 Mobile/15E148 Safari/605.1.15`,
  "email webview": `${iphone} Mobile/15E148`,
  "native user agent": "okhttp/4.12.0",
};

for (const [name, ua] of Object.entries(clients)) {
  for (const path of ["/", "/reset-password?token=fake-test-token", "/forgot-password"]) {
    test(`${name}: ${path.split("?")[0]} always serves the website`, async () => {
      const response = await fetch(base + path, { headers: { "user-agent": ua } });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), html);
      assert.match(response.headers.get("cache-control")!, /no-store/);
    });
  }
}

test("Expo headers no longer select a manifest or testing app", async () => {
  for (const platform of ["ios", "android"]) {
    const response = await fetch(base + "/", { headers: { "expo-platform": platform, accept: "application/json" } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get("expo-protocol-version"), null);
  }
});

test("retired manifest endpoint reports Gone", async () => {
  const response = await fetch(base + "/manifest", { headers: { "expo-platform": "ios" } });
  assert.equal(response.status, 410);
  assert.match(response.headers.get("content-type")!, /application\/json/);
});

test("leftover testing files are not exposed", async () => {
  const response = await fetch(base + "/ios/manifest.json");
  assert.equal(await response.text(), html);
});

test("registered APIs still work and unknown APIs remain JSON 404s", async () => {
  assert.deepEqual(await (await fetch(base + "/api/health")).json(), { status: "ok" });
  for (const method of ["GET", "POST"]) {
    const response = await fetch(base + "/api/not-a-real-route", { method });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  }
});

test("website assets, shared assets and logos remain available", async () => {
  for (const [path, expected] of [
    ["/assets/app.js", "window.webApp = true;"],
    ["/assets/guide.txt", "native app guide"],
    ["/logos/logo.txt", "logo"],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
  }
  assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
});

test("missing web build is an explicit 503, never an Expo fallback", async () => {
  const index = join(root, "dist/public/index.html");
  unlinkSync(index);
  try {
    const response = await fetch(base + "/reset-password");
    assert.equal(response.status, 503);
    assert.match(await response.text(), /website build is unavailable/);
  } finally {
    writeFileSync(index, html);
  }
});
