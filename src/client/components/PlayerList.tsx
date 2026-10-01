import type { PlayerPublic } from '../../shared/types';

interface Props { players: PlayerPublic[]; meId: string | null; max: number }

export function PlayerList({ players, meId, max }: Props) {
  return (
    <div>
      <ul className="player-list">
        {players.map((p) => (
          <li key={p.id} className={`player ${p.connected ? '' : 'player-away'} ${p.id === meId ? 'player-me' : ''}`}>
            <span className="swatch" style={{ background: p.color }} />
            <span className="player-name">{p.nickname}</span>
            {p.isHost && <span className="tag tag-host">HOST</span>}
            {p.id === meId && <span className="tag tag-you">YOU</span>}
            {!p.connected && <span className="tag tag-away">away</span>}
          </li>
        ))}
      </ul>
      <p className="muted count">{players.length} / {max} players</p>
    </div>
  );
}
