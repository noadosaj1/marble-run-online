import { TRACKS } from '../../shared/tracks';
import type { TrackId } from '../../shared/tracks';
import { Button } from './Button';
import { TrackPreview } from './TrackPreview';

interface Props {
  selected: TrackId;
  onPick: (id: TrackId) => void;
  onClose: () => void;
}

export function TrackPicker({ selected, onPick, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Select track">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Select Track</h2>
        <div className="track-grid">
          {TRACKS.map((t, i) => (
            <button
              key={t.id}
              className={`track-card ${t.id === selected ? 'track-card-active' : ''}`}
              style={{ ['--i' as string]: i }}
              onClick={() => onPick(t.id)}
            >
              <TrackPreview track={t} />
              <div className="track-card-body">
                <div className="track-card-name">{i + 1}. {t.name}</div>
                <div className="track-card-tag">{t.tagline}</div>
                <div className="difficulty" aria-label={`Chaos level ${t.difficulty} of 5`}>
                  {Array.from({ length: 5 }, (_, k) => (
                    <span key={k} className={k < t.difficulty ? 'dot dot-on' : 'dot'} />
                  ))}
                </div>
                <p className="track-card-desc">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}
