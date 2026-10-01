import { useEffect, useRef } from 'react';
import { getTrack } from '../../shared/tracks';
import { RacePhase } from '../../shared/types';
import type { RoomState } from '../../shared/types';
import type { CameraMode } from '../game/camera/Camera';
import { raceFeed } from '../game/raceFeed';
import type { SampledMarble } from '../game/raceFeed';
import { GameRenderer } from '../game/renderer/GameRenderer';
import { getState } from '../state/store';

interface Props { room: RoomState; cameraMode: CameraMode }

/**
 * Hosts the <canvas> and its animation loop. The loop reads the snapshot buffer
 * directly, so React does not re-render when marbles move.
 */
export function RaceCanvas({ room, cameraMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<CameraMode>(cameraMode);
  modeRef.current = cameraMode;
  const trackId = room.race?.trackId ?? room.selectedTrack;
  const raceId = room.raceId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new GameRenderer(canvas, getTrack(trackId));
    renderer.reset();
    const buffer: SampledMarble[] = [];
    let last = performance.now();
    let raf = 0;
    let simT = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = getState();
      const r = s.room;
      const race = r?.race;
      if (r && race) {
        const racing = r.phase === RacePhase.RACING || r.phase === RacePhase.FINISHED || r.phase === RacePhase.RESULTS;
        simT = racing ? raceFeed.advance(dt * 1000) : 0;
        const marbles = raceFeed.sample(simT, buffer);
        renderer.queueEvents(raceFeed.takeEvents());
        const byId = new Map(r.players.map((p) => [p.id, p]));
        renderer.render({
          dt,
          simTimeMs: simT,
          marbles,
          racers: race.racers,
          localIndex: race.racers.findIndex((x) => x.playerId === s.me?.playerId),
          phase: r.phase,
          cameraMode: modeRef.current,
          finishTimes: race.racers.map((x) => byId.get(x.playerId)?.finishTimeMs ?? null),
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // a new race (or track) gets a fresh renderer
  }, [trackId, raceId]);

  return <canvas ref={canvasRef} className="race-canvas" />;
}
