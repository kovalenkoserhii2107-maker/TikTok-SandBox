// Взрывчатка: граната, динамит, мина, C4, авиабомба, бочка, ядерная бомба.
import { Entity, visPoly, visCircle, visRRect, V, CAT, pl } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, TAU, polyArea, mirrorPts, roundRectPath } from '../util.js';
import { sfx } from '../audio.js';

// Текст в метрах: шрифты меньше 1px браузеры рисуют ненадёжно, поэтому масштабируем.
function tinyText(ctx, txt, x, y, size, color, family = 'system-ui, sans-serif') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = `800 100px ${family}`;
  ctx.fillStyle = color;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

export const EXPLOSIVES = {
  grenade: { name: 'Граната', mass: 0.6, P: 1.1, R: 6, fuse: 3, shrapnel: 26, chain: 15 },
  molotov: { name: 'Коктейль Молотова', mass: 0.9, fire: true },
  dynamite: { name: 'Динамит', mass: 1.2, P: 1.6, R: 7.5, fuse: 4, chain: 12 },
  mine: { name: 'Мина', mass: 3, P: 2, R: 6.5, chain: 10 },
  c4: { name: 'Взрывчатка C4', mass: 1, P: 2.6, R: 9.5, chain: 25, sticky: true },
  barrel: { name: 'Взрывоопасная бочка', mass: 40, P: 1.8, R: 8, chain: 8, hp: 35 },
  bomb: { name: 'Авиабомба', mass: 230, P: 4.2, R: 15, chain: 20 },
  nuke: { name: 'Ядерная бомба', mass: 900, P: 30, R: 80, fuse: 5, nuke: true },
};

export class Explosive extends Entity {
  constructor(sim, x, y, id, f = 1) {
    super(sim);
    this.isExplosive = true;
    this.expId = id;
    this.def = EXPLOSIVES[id];
    this.name = this.def.name;
    this.timer = null;
    this.armed = false;
    this.detonating = false;
    this.hp = this.def.hp ?? Infinity;
    this.spawnT = sim.time;
    this.stuck = null;
    this.beepT = 0;
    this.pickPriority = 0.25;
    if (id === 'c4') this.isC4 = true;
    this.f = f;
    const b = this.makeBody(x, y, 0, { angularDamping: 0.1 });
    this.build(b, f);
  }

  build(b, f) {
    const id = this.expId, d = this.def;
    const add = (pts, color, o = {}) => {
      pts = mirrorPts(pts, f, 1);
      if (!o.vis) this.fix(b, polyShape(pts), { density: d.mass / (o.areaTotal || polyArea(pts)), friction: o.friction ?? 0.6, mat: o.mat || 'metal', restitution: o.restitution ?? 0.1 });
      const v = visPoly(b, pts, { z: 0, t: o.t ?? 0.1, color, ...o.v });
      return this.vis(v);
    };
    if (id === 'grenade') {
      this.fix(b, circleShape(0.065), { density: d.mass / (Math.PI * 0.065 * 0.065), friction: 0.6, mat: 'metal', restitution: 0.3 });
      const v = this.vis(visCircle(b, 0.065, { z: 0, t: 0.13, color: '#4b5a32', sphere: true }));
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(20,30,10,0.6)'; ctx.lineWidth = 0.008;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-0.065, i * 0.025); ctx.lineTo(0.065, i * 0.025); ctx.stroke(); }
        ctx.fillStyle = '#8e959e';
        ctx.fillRect(-0.025, -0.095, 0.05, 0.035);
        if (this.timer === null) {
          ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 0.008;
          ctx.beginPath(); ctx.arc(0.04, -0.085, 0.018, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = '#7d848b';
        ctx.fillRect(0.02, -0.095, 0.012, 0.09);
      };
    } else if (id === 'molotov') {
      const body = R(-0.05, -0.08, 0.05, 0.13);
      const neck = R(-0.022, -0.17, 0.022, -0.08);
      const total = polyArea(body) + polyArea(neck);
      const v = add(body, '#3f7a3a', { t: 0.1, mat: 'glass', areaTotal: total, v: { alpha: 0.85 } });
      add(neck, '#3f7a3a', { t: 0.045, mat: 'glass', areaTotal: total, v: { alpha: 0.85 } });
      v.detail = (ctx) => {
        ctx.fillStyle = '#c9822b';
        ctx.fillRect(-0.045, -0.02, 0.09, 0.145);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-0.035, -0.07, 0.015, 0.18);
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(-0.016, -0.22, 0.032, 0.06);
      };
    } else if (id === 'dynamite') {
      const v = add(R(-0.16, -0.06, 0.16, 0.06), '#c0392b', { t: 0.12 });
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(60,10,10,0.6)'; ctx.lineWidth = 0.006;
        for (const y of [-0.02, 0.02]) { ctx.beginPath(); ctx.moveTo(-0.16, y); ctx.lineTo(0.16, y); ctx.stroke(); }
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(-0.05, -0.06, 0.03, 0.12);
        ctx.fillRect(0.05, -0.06, 0.03, 0.12);
        tinyText(ctx, 'TNT', -0.035, 0.013, 0.036, '#f2e6c8');
        ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 0.008;
        ctx.beginPath(); ctx.moveTo(0.16 * f, 0); ctx.quadraticCurveTo(0.22 * f, -0.03, 0.24 * f, -0.08); ctx.stroke();
      };
    } else if (id === 'mine') {
      const pts = [[-0.2, 0.0], [-0.15, -0.06], [0.15, -0.06], [0.2, 0.0]];
      const v = add(pts, '#3d4436', { t: 0.4, friction: 1 });
      add(R(-0.22, 0, 0.22, 0.03), '#2e3329');
      v.detail = (ctx) => {
        const on = this.armed && Math.floor(this.sim.time * 3) % 2 === 0;
        ctx.fillStyle = this.armed ? (on ? '#ff3b30' : '#661510') : '#3fbf4a';
        ctx.beginPath(); ctx.arc(0, -0.065, 0.014, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a6150';
        ctx.fillRect(-0.05, -0.08, 0.1, 0.02);
      };
    } else if (id === 'c4') {
      const v = add(R(-0.15, -0.055, 0.15, 0.055), '#d8cfae', { t: 0.08, friction: 1.2 });
      v.detail = (ctx) => {
        ctx.fillStyle = '#c6bd99';
        ctx.fillRect(-0.15, -0.012, 0.3, 0.024);
        ctx.fillStyle = '#1f2326';
        roundRectPath(ctx, -0.06, -0.045, 0.06, 0.0, 0.008); ctx.fill();
        tinyText(ctx, this.stuck ? 'ARM' : 'C-4', -0.042, -0.012, 0.03, this.stuck ? '#ff3b30' : '#55e06b', 'monospace');
        ctx.strokeStyle = '#e53935'; ctx.lineWidth = 0.007;
        ctx.beginPath(); ctx.moveTo(-0.06, -0.03); ctx.bezierCurveTo(-0.12, -0.08, -0.13, 0.03, -0.1, 0.04); ctx.stroke();
        ctx.strokeStyle = '#1e88e5';
        ctx.beginPath(); ctx.moveTo(0.06, -0.03); ctx.bezierCurveTo(0.12, -0.08, 0.13, 0.03, 0.1, 0.04); ctx.stroke();
      };
    } else if (id === 'barrel') {
      const v = this.vis(visRRect(b, -0.31, -0.46, 0.31, 0.46, 0.06, { z: 0, t: 0.62, color: '#c62828' }));
      this.fix(b, polyShape(R(-0.31, -0.46, 0.31, 0.46)), { density: d.mass / (0.62 * 0.92), friction: 0.6, mat: 'metal' });
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(60,0,0,0.5)'; ctx.lineWidth = 0.035;
        for (const y of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(-0.31, y); ctx.lineTo(0.31, y); ctx.stroke(); }
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(0, -0.17); ctx.lineTo(0.15, 0.1); ctx.lineTo(-0.15, 0.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(0, -0.07); ctx.quadraticCurveTo(0.07, 0.0, 0.035, 0.07); ctx.quadraticCurveTo(0, 0.04, -0.035, 0.07); ctx.quadraticCurveTo(-0.07, 0.0, 0, -0.07);
        ctx.fill();
        if (this.hp < this.def.hp) {
          ctx.fillStyle = '#1a0b0b';
          ctx.beginPath(); ctx.arc(-0.15, -0.15, 0.025, 0, TAU); ctx.fill();
        }
      };
    } else if (id === 'bomb') {
      const body = [[-0.55, -0.2], [0.25, -0.23], [0.6, -0.1], [0.68, 0], [0.6, 0.1], [0.25, 0.23], [-0.55, 0.2]];
      const fins = [[-0.95, -0.3], [-0.55, -0.12], [-0.55, 0.12], [-0.95, 0.3]];
      const total = polyArea(body) + polyArea(fins);
      const v = add(body, '#4f5b3a', { t: 0.46, areaTotal: total });
      add(fins, '#3f4a2e', { t: 0.5, areaTotal: total });
      v.detail = (ctx) => {
        ctx.save(); ctx.scale(f, 1);
        ctx.fillStyle = '#e8c547';
        ctx.fillRect(0.38, -0.2, 0.06, 0.4);
        ctx.fillRect(-0.4, -0.2, 0.05, 0.4);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(-0.5, -0.17, 1.0, 0.05);
        if (this.armed) {
          ctx.fillStyle = Math.floor(this.sim.time * 4) % 2 ? '#ff3b30' : '#7a1010';
          ctx.beginPath(); ctx.arc(0.1, -0.12, 0.03, 0, TAU); ctx.fill();
        }
        ctx.restore();
      };
    } else if (id === 'nuke') {
      const body = [[-1.3, -0.55], [0.7, -0.62], [1.35, -0.3], [1.5, 0], [1.35, 0.3], [0.7, 0.62], [-1.3, 0.55]];
      const fins = [[-2.0, -0.75], [-1.3, -0.35], [-1.3, 0.35], [-2.0, 0.75]];
      const total = polyArea(body) + polyArea(fins);
      const v = add(body, '#e0b52b', { t: 1.2, areaTotal: total });
      add(fins, '#2d2f33', { t: 1.3, areaTotal: total });
      v.detail = (ctx) => {
        ctx.save(); ctx.scale(f, 1);
        ctx.fillStyle = '#1f1f22';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          const x = -1.25 + i * 0.32;
          ctx.moveTo(x, 0.45); ctx.lineTo(x + 0.16, 0.45); ctx.lineTo(x + 0.28, 0.6); ctx.lineTo(x + 0.12, 0.6); ctx.fill();
        }
        // Знак радиации.
        ctx.fillStyle = '#1f1f22';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.36, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e0b52b';
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * TAU) / 3;
          ctx.beginPath(); ctx.moveTo(0, -0.05);
          ctx.arc(0, -0.05, 0.3, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#1f1f22';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e0b52b';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.05, 0, TAU); ctx.fill();
        if (this.timer !== null) {
          ctx.fillStyle = Math.floor(this.sim.time * 6) % 2 ? '#ff2a1a' : '#5a0a05';
          ctx.beginPath(); ctx.arc(0.95, -0.3, 0.07, 0, TAU); ctx.fill();
        }
        ctx.restore();
      };
    }
  }

  activate() {
    const id = this.expId;
    if (id === 'c4') {
      for (const e of this.sim.entities) if (e.isC4 && !e.removed) e.detonate(rand(0, 0.12));
      return true;
    }
    if (id === 'bomb') { this.armed = !this.armed; sfx.click(this.main.getPosition()); return true; }
    if (id === 'mine') { this.armed = true; return true; }
    if (id === 'barrel' || id === 'molotov') { this.detonate(0); return true; }
    if (this.timer === null) {
      this.timer = this.def.fuse;
      sfx.click(this.main.getPosition());
      if (id === 'grenade') {
        const p = this.main.getPosition();
        this.sim.effects.chunks(p.x, p.y - 0.08, 1, ['#7d848b'], 0.03, 3);
      }
    }
    return true;
  }

  update(dt) {
    const id = this.expId;
    const b = this.main;
    if (!b) return;
    if (id === 'mine' && !this.armed && this.sim.time - this.spawnT > 1.5) this.armed = true;
    if (id === 'molotov' && Math.random() < dt * 14) {
      const w = b.getWorldPoint(V(0, -0.23));
      this.sim.effects.flame(w.x, w.y, 0.06);
    }
    if (this.timer !== null && !this.detonating) {
      this.timer -= dt;
      this.beepT -= dt;
      const p = b.getPosition();
      if (this.beepT <= 0) {
        this.beepT = this.timer < 1.5 ? 0.18 : 0.5;
        if (id === 'nuke' || id === 'grenade') sfx.beep(this.timer < 1.5, p);
      }
      if (id === 'dynamite') {
        const fp = b.getWorldPoint(V(0.24 * this.facingSign(), -0.08));
        this.sim.effects.sparks(fp.x, fp.y, 1, 0.3);
      }
      if (this.timer <= 0) this.detonate(0);
    }
  }

  facingSign() { return this.f; }

  onBegin(c, myFix, otherFix) {
    const id = this.expId;
    const ob = otherFix.getBody();
    if (id === 'mine' && this.armed && !this.detonating) {
      const oud = ob.getUserData();
      if (ob.isDynamic() && ob.getMass() > 2 && !(oud && oud.ground)) this.detonate(0.05);
    }
    if (id === 'c4' && !this.stuck && this.sim.dragEnt !== this) {
      const wm = c.getWorldManifold(null);
      if (!wm || !wm.points[0]) return;
      const pt = V(wm.points[0].x, wm.points[0].y);
      this.sim.defer(() => {
        if (this.stuck || this.removed) return;
        const j = this.sim.world.createJoint(new pl.WeldJoint({}, this.main, ob, pt));
        this.stuck = this.sim.addLink(j, { type: 'stick', breakForce: 4000, onBreak: () => { this.stuck = null; } });
        sfx.click(pt);
      });
    }
  }

  onImpulse(myFix, otherFix, imp) {
    const dv = imp / this.main.getMass();
    if (this.expId === 'bomb' && this.armed && dv > 3) this.detonate(0);
    if (this.expId === 'barrel' && dv > 16) this.detonate(0.05);
    if (this.expId === 'molotov' && dv > 3.5 && this.sim.time - this.spawnT > 0.3) this.detonate(0);
    if (this.expId === 'grenade' && dv > 1.5 && !this.sim.silent) sfx.impact('metal', 0.3, this.main.getPosition());
  }

  onBullet(body, fix, point, dir, dmg, normal) {
    super.onBullet(body, fix, point, dir, 0, normal);
    if (this.expId === 'barrel') {
      this.hp -= dmg;
      if (this.hp <= 0) this.detonate(0.1);
    } else if (this.expId === 'bomb' && dmg > 40) this.detonate(0);
    else if (this.expId === 'molotov') this.detonate(0);
    else if (this.expId === 'dynamite' || this.expId === 'grenade') {
      if (dmg > 30) this.detonate(0);
    }
  }

  flammability() {
    return { barrel: 1, dynamite: 1, molotov: 1, c4: 0.5, grenade: 0.3, bomb: 0.3, mine: 0.3 }[this.expId] || 0;
  }

  onBurn(body, dt) {
    this.burnT = (this.burnT || 0) + dt;
    const id = this.expId;
    if (id === 'dynamite' && this.timer === null) this.timer = 1.5;
    else if (id === 'molotov') this.detonate(0);
    else if (this.burnT > (id === 'barrel' ? 2.5 : 3.5)) this.detonate(0);
  }

  onBlast(body, dmg) {
    if (this.def.nuke) return;
    if (dmg > (this.def.chain ?? 10)) this.detonate(rand(0.04, 0.16));
  }

  detonate(delay = 0) {
    if (this.detonating || this.removed) return;
    this.detonating = true;
    this.sim.after(delay, () => {
      if (this.removed) return;
      const b = this.main;
      const p = b.getWorldCenter();
      const x = p.x, y = p.y;
      const d = this.def;
      this.sim.remove(this);
      if (d.fire) { this.splashFire(x, y); return; }
      this.sim.explode(x, y, d.P, d.R, { nuke: d.nuke });
      if (d.shrapnel) {
        for (let i = 0; i < d.shrapnel; i++) {
          const a = rand(0, TAU);
          this.sim.hitscan(x, y, Math.cos(a), Math.sin(a), { damage: 22, impulse: 4, range: 14, tracer: 'rgba(255,220,160,0.6)', tracerW: 0.6 });
        }
      }
    });
  }

  // Молотов: разбитая бутылка, горящее топливо разливается.
  splashFire(x, y) {
    const sim = this.sim;
    const fx = sim.effects;
    fx.glassShards(x, y, 16, 3);
    sfx.glassBreak({ x, y });
    sfx.fireWhoosh({ x, y });
    for (let i = 0; i < fx.n(22); i++) {
      const a = rand(Math.PI, TAU);
      const s = rand(1, 5);
      fx.add({ type: 'fire', x, y, z: rand(-0.6, 0.6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), size: rand(0.15, 0.32), grow: 0.25, g: 0.6, drag: 1 });
    }
    fx.light(x, y, 6, 0.5, '#ff9a40');
    if (y > -2.5) sim.addGroundFire(x, 2.3, 9);
    const R2 = 2.2;
    sim.world.queryAABB(new pl.AABB(V(x - R2, y - R2), V(x + R2, y + R2)), (fix) => {
      sim.ignite(fix.getBody(), 8);
      return true;
    });
  }

  drawOverlay(r) {
    if (this.timer === null || this.detonating || !this.main) return;
    const p = this.main.getPosition();
    const big = this.expId === 'nuke';
    const [sx, sy] = r.P(p.x, p.y - (big ? 1.2 : 0.35), -0.3);
    const ctx = r.ctx;
    r.screen();
    ctx.font = `800 ${big ? 26 : 15}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const txt = Math.max(0, this.timer).toFixed(1);
    ctx.strokeText(txt, sx, sy);
    ctx.fillStyle = this.timer < 1.5 ? '#ff4a3a' : '#ffffff';
    ctx.fillText(txt, sx, sy);
  }
}
