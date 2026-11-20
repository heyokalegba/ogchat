/**
 * The sound of the street, made here rather than played back: there are no
 * recordings in ogchat, only a few noise sources and oscillators shaped into
 * what a window in Brooklyn lets in. A low hum of traffic that rises and
 * falls with the hour, cars going by, rain, wind, a few birds in the
 * morning, thunder in a storm, and every so often a siren a long way off.
 *
 * It is off until asked for, and a browser will not let it start without a
 * click, so `start` is called from one. Everything it does follows the
 * `Soundscape` it was last given; nothing is on a loop.
 */

/** What the street sounds like just now. Every figure runs from 0 to 1. */
export interface Soundscape {
  /** How much traffic there is. */
  traffic: number;
  /** How hard it is raining: 0 dry, 1 a downpour. */
  rain: number;
  /** A storm: thunder now and then. */
  storm: boolean;
  /** How hard the wind blows. */
  wind: number;
  /** How much the birds have to say: daylight, dry weather, not winter. */
  birds: number;
  /** How late it is: sirens carry at night, and everything else is quieter. */
  night: number;
}

export const QUIET: Soundscape = {
  traffic: 0.4,
  rain: 0,
  storm: false,
  wind: 0.1,
  birds: 0,
  night: 0,
};

type Timer = ReturnType<typeof setTimeout>;

export class Ambience {
  private ctx: AudioContext;
  private out: GainNode;
  private white: AudioBuffer;
  private brown: AudioBuffer;
  private hum: GainNode;
  private rainGain: GainNode;
  private patter: GainNode;
  private windGain: GainNode;
  private windTone: BiquadFilterNode;
  private scape: Soundscape = QUIET;
  private timers = new Set<Timer>();
  private stopped = false;

  constructor(volume: number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const { ctx } = this;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    // A limiter of sorts, so that a siren over a downpour over traffic never clips.
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -18;
    squash.ratio.value = 6;
    this.out.connect(squash).connect(ctx.destination);
    this.white = this.noise(2, false);
    this.brown = this.noise(4, true);

    // The city's hum: brown noise with the top taken off.
    this.hum = this.bed(this.brown, [["lowpass", 210, 0.5]]);
    // Rain: hiss up high, and the patter of it on things lower down.
    this.rainGain = this.bed(this.white, [
      ["highpass", 1400, 0.4],
      ["lowpass", 9000, 0.4],
    ]);
    this.patter = this.bed(this.white, [["bandpass", 700, 0.7]]);
    // Wind: a band of noise whose pitch wanders.
    this.windTone = ctx.createBiquadFilter();
    this.windGain = this.bed(this.brown, [["bandpass", 320, 0.9]], this.windTone);

    this.setVolume(volume);
    this.loop(
      () => this.carPass(),
      () => 3 + Math.random() * 10 + (1 - this.scape.traffic) * 22,
    );
    this.loop(
      () => this.chirp(),
      () => 2 + Math.random() * 9,
    );
    this.loop(
      () => this.gust(),
      () => 4 + Math.random() * 8,
    );
    this.loop(
      () => this.scape.storm && this.thunder(),
      () => 18 + Math.random() * 45,
    );
    // A siren somewhere in the city: every several minutes, more often at night.
    this.loop(
      () => this.siren(0.028 + this.scape.night * 0.02, 10 + Math.random() * 12),
      () => (240 + Math.random() * 600) * (1 - this.scape.night * 0.35),
      true,
    );
  }

  /** Whether the browser is letting it make any sound yet. */
  get running(): boolean {
    return this.ctx.state === "running";
  }

  /** Call from a click or a key press: a browser will not start sound otherwise. */
  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(volume: number): void {
    const level = Math.min(1, Math.max(0, volume));
    this.out.gain.setTargetAtTime(level * level * 0.9, this.ctx.currentTime, 0.2);
  }

  /** What the street sounds like now. The beds follow over a couple of seconds. */
  set(scape: Soundscape): void {
    this.scape = scape;
    const t = this.ctx.currentTime;
    const ease = (gain: GainNode, to: number) => gain.gain.setTargetAtTime(to, t, 1.5);
    const hush = 1 - scape.night * 0.35;
    ease(this.hum, (0.1 + 0.34 * scape.traffic) * hush);
    ease(this.rainGain, scape.rain * 0.16);
    ease(this.patter, scape.rain * 0.07);
    ease(this.windGain, 0.02 + scape.wind * 0.22);
  }

  /** A police car with its siren going, close by: a few seconds of it. */
  whoop(): void {
    this.siren(0.09, 5, true);
  }

  /** A firework: the thump, and the crackle after it. */
  bang(): void {
    const { ctx } = this;
    const t = ctx.currentTime + 0.25 + Math.random() * 0.4; // sound takes a moment to arrive
    this.burst(this.brown, [["lowpass", 160, 0.7]], t, 0.01, 0.5, 0.5);
    this.burst(this.white, [["bandpass", 3200, 1.2]], t + 0.12, 0.05, 0.7, 0.06);
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => void this.ctx.close().catch(() => {}), 500);
  }

  // ------------------------------------------------------------------ pieces

  private noise(seconds: number, brown: boolean): AudioBuffer {
    const { ctx } = this;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  private filters(
    specs: readonly (readonly [BiquadFilterType, number, number])[],
    first?: BiquadFilterNode,
  ): BiquadFilterNode[] {
    return specs.map(([type, frequency, q], index) => {
      const filter = index === 0 && first ? first : this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      return filter;
    });
  }

  /** A sound that is always there, at whatever level its gain is set to. */
  private bed(
    buffer: AudioBuffer,
    specs: readonly (readonly [BiquadFilterType, number, number])[],
    first?: BiquadFilterNode,
  ): GainNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    let node: AudioNode = source;
    for (const filter of this.filters(specs, first)) node = node.connect(filter);
    node.connect(gain).connect(this.out);
    source.start(0, Math.random() * buffer.duration);
    return gain;
  }

  /** A sound that happens once: up over `attack` seconds, away over `release`. */
  private burst(
    buffer: AudioBuffer,
    specs: readonly (readonly [BiquadFilterType, number, number])[],
    at: number,
    attack: number,
    release: number,
    level: number,
  ): BiquadFilterNode[] {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    const chain = this.filters(specs);
    let node: AudioNode = source;
    for (const filter of chain) node = node.connect(filter);
    node.connect(gain).connect(this.out);
    source.start(at, Math.random() * buffer.duration);
    source.stop(at + attack + release + 0.1);
    return chain;
  }

  /** Runs `what` again and again, `wait()` seconds apart. `late`: wait before the first, too. */
  private loop(what: () => void, wait: () => number, late = false): void {
    const next = () => {
      if (this.stopped) return;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.stopped) return;
        if (this.ctx.state === "running") what();
        next();
      }, wait() * 1000);
      this.timers.add(timer);
    };
    if (!late && this.ctx.state === "running") what();
    next();
  }

  /** A car going by: a swell of road noise whose pitch rises and falls as it passes. */
  private carPass(): void {
    if (Math.random() > 0.25 + this.scape.traffic) return;
    const t = this.ctx.currentTime;
    const long = 2.2 + Math.random() * 2;
    const [tone] = this.burst(
      this.white,
      [
        ["bandpass", 500, 0.8],
        ["lowpass", 1800, 0.5],
      ],
      t,
      long * 0.45,
      long * 0.55,
      0.03 + Math.random() * 0.035 + this.scape.rain * 0.03, // tyres hiss on a wet road
    );
    tone?.frequency.setValueAtTime(420, t);
    tone?.frequency.linearRampToValueAtTime(820, t + long * 0.45);
    tone?.frequency.linearRampToValueAtTime(380, t + long);
  }

  /** A bird: two to five quick notes, each a short slide in pitch. */
  private chirp(): void {
    if (Math.random() > this.scape.birds) return;
    const { ctx } = this;
    let t = ctx.currentTime;
    const base = 2600 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let n = 0; n < notes; n++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.05 + Math.random() * 0.4), t + 0.07);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.018, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(this.out);
      osc.start(t);
      osc.stop(t + 0.12);
      t += 0.11 + Math.random() * 0.12;
    }
  }

  /** The wind getting up for a few seconds: its pitch climbs and settles. */
  private gust(): void {
    const t = this.ctx.currentTime;
    const high = 280 + this.scape.wind * 520 + Math.random() * 120;
    this.windTone.frequency.setTargetAtTime(high, t, 1.2);
    this.windTone.frequency.setTargetAtTime(260, t + 3, 1.6);
  }

  private thunder(): void {
    const t = this.ctx.currentTime;
    const long = 3 + Math.random() * 3;
    this.burst(this.brown, [["lowpass", 110, 0.6]], t, 0.25, long, 0.75);
    this.burst(this.brown, [["lowpass", 60, 0.5]], t + 0.4, 0.6, long * 0.8, 0.5);
  }

  /** A siren: a wail between two pitches, a long way off unless `near`. */
  private siren(level: number, seconds: number, near = false): void {
    const { ctx } = this;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const period = near ? 0.9 : 3.8;
    for (let at = 0; at < seconds; at += period) {
      osc.frequency.setValueAtTime(620, t + at);
      osc.frequency.linearRampToValueAtTime(1380, t + at + period * 0.5);
      osc.frequency.linearRampToValueAtTime(620, t + at + period);
    }
    // Distance takes the edge off it: only the middle of the sound gets here.
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = near ? 2400 : 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + seconds * 0.3);
    gain.gain.linearRampToValueAtTime(level * 0.8, t + seconds * 0.6);
    gain.gain.linearRampToValueAtTime(0, t + seconds);
    osc.connect(muffle).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + seconds + 0.1);
  }
}

/** What the street sounds like, from what the scene already knows about itself. */
export function soundscapeOf(input: {
  traffic: number;
  weather: string;
  force: string;
  wind: number;
  night: number;
  season: string;
  wet: boolean;
}): Soundscape {
  const { weather, force } = input;
  const raining = weather === "rain" || weather === "storm";
  const rain = !raining
    ? 0
    : weather === "storm" || force === "heavy"
      ? 1
      : force === "light"
        ? 0.35
        : 0.65;
  // Birds: by day, in the dry, and hardly at all in winter. Loudest at first light.
  const light = Math.max(0, 1 - input.night * 1.6);
  const birds = input.wet ? 0 : light * (input.season === "winter" ? 0.12 : 0.55);
  return {
    traffic: Math.min(1, Math.max(0, input.traffic)),
    rain,
    storm: weather === "storm",
    wind: Math.min(1, Math.max(0, input.wind)),
    birds,
    night: Math.min(1, Math.max(0, input.night)),
  };
}
