import { useState } from 'react';
import { getTrack } from '../../shared/tracks';
import { RacePhase } from '../../shared/types';
import { CountdownOverlay } from '../components/CountdownOverlay';
import { FinishFeed } from '../components/FinishFeed';
import { RaceCanvas } from '../components/RaceCanvas';
import { SoundToggle } from '../components/SoundToggle';
import type { CameraMode } from '../game/camera/Camera';
import { leaveRoom } from '../networking/actions';
import { useGame } from '../state/store';

export function RaceScreen() {
  const room = useGame((s) => s.room)!;
  const [mode, setMode] = useState<CameraMode>('pack');
  const race = room.race;
  const track = getTrack(race?.trackId ?? room.selectedTrack);

  return (
    <div className="screen race-screen">
      <RaceCanvas room={room} cameraMode={mode} />

      <div className="race-top">
        <div className="race-info">
          <strong>{track.name}</strong>
          <span>Room {room.code}</span>
        </div>
        <div className="race-controls">
          <button className="icon-btn" title="Switch camera" aria-label="Switch camera" onClick={() => setMode(mode === 'pack' ? 'me' : 'pack')}>
            {mode === 'pack' ? '👥' : '🎯'}
          </button>
          <SoundToggle />
          <button className="icon-btn" title="Leave room" aria-label="Leave room" onClick={() => void leaveRoom()}>🚪</button>
        </div>
      </div>

      {room.phase === RacePhase.COUNTDOWN && race && <CountdownOverlay goAt={race.goAt} />}
      {room.phase === RacePhase.RACING && <div className="race-hint">You can’t steer — physics decides!</div>}
      {room.phase === RacePhase.FINISHED && <div className="complete-banner"><span>RACE COMPLETE!</span></div>}
      <FinishFeed />
    </div>
  );
}
