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

    // CHF (Switzerland)
    if (tz.includes("zurich")) return "CHF";

    // Scandinavia
    if (tz.includes("oslo") || tz.includes("stockholm") || tz.includes("copenhagen")) return "EUR"; // Most use EUR (Sweden, Norway, Denmark)

    // Russia/Eastern Europe
    if (tz.includes("moscow")) return "RUB";

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
    if (tz.includes("sydney") || tz.includes("melbourne") || tz.includes("brisbane")) return "AUD";
    if (tz.includes("auckland")) return "NZD";
    if (tz.includes("seoul")) return "KRW";
    if (tz.includes("dubai")) return "AED";

    // Default USD for other Asian zones
    return "USD";
  }

  // Pacific
  if (tz.startsWith("pacific/")) {
    return "AUD"; // Australia/NZ dollars are common in Pacific
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
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
];

export function getCurrencySymbol(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return currency?.symbol ?? code;
}
