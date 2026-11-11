import express from "express";
import type { Application } from "express";
import * as fs from "node:fs";
import * as path from "node:path";

// One web server path for every device and environment. There is no Expo
// manifest, development proxy, or testing-page fallback.
export function configureWebServing(app: Application, root = process.cwd()) {
  const webDistPath = path.resolve(root, "dist", "public");
  const webIndexPath = path.join(webDistPath, "index.html");

  app.get("/manifest", (_req, res) => {
    res.status(410).json({ error: "Mobile testing manifests are no longer available" });
  });

  // Keep unknown API requests separate from the web app, including all methods.
  // Actual API handlers have already been registered before this middleware.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use("/assets", express.static(path.resolve(root, "assets")));
  app.use("/logos", express.static(path.resolve(root, "attached_assets/generated_images")));
  app.use(express.static(webDistPath, { index: false }));

  app.get("*", (req, res) => {
    // Missing assets should not receive HTML disguised as a JS/image response.
    if (req.path.startsWith("/assets/") || req.path.startsWith("/logos/")) {
      return res.status(404).send("Not found");
    }
    if (!fs.existsSync(webIndexPath)) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).type("text").send("The website build is unavailable. Please try again later.");
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.sendFile(webIndexPath);
  });
}
