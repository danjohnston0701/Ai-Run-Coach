/**
 * Resolve timezone and country from device timezone ID.
 *
 * The Android/iOS device sends java.util.TimeZone.getDefault().id (Android)
 * or NSTimeZone.localTimeZone.identifier (iOS) in the signup/login request.
 *
 * Uses Luxon for reliable IANA timezone validation — same approach used by
 * the login route. The previous Intl.DateTimeFormat + strict regex approach
 * was broken: the regex rejected valid 3-part zones (America/Indiana/Indianapolis),
 * zones with hyphens (America/Port-au-Prince), and Intl.DateTimeFormat may not
 * be available with small-icu Node.js builds.
 */

import { DateTime } from "luxon";

// Comprehensive mapping of IANA timezone → ISO 3166-1 alpha-2 country codes.
// Covers the most common timezones across every region. Falls back to "US" for
// any unrecognised timezone (safe default for USD pricing).
const TIMEZONE_TO_COUNTRY_MAP: Record<string, string> = {
  // ── United States ─────────────────────────────────────────────────────────
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Kentucky/Louisville": "US",
  "America/Kentucky/Monticello": "US",
  "America/Indiana/Indianapolis": "US",
  "America/Indiana/Vincennes": "US",
  "America/Indiana/Winamac": "US",
  "America/Indiana/Marengo": "US",
  "America/Indiana/Petersburg": "US",
  "America/Indiana/Vevay": "US",
  "America/Indiana/Tell_City": "US",
  "America/Indiana/Knox": "US",
  "America/Chicago": "US",
  "America/Menominee": "US",
  "America/North_Dakota/Center": "US",
  "America/North_Dakota/New_Salem": "US",
  "America/North_Dakota/Beulah": "US",
  "America/Denver": "US",
  "America/Boise": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "America/Juneau": "US",
  "America/Sitka": "US",
  "America/Metlakatla": "US",
  "America/Yakutat": "US",
  "America/Nome": "US",
  "America/Adak": "US",
  "Pacific/Honolulu": "US",

  // ── Canada ─────────��──────────────────────────────────────────────────────
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Winnipeg": "CA",
  "America/Edmonton": "CA",
  "America/Calgary": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Regina": "CA",
  "America/Swift_Current": "CA",
  "America/Whitehorse": "CA",
  "America/Dawson": "CA",
  "America/Iqaluit": "CA",
  "America/Rankin_Inlet": "CA",
  "America/Resolute": "CA",
  "America/Glace_Bay": "CA",
  "America/Moncton": "CA",
  "America/Goose_Bay": "CA",
  "America/Blanc-Sablon": "CA",
  "America/Thunder_Bay": "CA",
  "America/Nipigon": "CA",
  "America/Rainy_River": "CA",
  "America/Cambridge_Bay": "CA",
  "America/Inuvik": "CA",
  "America/Creston": "CA",
  "America/Dawson_Creek": "CA",
  "America/Fort_Nelson": "CA",
  "America/Panama": "PA",

  // ── Mexico ────────────────────────────────────────────────────────────────
  "America/Mexico_City": "MX",
  "America/Cancun": "MX",
  "America/Merida": "MX",
  "America/Monterrey": "MX",
  "America/Matamoros": "MX",
  "America/Chihuahua": "MX",
  "America/Ojinaga": "MX",
  "America/Mazatlan": "MX",
  "America/Hermosillo": "MX",
  "America/Tijuana": "MX",
  "America/Ensenada": "MX",
  "America/Santa_Isabel": "MX",
  "America/Bahia_Banderas": "MX",

  // ── Central America ───────────────────────────────────────────────────────
  "America/Guatemala": "GT",
  "America/Belize": "BZ",
  "America/El_Salvador": "SV",
  "America/Tegucigalpa": "HN",
  "America/Managua": "NI",
  "America/Costa_Rica": "CR",

  // ── Caribbean ─────────────────────────────────────────────────────────────
  "America/Havana": "CU",
  "America/Jamaica": "JM",
  "America/Nassau": "BS",
  "America/Port-au-Prince": "HT",
  "America/Santo_Domingo": "DO",
  "America/Puerto_Rico": "PR",
  "America/Martinique": "MQ",
  "America/Guadeloupe": "GP",
  "America/Barbados": "BB",
  "America/Trinidad": "TT",
  "America/Curacao": "CW",
  "America/Aruba": "AW",

  // ── South America ─────────────────────────────────────────────────────────
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "America/Guayaquil": "EC",
  "America/Caracas": "VE",
  "America/La_Paz": "BO",
  "America/Santiago": "CL",
  "America/Punta_Arenas": "CL",
  "America/Asuncion": "PY",
  "America/Sao_Paulo": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Maceio": "BR",
  "America/Bahia": "BR",
  "America/Araguaina": "BR",
  "America/Manaus": "BR",
  "America/Belem": "BR",
  "America/Porto_Velho": "BR",
  "America/Boa_Vista": "BR",
  "America/Campo_Grande": "BR",
  "America/Cuiaba": "BR",
  "America/Santarem": "BR",
  "America/Rio_Branco": "BR",
  "America/Noronha": "BR",
  "America/Eirunepe": "BR",
  "America/Buenos_Aires": "AR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Argentina/Cordoba": "AR",
  "America/Argentina/Salta": "AR",
  "America/Argentina/Jujuy": "AR",
  "America/Argentina/Tucuman": "AR",
  "America/Argentina/Catamarca": "AR",
  "America/Argentina/La_Rioja": "AR",
  "America/Argentina/San_Juan": "AR",
  "America/Argentina/Mendoza": "AR",
  "America/Argentina/San_Luis": "AR",
  "America/Argentina/Rio_Gallegos": "AR",
  "America/Argentina/Ushuaia": "AR",
  "America/Montevideo": "UY",
  "America/Paramaribo": "SR",
  "America/Guyana": "GY",
  "America/Cayenne": "GF",

  // ── Europe ────────────────────────────────────────────────────────────────
  "Europe/London": "GB",
  "Europe/Belfast": "GB",
  "Europe/Guernsey": "GG",
  "Europe/Isle_of_Man": "IM",
  "Europe/Jersey": "JE",
  "Europe/Dublin": "IE",
  "Europe/Lisbon": "PT",
  "Atlantic/Azores": "PT",
  "Atlantic/Madeira": "PT",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Africa/Ceuta": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Luxembourg": "LU",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Prague": "CZ",
  "Europe/Warsaw": "PL",
  "Europe/Stockholm": "SE",
  "Europe/Copenhagen": "DK",
  "Atlantic/Faroe": "FO",
  "Europe/Oslo": "NO",
  "Arctic/Longyearbyen": "NO",
  "Europe/Helsinki": "FI",
  "Europe/Tallinn": "EE",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Kaliningrad": "RU",
  "Europe/Moscow": "RU",
  "Europe/Samara": "RU",
  "Europe/Volgograd": "RU",
  "Europe/Ulyanovsk": "RU",
  "Europe/Saratov": "RU",
  "Europe/Kirov": "RU",
  "Europe/Astrakhan": "RU",
  "Europe/Minsk": "BY",
  "Europe/Kiev": "UA",
  "Europe/Kyiv": "UA",
  "Europe/Uzhgorod": "UA",
  "Europe/Zaporozhye": "UA",
  "Europe/Bucharest": "RO",
  "Europe/Sofia": "BG",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Budapest": "HU",
  "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR",
  "Europe/Sarajevo": "BA",
  "Europe/Belgrade": "RS",
  "Europe/Podgorica": "ME",
  "Europe/Skopje": "MK",
  "Europe/Tirane": "AL",
  "Europe/Nicosia": "CY",
  "Asia/Nicosia": "CY",
  "Europe/Chisinau": "MD",
  "Europe/Mariehamn": "AX",
  "Europe/San_Marino": "SM",
  "Europe/Vatican": "VA",
  "Europe/Monaco": "MC",
  "Europe/Andorra": "AD",
  "Europe/Gibraltar": "GI",
  "Europe/Malta": "MT",
  "Atlantic/Reykjavik": "IS",

  // ── Africa ────────────────────────────────────────────────────────────────
  "Africa/Abidjan": "CI",
  "Africa/Accra": "GH",
  "Africa/Addis_Ababa": "ET",
  "Africa/Algiers": "DZ",
  "Africa/Asmara": "ER",
  "Africa/Bamako": "ML",
  "Africa/Bangui": "CF",
  "Africa/Banjul": "GM",
  "Africa/Bissau": "GW",
  "Africa/Blantyre": "MW",
  "Africa/Brazzaville": "CG",
  "Africa/Bujumbura": "BI",
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Conakry": "GN",
  "Africa/Dakar": "SN",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Djibouti": "DJ",
  "Africa/Douala": "CM",
  "Africa/El_Aaiun": "EH",
  "Africa/Freetown": "SL",
  "Africa/Gaborone": "BW",
  "Africa/Harare": "ZW",
  "Africa/Johannesburg": "ZA",
  "Africa/Juba": "SS",
  "Africa/Kampala": "UG",
  "Africa/Khartoum": "SD",
  "Africa/Kigali": "RW",
  "Africa/Kinshasa": "CD",
  "Africa/Lagos": "NG",
  "Africa/Libreville": "GA",
  "Africa/Lome": "TG",
  "Africa/Luanda": "AO",
  "Africa/Lubumbashi": "CD",
  "Africa/Lusaka": "ZM",
  "Africa/Malabo": "GQ",
  "Africa/Maputo": "MZ",
  "Africa/Maseru": "LS",
  "Africa/Mbabane": "SZ",
  "Africa/Mogadishu": "SO",
  "Africa/Monrovia": "LR",
  "Africa/Nairobi": "KE",
  "Africa/Ndjamena": "TD",
  "Africa/Niamey": "NE",
  "Africa/Nouakchott": "MR",
  "Africa/Ouagadougou": "BF",
  "Africa/Porto-Novo": "BJ",
  "Africa/Sao_Tome": "ST",
  "Africa/Tripoli": "LY",
  "Africa/Tunis": "TN",
  "Africa/Windhoek": "NA",
  "Indian/Antananarivo": "MG",
  "Indian/Comoro": "KM",
  "Indian/Mayotte": "YT",
  "Indian/Mauritius": "MU",
  "Indian/Reunion": "RE",

  // ── Middle East ───────────────────────────────────────────────────────────
  "Asia/Aden": "YE",
  "Asia/Amman": "JO",
  "Asia/Baghdad": "IQ",
  "Asia/Bahrain": "BH",
  "Asia/Beirut": "LB",
  "Asia/Damascus": "SY",
  "Asia/Dubai": "AE",
  "Asia/Gaza": "PS",
  "Asia/Hebron": "PS",
  "Asia/Jerusalem": "IL",
  "Asia/Tel_Aviv": "IL",
  "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM",
  "Asia/Qatar": "QA",
  "Asia/Riyadh": "SA",
  "Asia/Tehran": "IR",

  // ── Central Asia ─────────────────────���────────────────────────────────────
  "Asia/Almaty": "KZ",
  "Asia/Aqtau": "KZ",
  "Asia/Aqtobe": "KZ",
  "Asia/Atyrau": "KZ",
  "Asia/Oral": "KZ",
  "Asia/Qostanay": "KZ",
  "Asia/Qyzylorda": "KZ",
  "Asia/Ashgabat": "TM",
  "Asia/Dushanbe": "TJ",
  "Asia/Kabul": "AF",
  "Asia/Samarkand": "UZ",
  "Asia/Tashkent": "UZ",
  "Asia/Yerevan": "AM",
  "Asia/Baku": "AZ",
  "Asia/Tbilisi": "GE",

  // ── South Asia ────────────────────────────────────────────────────────────
  "Asia/Colombo": "LK",
  "Asia/Dhaka": "BD",
  "Asia/Kathmandu": "NP",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK",
  "Asia/Thimphu": "BT",

  // ── Southeast Asia ────────────────────────────────────────────────────────
  "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Hanoi": "VN",
  "Asia/Vientiane": "LA",
  "Asia/Phnom_Penh": "KH",
  "Asia/Rangoon": "MM",
  "Asia/Yangon": "MM",
  "Asia/Jakarta": "ID",
  "Asia/Pontianak": "ID",
  "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Kuching": "MY",
  "Asia/Singapore": "SG",
  "Asia/Manila": "PH",
  "Asia/Brunei": "BN",
  "Asia/Dili": "TL",

  // ── East Asia ─────────────────────────────────────────────────────────────
  "Asia/Shanghai": "CN",
  "Asia/Chongqing": "CN",
  "Asia/Harbin": "CN",
  "Asia/Kashgar": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Macau": "MO",
  "Asia/Taipei": "TW",
  "Asia/Seoul": "KR",
  "Asia/Tokyo": "JP",
  "Asia/Ulaanbaatar": "MN",
  "Asia/Choibalsan": "MN",
  "Asia/Hovd": "MN",

  // ── Russia & post-Soviet Far East ─────────────────────────────────────────
  "Asia/Novosibirsk": "RU",
  "Asia/Barnaul": "RU",
  "Asia/Tomsk": "RU",
  "Asia/Omsk": "RU",
  "Asia/Yekaterinburg": "RU",
  "Asia/Chelyabinsk": "RU",
  "Asia/Krasnoyarsk": "RU",
  "Asia/Novokuznetsk": "RU",
  "Asia/Irkutsk": "RU",
  "Asia/Chita": "RU",
  "Asia/Yakutsk": "RU",
  "Asia/Khandyga": "RU",
  "Asia/Vladivostok": "RU",
  "Asia/Ust-Nera": "RU",
  "Asia/Magadan": "RU",
  "Asia/Sakhalin": "RU",
  "Asia/Srednekolymsk": "RU",
  "Asia/Kamchatka": "RU",
  "Asia/Anadyr": "RU",
  "Asia/Bishkek": "KG",

  // ── Oceania ───────────────────────────────────────────────────────────────
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Lindeman": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Broken_Hill": "AU",
  "Australia/Darwin": "AU",
  "Australia/Perth": "AU",
  "Australia/Eucla": "AU",
  "Australia/Hobart": "AU",
  "Australia/Currie": "AU",
  "Australia/Lord_Howe": "AU",
  "Pacific/Auckland": "NZ",
  "Pacific/Chatham": "NZ",
  "Pacific/Fiji": "FJ",
  "Pacific/Tongatapu": "TO",
  "Pacific/Apia": "WS",
  "Pacific/Port_Moresby": "PG",
  "Pacific/Bougainville": "PG",
  "Pacific/Guadalcanal": "SB",
  "Pacific/Efate": "VU",
  "Pacific/Noumea": "NC",
  "Pacific/Norfolk": "NF",
  "Pacific/Pohnpei": "FM",
  "Pacific/Kosrae": "FM",
  "Pacific/Chuuk": "FM",
  "Pacific/Majuro": "MH",
  "Pacific/Kwajalein": "MH",
  "Pacific/Tarawa": "KI",
  "Pacific/Enderbury": "KI",
  "Pacific/Kiritimati": "KI",
  "Pacific/Nauru": "NR",
  "Pacific/Palau": "PW",
  "Pacific/Guam": "GU",
  "Pacific/Saipan": "MP",
  "Pacific/Pago_Pago": "AS",
  "Pacific/Fakaofo": "TK",
  "Pacific/Funafuti": "TV",
  "Pacific/Wake": "UM",
  "Pacific/Wallis": "WF",
  "Pacific/Tahiti": "PF",
  "Pacific/Marquesas": "PF",
  "Pacific/Gambier": "PF",
  "Pacific/Pitcairn": "PN",
  "Pacific/Easter": "CL",
  "Pacific/Galapagos": "EC",
  "Pacific/Niue": "NU",
  "Pacific/Rarotonga": "CK",
  "Pacific/Honolulu": "US",
  "Pacific/Johnston": "US",
  "Pacific/Midway": "UM",

  // ── Atlantic ──────────────────────────────────────────────────────────────
  "Atlantic/Bermuda": "BM",
  "Atlantic/Cape_Verde": "CV",
  "Atlantic/South_Georgia": "GS",
  "Atlantic/Stanley": "FK",
  "Atlantic/St_Helena": "SH",

  // ── Indian Ocean ──────────────────────────────────────────────────────────
  "Indian/Chagos": "IO",
  "Indian/Christmas": "CX",
  "Indian/Cocos": "CC",
  "Indian/Kerguelen": "TF",
  "Indian/Maldives": "MV",

  // ── Etc/UTC variants ──────────────────────────────────────────────────────
  "UTC": "US",
  "GMT": "GB",
  "Etc/UTC": "US",
  "Etc/GMT": "GB",
};

/**
 * Resolve country code from IANA timezone identifier.
 * Falls back to "US" if timezone is not recognised.
 */
export function resolveCountryFromTimezone(timezone: string): string {
  return TIMEZONE_TO_COUNTRY_MAP[timezone] ?? "US";
}

/**
 * Extract both timezone and country from device timezone string.
 *
 * Uses Luxon for validation — far more reliable than Intl.DateTimeFormat with
 * small-icu Node builds, and handles all valid IANA formats including
 * 3-part zones (America/Indiana/Indianapolis), zones with hyphens
 * (America/Port-au-Prince), and numeric Etc/GMT+N zones.
 *
 * @param deviceTimezone IANA timezone ID from the device (e.g., "America/Los_Angeles")
 * @returns { timezone, country } — falls back to { "UTC", "US" } for invalid input
 */
export function resolveTimezoneAndCountry(deviceTimezone: string | null | undefined): {
  timezone: string;
  country: string;
} {
  let timezone = "UTC";

  if (deviceTimezone && typeof deviceTimezone === "string") {
    const tz = deviceTimezone.trim();
    if (tz.length > 0 && tz.length < 64) {
      try {
        const dt = DateTime.now().setZone(tz);
        // Luxon returns isValid=false for unknown zones (e.g. "Foo/Bar")
        if (dt.isValid) {
          timezone = tz;
        } else {
          console.warn(`[TimezoneResolver] Luxon rejected timezone "${tz}": ${dt.invalidReason}`);
        }
      } catch (e: any) {
        console.warn(`[TimezoneResolver] Exception validating timezone "${tz}": ${e.message}`);
      }
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
