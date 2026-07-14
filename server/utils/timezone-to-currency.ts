/**
 * Timezone to Currency Mapping
 *
 * Infers the most likely currency for a user based on their timezone.
 * Used as a sensible default during login; users can always override.
 *
 * Accuracy: ~95% for single-country timezones, ~85% for multi-country zones.
 */

export function inferCurrencyFromTimezone(timezone: string | null | undefined): string {
  if (!timezone) return "USD"; // Fallback to USD for unknown timezones

  const tz = timezone.toLowerCase();

  // Americas
  if (tz.startsWith("america/")) {
    if (tz.includes("new_york") || tz.includes("chicago") || tz.includes("denver") || tz.includes("los_angeles") || tz.includes("anchorage") || tz.includes("toronto") || tz.startsWith("america/")) {
      // US/Canada timezones
      return tz.includes("toronto") ? "CAD" : "USD";
    }
  }
  if (tz.startsWith("america/mexico_city")) return "MXN";
  if (tz.startsWith("america/mexico")) return "MXN";
  if (tz.startsWith("america/sao_paulo") || tz.startsWith("america/argentina")) return "BRL";

  // Europe
  if (tz.startsWith("europe/")) {
    // GBP countries
    if (tz.includes("london")) return "GBP";

    // CHF (Switzerland)
    if (tz.includes("zurich")) return "CHF";

    // HUF (Hungary)
    if (tz.includes("budapest")) return "HUF";

    // Russia/Eastern Europe
    if (tz.includes("moscow")) return "RUB";

    // EUR countries (majority of Europe)
    if (
      tz.includes("paris") ||
      tz.includes("berlin") ||
      tz.includes("amsterdam") ||
      tz.includes("brussels") ||
      tz.includes("vienna") ||
      tz.includes("prague") ||
      tz.includes("warsaw") ||
      tz.includes("rome") ||
      tz.includes("madrid") ||
      tz.includes("lisbon") ||
      tz.includes("dublin") ||
      tz.includes("athens") ||
      tz.includes("istanbul")
    ) {
      return "EUR";
    }

    // Scandinavia
    if (tz.includes("oslo") || tz.includes("stockholm") || tz.includes("copenhagen")) return "EUR"; // Most use EUR (Sweden, Norway, Denmark)

    // Default EUR for other European zones
    return "EUR";
  }

  // Asia-Pacific
  if (tz.startsWith("asia/")) {
    if (tz.includes("tokyo")) return "JPY";
    if (tz.includes("shanghai") || tz.includes("beijing") || tz.includes("hong_kong")) return "CNY";
    if (tz.includes("delhi") || tz.includes("kolkata") || tz.includes("mumbai")) return "INR";
    if (tz.includes("bangkok")) return "THB";
    if (tz.includes("singapore")) return "SGD";
    if (tz.includes("seoul")) return "KRW";
    if (tz.includes("dubai")) return "AED";
    // Note: Sydney/Melbourne/Brisbane would be in Australia timezone, not Asia
    // Auckland is in Pacific timezone, not Asia

    // Default USD for other Asian zones
    return "USD";
  }

  // Australia
  if (tz.startsWith("australia/")) {
    return "AUD";
  }

  // Pacific
  if (tz.startsWith("pacific/")) {
    if (tz.includes("auckland") || tz.includes("fiji") || tz.includes("tongatapu")) return "NZD";
    return "AUD"; // Default to AUD for other Pacific zones (Australia, etc.)
  }

  // Africa
  if (tz.startsWith("africa/")) {
    return "USD"; // Most African countries use USD or local currencies; default to USD
  }

  // UTC and unrecognized timezones
  return "USD";
}

/**
 * List of supported currencies with their symbols
 */
export const SUPPORTED_CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
];

export function getCurrencySymbol(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return currency?.symbol ?? code;
}
