// Миры: фон в настоящей перспективе (параллакс получается сам), земля, свет.
import { seeded, shade, rgba, TAU, clamp, mix } from './util.js';
import { texPattern, TEX } from './textures.js';

const NEAR_Z = -3;

function sky(r, stops) {
  const ctx = r.ctx;
  r.screen();
  const g = ctx.createLinearGradient(0, 0, 0, r.vp.y + 1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r.W, r.vp.y + 1);
}

function haze(r, color, up = 40, down = 30, a = 0.65) {
  const ctx = r.ctx;
  r.screen();
  const y = r.vp.y;
  const g = ctx.createLinearGradient(0, y - up, 0, y + down);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.55, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, y - up, r.W, up + down);
}

function groundBand(r, z0, z1, color) {
  const [xa, xb] = r.xRange(Math.max(z0, z1), 4);
  r.screen();
  r.groundQuad(0, z0, z1, xa, xb);
  r.ctx.fillStyle = color;
  r.ctx.fill();
  // Текстура грунта на высоком качестве (только ближние полосы).
  if (r.q.tex && z0 < 30) {
    const ctx = r.ctx;
    r.face(Math.max(0, z0));
    ctx.fillStyle = texPattern(ctx, 'ground');
    ctx.globalAlpha = TEX.ground.a;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    r.screen();
  }
}

// Линии на земле вдоль X (разметка, швы плитки).
function groundLineX(r, z, color, w = 1, dash = null) {
  const ctx = r.ctx;
  const [xa, xb] = r.xRange(z, 2);
  r.screen();
  const a = r.P(xa, 0, z), b = r.P(xb, 0, z);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (dash) {
    // Пунктир в мировых метрах: рисуем отрезками.
    const [len, gap] = dash;
    const start = Math.floor(xa / (len + gap)) * (len + gap);
    ctx.beginPath();
    for (let x = start; x < xb; x += len + gap) {
      const p = r.P(x, 0, z), q = r.P(x + len, 0, z);
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}

function groundFront(r, color, line) {
  const ctx = r.ctx;
  const [xa, xb] = r.xRange(NEAR_Z, 4);
  r.face(NEAR_Z);
  ctx.fillStyle = color;
  ctx.fillRect(xa, 0, xb - xa, 60);
  ctx.fillStyle = shade(color, -0.15);
  for (let y = 0.8; y < 12; y += 1.6) ctx.fillRect(xa, y, xb - xa, 0.25);
  if (line) {
    ctx.fillStyle = line;
    ctx.fillRect(xa, 0, xb - xa, 0.12);
  }
  r.screen();
}

// Мир бесконечный по ширине: декорации генерируются на участке длиной period
// и повторяются вокруг камеры. Для цикла for..of это обычный массив.
let CAMX = 0;
class Periodic {
  constructor(list, period) {
    this.list = list;
    this.period = period;
    this.cache = new Map();
  }

  copies(k) {
    let c = this.cache.get(k);
    if (!c) {
      if (this.cache.size > 8) this.cache.clear();
      const off = k * this.period;
      c = this.list.map((it) => (typeof it === 'number' ? it + off : { ...it, x: it.x + off }));
      this.cache.set(k, c);
    }
    return c;
  }

  *[Symbol.iterator]() {
    const kc = Math.round(CAMX / this.period);
    for (let k = kc - 1; k <= kc + 1; k++) yield* (k === 0 ? this.list : this.copies(k));
  }
}
const per = (list, period) => new Periodic(list, period);

// Генерация раскладки декораций (один раз на мир).
const layouts = new Map();
function layout(id, fn) {
  let l = layouts.get(id);
  if (!l) { l = fn(seeded(id.length * 7919 + 17)); layouts.set(id, l); }
  return l;
}

function windowsGrid(ctx, x0, y0, x1, y1, cw, ch, color, litColor, rnd, litP = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const lit = [];
  for (let y = y0 + ch * 0.6; y < y1 - ch * 1.2; y += ch * 1.6) {
    for (let x = x0 + cw * 0.6; x < x1 - cw; x += cw * 1.7) {
      if (litP && rnd() < litP) lit.push([x, y]);
      else ctx.rect(x, y, cw, ch);
    }
  }
  ctx.fill();
  return lit;
}

// ---------------- Город ----------------
function cityLayout(rnd) {
  const far = [], mid = [], near = [], lamps = [], trees = [];
  for (let x = -700; x < 700; x += 14 + rnd() * 22) far.push({ x, w: 14 + rnd() * 26, h: 25 + rnd() * 60 });
  for (let x = -260; x < 260; x += 10 + rnd() * 10) mid.push({ x, w: 9 + rnd() * 10, h: 12 + rnd() * 30, c: ['#9aa7b4', '#b6a998', '#8d9aa8', '#a7b0a0', '#c2b6a8'][Math.floor(rnd() * 5)] });
  for (let x = -130; x < 130; ) {
    const w = 8 + rnd() * 7;
    near.push({
      x, w, h: 8 + rnd() * 16,
      c: ['#d0a77b', '#c97b63', '#9fb3c8', '#e2d4b7', '#8fa58b', '#d9c48f', '#b48f8f'][Math.floor(rnd() * 7)],
      seed: Math.floor(rnd() * 1e6),
      shop: rnd() < 0.5,
    });
    x += w + 1 + rnd() * 5;
  }
  for (let x = -130; x < 130; x += 16) lamps.push(x + rnd() * 2);
  for (let x = -122; x < 130; x += 16) if (rnd() < 0.7) trees.push({ x: x + rnd() * 3, s: 0.8 + rnd() * 0.5 });
  const clouds = [];
  for (let i = 0; i < 14; i++) clouds.push({ x: -1200 + rnd() * 2400, y: -90 - rnd() * 130, s: 0.6 + rnd() * 1.2 });
  return { far: per(far, 1400), mid: per(mid, 520), near: per(near, 260), lamps: per(lamps, 260), trees: per(trees, 260), clouds };
}

function drawCity(r, t, night) {
  const L = layout('city', cityLayout);
  const ctx = r.ctx;
  if (night) sky(r, ['#060b1a', '#14204a', '#3a3f6e']);
  else sky(r, ['#3f86d8', '#7db8ec', '#cfe9ff']);
  // Солнце / луна.
  r.screen();
  const sx = r.W * 0.78 - r.cam.x * 0.4, sy = r.vp.y * 0.38 - (r.cam.y + 4) * 0.3;
  if (night) {
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.arc(sx, sy, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#14204a';
    ctx.beginPath(); ctx.arc(sx + 9, sy - 5, 19, 0, TAU); ctx.fill();
    const rnd = seeded(3);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const x = ((rnd() * r.W * 2 - r.cam.x * 0.2) % r.W + r.W) % r.W;
      const y = rnd() * r.vp.y * 0.9;
      ctx.globalAlpha = 0.3 + rnd() * 0.7;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  } else {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.18, 'rgba(255,240,190,0.95)');
    g.addColorStop(0.35, 'rgba(255,230,170,0.25)');
    g.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
  }
  // Облака.
  for (const c of L.clouds) {
    const x = r.cam.x + ((((c.x + t * 1.5 - r.cam.x) % 2400) + 3600) % 2400) - 1200;
    const [cx, cy] = r.P(x, c.y, 500);
    const k = r.k(500) * c.s;
    if (cx < -200 || cx > r.W + 200) continue;
    ctx.fillStyle = night ? 'rgba(60,70,110,0.5)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40 * k, 9 * k, 0, 0, TAU);
    ctx.ellipse(cx - 14 * k, cy - 6 * k, 18 * k, 10 * k, 0, 0, TAU);
    ctx.ellipse(cx + 12 * k, cy - 8 * k, 22 * k, 12 * k, 0, 0, TAU);
    ctx.fill();
  }
  // Дальний силуэт города.
  const zf = 220;
  r.face(zf);
  ctx.fillStyle = night ? '#1f2a4f' : '#9dbad6';
  const [fa, fb] = r.xRange(zf, 30);
  ctx.beginPath();
  for (const b of L.far) {
    if (b.x + b.w < fa || b.x > fb) continue;
    ctx.rect(b.x, -b.h, b.w, b.h);
  }
  ctx.fill();
  haze(r, night ? '#3a3f6e' : '#cfe9ff', 50, 20, 0.7);
  // Земля.
  r.screen();
  ctx.fillStyle = night ? '#1b1d24' : '#8e9196';
  ctx.fillRect(0, r.vp.y, r.W, r.H - r.vp.y);
  groundBand(r, 16, 2000, night ? '#23252c' : '#9a9da2');
  groundBand(r, 5.3, 16, night ? '#3a3b40' : '#b9b6ae');
  groundBand(r, NEAR_Z, 5, night ? '#24252a' : '#46494f');
  for (let z = 6.5; z < 16; z += 1.6) groundLineX(r, z, night ? 'rgba(0,0,0,0.25)' : 'rgba(80,75,65,0.25)', 1);
  groundLineX(r, 1.2, night ? '#b8a24a' : '#f2d04b', Math.max(1, r.k(1.2) * 0.12), [3, 3]);
  groundLineX(r, -2.6, 'rgba(255,255,255,0.55)', Math.max(1, r.k(-2.6) * 0.1));
  groundLineX(r, 4.6, 'rgba(255,255,255,0.55)', Math.max(1, r.k(4.6) * 0.1));
  // Средний план.
  const zm = 70;
  r.face(zm);
  const [ma, mb] = r.xRange(zm, 20);
  for (const b of L.mid) {
    if (b.x + b.w < ma || b.x > mb) continue;
    ctx.fillStyle = night ? shade(b.c, -0.72) : mix(b.c, '#cfe9ff', 0.35);
    ctx.fillRect(b.x, -b.h, b.w, b.h);
    ctx.fillStyle = night ? 'rgba(255,220,140,0.55)' : 'rgba(60,80,100,0.35)';
    ctx.beginPath();
    for (let y = -b.h + 1.5; y < -1.5; y += 2.6) for (let x = b.x + 0.8; x < b.x + b.w - 1; x += 1.9) if (!night || ((x * 7 + y * 13) | 0) % 3 === 0) ctx.rect(x, y, 1, 1.3);
    ctx.fill();
  }
  // Бордюр.
  r.box3d(r.xRange(5, 4)[0], -0.18, r.xRange(5, 4)[1], 0, 5, 5.3, night ? '#55565c' : '#c9c6bd', null, { side: '#8a877f' });
  // Ближние дома.
  const [na, nb] = r.xRange(16, 10);
  const lit = [];
  for (const b of L.near) {
    if (b.x + b.w < na || b.x > nb) continue;
    const rnd = seeded(b.seed);
    const col = night ? shade(b.c, -0.6) : b.c;
    r.box3d(b.x, -b.h, b.x + b.w, 0, 16, 26, col, (c) => {
      const lw = windowsGrid(c, b.x, -b.h, b.x + b.w, b.shop ? -3.4 : -0.5, 1.1, 1.5, night ? '#1d2436' : '#5f7d99', '#ffd27a', rnd, night ? 0.45 : 0);
      for (const w of lw) lit.push(w);
      c.fillStyle = shade(col, -0.25);
      c.fillRect(b.x - 0.2, -b.h - 0.4, b.w + 0.4, 0.5);
      if (b.shop) {
        c.fillStyle = night ? '#2b3550' : '#7fb0d0';
        c.fillRect(b.x + 0.6, -2.8, b.w - 1.2, 2.2);
        c.fillStyle = ['#c0392b', '#2e86de', '#27ae60', '#e67e22'][b.seed % 4];
        c.fillRect(b.x + 0.4, -3.4, b.w - 0.8, 0.6);
      }
      c.fillStyle = shade(col, -0.45);
      c.fillRect(b.x + b.w / 2 - 0.6, -2.4, 1.2, 2.4);
    });
  }
  L.lit = lit;
  // Деревья и фонари на тротуаре.
  for (const tr of L.trees) {
    const z = 8.5;
    const [tx, ty] = r.P(tr.x, 0, z);
    if (tx < -100 || tx > r.W + 100) continue;
    r.face(z);
    ctx.fillStyle = night ? '#2a1e15' : '#6b4a2e';
    ctx.fillRect(tr.x - 0.15, -2.6 * tr.s, 0.3, 2.6 * tr.s);
    ctx.fillStyle = night ? '#16301f' : '#3f8a46';
    ctx.beginPath();
    ctx.arc(tr.x, -3.6 * tr.s, 1.5 * tr.s, 0, TAU);
    ctx.arc(tr.x - 0.9 * tr.s, -3.0 * tr.s, 1.0 * tr.s, 0, TAU);
    ctx.arc(tr.x + 0.9 * tr.s, -3.1 * tr.s, 1.1 * tr.s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = night ? 'rgba(80,120,90,0.25)' : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(tr.x - 0.4 * tr.s, -4.1 * tr.s, 0.7 * tr.s, 0, TAU); ctx.fill();
  }
  for (const lx of L.lamps) {
    const [px] = r.P(lx, 0, 6);
    if (px < -100 || px > r.W + 100) continue;
    r.box3d(lx - 0.08, -6, lx + 0.08, 0, 6, 6.16, night ? '#30333a' : '#4a4f57');
    r.face(6);
    ctx.fillStyle = night ? '#30333a' : '#4a4f57';
    ctx.fillRect(lx - 0.08, -6.05, 1.3, 0.14);
    ctx.fillStyle = night ? '#ffe7a8' : '#e9eef2';
    ctx.fillRect(lx + 0.8, -5.95, 0.55, 0.16);
    r.screen();
  }
  groundFront(r, night ? '#2a2420' : '#6b5a48', night ? '#55565c' : '#7a7d82');
}

function cityLights(r) {
  const L = layout('city', cityLayout);
  const ctx = r.ctx;
  r.face(16);
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  for (const [x, y] of L.lit || []) ctx.rect(x, y, 1.1, 1.5);
  ctx.fill();
  r.screen();
  ctx.globalCompositeOperation = 'lighter';
  for (const lx of L.lamps) {
    const [px, py] = r.P(lx + 1.05, -5.9, 6);
    if (px < -200 || px > r.W + 200) continue;
    const rad = r.k(6) * 5;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,220,150,0.55)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    const [gx, gy] = r.P(lx + 1.05, 0, 3);
    const gr = r.k(3) * 3.5;
    const g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g2.addColorStop(0, 'rgba(255,210,140,0.3)');
    g2.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.3, 0, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------- Пустыня ----------------
function desertLayout(rnd) {
  const mesas = [], cacti = [], rocks = [], dunes = [];
  for (let x = -900; x < 900; x += 40 + rnd() * 120) mesas.push({ x, w: 40 + rnd() * 90, h: 20 + rnd() * 35 });
  for (let i = 0; i < 80; i++) cacti.push({ x: -150 + rnd() * 300, z: 4 + rnd() * 60, s: 0.7 + rnd() * 0.8, arms: rnd() });
  cacti.sort((a, b) => b.z - a.z);
  for (let i = 0; i < 70; i++) rocks.push({ x: -150 + rnd() * 300, z: 1.5 + rnd() * 30, s: 0.2 + rnd() * 0.6 });
  for (let x = -600; x < 600; x += 30 + rnd() * 40) dunes.push({ x, w: 60 + rnd() * 80, h: 4 + rnd() * 7 });
  return { mesas: per(mesas, 1800), cacti: per(cacti, 300), rocks: per(rocks, 300), dunes: per(dunes, 1200) };
}

function drawDesert(r, t) {
  const L = layout('desert', desertLayout);
  const ctx = r.ctx;
  sky(r, ['#2f3f7a', '#c9667a', '#f59a5b', '#ffd38a']);
  r.screen();
  const sx = r.W * 0.3 - r.cam.x * 0.3, sy = r.vp.y - 30 - (r.cam.y + 4) * 0.2;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160);
  g.addColorStop(0, 'rgba(255,245,200,1)');
  g.addColorStop(0.2, 'rgba(255,200,120,0.9)');
  g.addColorStop(0.45, 'rgba(255,160,90,0.25)');
  g.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - 160, sy - 160, 320, 320);
  const zf = 260;
  r.face(zf);
  ctx.fillStyle = '#a65a43';
  const [fa, fb] = r.xRange(zf, 60);
  ctx.beginPath();
  for (const m of L.mesas) {
    if (m.x + m.w < fa || m.x > fb) continue;
    ctx.moveTo(m.x - 8, 0); ctx.lineTo(m.x + 4, -m.h); ctx.lineTo(m.x + m.w - 4, -m.h); ctx.lineTo(m.x + m.w + 8, 0);
  }
  ctx.fill();
  haze(r, '#ffc98a', 50, 25, 0.75);
  r.screen();
  ctx.fillStyle = '#d9a46c';
  ctx.fillRect(0, r.vp.y, r.W, r.H - r.vp.y);
  // Дюны.
  const zd = 80;
  r.face(zd);
  ctx.fillStyle = '#d99a5e';
  const [da, db] = r.xRange(zd, 60);
  ctx.beginPath();
  ctx.moveTo(da, 0);
  for (const d of L.dunes) {
    if (d.x + d.w < da || d.x > db) continue;
    ctx.lineTo(d.x, 0);
    ctx.quadraticCurveTo(d.x + d.w * 0.4, -d.h * 2, d.x + d.w, 0);
  }
  ctx.lineTo(db, 0);
  ctx.lineTo(db, 5); ctx.lineTo(da, 5);
  ctx.fill();
  groundBand(r, NEAR_Z, 80, '#e6bb83');
  for (let z = 2; z < 60; z *= 1.35) groundLineX(r, z, 'rgba(160,110,60,0.18)', 1);
  for (const c of L.rocks) {
    const [cx] = r.P(c.x, 0, c.z);
    if (cx < -50 || cx > r.W + 50) continue;
    r.face(c.z);
    ctx.fillStyle = '#9c6b47';
    ctx.beginPath(); ctx.ellipse(c.x, 0, c.s, c.s * 0.55, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#b98660';
    ctx.beginPath(); ctx.ellipse(c.x - c.s * 0.2, -c.s * 0.15, c.s * 0.5, c.s * 0.3, 0, Math.PI, TAU); ctx.fill();
  }
  for (const c of L.cacti) {
    const [cx] = r.P(c.x, 0, c.z);
    if (cx < -80 || cx > r.W + 80) continue;
    r.face(c.z);
    const s = c.s;
    ctx.fillStyle = shade('#4f8a3c', -Math.min(0.4, c.z / 120));
    const cap = (x0, y0, x1, y1, rr) => { ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0 + rr); ctx.arc((x0 + x1) / 2, y0 + rr, rr, Math.PI, 0); ctx.lineTo(x1, y1); ctx.fill(); };
    cap(c.x - 0.3 * s, -4 * s, c.x + 0.3 * s, 0, 0.3 * s);
    if (c.arms > 0.3) { cap(c.x - 1.1 * s, -2.9 * s, c.x - 0.6 * s, -1.4 * s, 0.25 * s); ctx.fillRect(c.x - 1.1 * s, -1.65 * s, 0.9 * s, 0.45 * s); }
    if (c.arms > 0.6) { cap(c.x + 0.6 * s, -3.4 * s, c.x + 1.05 * s, -2.1 * s, 0.22 * s); ctx.fillRect(c.x + 0.2 * s, -2.35 * s, 0.85 * s, 0.4 * s); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(c.x - 0.18 * s, -3.8 * s, 0.08 * s, 3.6 * s);
  }
  groundFront(r, '#b07a48', '#c9925a');
}

// ---------------- Луна ----------------
function moonLayout(rnd) {
  const stars = [], craters = [], hills = [];
  for (let i = 0; i < 220; i++) stars.push({ x: rnd(), y: rnd(), b: rnd() });
  for (let i = 0; i < 120; i++) craters.push({ x: -200 + rnd() * 400, z: -2 + rnd() * 70, r: 0.5 + rnd() * 4 });
  for (let x = -900; x < 900; x += 30 + rnd() * 60) hills.push({ x, w: 60 + rnd() * 120, h: 6 + rnd() * 22 });
  return { stars, craters: per(craters, 400), hills: per(hills, 1800) };
}

function drawMoon(r, t) {
  const L = layout('moon', moonLayout);
  const ctx = r.ctx;
  sky(r, ['#000000', '#05060a', '#0d0f16']);
  r.screen();
  for (const s of L.stars) {
    const x = ((s.x * r.W * 1.5 - r.cam.x * 0.15) % r.W + r.W) % r.W;
    const y = s.y * r.vp.y;
    ctx.globalAlpha = 0.3 + s.b * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, s.b > 0.9 ? 2 : 1.2, s.b > 0.9 ? 2 : 1.2);
  }
  ctx.globalAlpha = 1;
  // Земля в небе.
  const ex = r.W * 0.72 - r.cam.x * 0.25, ey = r.vp.y * 0.38 - (r.cam.y + 4) * 0.2;
  const er = Math.min(r.W, r.H) * 0.09;
  const eg = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
  eg.addColorStop(0, '#8fd0ff'); eg.addColorStop(0.7, '#2f6fb6'); eg.addColorStop(1, '#173a6a');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(80,170,90,0.85)';
  ctx.beginPath(); ctx.ellipse(ex - er * 0.25, ey - er * 0.1, er * 0.35, er * 0.22, 0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex + er * 0.35, ey + er * 0.3, er * 0.22, er * 0.3, -0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(ex, ey - er * 0.55, er * 0.5, er * 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(ex + er * 0.35, ey + er * 0.1, er * 0.95, -0.9, 2.2); ctx.fill();
  // Холмы.
  const zf = 240;
  r.face(zf);
  ctx.fillStyle = '#3b3d42';
  const [fa, fb] = r.xRange(zf, 80);
  ctx.beginPath();
  ctx.moveTo(fa, 0);
  for (const h of L.hills) {
    if (h.x + h.w < fa || h.x > fb) continue;
    ctx.lineTo(h.x, 0);
    ctx.quadraticCurveTo(h.x + h.w / 2, -h.h * 2, h.x + h.w, 0);
  }
  ctx.lineTo(fb, 0); ctx.lineTo(fb, 4); ctx.lineTo(fa, 4);
  ctx.fill();
  r.screen();
  ctx.fillStyle = '#5c5e63';
  ctx.fillRect(0, r.vp.y, r.W, r.H - r.vp.y);
  groundBand(r, 40, 2000, '#6c6e73');
  groundBand(r, NEAR_Z, 40, '#8f9196');
  // Кратеры на грунте.
  for (const c of L.craters) {
    const [cx, cy] = r.P(c.x, 0, c.z);
    const rx = c.r * r.k(c.z);
    if (cx + rx < 0 || cx - rx > r.W) continue;
    const [, y1] = r.P(c.x, 0, c.z - c.r);
    const [, y2] = r.P(c.x, 0, c.z + c.r);
    const ry = Math.max(1, Math.abs(y1 - y2) / 2);
    ctx.fillStyle = 'rgba(40,42,46,0.45)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(190,192,196,0.45)';
    ctx.lineWidth = Math.max(1, ry * 0.18);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0.1, Math.PI - 0.1); ctx.stroke();
  }
  // Посадочный модуль на заднем плане.
  const lx = 18, lz = 14;
  const [px] = r.P(lx, 0, lz);
  if (px > -300 && px < r.W + 300) {
    r.box3d(lx - 1.6, -3.6, lx + 1.6, -1.6, lz, lz + 3, '#d8b44a', (c) => {
      c.fillStyle = '#2b2b2b'; c.fillRect(lx - 0.5, -3.1, 1.0, 0.7);
    });
    r.box3d(lx - 1.0, -5.0, lx + 1.0, -3.6, lz + 0.5, lz + 2.5, '#cfd3d8');
    r.face(lz);
    c2legs(ctx, lx);
    r.screen();
  }
  groundFront(r, '#5e6065', '#9a9ca1');
}
function c2legs(ctx, lx) {
  ctx.strokeStyle = '#9ea3a8'; ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(lx - 1.4, -1.7); ctx.lineTo(lx - 2.4, 0);
  ctx.moveTo(lx + 1.4, -1.7); ctx.lineTo(lx + 2.4, 0);
  ctx.stroke();
  ctx.fillStyle = '#9ea3a8';
  ctx.fillRect(lx - 2.8, -0.12, 0.8, 0.12);
  ctx.fillRect(lx + 2.0, -0.12, 0.8, 0.12);
}

// ---------------- Полигон ----------------
function drawLab(r, t) {
  const ctx = r.ctx;
  const WZ = 10;
  r.screen();
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(0, 0, r.W, r.H);
  // Задняя стена.
  r.face(WZ);
  const [wa, wb] = r.xRange(WZ, 10);
  ctx.fillStyle = '#d6dbe1';
  ctx.fillRect(wa, -40, wb - wa, 40);
  ctx.strokeStyle = 'rgba(80,90,100,0.35)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  for (let x = Math.floor(wa / 4) * 4; x < wb; x += 4) { ctx.moveTo(x, -40); ctx.lineTo(x, 0); }
  for (let y = -40; y < 0; y += 3) { ctx.moveTo(wa, y); ctx.lineTo(wb, y); }
  ctx.stroke();
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(wa, -1.4, wb - wa, 1.4);
  ctx.fillStyle = '#1e1e1e';
  ctx.beginPath();
  for (let x = Math.floor(wa); x < wb; x += 1) {
    ctx.moveTo(x, 0); ctx.lineTo(x + 0.5, 0); ctx.lineTo(x + 1.0, -1.4); ctx.lineTo(x + 0.5, -1.4);
  }
  ctx.fill();
  ctx.fillStyle = '#9aa3ad';
  ctx.font = '800 1.4px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let x = Math.floor(wa / 10) * 10; x < wb; x += 10) {
    ctx.fillStyle = 'rgba(60,70,80,0.55)';
    ctx.fillRect(x - 0.03, -3.2, 0.06, 1.6);
    ctx.save(); ctx.translate(x, -3.6); ctx.scale(0.01, 0.01);
    ctx.font = '800 100px system-ui, sans-serif';
    ctx.fillText(String(x) + ' м', 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = '#c33c3c';
  ctx.save(); ctx.translate(0, -7); ctx.scale(0.016, 0.016);
  ctx.font = '900 100px system-ui, sans-serif';
  ctx.fillText('ИСПЫТАТЕЛЬНЫЙ ПОЛИГОН', 0, 0);
  ctx.restore();
  // Окна-лампы на стене.
  ctx.fillStyle = '#f7fbff';
  for (let x = Math.floor(wa / 12) * 12 + 6; x < wb; x += 12) ctx.fillRect(x - 2, -16, 4, 0.6);
  r.screen();
  // Пол-плитка с перспективной сеткой.
  groundBand(r, NEAR_Z, WZ, '#c7ccd2');
  const [xa, xb] = r.xRange(WZ, 2);
  ctx.strokeStyle = 'rgba(90,100,110,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(xa); x < xb; x += 1) {
    const a = r.P(x, 0, NEAR_Z), b = r.P(x, 0, WZ);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  for (let z = NEAR_Z; z <= WZ; z += 1) {
    const [za, zb] = r.xRange(z, 2);
    const a = r.P(za, 0, z), b = r.P(zb, 0, z);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  groundLineX(r, 0, 'rgba(200,60,60,0.5)', Math.max(1, r.k(0) * 0.05));
  groundFront(r, '#3a3f47', '#8b929a');
}

// ---------------- Зимний лес ----------------
function winterLayout(rnd) {
  const trees = [], mountains = [], flakes = [];
  for (let i = 0; i < 260; i++) trees.push({ x: -220 + rnd() * 440, z: 6 + Math.pow(rnd(), 1.6) * 140, s: 0.7 + rnd() * 0.9 });
  trees.sort((a, b) => b.z - a.z);
  for (let x = -1200; x < 1200; x += 60 + rnd() * 140) mountains.push({ x, w: 120 + rnd() * 200, h: 40 + rnd() * 90 });
  for (let i = 0; i < 160; i++) flakes.push({ x: rnd(), y: rnd(), d: 0.3 + rnd() * 0.7, ph: rnd() * TAU });
  return { trees: per(trees, 440), mountains: per(mountains, 2400), flakes };
}

function drawWinter(r, t) {
  const L = layout('winter', winterLayout);
  const ctx = r.ctx;
  sky(r, ['#1b2747', '#4b6390', '#a9bedc', '#dbe6f3']);
  r.screen();
  const mx = r.W * 0.2 - r.cam.x * 0.3, my = r.vp.y * 0.35;
  ctx.fillStyle = 'rgba(255,255,240,0.9)';
  ctx.beginPath(); ctx.arc(mx, my, 16, 0, TAU); ctx.fill();
  const zf = 320;
  r.face(zf);
  const [fa, fb] = r.xRange(zf, 120);
  for (const m of L.mountains) {
    if (m.x + m.w < fa || m.x > fb) continue;
    ctx.fillStyle = '#6d84a6';
    ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.lineTo(m.x + m.w / 2, -m.h); ctx.lineTo(m.x + m.w, 0); ctx.fill();
    ctx.fillStyle = '#eef3fa';
    ctx.beginPath();
    ctx.moveTo(m.x + m.w * 0.36, -m.h * 0.72); ctx.lineTo(m.x + m.w / 2, -m.h); ctx.lineTo(m.x + m.w * 0.64, -m.h * 0.72);
    ctx.lineTo(m.x + m.w * 0.56, -m.h * 0.78); ctx.lineTo(m.x + m.w * 0.5, -m.h * 0.7); ctx.lineTo(m.x + m.w * 0.44, -m.h * 0.78);
    ctx.fill();
  }
  haze(r, '#dbe6f3', 50, 30, 0.8);
  r.screen();
  ctx.fillStyle = '#d5e0ee';
  ctx.fillRect(0, r.vp.y, r.W, r.H - r.vp.y);
  groundBand(r, NEAR_Z, 2000, '#eef3f9');
  for (let z = 2; z < 80; z *= 1.4) groundLineX(r, z, 'rgba(120,150,190,0.12)', 1);
  for (const tr of L.trees) {
    const [tx] = r.P(tr.x, 0, tr.z);
    if (tx < -150 || tx > r.W + 150) continue;
    r.face(tr.z);
    const s = tr.s * 1.6;
    const fog = Math.min(0.75, tr.z / 160);
    ctx.fillStyle = mix('#5a3e2b', '#b8c8df', fog);
    ctx.fillRect(tr.x - 0.2 * s, -1.2 * s, 0.4 * s, 1.2 * s);
    const green = mix('#1f4d3a', '#a9bedc', fog);
    const snow = mix('#f4f8fc', '#c9d7ea', fog);
    for (let i = 0; i < 3; i++) {
      const y = -1 * s - i * 1.3 * s;
      const w = (2.2 - i * 0.55) * s;
      ctx.fillStyle = green;
      ctx.beginPath(); ctx.moveTo(tr.x - w, y); ctx.lineTo(tr.x, y - 2.2 * s); ctx.lineTo(tr.x + w, y); ctx.fill();
      ctx.fillStyle = snow;
      ctx.beginPath(); ctx.moveTo(tr.x - w * 0.45, y - 1.2 * s); ctx.lineTo(tr.x, y - 2.2 * s); ctx.lineTo(tr.x + w * 0.45, y - 1.2 * s); ctx.lineTo(tr.x, y - 1.45 * s); ctx.fill();
    }
  }
  groundFront(r, '#c2d1e3', '#ffffff');
}

function winterSnow(r, t) {
  const L = layout('winter', winterLayout);
  const ctx = r.ctx;
  r.screen();
  ctx.fillStyle = '#ffffff';
  for (const f of L.flakes) {
    const sp = 20 + f.d * 50;
    const x = ((f.x * r.W + Math.sin(t * 0.8 + f.ph) * 15 - r.cam.x * r.cam.s * f.d * 0.3) % r.W + r.W) % r.W;
    const y = ((f.y * r.H + t * sp - r.cam.y * r.cam.s * f.d * 0.3) % r.H + r.H) % r.H;
    ctx.globalAlpha = 0.4 + f.d * 0.5;
    ctx.beginPath(); ctx.arc(x, y, 0.8 + f.d * 1.8, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------- Военная база ----------------
function baseLayout(rnd) {
  const hills = [], barracks = [], bags = [], posts = [];
  for (let x = -900; x < 900; x += 50 + rnd() * 100) hills.push({ x, w: 120 + rnd() * 160, h: 15 + rnd() * 25 });
  for (let x = -140; x < 140; x += 22 + rnd() * 10) barracks.push({ x, w: 12 + rnd() * 5, h: 3.5 + rnd() * 1.5 });
  for (let x = -120; x < 120; x += 9 + rnd() * 12) bags.push({ x, n: 3 + Math.floor(rnd() * 3) });
  for (let x = -150; x < 150; x += 3) posts.push(x);
  return { hills: per(hills, 1800), barracks: per(barracks, 280), bags: per(bags, 240), posts: per(posts, 300) };
}

function drawBase(r, t) {
  const L = layout('base', baseLayout);
  const ctx = r.ctx;
  sky(r, ['#7d8a97', '#a9b4bd', '#d5dad8']);
  const zf = 260;
  r.face(zf);
  ctx.fillStyle = '#6f7a62';
  const [fa, fb] = r.xRange(zf, 80);
  ctx.beginPath(); ctx.moveTo(fa, 0);
  for (const h of L.hills) { if (h.x + h.w < fa || h.x > fb) continue; ctx.lineTo(h.x, 0); ctx.quadraticCurveTo(h.x + h.w / 2, -h.h * 2, h.x + h.w, 0); }
  ctx.lineTo(fb, 0); ctx.lineTo(fb, 4); ctx.lineTo(fa, 4); ctx.fill();
  haze(r, '#d5dad8', 40, 25, 0.7);
  r.screen();
  ctx.fillStyle = '#7b7356';
  ctx.fillRect(0, r.vp.y, r.W, r.H - r.vp.y);
  groundBand(r, 22, 2000, '#7f7a58');
  groundBand(r, 6, 22, '#8d8565');
  groundBand(r, NEAR_Z, 6, '#9a9384');
  for (let z = -2; z < 6; z += 2) groundLineX(r, z, 'rgba(60,60,55,0.18)', 1);
  // Казармы и ангар.
  for (const b of L.barracks) {
    const [px] = r.P(b.x, 0, 40);
    if (px < -400 || px > r.W + 400) continue;
    r.box3d(b.x, -b.h, b.x + b.w, 0, 40, 48, '#7a8063', (c) => {
      c.fillStyle = '#3c4232';
      for (let x = b.x + 1; x < b.x + b.w - 1; x += 2.2) c.fillRect(x, -b.h + 1, 1.1, 0.9);
      c.fillStyle = '#5c624a'; c.fillRect(b.x - 0.3, -b.h - 0.4, b.w + 0.6, 0.45);
    });
  }
  const hx = 12;
  r.box3d(hx, -8, hx + 22, 0, 24, 40, '#6d7458', (c) => {
    c.fillStyle = '#4c5240';
    c.beginPath(); c.moveTo(hx, -8); c.quadraticCurveTo(hx + 11, -15, hx + 22, -8); c.fill();
    c.fillStyle = '#2f3328'; c.fillRect(hx + 4, -6.5, 14, 6.5);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.15;
    for (let x = hx + 5.5; x < hx + 18; x += 1.5) { c.beginPath(); c.moveTo(x, -6.5); c.lineTo(x, 0); c.stroke(); }
    c.fillStyle = '#e8e2c8';
    c.save(); c.translate(hx + 9.5, -9.3); c.scale(0.02, 0.02); c.font = '900 100px system-ui, sans-serif'; c.fillText('★ 07', 0, 0); c.restore();
  });
  // Вышка.
  const tx = -14;
  r.face(14);
  ctx.strokeStyle = '#3d3a30'; ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(tx - 1.6, 0); ctx.lineTo(tx - 1.0, -7); ctx.moveTo(tx + 1.6, 0); ctx.lineTo(tx + 1.0, -7);
  ctx.moveTo(tx - 1.4, -2); ctx.lineTo(tx + 1.2, -4.5); ctx.moveTo(tx + 1.4, -2); ctx.lineTo(tx - 1.2, -4.5);
  ctx.stroke();
  r.box3d(tx - 1.5, -9, tx + 1.5, -7, 13, 16, '#5f5a46', (c) => { c.fillStyle = '#1c1d1a'; c.fillRect(tx - 1.2, -8.7, 2.4, 0.9); });
  r.box3d(tx - 1.8, -9.6, tx + 1.8, -9, 12.8, 16.2, '#4a4636');
  // Забор из сетки.
  const zfn = 9;
  r.face(zfn);
  const [xa, xb] = r.xRange(zfn, 2);
  ctx.strokeStyle = 'rgba(70,75,70,0.55)'; ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let x = Math.floor(xa); x < xb; x += 0.35) { ctx.moveTo(x, 0); ctx.lineTo(x + 2.2, -2.2); ctx.moveTo(x, -2.2); ctx.lineTo(x + 2.2, 0); }
  ctx.stroke();
  ctx.fillStyle = '#4b4f4a';
  for (const x of L.posts) if (x > xa && x < xb) ctx.fillRect(x - 0.05, -2.5, 0.1, 2.5);
  ctx.strokeStyle = '#6a6e68'; ctx.lineWidth = 0.04;
  ctx.beginPath(); ctx.moveTo(xa, -2.45); ctx.lineTo(xb, -2.45); ctx.stroke();
  // Мешки с песком.
  for (const b of L.bags) {
    const [px] = r.P(b.x, 0, 5);
    if (px < -100 || px > r.W + 100) continue;
    r.face(5);
    for (let i = 0; i < b.n; i++) {
      for (let row = 0; row < 2; row++) {
        ctx.fillStyle = row ? '#a49470' : '#988a66';
        ctx.beginPath(); ctx.ellipse(b.x + i * 0.62 + row * 0.31, -0.18 - row * 0.32, 0.33, 0.18, 0, 0, TAU); ctx.fill();
      }
    }
  }
  groundFront(r, '#5c5440', '#8d8565');
}

// ---------------- Крыша небоскрёба ----------------
function roofLayout(rnd) {
  const far = [], mid = [];
  for (let x = -900; x < 900; x += 18 + rnd() * 30) far.push({ x, w: 16 + rnd() * 30, top: -40 + rnd() * 90 });
  for (let x = -260; x < 260; x += 14 + rnd() * 16) mid.push({ x, w: 10 + rnd() * 14, top: -15 + rnd() * 45, c: ['#8f9fae', '#a5b2bd', '#7f8fa0', '#b8b0a4'][Math.floor(rnd() * 4)] });
  const units = [];
  for (let x = -60; x < 60; x += 11 + rnd() * 8) units.push({ x, kind: rnd() < 0.3 ? 'tower' : 'ac' });
  return { far: per(far, 1800), mid: per(mid, 520), units: per(units, 120) };
}

function drawRoof(r, t) {
  const L = layout('roof', roofLayout);
  const ctx = r.ctx;
  sky(r, ['#2f6db8', '#7fb3e6', '#d8ecfb']);
  r.screen();
  const sx = r.W * 0.15 - r.cam.x * 0.3, sy = r.vp.y * 0.3;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
  g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.2, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g; ctx.fillRect(sx - 90, sy - 90, 180, 180);
  // Город далеко внизу: основания зданий уходят ниже уровня крыши.
  const zf = 260;
  r.face(zf);
  ctx.fillStyle = '#9fb9d2';
  const [fa, fb] = r.xRange(zf, 40);
  ctx.beginPath();
  for (const b of L.far) { if (b.x + b.w < fa || b.x > fb) continue; ctx.rect(b.x, b.top, b.w, 300); }
  ctx.fill();
  haze(r, '#d8ecfb', 60, 200, 0.55);
  const zm = 70;
  r.face(zm);
  const [ma, mb] = r.xRange(zm, 20);
  for (const b of L.mid) {
    if (b.x + b.w < ma || b.x > mb) continue;
    ctx.fillStyle = mix(b.c, '#d8ecfb', 0.3);
    ctx.fillRect(b.x, b.top, b.w, 300);
    ctx.fillStyle = 'rgba(50,70,95,0.35)';
    ctx.beginPath();
    for (let y = b.top + 1.5; y < b.top + 60; y += 2.6) for (let x = b.x + 0.8; x < b.x + b.w - 1; x += 1.9) ctx.rect(x, y, 1, 1.3);
    ctx.fill();
    ctx.fillStyle = shade(b.c, -0.2); ctx.fillRect(b.x - 0.3, b.top - 0.5, b.w + 0.6, 0.6);
  }
  r.screen();
  // Крыша: гравий, вертолётная площадка, парапет.
  const [xa, xb] = r.xRange(8, 4);
  groundBand(r, NEAR_Z, 7, '#8e8b84');
  r.face(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.0)';
  r.screen();
  const [cx, cy] = r.P(0, 0, 2);
  const rad = r.k(2) * 3.2;
  const [, y1] = r.P(0, 0, 2 - 3.2), [, y2] = r.P(0, 0, 2 + 3.2);
  const ry = Math.abs(y1 - y2) / 2;
  ctx.strokeStyle = '#f2d04b'; ctx.lineWidth = Math.max(1.5, r.k(2) * 0.18);
  ctx.beginPath(); ctx.ellipse(cx, cy, rad, ry, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#f2f2f2';
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rad);
  ctx.font = `900 ${Math.round(rad * 1.2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('H', 0, 0); ctx.restore();
  r.box3d(xa, -0.9, xb, 0, 7, 7.5, '#a29f97', null, { side: '#7d7a73' });
  // Вентиляция и водонапорный бак.
  for (const u of L.units) {
    const [px] = r.P(u.x, 0, 5);
    if (px < -200 || px > r.W + 200) continue;
    if (u.kind === 'ac') {
      r.box3d(u.x, -1.3, u.x + 2.2, 0, 4.5, 6, '#c3c6c9', (c) => {
        c.fillStyle = '#7c8186';
        for (let i = 0; i < 6; i++) c.fillRect(u.x + 0.2 + i * 0.32, -1.1, 0.18, 0.9);
      });
    } else {
      r.face(5);
      ctx.strokeStyle = '#4d4a45'; ctx.lineWidth = 0.15;
      ctx.beginPath(); ctx.moveTo(u.x + 0.2, 0); ctx.lineTo(u.x + 0.5, -2.5); ctx.moveTo(u.x + 2.4, 0); ctx.lineTo(u.x + 2.1, -2.5); ctx.stroke();
      r.box3d(u.x, -5.5, u.x + 2.6, -2.5, 4.5, 6.5, '#8a6a4a', (c) => {
        c.strokeStyle = 'rgba(40,25,10,0.5)'; c.lineWidth = 0.06;
        for (let y = -5.2; y < -2.6; y += 0.6) { c.beginPath(); c.moveTo(u.x, y); c.lineTo(u.x + 2.6, y); c.stroke(); }
      });
    }
  }
  // Фасад нашего здания вместо земли.
  const [na, nb] = r.xRange(NEAR_Z, 4);
  r.face(NEAR_Z);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(na, 0, nb - na, 60);
  ctx.fillStyle = '#4e6a85';
  for (let x = Math.floor(na / 2.4) * 2.4; x < nb; x += 2.4) for (let y = 1.2; y < 30; y += 3) ctx.fillRect(x + 0.4, y, 1.6, 1.8);
  ctx.fillStyle = '#c9ced4'; ctx.fillRect(na, 0, nb - na, 0.25);
  r.screen();
}

// ---------------- Космическая станция ----------------
function drawStation(r, t) {
  const ctx = r.ctx;
  const WZ = 7, CEIL = -13;
  r.screen();
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, r.W, r.H);
  // Задняя стена с иллюминаторами.
  r.face(WZ);
  const [wa, wb] = r.xRange(WZ, 10);
  ctx.fillStyle = '#c8ced6';
  ctx.fillRect(wa, CEIL, wb - wa, -CEIL);
  ctx.strokeStyle = 'rgba(60,70,85,0.4)'; ctx.lineWidth = 0.05;
  ctx.beginPath();
  for (let x = Math.floor(wa / 3) * 3; x < wb; x += 3) { ctx.moveTo(x, CEIL); ctx.lineTo(x, 0); }
  for (let y = CEIL; y < 0; y += 2.2) { ctx.moveTo(wa, y); ctx.lineTo(wb, y); }
  ctx.stroke();
  const rnd = seeded(11);
  for (let x = Math.floor(wa / 12) * 12; x < wb; x += 12) {
    const cx = x + 6, cy = -7.5, rr = 2.4;
    ctx.fillStyle = '#7d8794';
    ctx.beginPath(); ctx.arc(cx, cy, rr + 0.4, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.clip();
    ctx.fillStyle = '#020309'; ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) ctx.fillRect(cx - rr + rnd() * rr * 2, cy - rr + rnd() * rr * 2, 0.05, 0.05);
    if (Math.floor(x / 12) % 2 === 0) {
      const eg = ctx.createRadialGradient(cx - 0.6, cy + 1.6, 0.2, cx, cy + 2.6, 3.2);
      eg.addColorStop(0, '#8fd0ff'); eg.addColorStop(0.6, '#2f6fb6'); eg.addColorStop(1, '#0d2a50');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(cx + 0.3, cy + 3.4, 3.0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(cx - 0.5, cy + 1.0, 1.2, 0.2, 0.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#4b5462'; ctx.lineWidth = 0.15;
    ctx.beginPath(); ctx.arc(cx, cy, rr + 0.2, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = '#e8b923';
  ctx.fillRect(wa, -1.0, wb - wa, 0.35);
  ctx.fillStyle = '#6b7380';
  for (let x = Math.floor(wa / 2) * 2; x < wb; x += 2) ctx.fillRect(x, -12.2, 1.2, 0.5);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(wa, -3.4, wb - wa, 0.25);
  ctx.fillRect(wa, -3.0, wb - wa, 0.12);
  r.screen();
  // Пол-настил и потолок.
  groundBand(r, NEAR_Z, WZ, '#8e959e');
  const [xa, xb] = r.xRange(WZ, 2);
  ctx.strokeStyle = 'rgba(40,45,55,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(xa); x < xb; x += 1.5) { const a = r.P(x, 0, NEAR_Z), b = r.P(x, 0, WZ); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  const [ca, cb] = r.xRange(NEAR_Z, 4);
  r.groundQuad(CEIL, NEAR_Z, WZ, ca, cb);
  ctx.fillStyle = '#5d6571';
  ctx.fill();
  for (let x = Math.floor(ca / 6) * 6; x < cb; x += 6) {
    r.groundQuad(CEIL, 1, 3, x, x + 2.5);
    ctx.fillStyle = '#f2f7ff';
    ctx.fill();
  }
  r.face(NEAR_Z);
  ctx.fillStyle = '#3a414c';
  ctx.fillRect(ca, CEIL - 40, cb - ca, 40);
  ctx.fillStyle = '#e8b923';
  ctx.fillRect(ca, CEIL - 0.3, cb - ca, 0.3);
  r.screen();
  groundFront(r, '#3a414c', '#9aa3ad');
}


// ---------------- Вулкан ----------------
function volcanoLayout(rnd) {
  const ridges = [], rocks = [], vents = [], ash = [];
  for (let x = -900; x < 900; x += 60 + rnd() * 110) ridges.push({ x, w: 90 + rnd() * 140, h: 18 + rnd() * 30 });
  for (let i = 0; i < 70; i++) rocks.push({ x: -150 + rnd() * 300, z: 3 + rnd() * 45, s: 0.4 + rnd() * 1.4 });
  rocks.sort((a, b) => b.z - a.z);
  for (let i = 0; i < 14; i++) vents.push({ x: -150 + rnd() * 300, z: 6 + rnd() * 40, ph: rnd() * TAU });
  for (let i = 0; i < 120; i++) ash.push({ x: rnd(), y: rnd(), d: 0.3 + rnd() * 0.7, ph: rnd() * TAU, hot: rnd() < 0.25 });
  return { ridges: per(ridges, 1800), rocks: per(rocks, 300), vents: per(vents, 300), ash };
}

function drawVolcano(r, t) {
  const ctx = r.ctx;
  const L = layout('volcano', volcanoLayout);
  sky(r, ['#120306', '#3a0a0c', '#7a1a10', '#c2410c', '#f97316']);
  // Главный вулкан вдали со светящимся жерлом и лавой.
  const zv = 600;
  r.face(zv);
  // Гора привязана к камере, поэтому всегда на горизонте.
  const vx = r.cam.x * 0.92 + 40, H = 85;
  // Столб дыма над жерлом.
  for (let i = 0; i < 8; i++) {
    const yy = -H - 12 - i * 22 - ((t * 5) % 22);
    ctx.fillStyle = `rgba(45,28,28,${0.55 - i * 0.06})`;
    ctx.beginPath(); ctx.arc(vx + Math.sin(i + t * 0.3) * 10 + i * 7, yy, 22 + i * 8, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#1d0a0b';
  ctx.beginPath();
  ctx.moveTo(vx - 230, 0); ctx.lineTo(vx - 34, -H); ctx.lineTo(vx + 34, -H); ctx.lineTo(vx + 230, 0);
  ctx.closePath(); ctx.fill();
  const glow = 0.75 + Math.sin(t * 2.3) * 0.15;
  const lg = ctx.createRadialGradient(vx, -H, 2, vx, -H, 60);
  lg.addColorStop(0, `rgba(255,170,60,${glow})`);
  lg.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(vx, -H, 60, 0, TAU); ctx.fill();
  // Потоки лавы по склонам.
  for (const [a, w] of [[-1, 9], [0.4, 7], [1.3, 6]]) {
    ctx.fillStyle = `rgba(255,${Math.round(90 + glow * 60)},30,0.85)`;
    ctx.beginPath();
    ctx.moveTo(vx + a * 14 - w / 2, -H);
    ctx.quadraticCurveTo(vx + a * 40, -H * 0.5, vx + a * 110 - w, 0);
    ctx.lineTo(vx + a * 110 + w, 0);
    ctx.quadraticCurveTo(vx + a * 40 + w, -H * 0.5, vx + a * 14 + w / 2, -H);
    ctx.closePath(); ctx.fill();
  }
  haze(r, '#ff5a1f', 70, 40, 0.5);
  // Хребты.
  const zf = 220;
  r.face(zf);
  const [fa, fb] = r.xRange(zf, 60);
  ctx.fillStyle = '#2a0e0f';
  ctx.beginPath();
  ctx.moveTo(fa, 0);
  for (const g of L.ridges) { if (g.x + g.w < fa || g.x > fb) continue; ctx.lineTo(g.x, 0); ctx.lineTo(g.x + g.w * 0.45, -g.h); ctx.lineTo(g.x + g.w * 0.55, -g.h * 0.92); ctx.lineTo(g.x + g.w, 0); }
  ctx.lineTo(fb, 0); ctx.closePath(); ctx.fill();
  groundBand(r, 60, 260, '#2b1214');
  groundBand(r, 20, 60, '#2f1416');
  groundBand(r, NEAR_Z, 20, '#26100f');
  // Трещины с лавой.
  r.screen();
  for (const v of L.vents) {
    const [px, py] = r.P(v.x, 0, v.z);
    if (px < -200 || px > r.W + 200) continue;
    const k = r.k(v.z);
    const a = 0.55 + Math.sin(t * 3 + v.ph) * 0.25;
    ctx.fillStyle = `rgba(255,${Math.round(110 + a * 60)},30,${a})`;
    ctx.beginPath(); ctx.ellipse(px, py, 2.2 * k, 0.16 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,80,0.35)';
    ctx.beginPath(); ctx.ellipse(px, py, 1.2 * k, 0.07 * k, 0, 0, TAU); ctx.fill();
  }
  // Глыбы.
  for (const c of L.rocks) {
    const [px, py] = r.P(c.x, 0, c.z);
    if (px < -100 || px > r.W + 100) continue;
    const k = r.k(c.z) * c.s;
    ctx.fillStyle = '#1a0b0b';
    ctx.beginPath(); ctx.moveTo(px - 0.6 * k, py); ctx.lineTo(px - 0.3 * k, py - 0.55 * k); ctx.lineTo(px + 0.35 * k, py - 0.45 * k); ctx.lineTo(px + 0.65 * k, py); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,90,30,0.25)';
    ctx.fillRect(px - 0.6 * k, py - 0.06 * k, 1.25 * k, 0.06 * k);
  }
  groundLineX(r, 1.5, 'rgba(255,110,40,0.25)', 1);
  groundFront(r, '#1c0b0c', '#ff6a2a');
}

// Пепел и искры в воздухе.
function volcanoAsh(r, t) {
  const L = layout('volcano', volcanoLayout);
  const ctx = r.ctx;
  r.screen();
  for (const f of L.ash) {
    const sp = 14 + f.d * 30;
    const x = ((f.x * r.W + Math.sin(t * 0.6 + f.ph) * 20 - r.cam.x * r.cam.s * f.d * 0.3) % r.W + r.W) % r.W;
    const y = ((f.y * r.H + (f.hot ? -t * sp : t * sp) - r.cam.y * r.cam.s * f.d * 0.3) % r.H + r.H) % r.H;
    ctx.globalAlpha = 0.35 + f.d * 0.45;
    ctx.fillStyle = f.hot ? '#ffb347' : '#3b3434';
    ctx.beginPath(); ctx.arc(x, y, (f.hot ? 0.8 : 1.1) + f.d * 1.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------- Киберпанк ----------------
const NEON = ['#00e5ff', '#ff2bd6', '#ffe14d', '#7c4dff', '#39ff88'];
function cyberLayout(rnd) {
  const far = [], near = [], signs = [], cars = [];
  for (let x = -700; x < 700; x += 10 + rnd() * 14) far.push({ x, w: 8 + rnd() * 14, h: 40 + rnd() * 110 });
  for (let x = -150; x < 150;) {
    const w = 9 + rnd() * 9;
    const h = 7 + rnd() * 12;
    near.push({ x, w, h, seed: Math.floor(rnd() * 1e6), c: NEON[Math.floor(rnd() * NEON.length)] });
    if (rnd() < 0.8) signs.push({ x: x + 1 + rnd() * (w - 4), y: -(3 + rnd() * (h - 6)), w: 2 + rnd() * 3, h: 0.8 + rnd() * 1.2, c: NEON[Math.floor(rnd() * NEON.length)], ph: rnd() * TAU });
    x += w + 3 + rnd() * 6;
  }
  for (let i = 0; i < 10; i++) cars.push({ y: -(30 + rnd() * 60), z: 120 + rnd() * 200, v: (rnd() < 0.5 ? -1 : 1) * (15 + rnd() * 25), x0: rnd() * 600, c: NEON[Math.floor(rnd() * NEON.length)] });
  return { far: per(far, 1400), near: per(near, 300), signs: per(signs, 300), cars };
}

function drawCyberpunk(r, t) {
  const ctx = r.ctx;
  const L = layout('cyber', cyberLayout);
  sky(r, ['#04030d', '#0d0724', '#22093a', '#3b0c4f']);
  haze(r, '#b026ff', 80, 30, 0.35);
  // Дальние башни с огнями.
  const zf = 260;
  r.face(zf);
  const [fa, fb] = r.xRange(zf, 40);
  for (const b of L.far) {
    if (b.x + b.w < fa || b.x > fb) continue;
    ctx.fillStyle = '#0b0820';
    ctx.fillRect(b.x, -b.h, b.w, b.h);
    ctx.fillStyle = 'rgba(0,229,255,0.35)';
    for (let y = -b.h + 4; y < -2; y += 6) for (let x = b.x + 1; x < b.x + b.w - 1; x += 2.5) if (((x * 13 + y * 7) | 0) % 4 === 0) ctx.fillRect(x, y, 1, 1.6);
    ctx.fillStyle = '#ff2bd6';
    ctx.fillRect(b.x + b.w / 2 - 0.3, -b.h - 3, 0.6, 3);
  }
  // Летающие машины.
  r.screen();
  for (const c of L.cars) {
    const span = 900;
    const x = r.cam.x + ((((c.x0 + t * c.v - r.cam.x) % span) + span * 1.5) % span) - span / 2;
    const [px, py] = r.P(x, c.y, c.z);
    if (px < -40 || px > r.W + 40) continue;
    const k = r.k(c.z);
    ctx.fillStyle = c.c;
    ctx.fillRect(px - 2 * k, py - 0.4 * k, 4 * k, 0.8 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(px + (c.v > 0 ? 1.6 : -2) * k, py - 0.2 * k, 0.4 * k, 0.4 * k);
  }
  // Ближние дома с неоновыми вывесками.
  const zn = 32;
  r.face(zn);
  const [na, nb] = r.xRange(zn, 10);
  for (const b of L.near) {
    if (b.x + b.w < na || b.x > nb) continue;
    ctx.fillStyle = '#120d24';
    ctx.fillRect(b.x, -b.h, b.w, b.h);
    ctx.fillStyle = b.c;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(b.x, -b.h, b.w, 0.25);
    ctx.globalAlpha = 1;
    const rnd = seeded(b.seed);
    for (let y = -b.h + 1.5; y < -2.5; y += 2.4) for (let x = b.x + 0.7; x < b.x + b.w - 1; x += 1.8) {
      const lit = rnd() < 0.22;
      ctx.fillStyle = lit ? (rnd() < 0.5 ? '#ffd27a' : '#7ff3ff') : '#19152f';
      ctx.fillRect(x, y, 1, 1.3);
    }
  }
  for (const sgn of L.signs) {
    if (sgn.x + sgn.w < na || sgn.x > nb) continue;
    const on = Math.sin(t * 5 + sgn.ph) > -0.85;
    ctx.fillStyle = '#05040c';
    ctx.fillRect(sgn.x - 0.1, sgn.y - 0.1, sgn.w + 0.2, sgn.h + 0.2);
    ctx.globalAlpha = on ? 1 : 0.25;
    ctx.fillStyle = sgn.c;
    ctx.fillRect(sgn.x, sgn.y, sgn.w, sgn.h);
    ctx.fillStyle = '#05040c';
    ctx.fillRect(sgn.x + 0.2, sgn.y + 0.25, sgn.w - 0.4, sgn.h - 0.5);
    ctx.fillStyle = sgn.c;
    for (let x = sgn.x + 0.35; x < sgn.x + sgn.w - 0.4; x += 0.5) ctx.fillRect(x, sgn.y + sgn.h * 0.35, 0.3, sgn.h * 0.3);
    ctx.globalAlpha = 1;
  }
  groundBand(r, 20, 260, '#0b0a18');
  groundBand(r, NEAR_Z, 20, '#0e0c1d');
  // Мокрый асфальт: неоновые полосы-отражения.
  groundLineX(r, 6, 'rgba(255,43,214,0.35)', 2, [3, 3]);
  groundLineX(r, 2.5, 'rgba(0,229,255,0.35)', 2);
  groundFront(r, '#08070f', '#00e5ff');
}

// Свечение вывесок в темноте (поверх ambient).
function cyberLights(r, t) {
  const L = layout('cyber', cyberLayout);
  const ctx = r.ctx;
  r.face(32);
  ctx.globalCompositeOperation = 'lighter';
  for (const sgn of L.signs) {
    if (Math.sin(t * 5 + sgn.ph) <= -0.85) continue;
    ctx.fillStyle = rgba(sgn.c, 0.18);
    ctx.fillRect(sgn.x - 1, sgn.y - 1, sgn.w + 2, sgn.h + 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  r.screen();
}

export const WORLDS = [
  { id: 'city', name: 'Город', desc: 'Улица, дома, фонари', gravity: 9.8, drawBackground: (r, t) => drawCity(r, t, false), dust: '#a8a49c', debris: ['#5d5f63', '#7a7c80'], thumb: ['#3f86d8', '#cfe9ff', '#46494f'], sun: { x: -0.55, y: 1, z: 0.45, k: 0.45 }, grade: '#ffe9c9' },
  { id: 'night', name: 'Ночной город', desc: 'Огни окон и фонарей', gravity: 9.8, drawBackground: (r, t) => drawCity(r, t, true), ambient: '#5a6aa0', drawLights: cityLights, dust: '#77736c', debris: ['#3a3b40', '#55565c'], thumb: ['#060b1a', '#3a3f6e', '#24252a'], sun: { x: -0.25, y: 1, z: 0.3, k: 0.22 }, grade: '#3b4a8a' },
  { id: 'desert', name: 'Пустыня', desc: 'Закат, кактусы, дюны', gravity: 9.8, drawBackground: drawDesert, ambient: '#ffe6cc', dust: '#d9b98a', debris: ['#c99a62', '#a67a48'], thumb: ['#c9667a', '#ffd38a', '#e6bb83'], sun: { x: 1.7, y: 1, z: 0.6, k: 0.5 }, grade: '#ff9a5a' },
  { id: 'moon', name: 'Луна', desc: 'Гравитация 1.6 м/с², огонь быстро гаснет', gravity: 1.62, noAir: true, drawBackground: drawMoon, dust: '#a3a5aa', debris: ['#7c7e83', '#5e6065'], thumb: ['#000000', '#0d0f16', '#8f9196'], sun: { x: 0.8, y: 1, z: 0.4, k: 0.65 }, grade: '#9fb0c8' },
  { id: 'lab', name: 'Полигон', desc: 'Испытательная площадка', gravity: 9.8, drawBackground: drawLab, dust: '#c2c6cc', debris: ['#9aa0a8', '#c7ccd2'], thumb: ['#2b2f36', '#d6dbe1', '#c7ccd2'], sun: { x: 0.12, y: 1, z: 0.18, k: 0.35 }, grade: '#dfe8f2' },
  { id: 'winter', name: 'Зимний лес', desc: 'Снег и ели', gravity: 9.8, drawBackground: drawWinter, drawForeground: winterSnow, ambient: '#e4ecf8', dust: '#eef3f9', debris: ['#ffffff', '#cfdbe9'], thumb: ['#4b6390', '#dbe6f3', '#eef3f9'], sun: { x: 0.6, y: 1, z: 0.5, k: 0.28 }, grade: '#9db8e6' },
  { id: 'base', name: 'Военная база', desc: 'Ангар, вышка, забор', gravity: 9.8, drawBackground: drawBase, dust: '#a49a78', debris: ['#7b7356', '#5c5440'], thumb: ['#7d8a97', '#d5dad8', '#8d8565'], sun: { x: -0.4, y: 1, z: 0.4, k: 0.3 }, grade: '#c7c9a6' },
  { id: 'roof', name: 'Крыша небоскрёба', desc: 'Город далеко внизу', gravity: 9.8, drawBackground: drawRoof, dust: '#b0aca3', debris: ['#8e8b84', '#6f6c66'], thumb: ['#2f6db8', '#d8ecfb', '#8e8b84'], sun: { x: 0.7, y: 1, z: 0.45, k: 0.45 }, grade: '#ffeccc' },
  { id: 'station', name: 'Космостанция', desc: 'Невесомость, потолок', gravity: 0, ceiling: -13, drawBackground: drawStation, dust: '#c2c8d0', debris: ['#9aa3ad', '#6b7380'], thumb: ['#05070c', '#c8ced6', '#8e959e'], sun: { x: 0.05, y: 1, z: 0.1, k: 0.2 }, grade: '#cfe0ff' },
  { id: 'volcano', name: 'Вулкан', desc: 'Пепел, лавовые трещины, раскалённый воздух', gravity: 9.8, drawBackground: drawVolcano, drawForeground: volcanoAsh, ambient: '#ffb08a', dust: '#d84315', debris: ['#3e2723', '#bf360c'], thumb: ['#3d080c', '#8a1f11', '#ff9800'], sun: { x: 0.2, y: 1, z: 0.3, k: 0.6 }, grade: '#ff7043' },
  { id: 'cyberpunk', name: 'Киберпанк', desc: 'Неоновый ночной мегаполис', gravity: 9.8, drawBackground: drawCyberpunk, drawLights: cyberLights, ambient: '#8f7cd6', dust: '#ba68c8', debris: ['#212121', '#4a148c'], thumb: ['#050510', '#3d0c4e', '#00e5ff'], sun: { x: -0.3, y: 1, z: 0.25, k: 0.25 }, grade: '#7c4dff' },
];

// Перед отрисовкой запоминаем камеру — от неё зависит, какие копии декораций нужны.
for (const w of WORLDS) {
  for (const key of ['drawBackground', 'drawForeground', 'drawLights']) {
    const fn = w[key];
    if (fn) w[key] = (r, ...a) => { CAMX = r.cam.x; return fn(r, ...a); };
  }
}

export const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS[0];
export { clamp };
