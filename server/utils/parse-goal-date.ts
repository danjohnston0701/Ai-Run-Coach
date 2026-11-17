/**
 * Parses a goal's target date as the apps send it.
 *
 * Android and iOS (every build up to Android 2.0.80 / iOS 1.8.23) send the date picker's display
 * text, "dd MMM yyyy", formatted in the PHONE's language: "20 Oct 2026" in English, "20 ott 2026"
 * in Italian, "20 Okt. 2026" in German. `new Date()` only understands English month names, so a
 * non-English phone got Invalid Date and `POST /api/goals` threw a 500 (an Italian runner
 * failed six times in a row on 2026-10-20 and never came back). Newer builds send English, but
 * the old ones stay installed, so the server reads month names in any common language.
 *
 * Returns a Date at UTC midnight for date-only input, `null` for empty input, and `undefined`
 * when the text can't be read (the caller decides whether to drop it or reject the request).
 */

const LOCALES = [
  "en", "it", "de", "fr", "es", "pt", "nl", "sv", "da", "nb", "fi", "pl", "cs", "sk", "hu", "ro",
  "tr", "ru", "uk", "el", "sl", "hr", "sr", "bg", "ca", "et", "lv", "lt", "id", "ms", "vi", "ja",
  "ko", "zh", "he", "ar",
];

let monthLookup: Map<string, number> | null = null;

function normaliseToken(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[.‏‎]/g, "").trim();
}

/** Every short and long month name (both the in-a-date and standalone forms) → month index. */
function getMonthLookup(): Map<string, number> {
  if (monthLookup) return monthLookup;
  const map = new Map<string, number>();
  const add = (name: string | undefined, month: number) => {
    if (!name) return;
    const key = normaliseToken(name);
    // First locale wins on a clash (e.g. Croatian "listopad" = October, Polish = November),
    // so LOCALES is ordered by how likely the language is among our users.
    if (key && !map.has(key)) map.set(key, month);
  };
  for (const locale of LOCALES) {
    for (const width of ["short", "long"] as const) {
      let inDate: Intl.DateTimeFormat;
      let standalone: Intl.DateTimeFormat;
      try {
        inDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: width, year: "numeric", timeZone: "UTC" });
        standalone = new Intl.DateTimeFormat(locale, { month: width, timeZone: "UTC" });
      } catch {
        continue;
      }
      for (let m = 0; m < 12; m++) {
        const d = new Date(Date.UTC(2026, m, 15));
        add(inDate.formatToParts(d).find((p) => p.type === "month")?.value, m);
        add(standalone.format(d), m);
      }
    }
  }
  monthLookup = map;
  return map;
}

/** Arabic-Indic, Persian, Devanagari, Bengali and full-width digits → ASCII. */
function asciiDigits(s: string): string {
  const zeros = [0x0660, 0x06f0, 0x0966, 0x09e6, 0xff10];
  return s.replace(/\p{Nd}/gu, (ch) => {
    const code = ch.codePointAt(0)!;
    for (const z of zeros) if (code >= z && code <= z + 9) return String(code - z);
    return ch;
  });
}

export function parseGoalDate(input: unknown): Date | null | undefined {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? undefined : input;
  if (typeof input !== "string") return undefined;
  const text = asciiDigits(input).trim();
  if (!text) return null;

  // ISO date-only (what the apps should send) → UTC midnight.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validUtc(+iso[1], +iso[2] - 1, +iso[3]);

  // "dd MMM yyyy" in any language.
  const dmy = /^(\d{1,2})\s+(.+?)\s+(\d{4})$/u.exec(text);
  if (dmy) {
    const month = getMonthLookup().get(normaliseToken(dmy[2]));
    if (month !== undefined) return validUtc(+dmy[3], month, +dmy[1]);
  }

  // Anything else JavaScript understands (full ISO timestamps, "Oct 20, 2026", ...).
  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? undefined : fallback;
}

function validUtc(year: number, month: number, day: number): Date | undefined {
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day ? d : undefined;
}
