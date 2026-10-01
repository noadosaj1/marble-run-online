import { useEffect, useState } from 'react';
import { NICKNAME_MAX_LENGTH } from '../../shared/constants';
import { normalizeRoomCode, sanitizeNickname } from '../../shared/validation';
import { Button } from '../components/Button';
import { HowToPlay } from '../components/HowToPlay';
import { SoundToggle } from '../components/SoundToggle';
import { hostGame, joinGame } from '../networking/actions';
import { saveNickname } from '../networking/session';
import { setState, useGame } from '../state/store';

const TITLE = [
  ['M', '#ff4d6d'], ['A', '#ffa62b'], ['R', '#ffe14d'], ['B', '#7bd953'], ['L', '#2ad4c8'], ['E', '#4cc9ff'],
  [' ', 'transparent'],
  ['R', '#8a5cff'], ['A', '#d65cff'], ['C', '#ff6fd1'], ['E', '#ff4d6d'],
] as const;

export function Title({ small }: { small?: boolean }) {
  return (
    <h1 className={`title ${small ? 'title-small' : ''}`} aria-label="Marble Race">
      {TITLE.map(([ch, color], i) => (
        <span key={i} style={{ color, ['--i' as string]: i }} aria-hidden>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </h1>
  );
}

function initialCode(): string {
  try {
    return normalizeRoomCode(new URLSearchParams(window.location.search).get('room')) ?? '';
  } catch { return ''; }
}

export function MenuScreen() {
  const nickname = useGame((s) => s.nickname);
  const notice = useGame((s) => s.menuNotice);
  const [mode, setMode] = useState<'home' | 'join'>(() => (initialCode() ? 'join' : 'home'));
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => { setError(null); }, [mode]);

  const cleanName = (): string | null => {
    const n = sanitizeNickname(nickname);
    if (!n) {
      setError('Please enter a name (up to 16 characters).');
      return null;
    }
    saveNickname(n);
    return n;
  };

  const host = async () => {
    const n = cleanName();
    if (!n) return;
    setBusy(true);
    const r = await hostGame(n);
    setBusy(false);
    if (!r.ok) setError(r.message);
  };

  const join = async () => {
    const n = cleanName();
    if (!n) return;
    const c = normalizeRoomCode(code);
    if (!c) {
      setError('Enter the room code your friend shared.');
      return;
    }
    setBusy(true);
    const r = await joinGame(n, c);
    setBusy(false);
    if (!r.ok) setError(r.message);
    else window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <div className="screen menu-screen">
      <div className="menu-bg" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => <span key={i} className="bg-marble" style={{ ['--i' as string]: i }} />)}
      </div>
      <div className="corner"><SoundToggle /></div>
      <main className="menu-card enter">
        <Title />
        <p className="subtitle">Drop in. Bounce around. Hope for the best.</p>

        {notice && <div className="banner banner-warn" role="alert">{notice}</div>}

        {mode === 'home' ? (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void host(); }}>
            <label className="field">
              <span className="field-label">Enter your name</span>
              <input
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="Your name"
                autoComplete="nickname"
                autoFocus
                onChange={(e) => { setState({ nickname: e.target.value }); setError(null); }}
              />
            </label>
            {error && <div className="banner banner-error" role="alert">{error}</div>}
            <div className="btn-row">
              <Button type="submit" big disabled={busy}>HOST GAME</Button>
              <Button type="button" big variant="secondary" disabled={busy} onClick={() => { if (cleanName()) setMode('join'); }}>JOIN GAME</Button>
            </div>
            <Button type="button" variant="ghost" onClick={() => setHelp(true)}>HOW TO PLAY</Button>
          </form>
        ) : (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void join(); }}>
            <label className="field">
              <span className="field-label">Your name</span>
              <input
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="Your name"
                autoComplete="nickname"
                onChange={(e) => { setState({ nickname: e.target.value }); setError(null); }}
              />
            </label>
            <label className="field">
              <span className="field-label">Room code</span>
              <input
                className="code-input"
                value={code}
                maxLength={6}
                placeholder="K7PX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                autoFocus={!!nickname}
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(null); }}
              />
            </label>
            {error && <div className="banner banner-error" role="alert">{error}</div>}
            <div className="btn-row">
              <Button type="submit" big disabled={busy}>JOIN GAME</Button>
              <Button type="button" big variant="secondary" onClick={() => setMode('home')}>BACK</Button>
            </div>
          </form>
        )}
      </main>
      {help && <HowToPlay onClose={() => setHelp(false)} />}
    </div>
  );
}
