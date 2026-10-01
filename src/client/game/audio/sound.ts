/**
 * Tiny sound system. Every sound is synthesised with WebAudio so the game has audio
 * with zero asset files. To use real recordings instead, drop files in /public/sounds
 * and list them in SOUND_FILES — they take priority over the synth fallback.
 */
export type SoundName =
  | 'click' | 'join' | 'beep' | 'go' | 'clack' | 'impact' | 'bumper' | 'finish' | 'complete';

export const SOUND_FILES: Partial<Record<SoundName, string>> = {
  // click: '/sounds/click.mp3',
  // go: '/sounds/go.mp3',
};

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, opts: {
  type?: OscillatorType; gain?: number; slideTo?: number; delay?: number;
} = {}): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const start = t + (opts.delay ?? 0);
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, start);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

const SYNTHS: Record<SoundName, Synth> = {
  click: (c, o, t) => tone(c, o, t, 520, 0.07, { type: 'triangle', gain: 0.18, slideTo: 760 }),
  join: (c, o, t) => { tone(c, o, t, 523, 0.12, { type: 'triangle' }); tone(c, o, t, 784, 0.18, { type: 'triangle', delay: 0.09 }); },
  beep: (c, o, t) => tone(c, o, t, 660, 0.16, { type: 'square', gain: 0.12 }),
  go: (c, o, t) => { tone(c, o, t, 880, 0.45, { type: 'square', gain: 0.14 }); tone(c, o, t, 1320, 0.45, { type: 'triangle', gain: 0.12 }); },
  clack: (c, o, t) => tone(c, o, t, 1500 + Math.random() * 500, 0.04, { type: 'triangle', gain: 0.06, slideTo: 700 }),
  impact: (c, o, t) => tone(c, o, t, 160, 0.16, { type: 'sine', gain: 0.25, slideTo: 60 }),
  bumper: (c, o, t) => tone(c, o, t, 300, 0.14, { type: 'square', gain: 0.1, slideTo: 900 }),
  finish: (c, o, t) => { tone(c, o, t, 660, 0.1, { type: 'triangle' }); tone(c, o, t, 990, 0.2, { type: 'triangle', delay: 0.08 }); },
  complete: (c, o, t) => [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t, f, 0.3, { type: 'triangle', delay: i * 0.12, gain: 0.18 })),
};

class SoundSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private lastPlayed = new Map<SoundName, number>();
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('marble.muted') === '1'; } catch { /* ignore */ }
    // Browsers only allow audio after a user gesture.
    const unlock = (): void => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    for (const [name, url] of Object.entries(SOUND_FILES) as [SoundName, string][]) void this.load(name, url);
    return this.ctx;
  }

  private async load(name: SoundName, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      this.buffers.set(name, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
    } catch { /* fall back to synth */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem('marble.muted', m ? '1' : '0'); } catch { /* ignore */ }
  }

  /** `minGapMs` throttles spammy sounds (collisions). */
  play(name: SoundName, minGapMs = 0): void {
    if (this.muted) return;
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < minGapMs) return;
    this.lastPlayed.set(name, now);
    const buf = this.buffers.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master);
      src.start();
      return;
    }
    SYNTHS[name](ctx, this.master, ctx.currentTime);
  }
}

export const sound = new SoundSystem();
