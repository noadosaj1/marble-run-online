import { useEffect, useRef } from 'react';
import type { TrackDef } from '../../shared/tracks';
import { drawTrackThumbnail } from '../game/renderer/thumbnail';

export function TrackPreview({ track, className = '' }: { track: TrackDef; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => drawTrackThumbnail(c, track);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [track]);
  return <canvas ref={ref} className={`track-preview ${className}`} aria-label={`${track.name} preview`} />;
}
