import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../networking/clock';
import { sound } from '../game/audio/sound';

/** Label for how long until the server's GO timestamp. */
function labelFor(msToGo: number): string | null {
  if (msToGo > 3000) return 'READY?';
  if (msToGo > 2000) return '3';
  if (msToGo > 1000) return '2';
  if (msToGo > 0) return '1';
  if (msToGo > -900) return 'GO!';
  return null;
}

/** Big 3-2-1-GO driven by the server's `goAt` timestamp (never by a local timer). */
export function CountdownOverlay({ goAt }: { goAt: number }) {
  const [label, setLabel] = useState<string | null>(() => labelFor(goAt - serverNow()));
  const last = useRef<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = labelFor(goAt - serverNow());
      if (l !== last.current) {
        last.current = l;
        setLabel(l);
        if (l === 'GO!') sound.play('go');
        else if (l && l !== 'READY?') sound.play('beep');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [goAt]);

  if (!label) return null;
  const isGo = label === 'GO!';
  return (
    <div className="countdown" aria-live="assertive">
      <div key={label} className={`count-num ${isGo ? 'count-go' : label === 'READY?' ? 'count-ready' : ''}`}>{label}</div>
    </div>
  );
}
