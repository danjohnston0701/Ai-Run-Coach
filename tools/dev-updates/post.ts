// Post entries to the Development updates & asks page (/admin/dev-updates).
//
//   DEV_UPDATES_URL=https://airuncoach.live DEV_UPDATES_API_KEY=… npx tsx tools/dev-updates/post.ts entries.json
//
// entries.json: [{ kind, title, body, platforms?, status?, author?, images?: [{ path, caption? }] }]
//   kind: question | test_request | change | review | ux_test   (body: light markdown —
//   paragraphs, "- " bullets, **bold**, `code`, "## " headings)
// Screenshots are downsized to ≤ 1000 px tall JPEG with macOS `sips` before upload (the server
// stores them in the DB, 3 MB cap each). The key is the DEV_UPDATES_API_KEY Replit secret.

import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";

const base = (process.env.DEV_UPDATES_URL ?? "https://airuncoach.live").replace(/\/$/, "");
const key = process.env.DEV_UPDATES_API_KEY;
const file = process.argv[2];
if (!key || !file) {
  console.error("Usage: DEV_UPDATES_URL=… DEV_UPDATES_API_KEY=… npx tsx tools/dev-updates/post.ts entries.json");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", "X-Dev-Updates-Key": key };
const work = mkdtempSync(join(tmpdir(), "dev-updates-"));

function shrink(path: string): Buffer {
  const out = join(work, basename(path).replace(/\.\w+$/, "") + ".jpg");
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "75", "--resampleHeight", "1000", path, "--out", out], { stdio: "ignore" });
  return readFileSync(out);
}

async function main() {
  const entries = JSON.parse(readFileSync(file, "utf8"));
  const dir = dirname(resolve(file));
  for (const e of entries) {
    const r = await fetch(`${base}/api/dev-updates`, {
      method: "POST", headers,
      body: JSON.stringify({ kind: e.kind, title: e.title, body: e.body, platforms: e.platforms, status: e.status, author: e.author }),
    });
    if (!r.ok) throw new Error(`POST ${e.title}: ${r.status} ${await r.text()}`);
    const { id } = await r.json() as { id: string };
    for (const [i, img] of (e.images ?? []).entries()) {
      const data = shrink(resolve(dir, img.path));
      const ir = await fetch(`${base}/api/dev-updates/${id}/images`, {
        method: "POST", headers,
        body: JSON.stringify({ caption: img.caption, contentType: "image/jpeg", dataBase64: data.toString("base64"), position: i }),
      });
      if (!ir.ok) throw new Error(`image ${img.path}: ${ir.status} ${await ir.text()}`);
    }
    console.log(`posted [${e.kind}] ${e.title} (${(e.images ?? []).length} images) → ${id}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
