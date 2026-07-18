/**
 * Resolve timezone and country from device timezone ID.
 * 
 * The Android/iOS device sends Intl.DateTimeFormat().resolvedOptions().timeZone
 * in the signup/login request (e.g., "America/Los_Angeles", "Europe/London").
 * 
 * From the IANA timezone identifier, we can infer the country code using a
 * basic mapping. For accurate results, consider using a library like
 * tzdata or a geographic database, but this basic map covers common cases.
 */

// Mapping of IANA timezone to ISO 3166-1 alpha-2 country codes
// This is a simplified map covering the most common timezones
// For 100% accuracy, use a dedicated library or API
const TIMEZONE_TO_COUNTRY_MAP: Record<string, string> = {
  // North America
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Mexico_City": "MX",

  // South America
  "America/Buenos_Aires": "AR",
  "America/Sao_Paulo": "BR",
  "America/Lima": "PE",
  "America/Santiago": "CL",
  "America/Bogota": "CO",
  "America/Caracas": "VE",

  // Europe
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Prague": "CZ",
  "Europe/Warsaw": "PL",
  "Europe/Stockholm": "SE",
  "Europe/Copenhagen": "DK",
  "Europe/Oslo": "NO",
  "Europe/Helsinki": "FI",
  "Europe/Dublin": "IE",
  "Europe/Lisbon": "PT",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Moscow": "RU",
  "Europe/Kiev": "UA",
  "Europe/Bucharest": "RO",
  "Europe/Sofia": "BG",
  "Europe/Budapest": "HU",

  // Africa
  "Africa/Johannesburg": "ZA",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Casablanca": "MA",
  "Africa/Nairobi": "KE",
  "Africa/Addis_Ababa": "ET",

  // Middle East & Central Asia
  "Asia/Dubai": "AE",
  "Asia/Karachi": "PK",
  "Asia/Kolkata": "IN",
  "Asia/Bangkok": "TH",
  "Asia/Hong_Kong": "HK",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Hanoi": "VN",
  "Asia/Phnom_Penh": "KH",
  "Asia/Tehran": "IR",
  "Asia/Baghdad": "IQ",
  "Asia/Jerusalem": "IL",
  "Asia/Amman": "JO",
  "Asia/Beirut": "LB",
  "Asia/Almaty": "KZ",
  "Asia/Tashkent": "UZ",
  "Asia/Kabul": "AF",

  // Oceania
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Perth": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Darwin": "AU",
  "Australia/Hobart": "AU",
  "Pacific/Auckland": "NZ",
  "Pacific/Fiji": "FJ",
  "Pacific/Tongatapu": "TO",
  "Pacific/Apia": "WS",
  "Pacific/Kiritimati": "KI",

  // Fallback for common UTC variants
  "UTC": "US",
  "GMT": "GB",
  "Etc/UTC": "US",
};

/**
 * Resolve country code from IANA timezone identifier.
 * Falls back to "US" if timezone is not recognized.
 */
export function resolveCountryFromTimezone(timezone: string): string {
  return TIMEZONE_TO_COUNTRY_MAP[timezone] || "US";
}

/**
 * Extract both timezone and country from device timezone string.
 * The device sends the IANA timezone identifier (via Intl.DateTimeFormat().resolvedOptions().timeZone).
 * 
 * @param deviceTimezone IANA timezone ID (e.g., "America/Los_Angeles")
 * @returns { timezone, country }
 */
export function resolveTimezoneAndCountry(deviceTimezone: string): {
  timezone: string;
  country: string;
} {
  // Validate that it's a reasonable timezone string
  // IANA timezones are typically in format: Region/City or Etc/...
  const isValidTimezone = /^[A-Za-z_]+\/[A-Za-z_]+$|^Etc\/[A-Za-z_]+$|^UTC$|^GMT$/.test(
    deviceTimezone
  );

  let timezone = "UTC";
  if (isValidTimezone) {
    try {
      // The shape check above is not sufficient: values such as
      // "America/NotARealZone" also match it.
      new Intl.DateTimeFormat("en-US", { timeZone: deviceTimezone }).format();
      timezone = deviceTimezone;
    } catch {
      timezone = "UTC";
    }
  }
  const country = resolveCountryFromTimezone(timezone);

  return { timezone, country };
}

/**
 * For future enhancement: use a geographic API to get more accurate country data.
 * Example using a free IP geolocation service:
 * 
 * export async function resolveCountryFromIP(ip: string): Promise<string> {
 *   try {
 *     const res = await fetch(`https://ip-api.com/json/${ip}`);
 *     const data = await res.json();
 *     return data.countryCode || "US";
 *   } catch (e) {
 *     return "US";
 *   }
 * }
 */
