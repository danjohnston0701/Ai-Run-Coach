/**
 * Regenerates server/garmin-device-models.ts from the locally installed Connect IQ SDK.
 *
 * The companion watch app reports Sys.getDeviceSettings().partNumber, an opaque code such as
 * "006-B3851-00". Each device the SDK supports ships a compiler.json containing both that part
 * number and the device's real name, so the mapping is extracted from the SDK rather than
 * hand-maintained — run this after installing a new SDK to pick up newly released watches.
 *
 *   npx tsx server/scripts/generate-garmin-device-models.ts
 *
 * Requires the Connect IQ SDK Manager's device definitions, by default at
 * ~/Library/Application Support/Garmin/ConnectIQ/Devices (override with CIQ_DEVICES_DIR).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const devicesDir =
  process.env.CIQ_DEVICES_DIR ||
  join(homedir(), "Library/Application Support/Garmin/ConnectIQ/Devices");

if (!existsSync(devicesDir)) {
  console.error(`Connect IQ device definitions not found at ${devicesDir}`);
  console.error("Install them via the Connect IQ SDK Manager, or set CIQ_DEVICES_DIR.");
  process.exit(1);
}

/** Part numbers are nested at varying depths across SDK versions — collect them wherever they appear. */
function collectPartNumbers(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const v of node) collectPartNumbers(v, found);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.toLowerCase().includes("partnumber") && typeof v === "string") found.add(v);
      else collectPartNumbers(v, found);
    }
  }
}

const map = new Map<string, string>();
let scanned = 0;

for (const entry of readdirSync(devicesDir)) {
  const compilerJson = join(devicesDir, entry, "compiler.json");
  if (!existsSync(compilerJson)) continue;
  scanned++;
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(compilerJson, "utf8"));
  } catch {
    console.warn(`  skipped ${entry}: unreadable compiler.json`);
    continue;
  }
  const rawName: string | undefined = parsed.deviceName || parsed.displayName;
  if (!rawName) continue;
  // Strip ®/™ — these names are shown in run titles and on the run summary.
  const name = rawName.replace(/[®™]/g, "").replace(/\s{2,}/g, " ").trim();
  const partNumbers = new Set<string>();
  collectPartNumbers(parsed, partNumbers);
  for (const pn of partNumbers) map.set(pn, name);
}

const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
const body = entries.map(([pn, name]) => `  "${pn}": "${name}",`).join("\n");
const today = new Date().toISOString().slice(0, 10);

writeFileSync(
  join(import.meta.dirname ?? __dirname, "../garmin-device-models.ts"),
  `// GENERATED FILE — do not edit by hand.
// Regenerate with:  npx tsx server/scripts/generate-garmin-device-models.ts
//
// Garmin hardware part number → human-readable model name. The companion app reports
// Sys.getDeviceSettings().partNumber (e.g. "006-B3851-00"), which is what lands in
// garmin_companion_sessions.device_model — an opaque code with no model name attached, so
// every watch run was titled the generic "Garmin Watch" regardless of device.
//
// Source of truth is the Connect IQ SDK itself: each device ships a compiler.json carrying its
// deviceName and hardware part numbers, so this map is extracted rather than hand-maintained
// and can be regenerated whenever the SDK is updated.
// Generated from Connect IQ SDK device definitions on ${today} — ${entries.length} part numbers, ${new Set(map.values()).size} models.

export const GARMIN_PART_NUMBER_TO_MODEL: Record<string, string> = {
${body}
};

/**
 * Human-readable watch model for a reported device identifier, or null when unknown.
 * Accepts a raw part number, or a string that already looks like a model name (the Wear OS
 * companion reports "Galaxy Watch7" rather than a Garmin part number).
 */
export function resolveWatchModel(deviceModel: string | null | undefined): string | null {
  if (!deviceModel) return null;
  const raw = deviceModel.trim();
  if (!raw) return null;
  const mapped = GARMIN_PART_NUMBER_TO_MODEL[raw.toUpperCase()];
  if (mapped) return mapped;
  // Not a part number we know. If it doesn't look like one at all ("006-XXXXX-00"), assume the
  // device reported a real name already and pass it through rather than discarding it.
  if (!/^\\d{3}-[A-Za-z0-9]+-\\d{2}$/.test(raw)) return raw;
  return null;
}
`,
);

console.log(`Scanned ${scanned} device definitions → ${entries.length} part numbers, ${new Set(map.values()).size} models.`);
