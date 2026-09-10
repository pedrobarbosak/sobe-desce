/**
 * Synthesized sound system: no audio files, everything is generated with the Web Audio
 * API and sent through a small generated reverb so it feels like a room, not a beeper.
 * Effects and music can be toggled separately and the choice is remembered.
 */
type Sfx = "card" | "tick" | "turn" | "trick" | "trickWin" | "trickLose" | "round" | "trump" | "win" | "lose";

const KEY_SFX = "sd.sfx";
const KEY_MUSIC = "sd.music";

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

class SoundSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  sfxEnabled = read(KEY_SFX, true);
  musicEnabled = read(KEY_MUSIC, false);
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** Browsers only allow audio after a user gesture; call this from any click. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);
      // Generated impulse response: 1.4 s of decaying noise.
      const seconds = 1.4;
      const len = Math.floor(ctx.sampleRate * seconds);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = ir;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.28;
      this.dry = ctx.createGain();
      this.dry.gain.value = 1;
      this.dry.connect(this.master);
      this.wet.connect(convolver);
      convolver.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.musicEnabled && !this.musicTimer) this.startMusic();
  }

  setSfx(on: boolean) {
    this.sfxEnabled = on;
    try {
      localStorage.setItem(KEY_SFX, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (on) {
      this.unlock();
      this.play("turn");
    }
    this.notify();
  }

  setMusic(on: boolean) {
    this.musicEnabled = on;
    try {
      localStorage.setItem(KEY_MUSIC, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (on) {
      this.unlock();
      this.startMusic();
    } else {
      this.stopMusic();
    }
    this.notify();
  }

  /** Route a node to the room: dry plus a bit of reverb. */
  private out(node: AudioNode, reverb = 1) {
    if (!this.dry || !this.wet) return;
    node.connect(this.dry);
    if (reverb > 0) {
      const send = this.ctx!.createGain();
      send.gain.value = reverb;
      node.connect(send);
      send.connect(this.wet);
    }
  }

  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number; reverb?: number; dest?: AudioNode } = {},
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, start);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    const attack = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    if (opts.dest) g.connect(opts.dest);
    else this.out(g, opts.reverb ?? 1);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A struck bell: a few inharmonic partials, each dying at its own pace. */
  private bell(freq: number, start: number, dur: number, gain: number) {
    const partials: [number, number, number][] = [
      [1, 1, 1],
      [2.01, 0.45, 0.7],
      [3.02, 0.22, 0.5],
      [4.2, 0.1, 0.35],
      [5.4, 0.06, 0.25],
    ];
    for (const [ratio, amp, life] of partials) this.tone(freq * ratio, start, dur * life, { gain: gain * amp, attack: 0.004 });
  }

  private noise(start: number, dur: number, gain: number, freq: number, type: BiquadFilterType = "bandpass", q = 0.9, reverb = 0.6) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    this.out(g, reverb);
    src.start(start);
  }

  /**
   * `level` (0..1) only matters for "tick": 0 is a calm early tick, 1 the last seconds.
   */
  play(name: Sfx, level = 0) {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case "card":
        // Felt thump, paper snap, tiny click.
        this.tone(160, t, 0.14, { gain: 0.35, to: 55, reverb: 0.4 });
        this.noise(t, 0.07, 0.5, 2600, "bandpass", 0.7, 0.5);
        this.noise(t + 0.005, 0.02, 0.25, 6000, "highpass", 0.5, 0.2);
        break;
      case "tick": {
        // Woodblock that rises in pitch and weight as time runs out.
        const f = 720 + level * 620;
        this.tone(f, t, 0.055 + level * 0.02, { gain: 0.08 + level * 0.16, to: f * 0.75, reverb: 0.3 });
        this.noise(t, 0.015, 0.12 + level * 0.15, 4000, "highpass", 0.5, 0.2);
        break;
      }
      case "turn":
        this.bell(880, t, 0.9, 0.16);
        this.bell(1318, t + 0.13, 1.1, 0.13);
        break;
      case "trick":
        // Someone else's trick while you sit out: a single soft bell.
        this.bell(659, t, 0.7, 0.08);
        break;
      case "trickWin":
        this.bell(659, t, 0.6, 0.12);
        this.bell(784, t + 0.1, 0.7, 0.12);
        this.bell(1047, t + 0.2, 1.2, 0.14);
        break;
      case "trickLose":
        // Two low notes stepping down; short so it never nags.
        this.tone(392, t, 0.22, { type: "triangle", gain: 0.1, attack: 0.01 });
        this.tone(330, t + 0.16, 0.4, { type: "triangle", gain: 0.09, to: 300, attack: 0.01 });
        break;
      case "trump":
        this.bell(523, t, 1.4, 0.11);
        this.bell(659, t + 0.04, 1.4, 0.1);
        this.bell(784, t + 0.08, 1.6, 0.1);
        this.noise(t, 0.4, 0.06, 1200, "bandpass", 0.4, 1);
        break;
      case "round":
        [392, 494, 587, 784].forEach((f) => this.tone(f, t, 1.6, { type: "triangle", gain: 0.06, attack: 0.25 }));
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => this.bell(f, t + i * 0.14, 1.2, 0.14));
        [523, 659, 784].forEach((f) => this.tone(f, t + 0.6, 2.2, { type: "triangle", gain: 0.05, attack: 0.3 }));
        break;
      case "lose":
        // Slow minor descent with a sagging final note.
        [659, 622, 523].forEach((f, i) => this.bell(f, t + i * 0.32, 0.9, 0.11));
        this.tone(415, t + 0.98, 1.6, { type: "triangle", gain: 0.09, to: 370, attack: 0.05 });
        [262, 311].forEach((f) => this.tone(f, t + 1.0, 2.4, { type: "triangle", gain: 0.04, attack: 0.4 }));
        break;
    }
  }

  /** A slow, quiet loop of soft chords. */
  private startMusic() {
    if (!this.ctx || !this.master || this.musicTimer) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.07;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    this.musicGain.connect(lp);
    this.out(lp, 1.4);
    const chords = [
      [196, 247, 294, 392],
      [220, 262, 330, 440],
      [175, 220, 262, 349],
      [147, 196, 247, 294],
    ];
    const step = () => {
      if (!this.ctx || !this.musicGain) return;
      const chord = chords[this.musicStep % chords.length]!;
      const t = this.ctx.currentTime;
      chord.forEach((f, i) => this.tone(f, t + i * 0.08, 3.6, { type: "triangle", gain: 0.5, attack: 0.4, dest: this.musicGain! }));
      this.musicStep++;
    };
    step();
    this.musicTimer = window.setInterval(step, 4000);
  }

  private stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      const g = this.musicGain;
      setTimeout(() => g.disconnect(), 1500);
      this.musicGain = null;
    }
  }
}

export const sound = new SoundSystem();

if (typeof window !== "undefined") {
  const unlock = () => sound.unlock();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}
