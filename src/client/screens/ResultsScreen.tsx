import { useState } from 'react';
import { Button } from '../components/Button';
import { SoundToggle } from '../components/SoundToggle';
import { changeTrack, leaveRoom, playAgain } from '../networking/actions';
import { useGame } from '../state/store';

const MEDAL = ['🥇', '🥈', '🥉'];

const fmt = (ms: number | null): string => (ms === null ? 'DNF' : `${(ms / 1000).toFixed(2)}s`);

export function ResultsScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me);
  const [busy, setBusy] = useState(false);
  const results = room.race?.results ?? [];
  const isHost = room.hostId === me?.playerId;
  const mine = results.find((r) => r.playerId === me?.playerId);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); };

  return (
    <div className="screen results-screen enter">
      <div className="corner"><SoundToggle /></div>
      <div className="confetti" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
      </div>
      <main className="results-card">
        <div className="phase-pill">RESULTS</div>
        <h1 className="results-title">RACE COMPLETE</h1>
        {mine && <p className="your-place">You placed <strong>#{mine.position}</strong> of {results.length}</p>}

        <ol className="results-list">
          {results.map((r, i) => (
            <li
              key={r.playerId}
              className={`result ${r.playerId === me?.playerId ? 'result-me' : ''} ${i === 0 ? 'result-first' : ''}`}
              style={{ ['--d' as string]: `${(results.length - 1 - i) * 0.12}s`, borderColor: r.color }}
            >
              <span className="result-pos">{MEDAL[i] ?? r.position}</span>
              <span className="swatch" style={{ background: r.color }} />
              <span className="result-name">{r.nickname}{!r.connected && <em> (left)</em>}</span>
              <span className="result-time">{fmt(r.timeMs)}</span>
            </li>
          ))}
        </ol>

        <div className="btn-row results-actions">
          {isHost ? (
            <>
              <Button big disabled={busy} onClick={() => void run(playAgain)}>PLAY AGAIN</Button>
              <Button big variant="secondary" disabled={busy} onClick={() => void run(changeTrack)}>CHANGE TRACK</Button>
            </>
          ) : (
            <div className="waiting">Waiting for host<span className="dots" /></div>
          )}
          <Button variant="ghost" onClick={() => void leaveRoom()}>LEAVE ROOM</Button>
        </div>
      </main>
    </div>
  );
}
