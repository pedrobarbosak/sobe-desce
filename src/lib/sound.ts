/**
 * Synthesized sound system: no audio files, everything is generated with the Web Audio
 * API and sent through a small generated reverb so it feels like a room, not a beeper.
 * Effects and music can be toggled separately and the choice is remembered.
 */
type Sfx = "card" | "tick" | "turn" | "trick" | "trickWin" | "trickLose" | "round" | "trump" | "win" | "lose";

const KEY_SFX = "sd.sfx";
const KEY_MUSIC = "sd.music";

/** Overall music volume; the effects play at full level on top of this. */
const MUSIC_LEVEL = 0.045;

/** C major pentatonic, C4..C5: low and close together, so a run of plays stays mellow. */
const CARD_NOTES = [262, 294, 330, 392, 440, 523];

/** Note sets for the frequent trick cues; one is picked at random each time. */
const TRICK: number[][] = [[659], [587], [698], [784], [587, 784], [659, 880]];
const TRICK_WIN: number[][] = [
  [659, 784, 1047],
  [523, 784, 1047],
  [523, 659, 784, 1047],
  [784, 988, 1175],
  [698, 880, 1047],
];
const TRICK_LOSE: [number, number][] = [
  [392, 330],
  [440, 349],
  [330, 294],
  [349, 294],
];

/** Chord progressions as major-scale degrees (0 = I). */
const PROGRESSIONS: number[][] = [
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 3, 5, 4],
  [1, 4, 0, 5],
  [3, 0, 4, 5],
  [0, 2, 3, 3],
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Major pentatonic across two octaves, in semitones. */
const PENTA_LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

function scaleNote(key: number, degree: number): number {
  return key + MAJOR[degree % 7]! + 12 * Math.floor(degree / 7);
}

function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** A multiplier around 1, up to ±amount. */
function jitter(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

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
  private musicBar = 0;
  private lastVariant = new Map<string, number>();
  private cardNote = 2; // index into CARD_NOTES
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

  /** A random variant index for a repeated cue, never the same one twice in a row. */
  private variant(name: string, count: number): number {
    const last = this.lastVariant.get(name);
    let i: number;
    if (last === undefined || count < 2) i = Math.floor(Math.random() * count);
    else {
      i = Math.floor(Math.random() * (count - 1));
      if (i >= last) i++;
    }
    this.lastVariant.set(name, i);
    return i;
  }

  /**
   * `level` (0..1) only matters for "tick": 0 is a calm early tick, 1 the last seconds.
   *
   * Frequent cues (card, trick results) vary their notes and add a little volume jitter
   * so they never sound mechanical. Cues that must be recognised at once (turn, tick,
   * trump, round end) stay fixed.
   */
  play(name: Sfx, level = 0) {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    // Volume only: pitch jitter would put the tuned cues out of tune.
    const v = jitter(0.15);
    switch (name) {
      case "card": {
        // A soft marimba-like "bop". The note wanders around a pentatonic scale, so a run
        // of plays sounds like a little tune rather than the same hit over and over.
        const dir = this.cardNote <= 0 ? 1 : this.cardNote >= CARD_NOTES.length - 1 ? -1 : Math.random() < 0.5 ? -1 : 1;
        this.cardNote += dir;
        const f = CARD_NOTES[this.cardNote]!;
        // A quick upward blip into the note gives it a rounded, bubbly attack.
        this.tone(f * 0.8, t, 0.04, { gain: 0.035 * v, to: f, attack: 0.006, reverb: 0.2 });
        this.tone(f, t, 0.28, { gain: 0.09 * v, attack: 0.008, reverb: 0.4 });
        // The faintest brush of paper underneath.
        this.noise(t, 0.035, 0.03 * v, 1200, "lowpass", 0.5, 0.2);
        break;
      }
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
      case "trick": {
        // Someone else's trick while you sit out: a single soft bell, sometimes two.
        const notes = TRICK[this.variant("trick", TRICK.length)]!;
        notes.forEach((f, i) => this.bell(f, t + i * 0.11, 0.7, 0.05 * v));
        break;
      }
      case "trickWin": {
        const notes = TRICK_WIN[this.variant("trickWin", TRICK_WIN.length)]!;
        const gap = 0.08 + Math.random() * 0.04;
        notes.forEach((f, i) => {
          const lastNote = i === notes.length - 1;
          this.bell(f, t + i * gap, lastNote ? 1.2 : 0.65, (lastNote ? 0.09 : 0.075) * v);
        });
        break;
      }
      case "trickLose": {
        // Two low notes stepping down; short so it never nags.
        const [a, b] = TRICK_LOSE[this.variant("trickLose", TRICK_LOSE.length)]!;
        this.tone(a, t, 0.22, { type: "triangle", gain: 0.065 * v, attack: 0.01 });
        this.tone(b, t + 0.16, 0.4, { type: "triangle", gain: 0.06 * v, to: b * 0.92, attack: 0.01 });
        break;
      }
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

  /**
   * Generative background music: soft pad chords over a quiet bass, with a sparse
   * pentatonic melody on top. It stays in C to match the effects; the progression,
   * voicings and melody are re-rolled as it plays, so it never loops audibly.
   */
  private startMusic() {
    if (!this.ctx || !this.master || this.musicTimer) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    // Fade in, and keep it well under the effects.
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 4);
    this.musicGain = out;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    out.connect(lp);
    this.out(lp, 1.4);

    // C, like the effects, so the cues always sit in harmony with the music.
    const key = 48;
    let progression = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]!;
    let barSeconds = 4.4 + Math.random() * 0.8;
    let melodyNote = 2; // index into the pentatonic ladder
    this.musicBar = 0;

    const bar = () => {
      if (!this.musicGain || this.musicGain !== out) return;
      if (this.musicBar > 0 && this.musicBar % 8 === 0) {
        const next = PROGRESSIONS.filter((pr) => pr !== progression);
        progression = next[Math.floor(Math.random() * next.length)]!;
        barSeconds = 4.4 + Math.random() * 0.8;
      }
      const t = ctx.currentTime + 0.05;
      const degree = progression[this.musicBar % progression.length]!;

      // Pad: a triad (sometimes with a seventh), in a random inversion.
      const tones = [0, 2, 4].map((s) => scaleNote(key, degree + s));
      if (Math.random() < 0.35) tones.push(scaleNote(key, degree + 6));
      const inversion = Math.floor(Math.random() * 3);
      for (let i = 0; i < inversion; i++) tones[i]! += 12;
      tones.forEach((m, i) =>
        this.tone(mtof(m + 12), t + i * (0.05 + Math.random() * 0.06), barSeconds * 0.95, {
          type: "triangle",
          gain: 0.3,
          attack: 0.7,
          dest: out,
        }),
      );

      // Bass: the root, low and round.
      this.tone(mtof(scaleNote(key, degree) - 12), t, barSeconds * 0.9, { gain: 0.35, attack: 0.08, dest: out });

      // Melody: a few notes, wandering by small steps; some bars rest.
      const beat = barSeconds / 4;
      const count = Math.random() < 0.3 ? 0 : 1 + Math.floor(Math.random() * 3);
      const slots = [0, 1, 1.5, 2, 2.5, 3].sort(() => Math.random() - 0.5).slice(0, count).sort((a, b) => a - b);
      for (const slot of slots) {
        melodyNote = Math.max(0, Math.min(PENTA_LADDER.length - 1, melodyNote + Math.floor(Math.random() * 5) - 2));
        const f = mtof(key + 12 + PENTA_LADDER[melodyNote]!);
        const at = t + slot * beat + Math.random() * 0.04;
        this.tone(f, at, 1.8, { gain: 0.16, attack: 0.02, dest: out });
        this.tone(f * 2, at, 0.8, { gain: 0.03, attack: 0.01, dest: out });
      }

      this.musicBar++;
      this.musicTimer = window.setTimeout(bar, barSeconds * 1000);
    };
    bar();
  }

  private stopMusic() {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
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
