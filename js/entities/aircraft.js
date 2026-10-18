// Вертолёт, самолёт и пушка-турель.
import { Entity, visPoly, visCircle, V, CAT, pl } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, TAU, polyArea, mirrorPts, mix, clamp, wrapAngle } from '../util.js';
import { sfx } from '../audio.js';
import { Projectile } from './weapons.js';
import { Explosive } from './explosives.js';

function glassFill(ctx, pts) {
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
  g.addColorStop(0, '#d4f0ff'); g.addColorStop(0.5, '#6aa8cc'); g.addColorStop(1, '#2f5f80');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,25,0.7)';
  ctx.lineWidth = 0.03;
  ctx.stroke();
}

class Craft extends Entity {
  constructor(sim, f) {
    super(sim);
    this.isVehicle = true;
    this.f = f;
    this.ctrl = { x: 0, aim: 0, fire: false, mg: false };
    this.burn = 0;
    this.wrecked = false;
    this.burning = 0;
    this.cool = 0;
    this.mgCool = 0;
    this.pickPriority = -1;
  }
  colorOf(v) { return this.burn > 0.05 ? mix(v.color, '#1b1714', this.burn * 0.85) : v.color; }
  part(b, pts, color, t, o = {}) {
    const p = mirrorPts(pts, this.f, 1);
    if (!o.vis) this.fix(b, polyShape(p), { density: o.density, friction: 0.6, mat: o.mat || 'metal' });
    const v = visPoly(b, p, { z: o.z || 0, t, color, tex: o.tex ?? 'paint' });
    if (o.detail) { const f = this.f; v.detail = (ctx) => { ctx.save(); ctx.scale(f, 1); o.detail(ctx); ctx.restore(); }; }
    return this.vis(v);
  }
  get controlledNow() { return this.sim.controlled === this; }
  activate() { return 'drive'; }
  flammability(body) { return 0.4; }
  onBurn(body, dt) { this.burn = Math.min(1, this.burn + dt * 0.02); this.damage(dt * 40, 'fire'); }
  damage(amount, kind) {
    if (this.wrecked || this.burning > 0) return;
    this.hp -= kind === 'bullet' ? amount * 0.25 : amount;
    if (this.hp <= 0) this.burning = 2.5;
  }
  onBlast(body, dmg) { this.burn = Math.min(1, this.burn + dmg / 600); this.damage(dmg * 4, 'blast'); }
  onImpulse(myFix, otherFix, imp) {
    // Замороженное (статичное) тело имеет массу 0 — от ударов оно не страдает.
    if (!this.chassis.isDynamic()) return;
    const dv = imp / this.chassis.getMass();
    if (dv > 9) this.damage((dv - 9) * 80, 'crash');
  }
  mg(from, dir) {
    if (this.mgCool > 0) return;
    this.mgCool = 0.07;
    const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.04;
    this.sim.hitscan(from.x, from.y, Math.cos(a), Math.sin(a), { damage: 28, impulse: 8, group: this.group });
    this.sim.effects.muzzle(from.x, from.y, dir.x, dir.y, 1);
    sfx.shot('rifle', from);
  }
  burnTick(dt, at) {
    if (this.burning <= 0) return;
    this.burning -= dt;
    this.sim.effects.flame(at.x + rand(-0.4, 0.4), at.y, 0.5);
    if (Math.random() < 0.4) this.sim.effects.smokePuff(at.x, at.y - 0.5, 0.5, '#2a2a2a', 0.6);
    if (this.burning <= 0 && !this.wrecked) {
      this.wrecked = true;
      this.burn = 1;
      const p = this.chassis.getWorldCenter();
      this.sim.explode(p.x, p.y, 2.4, 9);
    }
  }
}

// ---------- Вертолёт ----------
export class Helicopter extends Craft {
  constructor(sim, x, y, f = 1) {
    super(sim, f);
    this.name = 'Вертолёт';
    this.kind = 'heli';
    this.rotor = 0;
    this.rotorA = 0;
    this.hp = 900;
    this.chopCd = new Map();
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 1.5, linearDamping: 0.1 }));
    const cabin = [[1.7, -0.25], [1.25, -1.15], [-0.7, -1.2], [-1.05, -0.45], [-0.6, 0.05], [1.25, 0.05]];
    const boom = R(-3.7, -0.92, -0.9, -0.62);
    const fin = [[-3.7, -0.92], [-3.3, -0.9], [-3.75, -1.75], [-4.0, -1.7]];
    const skid = R(-1.1, 0.28, 1.3, 0.36);
    const total = polyArea(cabin) + polyArea(boom) + polyArea(fin) + polyArea(skid);
    const dens = 1600 / total;
    this.part(c, cabin, '#2f4f3f', 2.0, {
      density: dens,
      detail: (ctx) => {
        glassFill(ctx, [[1.5, -0.3], [1.15, -1.0], [0.55, -1.0], [0.55, -0.3]]);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.025;
        ctx.strokeRect(-0.55, -1.0, 0.95, 0.85);
        ctx.fillStyle = '#e8e2c8';
        ctx.save(); ctx.translate(-0.35, -0.42); ctx.scale(0.004, 0.004); ctx.font = '800 100px system-ui, sans-serif'; ctx.fillText('★', 0, 0); ctx.restore();
        ctx.fillStyle = '#1e2a22';
        ctx.fillRect(0.2, 0.0, 0.5, 0.12);
      },
    });
    this.part(c, boom, '#2a463a', 0.5, { density: dens });
    this.part(c, fin, '#2a463a', 0.15, { density: dens });
    this.part(c, skid, '#1d1f22', 1.8, { density: dens, tex: 'metal' });
    this.part(c, R(-0.15, -1.45, 0.15, -1.18), '#3a3f46', 0.3, { vis: true, tex: 'metal' });
    this.part(c, R(0.0, 0.0, 0.6, 0.15), '#3a3f46', 1.6, { vis: true, z: 0, tex: 'metal' });
    this.vis({ custom: (r) => this.drawRotor(r), z: -0.2, body: c });
  }
  preStep(h) {
    const c = this.chassis;
    const on = this.sim.controlledEnt === this && !this.wrecked;
    this.rotor = clamp(this.rotor + (on ? h * 0.8 : -h * 0.35), 0, 1);
    if (this.rotor <= 0) return;
    const m = c.getMass(), g = this.sim.def.gravity || 9.8;
    const up = c.getWorldVector(V(0, -1));
    // Тяга компенсирует наклон, чтобы вертолёт держал высоту.
    const tilt = Math.max(0.55, Math.cos(c.getAngle()));
    const thrust = on ? (m * Math.max(g, 2) * (1 + this.ctrl.aim * 0.6) * this.rotor) / tilt : m * g * 0.6 * this.rotor;
    c.applyForceToCenter(V(up.x * thrust, up.y * thrust), true);
    const target = (on ? this.ctrl.x : 0) * 0.38;
    const err = wrapAngle(target - c.getAngle());
    const I = c.getInertia();
    c.applyTorque(I * (14 * err - 6 * c.getAngularVelocity()) * this.rotor, true);
    const v = c.getLinearVelocity();
    c.applyForceToCenter(V(-v.x * m * 0.25, -v.y * m * 0.25), true);
  }
  update(dt) {
    this.cool -= dt; this.mgCool -= dt;
    this.rotorA += this.rotor * dt * 30;
    const c = this.chassis, f = this.f;
    if (this.sim.controlledEnt === this && !this.wrecked) {
      const fwd = c.getWorldVector(V(f, 0.18));
      if (this.ctrl.mg) this.mg(c.getWorldPoint(V(1.75 * f, -0.15)), fwd);
      if (this.ctrl.fire && this.cool <= 0) {
        this.cool = 0.5;
        const p = c.getWorldPoint(V(0.4 * f, 0.18));
        const v = c.getLinearVelocity();
        const d = c.getWorldVector(V(f, 0.05));
        this.sim.add(new Projectile(this.sim, p.x + d.x * 0.6, p.y + d.y * 0.6, d.x * 25 + v.x, d.y * 25 + v.y, { kind: 'rocket', group: this.group, P: 1.6, R: 7 }));
        sfx.rocket(p);
      }
    }
    if (this.rotor > 0.3) {
      if (Math.random() < dt * 4) sfx.impact('metal', 0.05, c.getPosition());
      this.chop(dt);
    }
    this.burnTick(dt, c.getWorldPoint(V(0, -0.8)));
  }
  // Лопасти рубят всё, что в них попадает.
  chop(dt) {
    const c = this.chassis;
    const hub = c.getWorldPoint(V(0, -1.48));
    const ax = c.getWorldVector(V(1, 0));
    const L = 3.3;
    for (const [b, t] of this.chopCd) if (t - dt <= 0) this.chopCd.delete(b); else this.chopCd.set(b, t - dt);
    const lo = V(Math.min(hub.x - ax.x * L, hub.x + ax.x * L) - 0.1, Math.min(hub.y - ax.y * L, hub.y + ax.y * L) - 0.15);
    const hi = V(Math.max(hub.x - ax.x * L, hub.x + ax.x * L) + 0.1, Math.max(hub.y - ax.y * L, hub.y + ax.y * L) + 0.15);
    this.sim.world.queryAABB(new pl.AABB(lo, hi), (fix) => {
      const b = fix.getBody();
      const ud = b.getUserData();
      if (!ud || ud.ent === this || fix.isSensor() || this.chopCd.has(b)) return true;
      const p = b.getPosition();
      const rx = p.x - hub.x, ry = p.y - hub.y;
      const along = rx * ax.x + ry * ax.y;
      const perp = Math.abs(-rx * ax.y + ry * ax.x);
      if (Math.abs(along) > L || perp > 0.35) return true;
      this.chopCd.set(b, 0.12);
      if (ud.ground) { this.damage(200, 'crash'); return true; }
      const e = ud.ent;
      if (b.isDynamic()) b.applyLinearImpulse(V(rand(-1, 1) * 30, -20), p, true);
      if (e && e.isRagdoll) {
        const part = e.parts[ud.part];
        e.damage(part, 45 * this.rotor, 'cut', { x: p.x, y: p.y }, { x: ax.x, y: ax.y });
        this.sim.effects.bloodSpray(p.x, p.y, ax.x, -1, 14, 6, e.type.blood || 'oil');
        sfx.slice(p);
      } else {
        if (e && e.damage) e.damage(40, 'cut', b, p);
        this.sim.effects.sparks(p.x, p.y, 6, 1);
        this.damage(25, 'crash');
      }
      return true;
    });
  }
  drawRotor(r) {
    const c = this.chassis;
    const ctx = r.ctx;
    const hub = c.getWorldPoint(V(0, -1.48));
    const ax = c.getWorldVector(V(1, 0));
    const L = 3.3;
    r.face(-0.2);
    // Диск винта сбоку: две лопасти с меняющейся видимой длиной + размытие на оборотах.
    if (this.rotor > 0.25) {
      ctx.globalAlpha = 0.18 * this.rotor;
      ctx.fillStyle = '#c9ced4';
      ctx.beginPath();
      ctx.ellipse(hub.x, hub.y, L, 0.08, Math.atan2(ax.y, ax.x), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#222428';
    ctx.lineWidth = 0.09;
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const s = Math.cos(this.rotorA + k * Math.PI / 2) * L;
      ctx.beginPath();
      ctx.moveTo(hub.x - ax.x * s, hub.y - ax.y * s);
      ctx.lineTo(hub.x + ax.x * s, hub.y + ax.y * s);
      ctx.stroke();
    }
    const tail = c.getWorldPoint(V(-3.85 * this.f, -1.3));
    ctx.strokeStyle = '#222428';
    ctx.lineWidth = 0.05;
    const tr = 0.55, ta = this.rotorA * 1.7;
    ctx.beginPath();
    ctx.moveTo(tail.x + Math.cos(ta) * tr, tail.y + Math.sin(ta) * tr);
    ctx.lineTo(tail.x - Math.cos(ta) * tr, tail.y - Math.sin(ta) * tr);
    ctx.stroke();
    r.screen();
  }
}

// ---------- Самолёт ----------
export class Plane extends Craft {
  constructor(sim, x, y, f = 1) {
    super(sim, f);
    this.name = 'Самолёт';
    this.kind = 'plane';
    this.prop = 0;
    this.propA = 0;
    this.throttle = 0;
    this.hp = 700;
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 0.8, linearDamping: 0.02 }));
    const body = [[2.7, -0.42], [2.3, -0.8], [-1.6, -0.75], [-3.0, -0.6], [-3.0, -0.35], [-1.6, -0.1], [2.3, -0.08]];
    const fin = [[-2.6, -0.6], [-2.2, -0.65], [-2.95, -1.6], [-3.25, -1.6]];
    const total = polyArea(body) + polyArea(fin);
    const dens = 1100 / total;
    this.part(c, body, '#d8dde3', 1.3, {
      density: dens,
      detail: (ctx) => {
        glassFill(ctx, [[1.6, -0.78], [1.15, -1.1], [0.15, -1.1], [0.0, -0.78]]);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-1.6, -0.5, 4.2, 0.1);
        ctx.fillStyle = '#2b2f36';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-0.9 + i * 0.5, -0.45, 0.08, 0, TAU); ctx.fill(); }
      },
    });
    this.part(c, fin, '#c0392b', 0.12, { density: dens });
    this.part(c, R(-0.6, -0.55, 1.1, -0.4), '#aab2bb', 9, { vis: true, z: 0, tex: 'metal' });
    this.part(c, R(-3.0, -0.62, -2.3, -0.52), '#aab2bb', 3.4, { vis: true, z: 0, tex: 'metal' });
    // Шасси.
    const wheel = (lx, ly, rr) => {
      const wp = c.getWorldPoint(V(lx * f, ly));
      const w = this.makeBody(wp.x, wp.y, 0);
      this.fix(w, circleShape(rr), { density: 40 / (Math.PI * rr * rr), friction: 0.9, mat: 'rubber' });
      const j = sim.world.createJoint(new pl.WheelJoint({ enableMotor: true, maxMotorTorque: 5, motorSpeed: 0, frequencyHz: 4, dampingRatio: 0.7 }, c, w, wp, V(0, 1)));
      this.vis(visCircle(w, rr, { z: -0.35, t: 0.18, color: '#1c1c1c' }));
      this.vis(visCircle(w, rr, { z: 0.35, t: 0.18, color: '#1c1c1c' }));
      return j;
    };
    this.part(c, R(-0.66, -0.12, -0.54, 0.3), '#3a3f46', 0.9, { vis: true, tex: 'metal' });
    this.part(c, R(1.9, -0.12, 2.0, 0.36), '#3a3f46', 0.4, { vis: true, tex: 'metal' });
    this.wheelJoints = [wheel(-0.6, 0.3, 0.26), wheel(1.95, 0.39, 0.17)];
    this.vis({ custom: (r) => this.drawProp(r), z: -0.7, body: c });
  }
  preStep(h) {
    const c = this.chassis, f = this.f;
    const on = this.sim.controlledEnt === this && !this.wrecked;
    const want = on ? (this.ctrl.x * f > 0 ? 1 : this.ctrl.x * f < 0 ? -0.2 : this.throttle > 0.3 ? 0.6 : 0) : 0;
    this.throttle += (want - this.throttle) * Math.min(1, h * 1.5);
    const m = c.getMass(), g = this.sim.def.gravity || 9.8;
    const fwd = c.getWorldVector(V(f, 0));
    const up = c.getWorldVector(V(0, -1));
    const v = c.getLinearVelocity();
    const vf = v.x * fwd.x + v.y * fwd.y;
    c.applyForceToCenter(V(fwd.x * m * 12 * this.throttle, fwd.y * m * 12 * this.throttle), true);
    // Подъёмная сила ∝ v²; срыв потока на больших углах атаки.
    const vlen = Math.hypot(v.x, v.y);
    const aoa = vlen > 1 ? wrapAngle(Math.atan2(fwd.y, fwd.x) - Math.atan2(v.y, v.x)) * -f : 0;
    const stall = Math.abs(aoa) > 0.5 ? 0.3 : 1;
    const lift = (m * 9.8 / 22 / 22) * vf * Math.abs(vf) * (1 + clamp(aoa, -0.4, 0.4) * 2) * stall * (g > 0.1 ? 1 : 0);
    c.applyForceToCenter(V(up.x * Math.max(0, lift), up.y * Math.max(0, lift)), true);
    const drag = 0.012 * m * vlen;
    c.applyForceToCenter(V(-v.x * drag, -v.y * drag), true);
    const I = c.getInertia();
    const air = clamp(Math.abs(vf) / 18, 0, 1);
    // Рули высоты: ▲ — нос вверх.
    const wTarget = on ? -this.ctrl.aim * f * 1.3 * air : 0;
    c.applyTorque(I * (wTarget - c.getAngularVelocity()) * 4 * air, true);
    // Флюгерная устойчивость: нос выравнивается по скорости.
    if (vlen > 6) {
      const velA = Math.atan2(v.y, v.x);
      const noseA = Math.atan2(fwd.y, fwd.x);
      c.applyTorque(I * wrapAngle(velA - noseA) * 2.5 * air, true);
    }
    for (const j of this.wheelJoints) {
      j.setMotorSpeed(0);
      j.setMaxMotorTorque(on && this.ctrl.x * f < 0 ? 600 : 5);
    }
  }
  update(dt) {
    this.cool -= dt; this.mgCool -= dt;
    this.propA += this.throttle * dt * 60 + (this.sim.controlledEnt === this ? dt * 8 : 0);
    const c = this.chassis, f = this.f;
    if (this.sim.controlledEnt === this && !this.wrecked) {
      if (this.ctrl.mg) this.mg(c.getWorldPoint(V(2.8 * f, -0.3)), c.getWorldVector(V(f, 0)));
      if (this.ctrl.fire && this.cool <= 0) {
        this.cool = 1.2;
        const p = c.getWorldPoint(V(0.4 * f, 0.15));
        const b = new Explosive(this.sim, p.x, p.y + 0.4, 'bomb', f);
        b.armed = true;
        b.spawnT = this.sim.time;
        b.main.setTransform(b.main.getPosition(), c.getAngle());
        const v = c.getLinearVelocity();
        b.main.setLinearVelocity(V(v.x, v.y + 1));
        b.setGroup(this.group);
        this.sim.add(b);
        this.sim.after(0.6, () => { if (!b.removed) b.setGroup(b.group); });
        sfx.click(p);
      }
    }
    if (this.throttle > 0.2 && Math.random() < dt * 6) this.sim.effects.smokePuff(c.getWorldPoint(V(-1.5 * f, -0.4)).x, c.getWorldPoint(V(-1.5 * f, -0.4)).y, 0.15, '#9a9a9a', 0.25);
    this.burnTick(dt, c.getWorldPoint(V(1.5 * f, -0.5)));
  }
  drawProp(r) {
    const c = this.chassis;
    const ctx = r.ctx;
    const hub = c.getWorldPoint(V(2.78 * this.f, -0.42));
    const ay = c.getWorldVector(V(0, 1));
    r.face(-0.7);
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath(); ctx.arc(hub.x, hub.y, 0.1, 0, TAU); ctx.fill();
    if (this.throttle > 0.3) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#c9ced4';
      ctx.beginPath(); ctx.ellipse(hub.x, hub.y, 0.06, 0.75, Math.atan2(ay.y, ay.x) - Math.PI / 2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const s = Math.cos(this.propA) * 0.75;
      ctx.strokeStyle = '#222428';
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(hub.x - ay.x * s, hub.y - ay.y * s); ctx.lineTo(hub.x + ay.x * s, hub.y + ay.y * s); ctx.stroke();
    }
    r.screen();
  }
}

// ---------- Турель ----------
export class Turret extends Craft {
  constructor(sim, x, y, f = 1) {
    super(sim, f);
    this.name = 'Турель';
    this.kind = 'turret';
    this.hp = 1200;
    this.auto = true;
    this.thinkT = 0;
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 2 }));
    const base = [[-0.9, 0.3], [-0.5, -0.4], [0.5, -0.4], [0.9, 0.3]];
    this.part(c, base, '#4b5530', 1.4, { density: 500 / polyArea(base) });
    this.part(c, R(-0.15, -1.0, 0.15, -0.4), '#3c4427', 0.4, { density: 50 / 0.18 });
    const piv = c.getWorldPoint(V(0, -1.05));
    const gun = (this.gun = this.makeBody(piv.x, piv.y, 0, { angularDamping: 1 }));
    const parts = [R(-0.4, -0.25, 0.45, 0.2), R(0.45, -0.07, 1.6, 0.05), R(1.5, -0.1, 1.68, 0.08)];
    const ga = parts.reduce((a, p) => a + polyArea(p), 0);
    parts.forEach((pts, i) => {
      const p = mirrorPts(pts, f, 1);
      this.fix(gun, polyShape(p), { density: 120 / ga, mat: 'metal' });
      this.vis(visPoly(gun, p, { z: 0, t: i === 0 ? 0.6 : 0.14, color: i === 0 ? '#56653a' : '#22252a', tex: i === 0 ? 'paint' : 'metal' }));
    });
    this.joint = sim.world.createJoint(new pl.RevoluteJoint({ enableLimit: true, lowerAngle: f > 0 ? -1.2 : -0.4, upperAngle: f > 0 ? 0.4 : 1.2, enableMotor: true, maxMotorTorque: 4000, motorSpeed: 0 }, c, gun, piv));
    this.aimT = 0;
  }
  menu() { return [{ label: `Автоогонь: ${this.auto ? 'вкл' : 'выкл'}`, icon: '🎯', fn: () => { this.auto = !this.auto; } }]; }
  preStep(h) {
    const f = this.f;
    if (this.ctrl.aim && this.sim.controlledEnt === this) this.aimT = clamp(this.aimT - this.ctrl.aim * f * h * 0.8, f > 0 ? -1.2 : -0.4, f > 0 ? 0.4 : 1.2);
    this.joint.setMotorSpeed(clamp((this.aimT - this.joint.getJointAngle()) * 8, -3, 3));
  }
  update(dt) {
    this.mgCool -= dt;
    const g = this.gun, f = this.f;
    const mz = g.getWorldPoint(V(1.7 * f, 0));
    const dir = g.getWorldVector(V(f, 0));
    if (this.wrecked) return;
    if (this.sim.controlledEnt === this) {
      if (this.ctrl.fire || this.ctrl.mg) this.mg(mz, dir);
    } else if (this.auto) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = 0.3;
        let best = null, bd = 40;
        const piv = g.getPosition();
        for (const e of this.sim.entities) {
          if (!e.isRagdoll || !e.alive || !e.type.zombie) continue;
          const p = e.parts.head.gone ? e.parts.chest.body.getPosition() : e.parts.head.body.getPosition();
          const dx = p.x - piv.x;
          if (dx * f < 0.5) continue;
          const d = Math.hypot(dx, p.y - piv.y);
          if (d < bd) { bd = d; best = p; }
        }
        this.target = best ? { x: best.x, y: best.y } : null;
      }
      if (this.target) {
        const piv = g.getPosition();
        const want = Math.atan2(this.target.y - piv.y, this.target.x - piv.x);
        const base = this.chassis.getAngle();
        this.aimT = clamp(f > 0 ? wrapAngle(want - base) : wrapAngle(want - Math.PI - base), f > 0 ? -1.2 : -0.4, f > 0 ? 0.4 : 1.2);
        const cur = Math.atan2(dir.y, dir.x);
        if (Math.abs(wrapAngle(cur - want)) < 0.08) this.mg(mz, dir);
      }
    }
    this.burnTick(dt, this.chassis.getWorldPoint(V(0, -0.5)));
  }
}
