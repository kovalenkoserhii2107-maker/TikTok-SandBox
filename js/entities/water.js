// Бассейн и аквариум: статичная чаша с водой (плавучесть считается в Sim).
import { Entity, visPoly, V, CAT } from './base.js';
import { polyShape } from '../sim.js';
import { R, TAU } from '../util.js';

export const POOLS = {
  pool: { name: 'Бассейн', w: 6, d: 2.9, wall: 0.3, color: '#cfe6ee', glass: false },
  tank: { name: 'Аквариум', w: 3.2, d: 1.8, wall: 0.08, color: '#bfe6f5', glass: true },
};

export class Pool extends Entity {
  constructor(sim, x, y, id = 'pool') {
    super(sim);
    const d = (this.def = POOLS[id]);
    this.name = d.name;
    this.permanentStatic = true;
    this.noShadow = d.glass;
    this.pickPriority = -2;
    const W = d.w, D = d.d, t = d.wall;
    // Чаша стоит на земле: x — центр, дно на уровне y = 0.
    const b = this.makeBody(x, 0, 0);
    b.setStatic();
    const mat = d.glass ? 'glass' : 'stone';
    const parts = [
      R(-W / 2 - t, -D - 0.25, -W / 2, 0),
      R(W / 2, -D - 0.25, W / 2 + t, 0),
      R(-W / 2, -0.12, W / 2, 0),
    ];
    for (const pts of parts) {
      this.fix(b, polyShape(pts), { density: 0, friction: 0.8, mat, cat: CAT.STATIC });
      const v = this.vis(visPoly(b, pts, { z: 0, t: 3, color: d.glass ? '#a9dcf0' : d.color, tex: d.glass ? null : 'concrete', alpha: d.glass ? 0.5 : 1 }));
      if (!d.glass) v.detail = (ctx) => this.tiles(ctx, pts);
    }
    this.water = { x0: 0, x1: 0, top: 0, bottom: 0, ent: this };
    this.region();
    sim.waters.push(this);
    this.vis({ custom: (r) => this.drawWater(r), z: -1.56, body: b });
  }

  // Водная область в мировых координатах (чаша может быть перенесена при загрузке).
  region() {
    const p = this.main.getPosition();
    const d = this.def, w = this.water;
    w.x0 = p.x - d.w / 2; w.x1 = p.x + d.w / 2;
    w.top = p.y - d.d * 0.88; w.bottom = p.y - 0.12;
    return w;
  }

  tiles(ctx, pts) {
    const [x0, y0] = pts[0], [x1, , ] = pts[1], y1 = pts[2][1];
    ctx.strokeStyle = 'rgba(80,120,140,0.35)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.001; x += 0.15) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1 + 0.001; y += 0.15) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }

  destroy() {
    const i = this.sim.waters.indexOf(this);
    if (i >= 0) this.sim.waters.splice(i, 1);
    super.destroy();
  }

  drawWater(r) {
    const w = this.region();
    const ctx = r.ctx;
    const t = this.sim.time;
    const zf = -1.52, zb = 1.52;
    // Поверхность воды (видна сверху в перспективе).
    r.screen();
    r.groundQuad(w.top, zf, zb, w.x0, w.x1);
    ctx.fillStyle = 'rgba(140,215,240,0.32)';
    ctx.fill();
    // Передняя «стенка» воды с глубинным градиентом и волной.
    r.face(zf);
    const g = ctx.createLinearGradient(0, w.top, 0, w.bottom);
    g.addColorStop(0, 'rgba(80,190,230,0.42)');
    g.addColorStop(1, 'rgba(18,90,140,0.62)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w.x0, w.bottom);
    const n = Math.max(8, Math.round((w.x1 - w.x0) * 6));
    for (let i = 0; i <= n; i++) {
      const x = w.x0 + ((w.x1 - w.x0) * i) / n;
      ctx.lineTo(x, w.top + Math.sin(x * 3.1 + t * 2.4) * 0.025 + Math.sin(x * 7.3 - t * 3.1) * 0.012);
    }
    ctx.lineTo(w.x1, w.bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,250,255,0.75)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = w.x0 + ((w.x1 - w.x0) * i) / n;
      const y = w.top + Math.sin(x * 3.1 + t * 2.4) * 0.025 + Math.sin(x * 7.3 - t * 3.1) * 0.012;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Каустика — блики на дне.
    ctx.fillStyle = 'rgba(200,245,255,0.14)';
    for (let i = 0; i < 6; i++) {
      const x = w.x0 + ((i * 0.37 + Math.sin(t * 0.7 + i) * 0.05 + 0.1) % 1) * (w.x1 - w.x0);
      ctx.beginPath(); ctx.ellipse(x, w.bottom - 0.05, 0.3, 0.03, 0, 0, TAU); ctx.fill();
    }
    r.screen();
  }
}
