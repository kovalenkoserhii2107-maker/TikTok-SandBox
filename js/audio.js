// Синтезированные звуки (WebAudio) — без внешних файлов, работает офлайн.
import { clamp, rand } from './util.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
let rate = 1;
let voices = 0;
const MAX_VOICES = 28;
let listener = { x: 0, y: 0, scale: 30 };
const lastPlay = new Map();

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master = ctx.createGain();
  master.gain.value = enabled ? 0.7 : 0;
  master.connect(comp);
  comp.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function setSoundEnabled(v) {
  enabled = v;
  if (master) master.gain.value = v ? 0.7 : 0;
}
export const isSoundEnabled = () => enabled;
export function setTimeRate(r) { rate = r; }
export function setListener(x, y, scale) { listener.x = x; listener.y = y; listener.scale = scale; }

function ready() {
  return ctx && enabled && voices < MAX_VOICES && ctx.state === 'running';
}

// Громкость и панорама в зависимости от расстояния до камеры.
function spatial(pos) {
  if (!pos) return { vol: 1, pan: 0 };
  const dx = pos.x - listener.x, dy = pos.y - listener.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const vol = 1 / (1 + d / 25);
  return { vol, pan: clamp(dx / 25, -0.8, 0.8) };
}

function throttle(key, ms) {
  const now = performance.now();
  const t = lastPlay.get(key) || 0;
  if (now - t < ms) return false;
  lastPlay.set(key, now);
  return true;
}

function out(gainVal, pan) {
  const g = ctx.createGain();
  g.gain.value = gainVal;
  let node = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(master);
  } else g.connect(master);
  return node;
}

function track(src, dur) {
  voices++;
  src.onended = () => { voices--; };
  src.stop(ctx.currentTime + dur + 0.05);
}

// Шумовой всплеск с фильтром и огибающей.
function noise({ dur = 0.3, vol = 0.5, type = 'lowpass', freq = 1200, freqEnd = null, q = 0.7, attack = 0.002, pos = null, pr = 1 }) {
  const sp = spatial(pos);
  const r = rate * pr;
  const d = dur / Math.max(0.15, r);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = clamp(r, 0.2, 2);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq * clamp(r, 0.3, 1.5), t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd * clamp(r, 0.3, 1.5)), t + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * sp.vol + 0.0001, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f);
  f.connect(g);
  g.connect(out(1, sp.pan));
  src.start(t, Math.random() * 1.5);
  track(src, d);
}

function tone({ freq = 440, freqEnd = null, dur = 0.2, vol = 0.3, type = 'sine', attack = 0.003, pos = null }) {
  const sp = spatial(pos);
  const r = clamp(rate, 0.25, 1);
  const d = dur / Math.max(0.25, rate);
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq * r, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd * r), t + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * sp.vol + 0.0001, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(out(1, sp.pan));
  o.start(t);
  track(o, d);
}

export const sfx = {
  shot(kind, pos) {
    if (!ready()) return;
    const k = {
      pistol: { v: 0.6, f: 2600, d: 0.22, b: 140 },
      revolver: { v: 0.8, f: 2000, d: 0.35, b: 110 },
      rifle: { v: 0.8, f: 3200, d: 0.3, b: 120 },
      smg: { v: 0.5, f: 3400, d: 0.16, b: 150 },
      shotgun: { v: 1.0, f: 1500, d: 0.5, b: 90 },
      sniper: { v: 1.0, f: 4200, d: 0.7, b: 80 },
      minigun: { v: 0.45, f: 3000, d: 0.12, b: 160 },
      cannon: { v: 1.0, f: 900, d: 1.2, b: 50 },
    }[kind] || { v: 0.6, f: 2500, d: 0.25, b: 130 };
    noise({ dur: k.d, vol: k.v, freq: k.f, freqEnd: 300, pos });
    tone({ freq: k.b, freqEnd: 40, dur: k.d * 0.8, vol: k.v * 0.7, type: 'triangle', pos });
  },
  rocket(pos) {
    if (!ready()) return;
    noise({ dur: 0.9, vol: 0.5, type: 'bandpass', freq: 600, freqEnd: 2500, q: 1.2, attack: 0.05, pos });
  },
  explosion(power, pos) {
    if (!ready()) return;
    const p = clamp(power, 0.4, 4);
    noise({ dur: 0.9 + p * 0.5, vol: clamp(0.6 + p * 0.25, 0, 1.4), freq: 1800, freqEnd: 60, attack: 0.004, pos });
    tone({ freq: 90, freqEnd: 25, dur: 0.8 + p * 0.4, vol: clamp(0.5 + p * 0.3, 0, 1.2), type: 'sine', pos });
    noise({ dur: 0.12, vol: 0.6, type: 'highpass', freq: 3000, pos });
  },
  nuke() {
    if (!ready()) return;
    noise({ dur: 7, vol: 1.6, freq: 900, freqEnd: 30, attack: 0.01 });
    tone({ freq: 60, freqEnd: 18, dur: 6, vol: 1.4, type: 'sine', attack: 0.01 });
    tone({ freq: 45, freqEnd: 20, dur: 8, vol: 0.8, type: 'triangle', attack: 0.4 });
  },
  impact(material, strength, pos) {
    if (!ready() || strength < 0.15) return;
    if (!throttle('imp' + material, 45)) return;
    const s = clamp(strength, 0, 1.2);
    switch (material) {
      case 'metal':
        tone({ freq: rand(380, 900), dur: 0.5 * s + 0.1, vol: 0.25 * s, type: 'triangle', pos });
        tone({ freq: rand(1500, 2600), dur: 0.3 * s + 0.05, vol: 0.08 * s, type: 'sine', pos });
        noise({ dur: 0.05, vol: 0.3 * s, freq: 4000, type: 'highpass', pos });
        break;
      case 'wood':
        noise({ dur: 0.12, vol: 0.5 * s, type: 'bandpass', freq: rand(500, 900), q: 2, pos });
        tone({ freq: rand(150, 230), freqEnd: 90, dur: 0.12, vol: 0.3 * s, type: 'triangle', pos });
        break;
      case 'glass':
        tone({ freq: rand(2500, 4000), dur: 0.25, vol: 0.12 * s, type: 'sine', pos });
        break;
      case 'flesh':
      case 'melon':
        noise({ dur: 0.1, vol: 0.45 * s, freq: 500, pos });
        tone({ freq: 90, freqEnd: 50, dur: 0.12, vol: 0.35 * s, type: 'sine', pos });
        break;
      case 'rubber':
        tone({ freq: rand(120, 180), freqEnd: 70, dur: 0.12, vol: 0.3 * s, type: 'sine', pos });
        break;
      default:
        noise({ dur: 0.1, vol: 0.4 * s, freq: 700, pos });
        tone({ freq: 70, freqEnd: 40, dur: 0.1, vol: 0.3 * s, type: 'sine', pos });
    }
  },
  ricochet(pos) {
    if (!ready() || !throttle('rico', 60)) return;
    tone({ freq: rand(1800, 3000), freqEnd: rand(600, 1200), dur: 0.25, vol: 0.12, type: 'sine', pos });
  },
  hitFlesh(pos) {
    if (!ready() || !throttle('hf', 30)) return;
    noise({ dur: 0.09, vol: 0.4, freq: 800, pos });
  },
  slice(pos) {
    if (!ready() || !throttle('slice', 60)) return;
    noise({ dur: 0.2, vol: 0.45, type: 'bandpass', freq: 3500, freqEnd: 900, q: 1.5, pos });
  },
  stab(pos) {
    if (!ready() || !throttle('stab', 60)) return;
    noise({ dur: 0.15, vol: 0.55, freq: 600, freqEnd: 200, pos });
    tone({ freq: 160, freqEnd: 70, dur: 0.15, vol: 0.25, pos });
  },
  bite(pos) {
    if (!ready() || !throttle('bite', 150)) return;
    noise({ dur: 0.18, vol: 0.5, type: 'bandpass', freq: 900, q: 3, pos });
  },
  groan(pos) {
    if (!ready() || !throttle('groan', 900)) return;
    tone({ freq: rand(80, 120), freqEnd: rand(60, 90), dur: 0.9, vol: 0.12, type: 'sawtooth', attack: 0.15, pos });
  },
  scream(pos) {
    if (!ready() || !throttle('scream', 700)) return;
    tone({ freq: rand(500, 750), freqEnd: rand(350, 450), dur: 0.5, vol: 0.1, type: 'sawtooth', attack: 0.03, pos });
  },
  beep(high = false, pos) {
    if (!ready()) return;
    tone({ freq: high ? 1800 : 1200, dur: 0.09, vol: 0.18, type: 'square', pos });
  },
  click(pos) {
    if (!ready() || !throttle('click', 40)) return;
    noise({ dur: 0.03, vol: 0.35, type: 'highpass', freq: 3000, pos });
  },
  glassBreak(pos) {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) tone({ freq: rand(2000, 5000), dur: rand(0.2, 0.5), vol: 0.08, type: 'sine', pos });
    noise({ dur: 0.4, vol: 0.5, type: 'highpass', freq: 2500, pos });
  },
  woodBreak(pos) {
    if (!ready()) return;
    noise({ dur: 0.35, vol: 0.6, type: 'bandpass', freq: 700, q: 1.5, pos });
    tone({ freq: 120, freqEnd: 60, dur: 0.25, vol: 0.3, type: 'triangle', pos });
  },
  squish(pos) {
    if (!ready()) return;
    noise({ dur: 0.35, vol: 0.6, freq: 400, freqEnd: 150, pos });
  },
  zap(pos) {
    if (!ready() || !throttle('zap', 80)) return;
    noise({ dur: 0.12, vol: 0.3, type: 'bandpass', freq: 5000, q: 4, pos });
  },
  splash(pos, k = 1) {
    if (!ready() || !throttle('splash', 80)) return;
    noise({ dur: 0.35 + k * 0.2, vol: clamp(0.25 + k * 0.3, 0, 0.8), type: 'bandpass', freq: 900, freqEnd: 300, q: 0.6, pos });
  },
  flame(pos) {
    if (!ready() || !throttle('flame', 90)) return;
    noise({ dur: 0.22, vol: 0.32, type: 'bandpass', freq: rand(350, 600), q: 0.8, attack: 0.02, pos });
  },
  fireWhoosh(pos) {
    if (!ready()) return;
    noise({ dur: 0.8, vol: 0.7, type: 'lowpass', freq: 900, freqEnd: 200, attack: 0.03, pos });
  },
  inject(pos) {
    if (!ready()) return;
    noise({ dur: 0.25, vol: 0.25, type: 'highpass', freq: 2500, pos });
    tone({ freq: 700, freqEnd: 1100, dur: 0.18, vol: 0.06, type: 'sine', pos });
  },
  ui() {
    if (!ready()) return;
    tone({ freq: 900, dur: 0.05, vol: 0.06, type: 'sine' });
  },
};

// Двигатель техники: постоянный осциллятор.
let engine = null;
export function engineStart(kind) {
  if (!ctx || engine) return;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 300;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  const base = kind === 'tank' ? 32 : kind === 'car' ? 55 : 42;
  o.frequency.value = base;
  o2.frequency.value = base * 0.5;
  o.start(); o2.start();
  engine = { o, o2, g, f, base };
}
export function engineSet(throttle) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  const k = Math.abs(throttle);
  engine.o.frequency.setTargetAtTime(engine.base * (1 + k * 1.2) * clamp(rate, 0.3, 1), t, 0.15);
  engine.o2.frequency.setTargetAtTime(engine.base * 0.5 * (1 + k * 1.2) * clamp(rate, 0.3, 1), t, 0.15);
  engine.f.frequency.setTargetAtTime(250 + k * 500, t, 0.2);
  engine.g.gain.setTargetAtTime(enabled ? 0.07 + k * 0.08 : 0, t, 0.1);
}
export function engineStop() {
  if (!engine) return;
  const e = engine;
  engine = null;
  const t = ctx.currentTime;
  e.g.gain.setTargetAtTime(0, t, 0.1);
  e.o.stop(t + 0.5);
  e.o2.stop(t + 0.5);
}
