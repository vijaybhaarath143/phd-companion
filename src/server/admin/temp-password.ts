import "server-only";
import { randomInt } from "node:crypto";

// No look-alikes (0/O, 1/l/I), so it can be read out or typed from a screenshot.
const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** A one-time password the admin hands over; the person must replace it at first sign-in. */
export function temporaryPassword(length = 14): string {
  const all = LETTERS + DIGITS;
  const chars = Array.from({ length }, (_, i) =>
    i === 0 ? LETTERS[randomInt(LETTERS.length)] : i === 1 ? DIGITS[randomInt(DIGITS.length)] : all[randomInt(all.length)],
  );
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
