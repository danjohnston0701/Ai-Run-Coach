/**
 * Invite Code Generator
 * Generates short, human-typable invite codes for live run observers.
 *
 * Format: 8 characters, uppercase alphanumeric
 * Excluded characters: O, 0, I, 1, L (ambiguous characters)
 * Valid charset: A-N, P-Z, 2-9 (26 + 8 = 34 characters)
 * Combinations: 34^8 ≈ 1.8 × 10^12
 */

import { randomBytes } from "node:crypto";

const VALID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 34 chars: no O/0/I/1/L

/**
 * Generate a random invite code
 * @returns 8-character uppercase alphanumeric code
 */
export function generateInviteCode(): string {
  let code = "";
  const randomData = randomBytes(8);
  
  for (let i = 0; i < 8; i++) {
    code += VALID_CHARS[randomData[i] % VALID_CHARS.length];
  }
  
  return code;
}

/**
 * Validate an invite code format
 * @param code The code to validate
 * @returns true if the code is in valid format
 */
export function isValidInviteCodeFormat(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  if (code.length !== 8) return false;
  
  // Check that all characters are in the valid set (case-insensitive)
  const upperCode = code.toUpperCase();
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(upperCode);
}

/**
 * Normalize a code to uppercase (for case-insensitive comparison)
 * @param code The code to normalize
 * @returns Uppercased code
 */
export function normalizeInviteCode(code: string): string {
  return (code || "").toUpperCase().trim();
}
