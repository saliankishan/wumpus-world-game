let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

export function setMuted(flag: boolean) {
  muted = flag;
  if (master && ctx) {
    master.gain.setTargetAtTime(flag ? 0.0001 : 0.7, ctx.currentTime, 0.02);
  }
}

export function unlock() {
  if (typeof window === "undefined") return;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!ctx) {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = muted ? 0.0001 : 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function env(peak: number, dur: number, attack = 0.008) {
  if (!ctx || !master) return null;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  return { g, t };
}

function tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  try {
    if (!ctx) return;
    const e = env(peak, dur);
    if (!e) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, freq), e.t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), e.t + dur);
    o.connect(e.g);
    o.start(e.t);
    o.stop(e.t + dur + 0.03);
  } catch {
    /* audio graph hiccup */
  }
}

function burst(dur: number, peak: number, freq: number, q: number, type: BiquadFilterType) {
  try {
    if (!ctx || !master) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const e = env(peak, dur, 0.004);
    if (!e) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, e.t);
    f.Q.value = q;
    src.connect(f);
    f.connect(e.g);
    src.start(e.t);
    src.stop(e.t + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  ui() {
    tone(780, 0.06, "triangle", 0.045);
  },
  step() {
    burst(0.045, 0.055, 120 + Math.random() * 80, 0.7, "lowpass");
  },
  bump() {
    burst(0.08, 0.09, 200, 0.55, "lowpass");
    tone(86, 0.08, "sine", 0.05);
  },
  dry() {
    tone(196, 0.07, "square", 0.025);
  },
  gold() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => tone(f, 0.2, "triangle", 0.055), i * 52);
    });
  },
  shoot() {
    burst(0.14, 0.09, 1600, 0.35, "highpass");
    tone(720, 0.12, "sawtooth", 0.028, 160);
  },
  clatter() {
    burst(0.08, 0.08, 2200, 1.6, "bandpass");
    setTimeout(() => burst(0.06, 0.05, 1400, 1.4, "bandpass"), 68);
  },
  scream() {
    tone(480, 0.48, "sawtooth", 0.045, 120);
    burst(0.36, 0.05, 700, 0.45, "bandpass");
  },
  roar() {
    tone(92, 0.52, "sawtooth", 0.06, 46);
    burst(0.42, 0.07, 160, 0.45, "lowpass");
  },
  pit() {
    tone(340, 0.72, "sine", 0.07, 48);
    burst(0.4, 0.045, 360, 0.4, "lowpass");
  },
  devour() {
    tone(210, 0.42, "sawtooth", 0.065, 42);
    burst(0.32, 0.07, 280, 0.55, "lowpass");
  },
  climb() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => {
      setTimeout(() => tone(f, 0.22, "triangle", 0.05), i * 68);
    });
  },
  descend() {
    tone(246, 0.32, "sine", 0.04, 110);
  },
  heart() {
    tone(64, 0.11, "sine", 0.07);
  },
  wait() {
    tone(494, 0.09, "sine", 0.02);
  },
};
