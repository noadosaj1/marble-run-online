import { useEffect, useState } from 'react';
import { getTrack } from '../../shared/tracks';
import type { TrackId } from '../../shared/tracks';
import { Button } from '../components/Button';
import { PlayerList } from '../components/PlayerList';
import { SoundToggle } from '../components/SoundToggle';
import { TrackPicker } from '../components/TrackPicker';
import { TrackPreview } from '../components/TrackPreview';
import { leaveRoom, setTrack, startRace } from '../networking/actions';
import { setState, useGame } from '../state/store';
import { Title } from './MenuScreen';

export function LobbyScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me);
  const conn = useGame((s) => s.conn);
  const openPicker = useGame((s) => s.openTrackPicker);
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const isHost = room.hostId === me?.playerId;
  const track = getTrack(room.selectedTrack);
  const connectedCount = room.players.filter((p) => p.connected).length;

  useEffect(() => {
    if (openPicker) {
      setPicker(true);
      setState({ openTrackPicker: false });
    }
  }, [openPicker]);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable: the code is on screen anyway */ }
  };

  const pick = async (id: TrackId) => {
    setPicker(false);
    await setTrack(id);
  };

  const canStart = isHost && connectedCount > 0 && conn === 'connected' && !starting;

  return (
    <div className="screen lobby-screen enter">
      <header className="topbar">
        <Title small />
        <div className="topbar-right">
          <SoundToggle />
          <Button variant="ghost" onClick={() => void leaveRoom()}>LEAVE ROOM</Button>
        </div>
      </header>

      <div className="phase-pill">LOBBY</div>

      <div className="lobby-grid">
        <section className="panel room-panel">
          <h2 className="panel-title">Room code</h2>
          <div className="room-code" aria-label={`Room code ${room.code}`}>
            {room.code.split('').map((c, i) => <span key={i} style={{ ['--i' as string]: i }}>{c}</span>)}
          </div>
          <Button variant="secondary" onClick={() => void copyLink()}>{copied ? 'Link copied! ✓' : 'Copy invite link'}</Button>
          <p className="muted small">Share this code with friends. Up to {room.maxPlayers} can join.</p>
        </section>

        <section className="panel players-panel">
          <h2 className="panel-title">Players</h2>
          <PlayerList players={room.players} meId={me?.playerId ?? null} max={room.maxPlayers} />
        </section>

        <section className="panel track-panel">
          <h2 className="panel-title">Current track</h2>
          <TrackPreview track={track} className="track-preview-lg" />
          <h3 className="track-name">{track.name}</h3>
          <p className="muted">{track.description}</p>
          {isHost && <Button variant="secondary" onClick={() => setPicker(true)}>CHANGE TRACK</Button>}
        </section>
      </div>

      <div className="lobby-actions">
        {isHost ? (
          <Button
            big
            disabled={!canStart}
            onClick={async () => { setStarting(true); await startRace(); setStarting(false); }}
          >
            START RACE
          </Button>
        ) : (
          <div className="waiting">Waiting for host<span className="dots" /></div>
        )}
      </div>

      {picker && isHost && <TrackPicker selected={room.selectedTrack} onPick={(id) => void pick(id)} onClose={() => setPicker(false)} />}
    </div>
  );
}
