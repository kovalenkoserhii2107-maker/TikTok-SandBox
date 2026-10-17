// Предметы: ящики, бочки, кирпичи, арбуз, стекло, мячи, балки и т.д.
import { Entity, visPoly, visCircle, visRRect, V, CAT } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, pick, chance, TAU, shade, polyArea, circleOutline, roundRectPath } from '../util.js';
import { sfx } from '../audio.js';

function ellipsePts(rx, ry, n = 12) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return out;
}

export const PROPS = {
  crate: {
    name: 'Деревянный ящик', w: 1, h: 1, mass: 30, mat: 'wood', color: '#b5834a', t: 1, hp: 90, breakDv: 9, impactK: 9,
    detail(ctx, w, h) {
      ctx.strokeStyle = '#6e4a22'; ctx.lineWidth = 0.035;
      ctx.strokeRect(-w / 2 + 0.04, -h / 2 + 0.04, w - 0.08, h - 0.08);
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 0.06, h / 2 - 0.06); ctx.lineTo(w / 2 - 0.06, -h / 2 + 0.06);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(80,50,20,0.35)'; ctx.lineWidth = 0.012;
      for (let i = 1; i < 4; i++) {
        const y = -h / 2 + (i * h) / 4;
        ctx.beginPath(); ctx.moveTo(-w / 2 + 0.06, y); ctx.lineTo(w / 2 - 0.06, y); ctx.stroke();
      }
      ctx.fillStyle = '#5a5a5a';
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath(); ctx.arc(x * (w / 2 - 0.09), y * (h / 2 - 0.09), 0.02, 0, TAU); ctx.fill();
      }
    },
    debris: 'planks',
  },
  metalCrate: {
    name: 'Металлический контейнер', w: 1.3, h: 1.2, mass: 220, mat: 'metal', color: '#4f7c8f', t: 1.3,
    detail(ctx, w, h) {
      ctx.strokeStyle = 'rgba(20,35,45,0.55)'; ctx.lineWidth = 0.03;
      for (let i = -2; i <= 2; i++) {
        const x = (i * w) / 6;
        ctx.beginPath(); ctx.moveTo(x, -h / 2 + 0.08); ctx.lineTo(x, h / 2 - 0.08); ctx.stroke();
      }
      ctx.fillStyle = '#e8b923';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const x = -w / 2 + i * 0.28;
        ctx.moveTo(x, h / 2 - 0.12); ctx.lineTo(x + 0.14, h / 2 - 0.12); ctx.lineTo(x + 0.04, h / 2); ctx.lineTo(x - 0.1, h / 2);
        ctx.fill();
      }
    },
  },
  barrel: {
    name: 'Бочка', w: 0.62, h: 0.9, mass: 35, mat: 'metal', color: '#2f6e9e', t: 0.62, round: 0.06,
    detail(ctx, w, h) {
      ctx.strokeStyle = 'rgba(10,25,40,0.55)'; ctx.lineWidth = 0.035;
      for (const y of [-h * 0.3, h * 0.3]) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-w * 0.32, -h / 2 + 0.05, w * 0.1, h - 0.1);
    },
  },
  brick: {
    name: 'Кирпич', w: 0.25, h: 0.12, mass: 2.6, mat: 'stone', color: '#b5523b', t: 0.12, hp: 60, breakDv: 14, impactK: 6, debris: 'stone',
    detail(ctx, w, h) {
      ctx.fillStyle = 'rgba(60,20,10,0.25)';
      ctx.beginPath(); ctx.arc(-w * 0.2, 0, 0.012, 0, TAU); ctx.arc(w * 0.2, h * 0.1, 0.01, 0, TAU); ctx.fill();
    },
  },
  concrete: {
    name: 'Бетонный блок', w: 1.2, h: 0.6, mass: 280, mat: 'stone', color: '#a3a19b', t: 0.6, hp: 600, breakDv: 30, impactK: 4, debris: 'stone',
    detail(ctx, w, h) {
      ctx.fillStyle = 'rgba(60,60,55,0.25)';
      for (let i = 0; i < 9; i++) {
        ctx.beginPath(); ctx.arc(-w / 2 + ((i * 0.37) % w), -h / 2 + ((i * 0.23) % h), 0.015, 0, TAU); ctx.fill();
      }
    },
  },
  plank: {
    name: 'Доска', w: 2.2, h: 0.09, mass: 9, mat: 'wood', color: '#c99a5e', t: 0.3, hp: 70, breakDv: 12, impactK: 5, debris: 'halves',
    detail(ctx, w, h) {
      ctx.strokeStyle = 'rgba(90,55,20,0.35)'; ctx.lineWidth = 0.008;
      ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.1); ctx.bezierCurveTo(-w * 0.2, -h * 0.3, w * 0.1, h * 0.3, w / 2, 0); ctx.stroke();
    },
  },
  beam: {
    name: 'Стальная балка', w: 3.2, h: 0.25, mass: 320, mat: 'metal', color: '#8a5a3a', t: 0.25,
    detail(ctx, w, h) {
      ctx.fillStyle = 'rgba(40,20,10,0.35)';
      ctx.fillRect(-w / 2, -h * 0.18, w, h * 0.36);
      ctx.fillStyle = '#4b4b4b';
      for (let x = -w / 2 + 0.2; x < w / 2; x += 0.4) { ctx.beginPath(); ctx.arc(x, 0, 0.025, 0, TAU); ctx.fill(); }
    },
  },
  ball: {
    name: 'Мяч', r: 0.26, mass: 0.6, mat: 'rubber', color: '#e8e8e8', restitution: 0.78, sphere: true,
    detail(ctx, r) {
      const cols = ['#e63946', '#f1c40f', '#2d9cdb'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, (i * TAU) / 3, (i * TAU) / 3 + TAU / 6); ctx.closePath(); ctx.fill();
      }
    },
  },
  tire: {
    name: 'Покрышка', r: 0.42, mass: 14, mat: 'rubber', color: '#232323', restitution: 0.55, t: 0.3,
    detail(ctx, r) {
      ctx.fillStyle = '#3d3d3d'; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
      ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.03;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
      }
    },
  },
  melon: {
    name: 'Арбуз', rx: 0.24, ry: 0.19, mass: 7, mat: 'melon', color: '#2e7d32', hp: 25, breakDv: 7, impactK: 6, debris: 'melon', sphere: true,
    detail(ctx, rx, ry) {
      ctx.strokeStyle = '#1b4d1e'; ctx.lineWidth = 0.035;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(i) * rx * 0.25 + 0.01, ry, 0, -Math.PI / 2, Math.PI / 2, i < 0); ctx.stroke();
      }
      ctx.fillStyle = '#6b4a1f';
      ctx.fillRect(-0.01, -ry - 0.02, 0.02, 0.03);
    },
  },
  glass: {
    name: 'Стекло', w: 0.08, h: 1.8, mass: 14, mat: 'glass', color: '#9fd6ef', t: 1.2, hp: 12, breakDv: 4, impactK: 6, debris: 'glass', alpha: true,
    detail(ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.4); ctx.lineTo(-w * 0.2, -h * 0.1); ctx.stroke();
    },
  },
  platform: {
    name: 'Платформа (неподвижная)', w: 6, h: 0.35, mass: 600, mat: 'stone', color: '#8d8f94', t: 2, static: true,
    detail(ctx, w, h) {
      ctx.fillStyle = '#e1b12c';
      for (let x = -w / 2; x < w / 2; x += 0.5) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2); ctx.lineTo(x + 0.25, -h / 2); ctx.lineTo(x + 0.1, -h / 2 + 0.08); ctx.lineTo(x - 0.15, -h / 2 + 0.08);
        ctx.fill();
      }
    },
  },
};

// Обломки — тоже физические тела, но лёгкие и без прочности.
let debrisList = [];

export class Prop extends Entity {
  constructor(sim, x, y, id, f = 1, opts = {}) {
    super(sim);
    const d = (this.def = opts.def || PROPS[id]);
    this.propId = id;
    this.name = d.name;
    this.hp = d.hp ?? Infinity;
    this.broken = false;
    const b = this.makeBody(x, y, opts.angle || 0, { linearDamping: 0.02, angularDamping: 0.05 });
    let area;
    const fo = { friction: d.friction ?? 0.6, restitution: d.restitution ?? 0.1, mat: d.mat, cat: opts.debris ? CAT.DEBRIS : CAT.OBJ };
    if (d.pts) {
      area = polyArea(d.pts);
      this.fix(b, polyShape(d.pts), { ...fo, density: d.mass / area });
      this.vis(visPoly(b, d.pts, { z: 0, t: d.t ?? 0.2, color: d.color, detail: d.detailPts }));
    } else if (d.r) {
      area = Math.PI * d.r * d.r;
      this.fix(b, circleShape(d.r), { ...fo, density: d.mass / area });
      this.vis(visCircle(b, d.r, { z: 0, t: d.t ?? d.r * 2, color: d.color, sphere: d.sphere, detail: d.detail ? (ctx) => d.detail(ctx, d.r) : null }));
    } else if (d.rx) {
      const pts = ellipsePts(d.rx, d.ry);
      area = Math.PI * d.rx * d.ry;
      this.fix(b, polyShape(pts), { ...fo, density: d.mass / area });
      const v = this.vis(visPoly(b, pts, { z: 0, t: d.ry * 2, color: d.color, sphere: d.sphere }));
      v.path = (ctx) => ctx.ellipse(0, 0, d.rx, d.ry, 0, 0, TAU);
      v.rad = d.rx;
      if (d.detail) v.detail = (ctx) => d.detail(ctx, d.rx, d.ry);
    } else {
      const pts = R(-d.w / 2, -d.h / 2, d.w / 2, d.h / 2);
      area = d.w * d.h;
      this.fix(b, polyShape(pts), { ...fo, density: d.mass / area });
      const v = d.round
        ? visRRect(b, -d.w / 2, -d.h / 2, d.w / 2, d.h / 2, d.round, { z: 0, t: d.t ?? 0.3, color: d.color })
        : visPoly(b, pts, { z: 0, t: d.t ?? 0.3, color: d.color });
      if (d.detail) v.detail = (ctx) => d.detail(ctx, d.w, d.h);
      if (d.alpha) v.alpha = 0.55;
      this.vis(v);
    }
    if (d.static) { b.setStatic(); this.permanentStatic = true; }
    if (opts.debris) {
      this.isDebris = true;
      debrisList.push(this);
      debrisList = debrisList.filter((e) => !e.removed);
      if (debrisList.length > 70) sim.remove(debrisList.shift());
    }
  }

  onImpulse(myFix, otherFix, imp) {
    if (!isFinite(this.hp) || this.broken) return;
    const dv = imp / this.main.getMass();
    const thr = this.def.breakDv ?? 9;
    if (dv > thr) this.damage((dv - thr) * (this.def.impactK ?? 8), 'blunt');
  }

  damage(amount, kind) {
    if (!isFinite(this.hp) || this.broken) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.broken = true;
      this.sim.defer(() => this.shatter());
    }
  }

  onBlast(body, dmg) { this.damage(dmg * 1.5, 'blast'); }

  shatter() {
    if (this.removed) return;
    const b = this.main;
    const p = b.getPosition();
    const a = b.getAngle();
    const v = b.getLinearVelocity();
    const sim = this.sim;
    const d = this.def;
    sim.remove(this);
    const fx = sim.effects;
    const spawn = (lx, ly, def, ang = a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const e = new Prop(sim, p.x + lx * c - ly * s, p.y + lx * s + ly * c, null, 1, { def, angle: ang, debris: true });
      e.setVelocity(v.x + rand(-1.5, 1.5), v.y + rand(-2, 0.5));
      e.main.setAngularVelocity(rand(-4, 4));
      sim.add(e);
    };
    switch (d.debris) {
      case 'planks': {
        sfx.woodBreak(p);
        const pl = { name: 'Доска', w: d.w * 0.9, h: 0.07, mass: 2.5, mat: 'wood', color: shade(d.color, -0.05), t: d.t * 0.9 };
        for (let i = 0; i < 4; i++) spawn(0, -d.h / 2 + (i + 0.5) * (d.h / 4), pl);
        const side = { name: 'Брусок', w: 0.07, h: d.h * 0.85, mass: 1.2, mat: 'wood', color: '#6e4a22', t: d.t * 0.9 };
        spawn(-d.w / 2 + 0.05, 0, side);
        spawn(d.w / 2 - 0.05, 0, side);
        fx.chunks(p.x, p.y, 14, ['#a8743f', '#c99a5e', '#7c5229'], 0.05, 4);
        fx.dust(p.x, p.y, 6, '#c9a77a', 0.4);
        break;
      }
      case 'halves': {
        sfx.woodBreak(p);
        const half = { name: 'Обломок доски', w: d.w / 2 - 0.02, h: d.h, mass: d.mass / 2, mat: 'wood', color: d.color, t: d.t };
        spawn(-d.w / 4, 0, half, a + rand(-0.2, 0.2));
        spawn(d.w / 4, 0, half, a + rand(-0.2, 0.2));
        fx.chunks(p.x, p.y, 8, ['#a8743f', '#c99a5e'], 0.03, 3);
        break;
      }
      case 'stone': {
        sfx.impact('stone', 1, p);
        const n = d.w > 0.8 ? 6 : 2;
        for (let i = 0; i < n; i++) {
          const cw = (d.w / n) * rand(0.8, 1.3);
          const piece = { name: 'Обломок', w: cw, h: d.h * rand(0.4, 0.7), mass: d.mass / n / 1.5, mat: 'stone', color: shade(d.color, rand(-0.1, 0.05)), t: d.t * rand(0.6, 1) };
          spawn(-d.w / 2 + (i + 0.5) * (d.w / n), rand(-0.1, 0.1) * d.h, piece, a + rand(-0.5, 0.5));
        }
        fx.chunks(p.x, p.y, 16, ['#9a9a9a', '#7b7b7b', shade(d.color, -0.1)], 0.06, 4);
        fx.dust(p.x, p.y, 8, '#aaa49a', 0.5);
        break;
      }
      case 'melon': {
        sfx.squish(p);
        const slice = {
          name: 'Долька арбуза', pts: [[-0.16, 0], [0.16, 0], [0.11, -0.1], [0, -0.13], [-0.11, -0.1]], mass: 1.8, mat: 'melon', color: '#e53950', t: 0.3,
          detailPts: (ctx) => {
            ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 0.03;
            ctx.beginPath(); ctx.moveTo(-0.16, 0); ctx.lineTo(-0.11, -0.1); ctx.lineTo(0, -0.13); ctx.lineTo(0.11, -0.1); ctx.lineTo(0.16, 0); ctx.stroke();
            ctx.fillStyle = '#1a1a1a';
            for (const [x, y] of [[-0.06, -0.05], [0.03, -0.07], [0.07, -0.03], [-0.02, -0.03]]) { ctx.beginPath(); ctx.ellipse(x, y, 0.008, 0.014, 0, 0, TAU); ctx.fill(); }
          },
        };
        for (let i = 0; i < 3; i++) spawn(rand(-0.1, 0.1), rand(-0.1, 0.1), slice, rand(0, TAU));
        fx.bloodSpray(p.x, p.y, 0, -1, 30, 4, 'juice');
        fx.chunks(p.x, p.y, 12, ['#e53950', '#ff6b81', '#2e7d32'], 0.04, 4);
        break;
      }
      case 'glass': {
        sfx.glassBreak(p);
        fx.glassShards(p.x, p.y, 40, 4);
        const shard = { name: 'Осколок', pts: [[-0.06, 0.1], [0.05, -0.12], [0.06, 0.08]], mass: 0.4, mat: 'glass', color: d.color, t: 0.6 };
        for (let i = 0; i < 4; i++) spawn(rand(-0.03, 0.03), -d.h / 2 + rand(0, d.h), shard, rand(0, TAU));
        break;
      }
      default:
        fx.chunks(p.x, p.y, 10, [d.color], 0.05, 3);
    }
  }
}
