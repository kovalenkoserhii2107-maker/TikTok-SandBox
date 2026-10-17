// 2.5D-рендер: физика плоская, но каждый объект — объёмная призма
// в настоящей перспективной проекции. Фон и земля уходят вглубь сцены.
import { clamp, convexHull, shade, TAU } from './util.js';

const DCAM = 24; // расстояние камеры до плоскости физики (м)

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.W = 300;
    this.H = 150;
    this.cam = { x: 0, y: -4, s: 34 };
    this.vpFrac = opts.vpFrac ?? 0.42;
    this.vp = { x: 150, y: 60 };
    this.shakeX = 0;
    this.shakeY = 0;
    this.maxDpr = opts.maxDpr ?? 2;
    this.items = [];
    this.gradCache = new Map();
    this.showFrozen = true;
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.vp.x = w / 2;
    this.vp.y = h * this.vpFrac;
    this.gradCache.clear();
  }

  // Масштаб (px/м) на глубине z.
  k(z) { return (this.cam.s * DCAM) / (DCAM + z); }

  // Проекция мировой точки в экранные (CSS) пиксели.
  P(x, y, z) {
    const f = DCAM / (DCAM + z);
    const s = this.cam.s * f;
    return [this.vp.x + (x - this.cam.x - this.shakeX) * s, this.vp.y + (y - this.cam.y - this.shakeY) * s];
  }

  toWorld(sx, sy, z = 0) {
    const s = this.k(z);
    return { x: this.cam.x + (sx - this.vp.x) / s, y: this.cam.y + (sy - this.vp.y) / s };
  }

  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  // Аффинное преобразование плоскости на глубине z: дальше рисуем в метрах.
  face(z) {
    const s = this.k(z);
    const d = this.dpr;
    this.ctx.setTransform(d * s, 0, 0, d * s, d * (this.vp.x - (this.cam.x + this.shakeX) * s), d * (this.vp.y - (this.cam.y + this.shakeY) * s));
    return s;
  }

  // Видимый диапазон X на глубине z.
  xRange(z, margin = 2) {
    const s = this.k(z);
    return [this.cam.x + (0 - this.vp.x) / s - margin, this.cam.x + (this.W - this.vp.x) / s + margin];
  }

  // Квад на горизонтальной плоскости y (полоса земли от z0 до z1).
  groundQuad(y, z0, z1, x0, x1) {
    const ctx = this.ctx;
    const a = this.P(x0, y, z0), b = this.P(x1, y, z0), c = this.P(x1, y, z1), d = this.P(x0, y, z1);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    ctx.closePath();
  }

  // Статичный 3D-блок (здания, бордюры). detail рисуется на передней грани в метрах.
  box3d(x0, y0, x1, y1, z0, z1, col, detail, opts = {}) {
    const ctx = this.ctx;
    this.screen();
    const cx = this.cam.x, cy = this.cam.y;
    const side = opts.side || shade(col, -0.3);
    const top = opts.top || shade(col, 0.12);
    const quad = (p) => {
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    if (cy < y0 && !opts.noTop) {
      ctx.fillStyle = top;
      quad([this.P(x0, y0, z0), this.P(x1, y0, z0), this.P(x1, y0, z1), this.P(x0, y0, z1)]);
    }
    if (cx < x0) {
      ctx.fillStyle = side;
      quad([this.P(x0, y0, z0), this.P(x0, y0, z1), this.P(x0, y1, z1), this.P(x0, y1, z0)]);
    } else if (cx > x1) {
      ctx.fillStyle = side;
      quad([this.P(x1, y0, z0), this.P(x1, y0, z1), this.P(x1, y1, z1), this.P(x1, y1, z0)]);
    }
    const s = this.face(z0);
    ctx.fillStyle = col;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (detail) detail(ctx, s);
    this.screen();
  }

  // Градиент «свет сверху» в единичном пространстве, кэшируется по цвету.
  grad(col) {
    let g = this.gradCache.get(col);
    if (!g) {
      g = this.ctx.createLinearGradient(0, -1, 0, 1);
      g.addColorStop(0, shade(col, 0.22));
      g.addColorStop(0.45, col);
      g.addColorStop(1, shade(col, -0.18));
      this.gradCache.set(col, g);
    }
    return g;
  }

  // Сферическое освещение (головы, мячи, арбузы).
  sgrad(col) {
    const key = col + '|s';
    let g = this.gradCache.get(key);
    if (!g) {
      g = this.ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.05);
      g.addColorStop(0, shade(col, 0.35));
      g.addColorStop(0.55, col);
      g.addColorStop(1, shade(col, -0.35));
      this.gradCache.set(key, g);
    }
    return g;
  }

  // ---------- Сцена ----------
  drawScene(sim, worldDef, opts = {}) {
    const ctx = this.ctx;
    this.screen();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    worldDef.drawBackground(this, sim.time, sim);
    sim.effects.drawDecals(this);
    this.drawShadows(sim);
    this.collect(sim);
    this.drawItems();
    for (const l of sim.links) if (l.draw && !l.dead) l.draw(this, l);
    for (const e of sim.entities) if (e.drawOverlay) e.drawOverlay(this);
    sim.effects.draw(this);
    if (worldDef.drawForeground) worldDef.drawForeground(this, sim.time, sim);
    if (worldDef.ambient) {
      this.screen();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = worldDef.ambient;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (worldDef.drawLights) worldDef.drawLights(this, sim.time);
    sim.effects.drawLights(this);
    const glow = sim.effects.nukeGlow;
    if (glow > 0) {
      this.screen();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255,${Math.round(150 + 60 * (1 - glow))},${Math.round(90 + 120 * (1 - glow))},1)`;
      ctx.globalAlpha = glow * 0.8;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (sim.flashAmt > 0.01) {
      this.screen();
      ctx.fillStyle = '#fffaf0';
      ctx.globalAlpha = Math.min(1, sim.flashAmt);
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    if (opts.overlay) opts.overlay(this);
  }

  drawShadows(sim) {
    const ctx = this.ctx;
    this.screen();
    ctx.fillStyle = '#000';
    for (const e of sim.entities) {
      if (e.noShadow) continue;
      for (const b of e.shadowBodies || e.bodies) {
        const p = b.getPosition();
        const h = -p.y;
        if (h > 25) continue;
        const r = e.shadowR ? e.shadowR(b) : 0.3;
        const a = 0.28 * Math.exp(-h / 4);
        if (a < 0.02) continue;
        const [sx, sy] = this.P(p.x + h * 0.15, 0, 0);
        const k = this.k(0);
        const rx = r * k * (1 + h * 0.08);
        const [, y1] = this.P(p.x, 0, -0.35);
        const [, y2] = this.P(p.x, 0, 0.35);
        const ry = Math.max(1, Math.abs(y2 - y1) / 2) * (1 + h * 0.05);
        if (sx + rx < 0 || sx - rx > this.W) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Собираем «грани» всех визуалов и сортируем по глубине (алгоритм художника).
  collect(sim) {
    const items = this.items;
    items.length = 0;
    for (const e of sim.entities) {
      if (e.removed) continue;
      for (const v of e.visuals) {
        if (v.hidden) continue;
        if (v.custom) {
          items.push({ key: v.z, v, e, kind: 2 });
          continue;
        }
        const t = v.t;
        if (t * this.cam.s > 1.2 && !v.flat && !v.sphere) items.push({ key: v.z + t / 2, v, e, kind: 0 });
        items.push({ key: v.z - t / 2, v, e, kind: 1 });
      }
    }
    items.sort((a, b) => b.key - a.key || a.kind - b.kind);
  }

  drawItems() {
    for (const it of this.items) {
      if (it.kind === 0) this.drawSide(it.v, it.e);
      else if (it.kind === 1) this.drawFront(it.v, it.e);
      else it.v.custom(this, it.e, it.v);
    }
  }

  bodyPose(v) {
    const b = v.body;
    const p = b.getPosition();
    return [p.x, p.y, b.getAngle()];
  }

  drawSide(v, e) {
    const ctx = this.ctx;
    const [px, py, a] = this.bodyPose(v);
    const c = Math.cos(a), s = Math.sin(a);
    const z0 = v.z - v.t / 2, z1 = v.z + v.t / 2;
    const out = v.outline;
    const n = out.length;
    const pts = this._pts || (this._pts = []);
    const wx = this._wx || (this._wx = []);
    pts.length = n * 4;
    let minx = Infinity, maxx = -Infinity;
    const s0 = this.k(z0), s1 = this.k(z1);
    const cx = this.cam.x + this.shakeX, cy = this.cam.y + this.shakeY;
    const vx = this.vp.x, vy = this.vp.y;
    for (let i = 0; i < n; i++) {
      const lx = out[i][0], ly = out[i][1];
      const x = px + lx * c - ly * s, y = py + lx * s + ly * c;
      wx[i * 2] = x; wx[i * 2 + 1] = y;
      const fx = vx + (x - cx) * s0;
      pts[i * 2] = fx; pts[i * 2 + 1] = vy + (y - cy) * s0;
      pts[(n + i) * 2] = vx + (x - cx) * s1; pts[(n + i) * 2 + 1] = vy + (y - cy) * s1;
      if (fx < minx) minx = fx;
      if (fx > maxx) maxx = fx;
    }
    if (maxx < -50 || minx > this.W + 50) return;
    const bandPx = Math.abs(s0 - s1) * Math.max(Math.abs(px - cx), Math.abs(py - cy)) + 0.001;
    const col = e.colorOf ? e.colorOf(v) : v.color;
    this.screen();
    ctx.globalAlpha = v.alpha || 1;
    // Подложка — выпуклая оболочка передней и задней граней.
    const hull = convexHull(pts);
    ctx.beginPath();
    ctx.moveTo(pts[hull[0] * 2], pts[hull[0] * 2 + 1]);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(pts[hull[i] * 2], pts[hull[i] * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = v.side || shade(col, bandPx < 5 ? -0.42 : -0.55);
    ctx.fill();
    if (!v.side && bandPx >= 5) {
      // Видимые боковые грани с освещением по нормали: верх светлее, низ темнее.
      const camX = this.cam.x, camY = this.cam.y;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += wx[i * 2] * wx[j * 2 + 1] - wx[j * 2] * wx[i * 2 + 1];
      }
      const ws = area > 0 ? 1 : -1;
      const paths = this._shadeP || (this._shadeP = [[], [], [], []]);
      for (const p of paths) p.length = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = wx[j * 2] - wx[i * 2], ey = wx[j * 2 + 1] - wx[i * 2 + 1];
        // Внешняя нормаль ребра (y вниз).
        let nx = ey * ws, ny = -ex * ws;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const mx = (wx[i * 2] + wx[j * 2]) / 2, my = (wx[i * 2 + 1] + wx[j * 2 + 1]) / 2;
        if ((camX - mx) * nx + (camY - my) * ny <= 0) continue;
        const lvl = ny < -0.55 ? 0 : ny < 0.2 ? (nx < 0 ? 1 : 2) : 3;
        paths[lvl].push(i, j);
      }
      const shades = [-0.12, -0.32, -0.42, -0.58];
      for (let L = 0; L < 4; L++) {
        const P = paths[L];
        if (!P.length) continue;
        ctx.beginPath();
        for (let k = 0; k < P.length; k += 2) {
          const i = P[k], j = P[k + 1];
          ctx.moveTo(pts[i * 2], pts[i * 2 + 1]);
          ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
          ctx.lineTo(pts[(n + j) * 2], pts[(n + j) * 2 + 1]);
          ctx.lineTo(pts[(n + i) * 2], pts[(n + i) * 2 + 1]);
          ctx.closePath();
        }
        const sc = shade(col, shades[L]);
        ctx.fillStyle = sc;
        ctx.fill();
        ctx.strokeStyle = sc;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
    if (bandPx >= 5) {
      ctx.beginPath();
      ctx.moveTo(pts[hull[0] * 2], pts[hull[0] * 2 + 1]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(pts[hull[i] * 2], pts[hull[i] * 2 + 1]);
      ctx.closePath();
    }
    ctx.strokeStyle = shade(col, -0.65);
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawFront(v, e) {
    const ctx = this.ctx;
    const [px, py, a] = this.bodyPose(v);
    const z = v.z - v.t / 2;
    const s = this.k(z);
    const [sx, sy] = this.P(px, py, z);
    const rad = v.rad * s;
    if (sx + rad < -20 || sx - rad > this.W + 20 || sy + rad < -20 || sy - rad > this.H + 20) return;
    const d = this.dpr;
    const c = Math.cos(a), sn = Math.sin(a);
    // Локальные координаты тела (метры), повёрнутые.
    ctx.setTransform(d * s * c, d * s * sn, -d * s * sn, d * s * c, d * sx, d * sy);
    ctx.beginPath();
    v.path(ctx);
    const col = e.colorOf ? e.colorOf(v) : v.color;
    // Заливка с освещением сверху (градиент не вращается вместе с объектом).
    ctx.setTransform(d * s * v.rad, 0, 0, d * s * v.rad, d * sx, d * sy);
    ctx.fillStyle = v.noGrad ? col : v.sphere ? this.sgrad(col) : this.grad(col);
    ctx.globalAlpha = v.alpha || 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    this.screen();
    ctx.strokeStyle = v.stroke || shade(col, -0.55);
    ctx.lineWidth = v.lineW || 1;
    ctx.stroke();
    if (v.detail || v.frozenFx) {
      ctx.setTransform(d * s * c, d * s * sn, -d * s * sn, d * s * c, d * sx, d * sy);
      if (v.clip) {
        ctx.save();
        ctx.clip();
        v.detail(ctx, e, v, s);
        ctx.restore();
      } else if (v.detail) v.detail(ctx, e, v, s);
    }
    if (this.showFrozen && v.body.isStatic() && !e.permanentStatic) {
      ctx.setTransform(d * s * c, d * s * sn, -d * s * sn, d * s * c, d * sx, d * sy);
      ctx.beginPath();
      v.path(ctx);
      ctx.fillStyle = 'rgba(120,200,255,0.28)';
      ctx.fill();
      this.screen();
      ctx.strokeStyle = 'rgba(160,225,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    this.screen();
  }
}
