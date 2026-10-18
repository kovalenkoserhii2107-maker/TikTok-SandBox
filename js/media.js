// Видео прямо из игры: запись экрана со звуком (REC), повтор последних 10 секунд
// в замедлении с другого ракурса, кинокамера, водяной знак, кадр 9:16 и «Поделиться».
// Всё работает в браузере: canvas.captureStream + MediaRecorder + Web Share, без серверов.
import { Effects } from './effects.js';
import { sfx, setTimeRate, setListener, getAudioStream, initAudio } from './audio.js';
import { clamp, lerp, TAU } from './util.js';

const BUFFER_SEC = 10;
const REC_HZ = 60;
const MAX_REC_SEC = 60;
const FX_METHODS = ['bloodSpray', 'drip', 'splash', 'bubble', 'sparks', 'dust', 'chunks', 'glassShards', 'impact', 'muzzle',
  'casing', 'smokePuff', 'flame', 'tracer', 'light', 'ring', 'decal', 'explosion', 'acidSpray', 'lightningArc', 'wind'];
const NO_LOG_SFX = new Set(['ui', 'click']);

export const GAME_NAME = 'KABOOM SANDBOX';
export function gameUrl() {
  const l = typeof location !== 'undefined' ? location : null;
  if (!l || !/^https?:$/.test(l.protocol)) return 'kaboom-sandbox';
  return (l.host + l.pathname).replace(/index\.html$/, '').replace(/\/$/, '');
}

const copyArg = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'x' in v && 'y' in v ? { x: v.x, y: v.y } : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// Плавный «ручной» шум камеры.
const wobble = (t, s) => Math.sin(t * 1.3 + s) * 0.6 + Math.sin(t * 2.9 + s * 2.1) * 0.3 + Math.sin(t * 6.1 + s * 0.7) * 0.1;

// Поза тела пишется прямо во внутренние поля planck: без пересчёта контактов,
// только для отрисовки кадра повтора. После кадра всё возвращается обратно.
function readXf(b, out, o) {
  const xf = b.m_xf, sw = b.m_sweep;
  out[o] = xf.p.x; out[o + 1] = xf.p.y; out[o + 2] = xf.q.c; out[o + 3] = xf.q.s;
  out[o + 4] = sw.a; out[o + 5] = sw.c.x; out[o + 6] = sw.c.y;
}
function writeXfRaw(b, src, o) {
  const xf = b.m_xf, sw = b.m_sweep;
  xf.p.x = src[o]; xf.p.y = src[o + 1]; xf.q.c = src[o + 2]; xf.q.s = src[o + 3];
  sw.a = src[o + 4]; sw.c.x = src[o + 5]; sw.c.y = src[o + 6];
}
function writePose(b, x, y, a) {
  const xf = b.m_xf, sw = b.m_sweep;
  const c = Math.cos(a), s = Math.sin(a);
  xf.p.x = x; xf.p.y = y; xf.q.c = c; xf.q.s = s;
  sw.a = a;
  const lc = sw.localCenter;
  sw.c.x = x + c * lc.x - s * lc.y;
  sw.c.y = y + s * lc.x + c * lc.y;
}

// ---------- Буфер последних секунд ----------
export class ReplayBuffer {
  constructor(sim) {
    this.sim = sim;
    this.live = true;
    this.mute = false;
    this.depth = 0;
    this.stamp = 0;
    this.onEvent = null;
    this.clear();
    this.hook();
  }

  clear() {
    this.frames = [];
    this.fx = [];
    this.snd = [];
    this.events = [];
    this.decals = [];
    this.lastT = -Infinity;
    this.lastDecalT = -Infinity;
  }

  // Перехватываем эффекты и звуки: в повторе они воспроизводятся заново по журналу.
  hook() {
    const sim = this.sim, fx = sim.effects, buf = this;
    for (const m of FX_METHODS) {
      const orig = fx[m];
      fx[m] = function (...a) {
        if (buf.depth === 0 && buf.live) buf.fx.push({ t: sim.time, m, a });
        buf.depth++;
        try { return orig.apply(this, a); } finally { buf.depth--; }
      };
    }
    const upd = fx.update;
    fx.update = function (dt) {
      buf.depth++;
      try { return upd.call(this, dt); } finally { buf.depth--; }
    };
    for (const k of Object.keys(sfx)) {
      const orig = sfx[k];
      if (typeof orig !== 'function') continue;
      sfx[k] = function (...a) {
        if (buf.mute) return undefined;
        if (buf.live && !NO_LOG_SFX.has(k)) buf.snd.push({ t: sim.time, k, a: a.map(copyArg) });
        return orig.apply(sfx, a);
      };
    }
    sim.onEvent = (ev) => {
      if (!this.live) return;
      this.events.push(ev);
      if (this.onEvent) this.onEvent(ev);
    };
    sim.onStepped = () => this.capture();
  }

  capture() {
    if (!this.live) return;
    const sim = this.sim;
    const t = sim.time;
    if (t - this.lastT < 1 / REC_HZ - 1e-6) return;
    this.lastT = t;
    const st = ++this.stamp;
    const ents = [], vis = [], bodies = [];
    for (const e of sim.entities) {
      if (e.removed || !e.visuals.length) continue;
      ents.push(e);
      vis.push(e.visuals);
      for (const b of e.bodies) if (b._rs !== st) { b._rs = st; bodies.push(b); }
      for (const v of e.visuals) {
        const b = v.body;
        if (b && b._rs !== st) { b._rs = st; bodies.push(b); }
      }
    }
    const poses = new Float32Array(bodies.length * 3);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i], p = b.getPosition();
      poses[i * 3] = p.x; poses[i * 3 + 1] = p.y; poses[i * 3 + 2] = b.getAngle();
    }
    this.frames.push({ t, ents, vis, bodies, poses, flash: sim.flashAmt, shake: sim.shakeAmt, index: null });
    if (t - this.lastDecalT >= 0.5) {
      this.lastDecalT = t;
      this.decals.push({ t, list: sim.effects.decals.slice() });
    }
    this.trim(t);
  }

  trim(t) {
    const cut = t - BUFFER_SEC;
    let i = 0;
    while (i < this.frames.length && this.frames[i].t < cut) i++;
    if (i) this.frames.splice(0, i);
    const cut2 = cut - 2;
    for (const arr of [this.fx, this.snd, this.events, this.decals]) {
      let j = 0;
      while (j < arr.length - (arr === this.decals ? 1 : 0) && arr[j].t < cut2) j++;
      if (j) arr.splice(0, j);
    }
  }

  get duration() {
    const f = this.frames;
    return f.length > 1 ? f[f.length - 1].t - f[0].t : 0;
  }
}

// ---------- Повтор ----------
const ANGLES = [
  { name: 'Низкий ракурс', zoom: 1.55, horizon: 0.7, ground: 0.8, dcam: 12 },
  { name: 'Крупный план', zoom: 2.4, horizon: 0.38, ground: 0.76, dcam: 17 },
  { name: 'Сверху', zoom: 1.1, horizon: 0.08, ground: 0.72, dcam: 34 },
  { name: 'Как в игре', zoom: 0 },
];
const SPEEDS = ['auto', 0.1, 0.25, 0.5, 1];

export class Replay {
  constructor(game, buf) {
    this.game = game;
    this.buf = buf;
    this.active = false;
    const sim = game.sim;
    this.fx = new Effects({ get def() { return sim.def; }, silent: false });
    this.angleI = 0;
    this.speedI = 0;
    this.onEnd = null;
  }

  // Главное событие окна: ядерка важнее всего, затем самые мощные и свежие взрывы.
  pickEvent(events, t0, t1) {
    let best = null, bs = 0;
    for (const ev of events) {
      if (ev.t < t0 || ev.t > t1) continue;
      const rec = (ev.t - t0) / Math.max(0.1, t1 - t0);
      const s = ev.w * (0.55 + 0.45 * rec);
      if (s >= bs) { bs = s; best = ev; }
    }
    return best;
  }

  start() {
    const buf = this.buf;
    if (buf.frames.length < 20) return false;
    this.frames = buf.frames.slice();
    this.fxLog = buf.fx.slice();
    this.sndLog = buf.snd.slice();
    this.decalLog = buf.decals.slice();
    const t0 = this.frames[0].t, t1 = this.frames[this.frames.length - 1].t;
    this.ev = this.pickEvent(buf.events, t0, t1);
    if (this.ev) {
      this.tStart = Math.max(t0, this.ev.t - 2);
      this.tEnd = Math.min(t1, this.ev.t + (this.ev.type === 'nuke' ? 7 : 4.5));
      if (this.tEnd - this.tStart < 1) { this.tStart = t0; this.tEnd = t1; }
    } else {
      this.tStart = t0;
      this.tEnd = t1;
    }
    this.focus = this.findFocus();
    const r = this.game.r;
    this.saved = { cam: { ...r.cam }, vpFrac: r.vpFrac };
    this.active = true;
    this.playing = true;
    this.ended = false;
    this.realT = 0;
    buf.live = false;
    this.seek(this.tStart);
    return true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.buf.live = true;
    this.buf.mute = false;
    const r = this.game.r;
    Object.assign(r.cam, this.saved.cam);
    r.vpFrac = this.saved.vpFrac;
    r.vp.y = r.H * r.vpFrac;
    r.dcam = 24;
    r.shakeX = r.shakeY = 0;
    setTimeRate(this.game.timeScale);
    this.frames = this.fxLog = this.sndLog = this.decalLog = null;
    this.fx.clear();
  }

  // Куда смотрит камера: точка события или центр персонажей и техники.
  findFocus() {
    if (this.ev) return { x: this.ev.x, y: this.ev.type === 'nuke' ? -7 : Math.min(this.ev.y, -0.6) };
    const f = this.frames[this.frames.length - 1];
    let sx = 0, sy = 0, n = 0;
    for (const e of f.ents) {
      if (!e.isRagdoll && !e.isVehicle && !e.chassis) continue;
      const p = (e.parts ? e.parts.chest.body : e.main).getPosition();
      sx += p.x; sy += p.y; n++;
    }
    const c = this.game.r.cam;
    return n ? { x: sx / n, y: Math.min(sy / n, -0.6) } : { x: c.x, y: c.y };
  }

  speedAt(t) {
    const m = SPEEDS[this.speedI];
    if (m !== 'auto') return m;
    if (!this.ev) return 0.5;
    const d = t - this.ev.t;
    if (d < -0.35) return 1;
    if (d < -0.1) return lerp(1, 0.1, (d + 0.35) / 0.25);
    if (d < 1.1) return 0.1;
    if (d < 2) return lerp(0.1, 0.4, (d - 1.1) / 0.9);
    return d < 3.5 ? 0.4 : 1;
  }

  get speed() { return this.speedAt(this.t); }
  get progress() { return clamp((this.t - this.tStart) / Math.max(0.01, this.tEnd - this.tStart), 0, 1); }

  applyFx(i, upto) {
    const log = this.fxLog, fx = this.fx;
    while (i < log.length && log[i].t <= upto) {
      const e = log[i++];
      try { fx[e.m](...e.a); } catch (err) { /* событие из другого мира — пропускаем */ }
    }
    return i;
  }

  seek(t) {
    t = clamp(t, this.tStart, this.tEnd);
    const live = this.game.sim.effects;
    const fx = this.fx;
    fx.clear();
    fx.quality = live.quality;
    fx.blood = live.blood;
    let snap = null;
    for (const d of this.decalLog) if (d.t <= t) snap = d;
    fx.decals = snap ? snap.list.slice() : [];
    // Предпрокрутка: частицы, рождённые до начала, уже летят.
    this.buf.mute = true;
    let ct = t - 1.5;
    let i = 0;
    while (i < this.fxLog.length && this.fxLog[i].t < ct) i++;
    while (ct < t - 1e-6) {
      const step = Math.min(1 / 30, t - ct);
      i = this.applyFx(i, ct + step);
      fx.update(step);
      ct += step;
    }
    this.buf.mute = false;
    this.fxI = i;
    let j = 0;
    while (j < this.sndLog.length && this.sndLog[j].t <= t) j++;
    this.sndI = j;
    this.fi = 0;
    this.t = t;
    this.ended = false;
    this.flashR = 0;
    this.flashPrev = 0;
  }

  restart() {
    this.seek(this.tStart);
    this.playing = true;
    this.realT = 0;
  }

  advance(dt) {
    this.flashR = Math.max(0, this.flashR - dt * 0.8);
    if (!this.playing || this.ended) return;
    const sp = this.speedAt(this.t);
    const nt = Math.min(this.tEnd, this.t + dt * sp);
    setTimeRate(sp);
    const snd = this.sndLog;
    while (this.sndI < snd.length && snd[this.sndI].t <= nt) {
      const s = snd[this.sndI++];
      try { sfx[s.k](...s.a); } catch (err) { /* нет такого звука */ }
    }
    this.buf.mute = true;
    this.fxI = this.applyFx(this.fxI, nt);
    this.fx.update(Math.max(0, nt - this.t));
    this.buf.mute = false;
    this.t = nt;
    this.realT += dt;
    if (nt >= this.tEnd - 1e-6) {
      this.ended = true;
      this.playing = false;
      if (this.onEnd) this.onEnd();
    }
  }

  // Камера повтора: свой ракурс, медленный наезд, проезд вбок, «ручная» тряска.
  camera(frameShake) {
    const g = this.game, r = g.r;
    const ang = ANGLES[this.angleI];
    const shake = frameShake || 0;
    if (!ang.zoom) {
      Object.assign(r.cam, this.saved.cam);
      r.vp.y = r.H * this.saved.vpFrac;
      r.dcam = 24;
    } else {
      const nuke = this.ev && this.ev.type === 'nuke';
      const pr = smooth(this.progress);
      const v = g.media.viewRect();
      const base = g.media.baseScale() * (nuke ? 0.32 : 1);
      const s = clamp(base * ang.zoom * (0.88 + 0.28 * pr), 4, 220);
      const half = (v.w / 2) / s;
      const tt = this.realT;
      // В вертикальном кадре низ закрывает подпись TikTok — поднимаем землю.
      const ground = g.media.vertical ? Math.min(ang.ground, 0.68) : ang.ground;
      const horizon = Math.min(ang.horizon, ground - 0.08);
      r.dcam = ang.dcam;
      r.vp.y = v.y + v.h * horizon;
      r.cam.s = s;
      r.cam.x = this.focus.x + (0.35 - 0.7 * pr) * half + wobble(tt, 1) * 0.012 * half;
      const fy = this.focus.y + wobble(tt, 4) * 0.01 * half;
      const yFocus = fy - (v.y + v.h * 0.52 - r.vp.y) / s;
      const yGround = -(v.y + v.h * ground - r.vp.y) / s;
      r.cam.y = Math.min(yFocus, yGround);
    }
    if (shake > 0.05) {
      r.shakeX = (Math.random() - 0.5) * shake * 0.04;
      r.shakeY = (Math.random() - 0.5) * shake * 0.04;
    } else r.shakeX = r.shakeY = 0;
  }

  frameAt(t) {
    const F = this.frames;
    let i = this.fi;
    if (i >= F.length || F[i].t > t) i = 0;
    while (i < F.length - 2 && F[i + 1].t <= t) i++;
    this.fi = i;
    return i;
  }

  render(overlay) {
    const g = this.game, r = g.r, sim = g.sim;
    const i = this.frameAt(this.t);
    const a = this.frames[i], b = this.frames[Math.min(i + 1, this.frames.length - 1)];
    const al = b === a ? 0 : clamp((this.t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    this.camera(lerp(a.shake, b.shake, al));
    setListener(r.cam.x, r.cam.y, r.cam.s);
    if (!b.index) b.index = new Map(b.bodies.map((x, k) => [x, k]));
    const n = a.bodies.length;
    const saved = this._save && this._save.length >= n * 7 ? this._save : (this._save = new Float64Array(n * 7 + 64));
    const pa = a.poses, pb = b.poses;
    for (let k = 0; k < n; k++) {
      const body = a.bodies[k];
      readXf(body, saved, k * 7);
      let x = pa[k * 3], y = pa[k * 3 + 1], an = pa[k * 3 + 2];
      const kb = b.bodies[k] === body ? k : b.index.get(body);
      if (kb !== undefined && al > 0) {
        x += (pb[kb * 3] - x) * al;
        y += (pb[kb * 3 + 1] - y) * al;
        let d = pb[kb * 3 + 2] - an;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        an += d * al;
      }
      writePose(body, x, y, an);
    }
    const ents = a.ents;
    const keepVis = new Array(ents.length);
    for (let k = 0; k < ents.length; k++) { keepVis[k] = ents[k].visuals; ents[k].visuals = a.vis[k]; }
    const rsim = Object.create(sim);
    rsim.entities = ents;
    rsim.effects = this.fx;
    rsim.time = lerp(a.t, b.t, al);
    // Вспышка в замедлении гаснет по реальному времени, иначе экран белый десятки секунд.
    const fl = lerp(a.flash, b.flash, al);
    if (fl > this.flashPrev + 0.05) this.flashR = fl;
    this.flashPrev = fl;
    rsim.flashAmt = Math.min(fl, this.flashR);
    r.ghosts = true;
    try {
      r.drawScene(rsim, g.worldDef, { overlay });
    } finally {
      r.ghosts = false;
      for (let k = 0; k < ents.length; k++) ents[k].visuals = keepVis[k];
      for (let k = 0; k < n; k++) writeXfRaw(a.bodies[k], saved, k * 7);
    }
  }

  get angleName() { return ANGLES[this.angleI].name; }
  nextAngle() { this.angleI = (this.angleI + 1) % ANGLES.length; return this.angleName; }
  get speedLabel() { const m = SPEEDS[this.speedI]; return m === 'auto' ? 'Авто' : m + '×'; }
  nextSpeed() { this.speedI = (this.speedI + 1) % SPEEDS.length; return this.speedLabel; }
}

// ---------- Кинокамера ----------
export class Director {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.shot = null;
    this.track = null;
    this.trackT = 0;
    this.manualT = 0;
    this.t = 0;
  }

  notify(ev) {
    if (!this.on) return;
    const big = ev.type === 'nuke' || ev.w >= 4;
    if (big && (!this.shot || ev.w >= this.shot.w * 0.8 || this.shot.age > 1.2)) {
      this.shot = { x: ev.x, y: ev.y, w: ev.w, nuke: ev.type === 'nuke', age: 0, dur: ev.type === 'nuke' ? 9 : 2.4 + Math.min(1.6, ev.w * 0.08) };
      this.track = null;
    } else if (ev.type === 'gore' && !this.shot) {
      this.shot = { x: ev.x, y: ev.y, w: ev.w, age: 0, dur: 1.8, small: true };
    }
  }

  userMoved() { if (this.on) this.manualT = 2.5; }

  // Самое быстрое летящее тело — его ведём.
  findFlyer() {
    let best = null, bv = 9;
    for (const e of this.game.sim.entities) {
      if (e.removed || !e.isRagdoll) continue;
      const v = e.parts.chest.body.getLinearVelocity();
      const sp = Math.hypot(v.x, v.y);
      if (sp > bv) { bv = sp; best = e; }
    }
    return best;
  }

  framing() {
    let lx = Infinity, ux = -Infinity, ly = Infinity, n = 0;
    for (const e of this.game.sim.entities) {
      if (e.removed || e.isDebris || e.isGore || e.permanentStatic) continue;
      if (!e.isRagdoll && !e.chassis && !e.isExplosive) continue;
      const p = (e.parts ? e.parts.chest.body : e.main).getPosition();
      lx = Math.min(lx, p.x); ux = Math.max(ux, p.x); ly = Math.min(ly, p.y); n++;
    }
    return n ? { x: (lx + ux) / 2, y: Math.min(-0.8, ly + 0.6), w: ux - lx + 4 } : null;
  }

  update(dt) {
    if (!this.on) return;
    const g = this.game, r = g.r;
    this.t += dt;
    if (this.manualT > 0) { this.manualT -= dt; return; }
    const base = g.media.baseScale();
    const V = g.media.viewRect(), vw = V.w;
    let tx, ty, ts, k = 1.6;
    const sh = this.shot;
    if (sh) {
      sh.age += dt;
      const u = sh.age / sh.dur;
      if (u >= 1) this.shot = null;
      if (sh.nuke) {
        // Ядерка: отъезд, чтобы поместился гриб.
        ts = base * lerp(0.75, 0.3, smooth(sh.age / 2.5));
        tx = sh.x; ty = lerp(sh.y, -9, smooth(sh.age / 3));
        k = 2.2;
      } else {
        // Резкий наезд, затем медленный отъезд.
        const zin = sh.small ? 1.7 : 2.1;
        ts = base * (sh.age < 0.4 ? zin : lerp(zin, zin * 0.72, smooth((sh.age - 0.4) / (sh.dur - 0.4))));
        tx = sh.x; ty = sh.y;
        k = sh.age < 0.4 ? 7 : 2.5;
        // После наезда — за самым быстрым отлетевшим телом.
        if (sh.age > 0.6) {
          const fl = this.findFlyer();
          if (fl) {
            const p = fl.parts.chest.body.getPosition();
            const u2 = smooth((sh.age - 0.6) / 0.8);
            tx = lerp(sh.x, p.x, u2 * 0.55);
            ty = lerp(sh.y, p.y, u2 * 0.55);
            ts = Math.min(ts, base * 1.15);
          }
        }
      }
    }
    if (!sh && g.controlled) {
      const p = g.controlled.chassis.getPosition();
      tx = p.x; ty = p.y - 1; ts = base * 1.1; k = 2.5;
    } else if (!this.shot && !sh) {
      if (this.track && (this.track.removed || this.trackT <= 0)) this.track = null;
      const fl = this.findFlyer();
      if (fl) { this.track = fl; this.trackT = 1.2; }
      if (this.track) {
        this.trackT -= dt;
        const p = this.track.parts.chest.body.getPosition();
        tx = p.x; ty = p.y; ts = base * 1.35; k = 3;
      } else {
        const f = this.framing();
        if (f) {
          tx = f.x + Math.sin(this.t * 0.25) * 0.4;
          ty = f.y;
          ts = clamp((vw * 0.8) / f.w, base * 0.55, base * 1.7) * (1 + Math.sin(this.t * 0.18) * 0.04);
        } else { tx = r.cam.x; ty = -2; ts = base; }
        k = 0.9;
      }
    }
    const a = 1 - Math.exp(-dt * k);
    r.cam.s = Math.exp(lerp(Math.log(r.cam.s), Math.log(clamp(ts, 6, 180)), a));
    r.cam.x += (tx - r.cam.x) * a;
    const yFocus = ty - (V.y + V.h * 0.5 - r.vp.y) / r.cam.s;
    const yGround = -(V.y + V.h * 0.8 - r.vp.y) / r.cam.s;
    const tyCam = Math.min(yFocus, yGround);
    r.cam.y += (tyCam - r.cam.y) * a;
    g.clampCam();
    // «Ручная» камера: лёгкое покачивание.
    const half = vw / 2 / r.cam.s;
    r.shakeX += wobble(this.t, 1.7) * 0.006 * half;
    r.shakeY += wobble(this.t, 5.3) * 0.004 * half;
  }
}

// ---------- Запись видео ----------
function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export class Recorder {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.t = 0;
    this.onDone = null;
  }

  static supported() {
    return typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && !!window.MediaRecorder;
  }

  start() {
    if (this.active || !Recorder.supported()) return false;
    const g = this.game;
    const vr = g.media.viewRect();
    const d = g.r.dpr;
    const sw = Math.round(vr.w * d), shh = Math.round(vr.h * d);
    const vertical = g.media.vertical;
    // Вертикальное видео — не меньше 720×1280 (так его принимают TikTok и Reels).
    let k = Math.min(1, 1920 / Math.max(sw, shh));
    if (vertical && shh * k < 1280) k = 1280 / shh;
    const ow = Math.round((sw * k) / 2) * 2, oh = Math.round((shh * k) / 2) * 2;
    this.cv = document.createElement('canvas');
    this.cv.width = ow;
    this.cv.height = oh;
    this.ctx = this.cv.getContext('2d');
    this.paint();
    const stream = this.cv.captureStream(30);
    const audio = getAudioStream();
    if (audio) for (const tr of audio.getAudioTracks()) stream.addTrack(tr);
    this.mime = pickMime();
    try {
      this.mr = new MediaRecorder(stream, { mimeType: this.mime || undefined, videoBitsPerSecond: vertical ? 8e6 : 10e6, audioBitsPerSecond: 128000 });
    } catch (e) {
      try { this.mr = new MediaRecorder(stream); } catch (e2) { return false; }
    }
    this.mime = this.mr.mimeType || this.mime || 'video/webm';
    this.chunks = [];
    this.stream = stream;
    this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
      for (const tr of this.stream.getVideoTracks()) tr.stop();
      this.chunks = [];
      if (this.onDone) this.onDone(blob, this.mime, this.t);
    };
    this.mr.start(500);
    this.active = true;
    this.t = 0;
    return true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try { this.mr.stop(); } catch (e) { /* уже остановлен */ }
  }

  frame(dt) {
    if (!this.active) return;
    this.t += dt;
    this.paint();
    if (this.t >= MAX_REC_SEC) this.game.media.stopRec();
  }

  paint() {
    const c = this.ctx, W = this.cv.width, H = this.cv.height;
    // Область берём каждый кадр: разрешение холста может поменяться.
    const g = this.game, v = g.media.viewRect(), d = g.r.dpr;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(g.canvas, v.x * d, v.y * d, v.w * d, v.h * d, 0, 0, W, H);
    drawWatermark(c, W, H);
  }
}

// Водяной знак: название и адрес игры — каждый ролик становится рекламой.
export function drawWatermark(c, W, H) {
  const vertical = H > W;
  const u = Math.min(W, H) / 100;
  const fs = u * (vertical ? 5.2 : 4.2);
  const x = vertical ? W / 2 : u * 4;
  const y = vertical ? H * 0.115 : u * 5;
  c.save();
  c.textAlign = vertical ? 'center' : 'left';
  c.textBaseline = 'top';
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = u * 1.2;
  c.font = `900 ${fs}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const t1 = 'KABOOM', t2 = ' SANDBOX';
  const w1 = c.measureText(t1).width, w2 = c.measureText(t2).width;
  const x0 = vertical ? x - (w1 + w2) / 2 : x;
  c.textAlign = 'left';
  // Значок-взрыв.
  const bx = x0 - fs * 0.75, by = y + fs * 0.5, br = fs * 0.48;
  c.fillStyle = '#ff7a1a';
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, rr = i % 2 ? br * 0.55 : br;
    c.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.fillStyle = '#ffd34d';
  c.beginPath(); c.arc(bx, by, br * 0.3, 0, TAU); c.fill();
  c.globalAlpha = 0.92;
  c.fillStyle = '#ff8a2a';
  c.fillText(t1, x0, y);
  c.fillStyle = '#ffffff';
  c.fillText(t2, x0 + w1, y);
  c.font = `700 ${fs * 0.5}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  c.globalAlpha = 0.85;
  c.textAlign = vertical ? 'center' : 'left';
  c.fillText('▶ ' + gameUrl(), vertical ? x : x0 - fs * 1.2 + fs * 0.45, y + fs * 1.12);
  c.restore();
}

// ---------- Интерфейс: REC, Повтор, Кино, 9:16, «Поделиться» ----------
const ICON = {
  replay: '<path d="M4.5 12a7.5 7.5 0 107.5-7.5A8 8 0 006.3 7L4 9.3"/><path d="M4 4.5v4.8h4.8"/><path d="M10.5 9.3l4.2 2.7-4.2 2.7z" fill="currentColor"/>',
  cine: '<rect x="3" y="9" width="12" height="9" rx="1.5"/><path d="M15 12.5l6-3v8l-6-3"/><circle cx="6.5" cy="5.5" r="2.3"/><circle cx="12" cy="5.5" r="2.3"/>',
  vert: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.6h2"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 107.5-7.5A8 8 0 006.3 7L4 9.3"/><path d="M4 4.5v4.8h4.8"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
const $ = (s) => document.querySelector(s);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class Media {
  constructor(game) {
    this.game = game;
    this.buf = new ReplayBuffer(game.sim);
    this.replay = new Replay(game, this.buf);
    this.director = new Director(game);
    this.rec = new Recorder(game);
    this.recFromReplay = false;
    this.vertical = false;
    try { this.vertical = localStorage.getItem('kaboom.vertical') === '1'; } catch (e) { /* нет хранилища */ }
    this.buf.onEvent = (ev) => this.director.notify(ev);
    this.rec.onDone = (blob, mime, dur) => this.showResult(blob, mime, dur);
    this.replay.onEnd = () => {
      if (this.recFromReplay) { this.recFromReplay = false; this.stopRec(); }
      this.updateBar();
    };
    this.lastSec = -1;
    this.build();
  }

  // Область кадра (CSS-пиксели): весь экран или вертикальная рамка 9:16.
  viewRect() {
    const r = this.game.r;
    if (!this.vertical) return { x: 0, y: 0, w: r.W, h: r.H };
    let w = Math.min(r.W, (r.H * 9) / 16), h = (w * 16) / 9;
    if (h > r.H) { h = r.H; w = (h * 9) / 16; }
    return { x: (r.W - w) / 2, y: (r.H - h) / 2, w, h };
  }

  // Обычный масштаб для кадра: в рамке 9:16 по ширине рамки.
  baseScale() {
    if (!this.vertical) return this.game.baseScale();
    return clamp(this.viewRect().w / 8, 14, 90);
  }

  build() {
    $('#btnRec').onclick = () => this.toggleRec();
    $('#btnReplay').innerHTML = svg('replay') + '<span>Повтор</span>';
    $('#btnReplay').onclick = () => this.openReplay();
    $('#btnCine').innerHTML = svg('cine') + '<span>Кино</span>';
    $('#btnCine').onclick = () => this.toggleCinema();
    $('#btnVert').innerHTML = svg('vert') + '<span>9:16</span>';
    $('#btnVert').onclick = () => this.toggleVertical();
    $('#rpClose').innerHTML = svg('close');
    $('#rpClose').onclick = () => this.closeReplay();
    $('#rpPlay').onclick = () => this.togglePlay();
    $('#rpSpeed').onclick = () => { this.game.ui.toast('Скорость повтора: ' + this.replay.nextSpeed()); this.updateBar(); };
    $('#rpAngle').onclick = () => { this.game.ui.toast(this.replay.nextAngle()); this.updateBar(); };
    $('#rpRec').onclick = () => this.recordReplay();
    $('#rpTrack').addEventListener('pointerdown', (e) => {
      const R = this.replay;
      if (!R.active) return;
      const b = e.currentTarget.getBoundingClientRect();
      const u = clamp((e.clientX - b.left) / b.width, 0, 1);
      R.seek(R.tStart + u * (R.tEnd - R.tStart));
      R.playing = true;
      this.updateBar();
    });
    $('#vidShare').onclick = () => this.share();
    $('#vidSave').onclick = () => this.download();
    $('#vidClose').onclick = () => this.closeResult();
    $('#btnCine').classList.toggle('on', this.director.on);
    this.layoutFrame();
  }

  layoutFrame() {
    const el = $('#frame916');
    $('#btnVert').classList.toggle('on', this.vertical);
    el.classList.toggle('hidden', !this.vertical);
    if (!this.vertical) return;
    const v = this.viewRect();
    const box = el.firstElementChild;
    Object.assign(box.style, { left: v.x + 'px', top: v.y + 'px', width: v.w + 'px', height: v.h + 'px' });
  }

  toggleVertical() {
    if (this.rec.active) { this.game.ui.toast('Сначала останови запись'); return; }
    this.vertical = !this.vertical;
    try { localStorage.setItem('kaboom.vertical', this.vertical ? '1' : '0'); } catch (e) { /* нет хранилища */ }
    this.layoutFrame();
    this.game.ui.toast(this.vertical ? 'Кадр 9:16 для TikTok: в видео попадёт только то, что внутри рамки' : 'Кадр на весь экран', 2600);
  }

  toggleCinema() {
    const d = this.director;
    d.on = !d.on;
    d.shot = null;
    d.manualT = 0;
    $('#btnCine').classList.toggle('on', d.on);
    this.game.ui.toast(d.on ? 'Кинокамера: наезд на взрывы, слежение за летящими телами' : 'Кинокамера выключена', 2400);
  }

  toggleRec() {
    if (this.rec.active) this.stopRec();
    else this.startRec();
  }

  startRec() {
    initAudio();
    if (!Recorder.supported()) {
      this.game.ui.toast('Этот браузер не умеет записывать видео. Попробуй Chrome или Safari 15+', 3200);
      return false;
    }
    if (!this.rec.start()) { this.game.ui.toast('Не удалось начать запись'); return false; }
    document.body.classList.add('recording');
    this.lastSec = -1;
    return true;
  }

  stopRec() {
    if (!this.rec.active) return;
    this.rec.stop();
    document.body.classList.remove('recording');
  }

  openReplay() {
    const g = this.game;
    if (this.replay.active) return;
    if (g.drag) g.endDrag();
    g.ui.closeCtx();
    if (!this.replay.start()) { g.ui.toast('Повтор появится через пару секунд игры'); return; }
    document.body.classList.add('replaying');
    this.updateBar();
    const ev = this.replay.ev;
    g.ui.toast(ev ? (ev.type === 'nuke' ? 'Повтор: ядерный взрыв в замедлении' : 'Повтор: главный момент в замедлении 0.1×') : 'Повтор последних 10 секунд', 2200);
  }

  closeReplay() {
    if (this.recFromReplay) { this.recFromReplay = false; this.stopRec(); }
    this.replay.stop();
    document.body.classList.remove('replaying');
  }

  togglePlay() {
    const R = this.replay;
    if (!R.active) return;
    if (R.ended) R.restart();
    else R.playing = !R.playing;
    this.updateBar();
  }

  // «Записать повтор»: проигрываем с начала и пишем до конца — готовый ролик.
  recordReplay() {
    const R = this.replay;
    if (!R.active) return;
    if (this.rec.active) { this.recFromReplay = false; this.stopRec(); return; }
    R.restart();
    if (this.startRec()) this.recFromReplay = true;
    this.updateBar();
  }

  updateBar() {
    const R = this.replay;
    if (!R.active) return;
    $('#rpPlay').innerHTML = svg(R.ended ? 'restart' : R.playing ? 'pause' : 'play');
    $('#rpSpeed').textContent = R.speedLabel;
    $('#rpAngle').textContent = R.angleName;
    $('#rpRec').classList.toggle('on', this.rec.active);
    $('#rpRec').textContent = this.rec.active ? '■ Стоп' : '● Записать';
  }

  // Кадр повтора вместо обычного кадра игры.
  frameReplay(dt) {
    const R = this.replay;
    const wasEnded = R.ended;
    R.advance(dt);
    R.render((r) => this.drawReplayOverlay(r));
    $('#rpFill').style.width = (R.progress * 100).toFixed(1) + '%';
    if (R.ended !== wasEnded) this.updateBar();
  }

  afterRender(dt) {
    if (!this.rec.active) return;
    this.rec.frame(dt);
    const sec = Math.floor(this.rec.t);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      $('#recTime').textContent = fmt(this.rec.t);
    }
  }

  // Плашка «ПОВТОР 0.1×» как в спортивной трансляции — попадает и в видео.
  drawReplayOverlay(r) {
    const R = this.replay, c = r.ctx, v = this.viewRect();
    r.screen();
    const u = Math.min(v.w, v.h) / 100;
    const fs = clamp(u * 4.2, 12, 26);
    const x = v.x + u * 4, y = v.y + (this.vertical ? v.h * 0.2 : u * 16);
    const sp = R.speed;
    const label = 'ПОВТОР';
    const spd = (sp < 0.995 ? sp.toFixed(sp < 0.2 ? 2 : 1).replace(/0$/, '') : '1') + '×';
    c.save();
    c.textAlign = 'left';
    c.font = `900 ${fs}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const w1 = c.measureText(label).width;
    c.font = `800 ${fs * 0.9}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const w2 = c.measureText(spd).width;
    const pad = fs * 0.45, h = fs * 1.5;
    c.globalAlpha = 0.92;
    c.fillStyle = '#e5251f';
    c.beginPath(); c.roundRect ? c.roundRect(x, y, w1 + pad * 2 + h * 0.5, h, h * 0.25) : c.rect(x, y, w1 + pad * 2 + h * 0.5, h); c.fill();
    c.fillStyle = 'rgba(12,14,18,0.82)';
    c.beginPath(); c.roundRect ? c.roundRect(x + w1 + pad * 2 + h * 0.5, y, w2 + pad * 2, h, h * 0.25) : c.rect(x + w1 + pad * 2 + h * 0.5, y, w2 + pad * 2, h); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(x + pad, y + h * 0.28); c.lineTo(x + pad + h * 0.36, y + h * 0.5); c.lineTo(x + pad, y + h * 0.72);
    c.fill();
    c.textBaseline = 'middle';
    c.font = `900 ${fs}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    c.fillText(label, x + pad + h * 0.5, y + h * 0.53);
    c.font = `800 ${fs * 0.9}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    c.fillStyle = sp < 0.3 ? '#7fd3ff' : '#fff';
    c.fillText(spd, x + w1 + pad * 3 + h * 0.5, y + h * 0.53);
    c.restore();
  }

  showResult(blob, mime, dur) {
    if (!blob || !blob.size) { this.game.ui.toast('Видео не записалось'); return; }
    const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `kaboom-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.file = new File([blob], name, { type: blob.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm') });
    const pl = $('#vidPlayer');
    pl.src = this.url;
    pl.play && pl.play().catch(() => {});
    const mb = (blob.size / 1048576).toFixed(1);
    $('#vidInfo').textContent = `${fmt(dur || 0)} · ${ext.toUpperCase()} · ${mb} МБ${ext === 'webm' ? ' · если приложение не примет WebM, сохрани и загрузи вручную' : ''}`;
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [this.file] })); } catch (e) { canShare = false; }
    $('#vidShare').classList.toggle('hidden', !canShare);
    $('#vid').classList.remove('hidden');
  }

  async share() {
    if (!this.file) return;
    try {
      await navigator.share({
        files: [this.file],
        title: 'Kaboom Sandbox',
        text: `💥 Kaboom Sandbox — играй бесплатно: https://${gameUrl()} #kaboomsandbox`,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      this.download();
    }
  }

  download() {
    if (!this.url) return;
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.game.ui.toast('Видео сохранено в «Загрузки»');
  }

  closeResult() {
    const pl = $('#vidPlayer');
    pl.pause && pl.pause();
    pl.removeAttribute('src');
    pl.load && pl.load();
    $('#vid').classList.add('hidden');
  }
}
