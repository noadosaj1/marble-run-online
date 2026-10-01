import { useGame } from '../state/store';

const MEDAL = ['🥇', '🥈', '🥉'];

export function FinishFeed() {
  const feed = useGame((s) => s.finishFeed);
  const me = useGame((s) => s.me);
  return (
    <div className="finish-feed" aria-live="polite">
      {feed.map((f) => (
        <div key={f.id} className={`finish-item ${f.playerId === me?.playerId ? 'finish-me' : ''}`}>
          {MEDAL[f.position - 1] ?? `#${f.position}`} {f.nickname} FINISHED!
        </div>
      ))}
    </div>
  );
}
