// Частицы, следы на земле, трассеры, вспышки, ударные волны, ядерный гриб.
import { rand, pick, clamp, TAU, len } from './util.js';
import { sfx } from './audio.js';

const sfxSplash = (pos, k) => sfx.splash(pos, k);

const sprites = new Map();
function softSprite(color, hard = 0) {
  const key = color + hard;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(clamp(hard, 0, 0.9), color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  sprites.set(key, c);
  return c;
}

const BLOOD = { blood: '#8a0b0b', zblood: '#3f5a12', oil: '#16161a', juice: '#d8344a', water: '#9fd8f0' };

export class Effects {
  constructor(sim) {
    this.sim = sim;
    this.ps = [];
    this.decals = [];
    this.tracers = [];
    this.rings = [];
    this.lights = [];
    this.nukes = [];
    this.quality = 1;
    this.blood = true;
    this.nukeGlow = 0;
  }

  clear() {
    this.ps.length = 0;
    this.decals.length = 0;
    this.tracers.length = 0;
    this.rings.length = 0;
    this.lights.length = 0;
    this.nukes.length = 0;
  }

  get grav() { return this.sim.def.gravity; }

  n(count) { return Math.max(1, Math.round(count * this.quality)); }

  add(p) {
    if (this.sim.silent) return;
    const cap = 900 + 1500 * Math.min(1.3, this.quality);
    if (this.ps.length > cap) this.ps.splice(0, 200);
    p.z ??= rand(-0.25, 0.25);
    p.vz ??= 0;
    p.max = p.life;
    p.rot ??= rand(0, TAU);
    p.vr ??= 0;
    p.g ??= 1;
    p.drag ??= 0;
    p.grow ??= 0;
    p.alpha ??= 1;
    this.ps.push(p);
  }

  // ---------- Готовые эффекты ----------
  bloodSpray(x, y, dx, dy, count, speed, kind = 'blood') {
    if (!this.blood && kind !== 'oil') kind = 'oil';
    const col = BLOOD[kind] || BLOOD.blood;
    for (let i = 0, n = this.n(count); i < n; i++) {
      const s = speed * rand(0.3, 1.1);
      const a = Math.atan2(dy, dx) + rand(-0.6, 0.6);
      this.add({
        type: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-1, 1),
        life: rand(1.5, 3), size: rand(0.02, 0.055), color: col, kind,
      });
    }
  }

  drip(x, y, kind = 'blood') {
    if (!this.blood && kind !== 'oil') kind = 'oil';
    this.add({ type: 'drop', x, y, vx: rand(-0.2, 0.2), vy: rand(0, 0.5), life: 3, size: rand(0.018, 0.035), color: BLOOD[kind], kind });
  }

  splash(x, y, k = 1) {
    for (let i = 0, n = this.n(14 * k + 4); i < n; i++) {
      const a = -Math.PI / 2 + rand(-0.9, 0.9);
      const s = rand(2, 6) * Math.min(1.6, k + 0.3);
      this.add({ type: 'drop', x: x + rand(-0.3, 0.3) * k, y: y - 0.02, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.6, 1.2), size: rand(0.025, 0.05), color: BLOOD.water, kind: 'water' });
    }
    this.add({ type: 'smoke', x, y: y - 0.1, vx: 0, vy: -0.5, life: 0.5, size: 0.3 * k, grow: 0.8, g: 0, drag: 2, color: '#e8f7ff', alpha: 0.6 });
    if (!this.sim.silent) sfxSplash({ x, y }, k);
  }

  bubble(x, y) {
    this.add({ type: 'bubble', x, y, vx: rand(-0.2, 0.2), vy: rand(-1.2, -0.6), life: rand(0.5, 1.1), size: rand(0.015, 0.035), g: 0, color: '#e8f7ff' });
  }

  sparks(x, y, count = 8, speed = 1, dx = 0, dy = -1) {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = Math.atan2(dy, dx) + rand(-1.3, 1.3);
      const s = rand(3, 11) * speed;
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.5), size: 0.02, color: pick(['#fff6c0', '#ffd25a', '#ffb02e']), bounce: 0.4 });
    }
    this.light(x, y, 1.2, 0.08, '#ffc870');
  }

  dust(x, y, count = 5, color = '#b9a58a', size = 0.25) {
    for (let i = 0, n = this.n(count); i < n; i++) {
      this.add({ type: 'smoke', x: x + rand(-0.1, 0.1), y, vx: rand(-1, 1), vy: rand(-1.5, -0.2), life: rand(0.6, 1.4), size: size * rand(0.6, 1.2), grow: 0.6, g: -0.05, drag: 2, color, alpha: 0.55 });
    }
  }

  chunks(x, y, count, colors, size = 0.08, speed = 4) {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.5, 1) * speed;
      this.add({ type: 'chunk', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life: rand(2, 4), size: size * rand(0.5, 1.3), color: pick(colors), vr: rand(-15, 15), bounce: 0.3 });
    }
  }

  glassShards(x, y, count = 14, speed = 4) {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.3, 1) * speed;
      this.add({ type: 'shard', x: x + rand(-0.3, 0.3), y: y + rand(-0.5, 0.5), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(2, 4), size: rand(0.04, 0.12), color: pick(['#cfefff', '#a9dcf7', '#e8fbff']), vr: rand(-20, 20), bounce: 0.25 });
    }
  }

  impact(mat, x, y, nx, ny, k = 1) {
    switch (mat) {
      case 'metal': case 'armor':
        this.sparks(x, y, 7 * k, 0.9, nx, ny);
        break;
      case 'wood':
        this.chunks(x, y, 4 * k, ['#a8743f', '#c99a5e', '#7c5229'], 0.05, 3);
        this.dust(x, y, 2, '#c9a77a', 0.12);
        break;
      case 'stone':
        this.chunks(x, y, 4 * k, ['#9a9a9a', '#7b7b7b', '#b8b2a8'], 0.05, 3);
        this.dust(x, y, 3, '#aaa49a', 0.18);
        break;
      case 'glass':
        this.glassShards(x, y, 4, 2);
        break;
      case 'flesh': this.bloodSpray(x, y, nx, ny, 10 * k, 3, 'blood'); break;
      case 'zombie': this.bloodSpray(x, y, nx, ny, 10 * k, 3, 'zblood'); break;
      case 'melon': this.bloodSpray(x, y, nx, ny, 10 * k, 3, 'juice'); break;
      case 'bone': this.chunks(x, y, 4 * k, ['#efe6cf', '#d8ccb0'], 0.04, 3); break;
      case 'ground':
      default:
        this.dust(x, y, 4 * k, this.sim.def.dust || '#b9a58a', 0.2);
        this.chunks(x, y, 3 * k, this.sim.def.debris || ['#7a6a55', '#5c4f3e'], 0.04, 3);
    }
  }

  muzzle(x, y, dx, dy, size = 1) {
    this.add({ type: 'flash', x: x + dx * 0.08 * size, y: y + dy * 0.08 * size, vx: 0, vy: 0, life: 0.05, size: 0.25 * size, color: '#ffd27a', g: 0 });
    for (let i = 0; i < 3; i++) {
      this.add({ type: 'fire', x, y, vx: dx * rand(3, 8) * size, vy: dy * rand(3, 8) * size, life: rand(0.04, 0.09), size: 0.08 * size, grow: 1, g: 0 });
    }
    for (let i = 0, n = this.n(2 + size); i < n; i++) {
      this.add({ type: 'smoke', x, y, vx: dx * rand(0.5, 2) + rand(-0.3, 0.3), vy: dy * rand(0.5, 2) - 0.3, life: rand(0.5, 1.2), size: 0.08 * size, grow: 0.5 * size, g: -0.08, drag: 2.5, color: '#c8c8c8', alpha: 0.35 });
    }
    this.light(x, y, 2.5 * size, 0.06, '#ffcf7a');
  }

  casing(x, y, vx, vy, big = false) {
    this.add({ type: 'casing', x, y, vx, vy, life: 4, size: big ? 0.05 : 0.03, color: '#d6a64a', vr: rand(-30, 30), bounce: 0.35 });
  }

  smokePuff(x, y, size = 0.4, color = '#9a9a9a', alpha = 0.5) {
    this.add({ type: 'smoke', x, y, vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.1), life: rand(0.8, 1.6), size, grow: size, g: -0.06, drag: 1.5, color, alpha });
  }

  flame(x, y, size = 0.3) {
    this.add({ type: 'fire', x: x + rand(-0.05, 0.05), y, vx: rand(-0.4, 0.4), vy: rand(-1.8, -0.6), life: rand(0.2, 0.5), size, grow: -size, g: 0 });
  }

  tracer(x1, y1, x2, y2, color = '#ffe7a0', w = 1) {
    if (this.sim.silent) return;
    this.tracers.push({ x1, y1, x2, y2, life: 0.07, max: 0.07, color, w });
  }

  light(x, y, r, life, color = '#ffd58a') {
    if (this.sim.silent) return;
    if (this.lights.length > 60) this.lights.shift();
    this.lights.push({ x, y, r, life, max: life, color });
  }

  ring(x, y, maxR, life = 0.45, color = 'rgba(255,255,255,0.7)') {
    this.rings.push({ x, y, r: 0, maxR, life, max: life, color });
  }

  decal(x, z, r, color, alpha = 0.85, kind = 'pool') {
    if (this.sim.silent) return;
    if (this.decals.length > 700) this.decals.splice(0, 60);
    this.decals.push({ x, z, r, color, alpha, kind, sx: rand(0.7, 1.3) });
  }

  explosion(x, y, P, R, nuke) {
    if (this.sim.silent) return;
    const sp = Math.sqrt(P);
    this.light(x, y, R * (nuke ? 5 : 1.8), nuke ? 1.6 : 0.35, '#ffc670');
    this.add({ type: 'flash', x, y, vx: 0, vy: 0, life: nuke ? 0.6 : 0.1, size: R * (nuke ? 0.35 : 0.16), color: '#fff3c4', g: 0 });
    const nf = nuke ? 90 : Math.min(60, 14 + P * 12);
    for (let i = 0, n = this.n(nf); i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(1, 7) * sp * (nuke ? 0.6 : 1);
      this.add({ type: 'fire', x, y, z: rand(-1, 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5 * sp, life: rand(0.35, 0.9) * (nuke ? 2.5 : 1), size: rand(0.4, 1.0) * sp * (nuke ? 0.7 : 1), grow: 0.6 * sp, g: -0.25, drag: 2.2 });
    }
    const ns = nuke ? 50 : Math.min(36, 8 + P * 7);
    for (let i = 0, n = this.n(ns); i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.5, 3.5) * sp * (nuke ? 0.6 : 1);
      this.add({ type: 'smoke', x, y, z: rand(-1, 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2 * sp, life: rand(2, 4), size: rand(0.5, 1.1) * sp, grow: 0.6 * sp, g: -0.12, drag: 1.4, color: pick(['#4a4541', '#5e5853', '#77706a']), alpha: 0.45 });
    }
    for (let i = 0, n = this.n(nuke ? 40 : 18); i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(6, 20) * Math.min(sp, 3);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, life: rand(0.4, 1.2), size: 0.03, color: pick(['#fff1b0', '#ffc24a', '#ff8a2a']), bounce: 0.3 });
    }
    if (y > -R * 0.5) {
      this.chunks(x, 0 - 0.05, nuke ? 40 : 6 + P * 4, this.sim.def.debris || ['#6b5a45', '#4f4233'], 0.07 * sp, 6 * sp);
      for (let i = 0, n = this.n(nuke ? 30 : 10); i < n; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.add({ type: 'smoke', x, y: -0.2, z: rand(-1.5, 1.5), vx: dir * rand(3, 9) * sp, vy: rand(-0.6, 0), life: rand(1, 2.2), size: 0.5 * sp, grow: 0.6 * sp, g: -0.02, drag: 2, color: this.sim.def.dust || '#b9a58a', alpha: 0.5 });
      }
      this.decal(x, rand(-0.3, 0.3), R * (nuke ? 0.7 : 0.38), '#141110', 0.8, 'scorch');
    }
    this.ring(x, y, R * (nuke ? 3 : 1.25), nuke ? 2.2 : 0.4, nuke ? 'rgba(255,240,210,0.8)' : 'rgba(255,255,255,0.55)');
    if (nuke) this.nukes.push({ x, t: 0 });
  }

  // ---------- Обновление ----------
  update(dt) {
    const g = this.grav;
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += g * p.g * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      if (p.size <= 0.001) continue;
      if ((p.type === 'smoke' || p.type === 'fire') && p.y > -p.size * 0.6) {
        p.y = -p.size * 0.6;
        if (p.vy > 0) p.vy *= -0.3;
      }
      if (p.y > -p.size * 0.3 && p.type !== 'smoke' && p.type !== 'fire' && p.type !== 'flash') {
        if (p.type === 'drop') {
          if (p.kind !== 'water') this.decal(p.x, p.z, p.size * rand(2.5, 4.5), p.color, 0.85);
          continue;
        }
        p.y = -p.size * 0.3;
        if (p.vy > 0) p.vy *= -(p.bounce || 0.2);
        p.vx *= 0.6; p.vr *= 0.6;
        if (Math.abs(p.vy) < 0.4) p.vy = 0;
      }
      ps[w++] = p;
    }
    ps.length = w;

    for (const arr of [this.tracers, this.lights, this.rings]) {
      let k = 0;
      for (const t of arr) {
        t.life -= dt;
        if (t.r !== undefined && t.maxR) t.r = t.maxR * (1 - Math.pow(t.life / t.max, 2));
        if (t.life > 0) arr[k++] = t;
      }
      arr.length = k;
    }

    // Ядерный гриб: столб и шапка из дыма и огня.
    this.nukeGlow = 0;
    for (const nk of this.nukes) {
      nk.t += dt;
      const t = nk.t;
      this.nukeGlow = Math.max(this.nukeGlow, clamp(1 - t / 14, 0, 1));
      const h = Math.min(30, 5 + t * 7);
      const rate = t < 10 ? 50 : 10;
      let cnt = rate * dt * this.quality;
      while (cnt > 0) {
        if (Math.random() > cnt) break;
        cnt -= 1;
        const hot = clamp(1 - t / 6, 0, 1);
        if (Math.random() < 0.55) {
          const yy = -rand(0, h);
          this.add({ type: 'smoke', x: nk.x + rand(-2, 2) * (1 + -yy / 40), y: yy, z: rand(-2, 2), vx: rand(-0.5, 0.5), vy: -rand(2, 6), life: rand(3, 6), size: rand(2, 3.5), grow: 0.6, g: 0, drag: 0.6, color: Math.random() < hot ? '#c8642a' : pick(['#5a4c44', '#6d5f55', '#3f3530']), alpha: 0.7 });
        } else {
          const a = rand(0, TAU);
          const cr = 7 + Math.min(t, 10) * 1.3;
          this.add({ type: 'smoke', x: nk.x + Math.cos(a) * cr * rand(0.2, 1), y: -h + Math.sin(a) * cr * 0.45 * rand(0.2, 1), z: rand(-3, 3), vx: Math.cos(a) * 2, vy: -rand(1, 3), life: rand(4, 7), size: rand(3.5, 6), grow: 0.8, g: 0, drag: 0.5, color: Math.random() < hot ? pick(['#ff9a3c', '#e36a2a']) : pick(['#6d5f55', '#857467', '#4e433c']), alpha: 0.75 });
          if (Math.random() < hot) this.add({ type: 'fire', x: nk.x + rand(-cr, cr) * 0.6, y: -h + rand(-3, 3), z: rand(-2, 2), vx: rand(-1, 1), vy: -rand(1, 3), life: rand(0.8, 1.6), size: rand(2.5, 5), grow: 0, g: 0 });
        }
      }
    }
    this.nukes = this.nukes.filter((n) => n.t < 16);
  }

  // ---------- Отрисовка ----------
  drawDecals(r) {
    const ctx = r.ctx;
    r.screen();
    for (const d of this.decals) {
      const [cx, cy] = r.P(d.x, 0, d.z);
      const k = r.k(d.z);
      const rx = d.r * k * d.sx;
      if (cx + rx < 0 || cx - rx > r.W) continue;
      const [, y1] = r.P(d.x, 0, d.z - d.r);
      const [, y2] = r.P(d.x, 0, d.z + d.r);
      const ry = Math.max(0.5, Math.abs(y1 - y2) / 2);
      if (d.kind === 'scorch') {
        ctx.globalAlpha = d.alpha;
        ctx.drawImage(softSprite('#120d0a', 0.35), cx - rx, cy - ry, rx * 2, ry * 2);
      } else {
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
        ctx.fill();
        // Влажный блеск луж.
        if (r.q.wet && rx > 4) {
          ctx.globalAlpha = 0.22 * d.alpha;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(cx - rx * 0.25, cy - ry * 0.3, rx * 0.35, ry * 0.22, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  draw(r) {
    const ctx = r.ctx;
    r.screen();
    const W = r.W, H = r.H;
    // Обычные частицы.
    for (const p of this.ps) {
      if (p.type === 'fire' || p.type === 'spark' || p.type === 'flash') continue;
      const [sx, sy] = r.P(p.x, p.y, p.z);
      const s = p.size * r.k(p.z);
      if (sx < -s - 20 || sx > W + s + 20 || sy < -s - 20 || sy > H + s + 20) continue;
      const lt = p.life / p.max;
      switch (p.type) {
        case 'smoke': {
          ctx.globalAlpha = p.alpha * Math.min(1, lt * 1.6);
          ctx.drawImage(softSprite(p.color, 0.15), sx - s, sy - s, s * 2, s * 2);
          break;
        }
        case 'bubble':
          ctx.globalAlpha = Math.min(1, lt * 2) * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.2, s), 0, TAU); ctx.stroke();
          break;
        case 'drop':
          ctx.globalAlpha = 1;
          ctx.fillStyle = p.color;
          if (s < 2) ctx.fillRect(sx - 1, sy - 1, 2, 2);
          else { ctx.beginPath(); ctx.arc(sx, sy, s, 0, TAU); ctx.fill(); }
          break;
        default: {
          ctx.globalAlpha = Math.min(1, lt * 3);
          const c = Math.cos(p.rot), si = Math.sin(p.rot);
          ctx.setTransform(r.dpr * c, r.dpr * si, -r.dpr * si, r.dpr * c, r.dpr * sx, r.dpr * sy);
          ctx.fillStyle = p.color;
          if (p.type === 'shard') {
            ctx.beginPath();
            ctx.moveTo(-s, s * 0.6); ctx.lineTo(s * 0.2, -s); ctx.lineTo(s, s * 0.8);
            ctx.closePath(); ctx.fill();
          } else if (p.type === 'casing') {
            ctx.fillRect(-s * 1.2, -s * 0.45, s * 2.4, s * 0.9);
          } else {
            ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
          }
          r.screen();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Светящиеся частицы рисуются после ночного освещения, чтобы не тускнели.
  drawGlow(r) {
    const ctx = r.ctx;
    r.screen();
    const W = r.W, H = r.H;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (p.type !== 'fire' && p.type !== 'spark' && p.type !== 'flash') continue;
      const [sx, sy] = r.P(p.x, p.y, p.z);
      const s = Math.max(1, p.size * r.k(p.z));
      if (sx < -s - 40 || sx > W + s + 40 || sy < -s - 40 || sy > H + s + 40) continue;
      const lt = p.life / p.max;
      if (p.type === 'spark') {
        const k = r.k(p.z);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = Math.min(1, lt * 2);
        ctx.lineWidth = Math.max(1, 0.025 * k);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * 0.025 * k, sy - p.vy * 0.025 * k);
        ctx.stroke();
      } else if (p.type === 'flash') {
        ctx.globalAlpha = lt;
        ctx.drawImage(softSprite('#fff4d0', 0.2), sx - s * 2, sy - s * 2, s * 4, s * 4);
      } else {
        ctx.globalAlpha = Math.min(1, lt * 1.5) * (s > 18 ? 0.5 : 0.75);
        const col = lt > 0.65 ? '#ffd88a' : lt > 0.3 ? '#ff9a32' : '#d4471c';
        ctx.drawImage(softSprite(col, 0.3), sx - s, sy - s, s * 2, s * 2);
      }
    }
    ctx.lineWidth = 1;
    for (const t of this.tracers) {
      const [x1, y1] = r.P(t.x1, t.y1, 0);
      const [x2, y2] = r.P(t.x2, t.y2, 0);
      ctx.globalAlpha = t.life / t.max;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1, 0.03 * r.k(0) * t.w);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (r.q.bloom) this.bloom(r);
    for (const g of this.rings) {
      const [cx, cy] = r.P(g.x, g.y, 0);
      const rr = g.r * r.k(0);
      ctx.globalAlpha = clamp(g.life / g.max, 0, 1);
      ctx.strokeStyle = g.color;
      ctx.lineWidth = Math.max(1.5, rr * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Свечение (bloom): яркие частицы в низком разрешении, растянутые и сложенные.
  bloom(r) {
    let any = false;
    for (const p of this.ps) if (p.type === 'fire' || p.type === 'flash') { any = true; break; }
    if (!any) return;
    const o = r.offscreen('bloom', 0.25);
    const c = o.cv.getContext('2d');
    const sc = o.scale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, o.cv.width, o.cv.height);
    c.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (p.type !== 'fire' && p.type !== 'flash') continue;
      const [sx, sy] = r.P(p.x, p.y, p.z);
      const s = Math.max(2, p.size * r.k(p.z)) * 2.6;
      const lt = p.life / p.max;
      c.globalAlpha = Math.min(1, lt * 1.5) * (p.type === 'flash' ? 0.6 : 0.22);
      c.drawImage(softSprite(p.type === 'flash' ? '#fff0c8' : '#ff8a30', 0), (sx - s) * sc, (sy - s) * sc, s * 2 * sc, s * 2 * sc);
    }
    const ctx = r.ctx;
    r.screen();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(o.cv, 0, 0, r.W, r.H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Динамический свет (вспышки) рисуется поверх освещения сцены.
  drawLights(r) {
    if (!this.lights.length) return;
    const ctx = r.ctx;
    r.screen();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      const [cx, cy] = r.P(l.x, l.y, 0);
      const rr = l.r * r.k(0);
      ctx.globalAlpha = clamp(l.life / l.max, 0, 1) * 0.55;
      ctx.drawImage(softSprite(l.color, 0), cx - rr, cy - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export { softSprite };
