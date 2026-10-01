import { Button } from './Button';

const STEPS = [
  'Enter your name.',
  'Host a room or join a friend’s room.',
  'Share the room code.',
  'Choose a track.',
  'Start the race.',
  'Watch your marble drop.',
  'Hope physics are on your side.',
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="How to play">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">How to Play</h2>
        <ol className="steps">
          {STEPS.map((s, i) => <li key={s} style={{ ['--i' as string]: i }}>{s}</li>)}
        </ol>
        <p className="callout">You don’t control your marble. The race is entirely physics-based.</p>
        <div className="modal-actions"><Button onClick={onClose}>Got it!</Button></div>
      </div>
    </div>
  );
}
