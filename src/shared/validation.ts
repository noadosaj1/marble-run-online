import { NICKNAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';

/**
 * Cleans a nickname. Returns null if nothing usable is left.
 * React escapes text anyway; we additionally strip markup characters and control
 * characters so names are safe wherever they end up (logs, canvas, other UIs).
 */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(cleaned).slice(0, NICKNAME_MAX_LENGTH);
  const result = chars.join('').trim();
  return result.length > 0 ? result : null;
}

/** Upper-cases, strips junk. Returns null unless the result looks like a real code. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < ROOM_CODE_LENGTH || code.length > 6) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
