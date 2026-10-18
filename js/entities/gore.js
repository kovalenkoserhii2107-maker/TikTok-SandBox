// Куски плоти, обломки металла и костей, которые отлетают от персонажей.
import { Entity, visPoly, V, CAT } from './base.js';
import { polyShape } from '../sim.js';
import { rand, TAU } from '../util.js';

const STYLE = {
  flesh: { color: '#8e1f1f', inner: '#c94a4a', mat: 'flesh', blood: 'blood', density: 120 },
  zombie: { color: '#4f5e2a', inner: '#7a2a2a', mat: 'zombie', blood: 'zblood', density: 120 },
  metal: { color: '#7d8590', inner: '#c3c9d0', mat: 'metal', blood: null, density: 300 },
  bone: { color: '#e4d8bc', inner: '#f5eedc', mat: 'bone', blood: null, density: 90 },
};

let chunks = [];

export class FleshChunk extends Entity {
  constructor(sim, x, y, vx, vy, o = {}) {
    super(sim);
    this.isGore = true;
    this.isDebris = true;
    this.name = o.kind === 'metal' ? 'Обломок' : o.kind === 'bone' ? 'Кость' : 'Кусок плоти';
    const st = (this.style = STYLE[o.kind] || STYLE.flesh);
    this.skin = o.skin || null;
    this.bleed = st.blood ? rand(2, 5) : 0;
    this.noShadow = true;
    const r = o.size || rand(0.035, 0.08);
    const n = 6;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      const rr = r * rand(0.6, 1.15);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (o.kind === 'bone' ? 0.45 : 0.7)]);
    }
    const b = this.makeBody(x, y, rand(0, TAU), { angularDamping: 5, linearDamping: 0.3, bullet: true });
    this.fix(b, polyShape(pts), { density: st.density, friction: 1.4, restitution: 0.02, mat: st.mat, cat: CAT.DEBRIS, mask: CAT.STATIC | CAT.OBJ });
    b.setLinearVelocity(V(vx, vy));
    b.setAngularVelocity(rand(-14, 14));
    const v = this.vis(visPoly(b, pts, { z: rand(-0.15, 0.15), t: r * 1.2, color: st.color, tex: st.mat === 'metal' ? 'metal' : 'skin' }));
    const skin = this.skin;
    v.detail = (ctx) => {
      ctx.fillStyle = st.inner;
      ctx.beginPath();
      ctx.ellipse(r * 0.1, r * 0.1, r * 0.45, r * 0.3, 0.6, 0, TAU);
      ctx.fill();
      if (skin) {
        // Кусок кожи по краю.
        ctx.strokeStyle = skin;
        ctx.lineWidth = r * 0.35;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.stroke();
      }
      if (st.mat === 'flesh' && r > 0.05) {
        ctx.fillStyle = '#f2e8d4';
        ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.2, r * 0.16, 0, TAU); ctx.fill();
      }
    };
    chunks.push(this);
    chunks = chunks.filter((c) => !c.removed);
    if (chunks.length > 70) sim.remove(chunks.shift());
  }

  update(dt) {
    if (this.bleed <= 0 || !this.main) return;
    this.bleed -= dt;
    const v = this.main.getLinearVelocity();
    if (Math.random() < dt * (3 + Math.hypot(v.x, v.y))) {
      const p = this.main.getPosition();
      this.sim.effects.drip(p.x, p.y, this.style.blood);
    }
  }

  onImpulse(myFix, otherFix, imp) {
    if (!this.style.blood) return;
    // Замороженное (статичное) тело имеет массу 0 — от ударов оно не страдает.
    if (!this.main.isDynamic()) return;
    const dv = imp / this.main.getMass();
    if (dv > 4 && Math.random() < 0.5) {
      const p = this.main.getPosition();
      this.sim.effects.bloodSpray(p.x, p.y, 0, -1, 3, 1.5, this.style.blood);
    }
  }
}

// Выброс кусков: dir — направление удара, power — сила.
export function spawnChunks(sim, x, y, dx, dy, n, kind, o = {}) {
  if (sim.silent) return [];
  const out = [];
  const sp = o.speed ?? 6;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dy, dx) + rand(-0.9, 0.9);
    const s = sp * rand(0.4, 1.2);
    const k = i === 0 || Math.random() < 0.7 ? kind : (kind === 'flesh' || kind === 'zombie' ? 'bone' : kind);
    const c = new FleshChunk(sim, x + rand(-0.05, 0.05), y + rand(-0.05, 0.05), Math.cos(a) * s + (o.vx || 0), Math.sin(a) * s - rand(0, 2) + (o.vy || 0), {
      kind: k, size: (o.size || 0.06) * rand(0.6, 1.3), skin: k === kind ? o.skin : null,
    });
    sim.add(c);
    out.push(c);
  }
  return out;
}
