/** Remembers the seat so a page refresh / network blip can resume it. Per-tab (sessionStorage). */
interface Saved { code: string; playerId: string; token: string }
const KEY = 'marble.session';

export function saveSession(s: Saved): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function loadSession(): Saved | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch { return null; }
}
export function clearSession(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

const NAME_KEY = 'marble.nickname';
export const loadNickname = (): string => {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
};
export const saveNickname = (n: string): void => {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
};
