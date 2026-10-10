/**
 * The name the AI coach should call someone by. Accounts are often created with a
 * full name ("Damion Polite") — coaching should say "Damion", never the surname.
 * Strips a leading title ("Dr.", "Mr") so it doesn't become the first name.
 */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir"]);

export function firstNameOf(name?: string | null): string | undefined {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && TITLES.has(parts[0].toLowerCase().replace(/\.$/, ""))) parts.shift();
  return parts[0] || undefined;
}
