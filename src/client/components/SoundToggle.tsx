import { useState } from 'react';
import { sound } from '../game/audio/sound';

export function SoundToggle() {
  const [muted, setMuted] = useState(sound.muted);
  return (
    <button
      className="icon-btn"
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => {
        sound.setMuted(!muted);
        setMuted(!muted);
        if (muted) sound.play('click');
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
