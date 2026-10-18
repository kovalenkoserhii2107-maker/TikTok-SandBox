// Техника: грузовик, легковушка, танк. Колёса на подвеске, моторы, разрушение.
import { Entity, visPoly, visCircle, V, CAT, pl } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, TAU, polyArea, mirrorPts, mix, shade, clamp, roundRectPath } from '../util.js';
import { sfx } from '../audio.js';
import { Projectile } from './weapons.js';

function wheelDetail(rad, rim = '#9aa1a8', spokes = 5) {
  return (ctx) => {
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.92, 0, TAU); ctx.fill();
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.58, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(rim, -0.35);
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(rim, -0.3);
    ctx.lineWidth = rad * 0.07;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rad * 0.22, Math.sin(a) * rad * 0.22); ctx.lineTo(Math.cos(a) * rad * 0.55, Math.sin(a) * rad * 0.55); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = rad * 0.04;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rad * 0.9, Math.sin(a) * rad * 0.9); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); ctx.stroke();
    }
  };
}

const glass = (ctx, pts) => {
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
  g.addColorStop(0, '#cfeefc');
  g.addColorStop(0.5, '#6aa8cc');
  g.addColorStop(1, '#2f5f80');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,25,0.8)';
  ctx.lineWidth = 0.04;
  ctx.stroke();
};

export class Vehicle extends Entity {
  constructor(sim, x, y, kind, f = 1) {
    super(sim);
    this.isVehicle = true;
    this.kind = kind;
    this.f = f;
    this.ctrl = { x: 0, aim: 0, fire: false, mg: false };
    this.wheels = [];
    this.wheelJoints = [];
    this.burn = 0;
    this.wrecked = false;
    this.burning = 0;
    this.cool = 0;
    this.mgCool = 0;
    this.trackPos = 0;
    this.pickPriority = -1;
    if (kind === 'truck') this.buildTruck(x, y, f);
    else if (kind === 'car') this.buildCar(x, y, f);
    else this.buildTank(x, y, f);
  }

  colorOf(v) {
    return this.burn > 0.05 ? mix(v.color, '#1b1714', this.burn * 0.85) : v.color;
  }

  // Детали кузова на передней грани, в координатах «лицом вправо».
  chassisPart(b, pts, color, t, o = {}) {
    const p = mirrorPts(pts, this.f, 1);
    if (!o.vis) this.fix(b, polyShape(p), { density: o.density, friction: 0.6, mat: o.mat || 'metal', restitution: 0.05 });
    const v = visPoly(b, p, { z: o.z || 0, t, color, tex: color === '#2d3035' || color === '#26282c' ? 'metal' : color === '#7a5230' ? 'wood' : 'paint', ...o.v });
    if (o.detail) {
      const f = this.f;
      v.detail = (ctx) => { ctx.save(); ctx.scale(f, 1); o.detail(ctx); ctx.restore(); };
    }
    return this.vis(v);
  }

  addWheel(lx, ly, r, mass, o) {
    const c = this.chassis;
    const wp = c.getWorldPoint(V(lx * this.f, ly));
    const w = this.makeBody(wp.x, wp.y, 0, { angularDamping: 0.2 });
    this.fix(w, circleShape(r), { density: mass / (Math.PI * r * r), friction: 1.15, restitution: 0.05, mat: 'rubber' });
    const j = this.sim.world.createJoint(new pl.WheelJoint({
      enableMotor: true, maxMotorTorque: o.brake, motorSpeed: 0, frequencyHz: o.hz, dampingRatio: o.damp,
    }, c, w, wp, V(0, 1)));
    this.wheels.push(w);
    this.wheelJoints.push(j);
    const det = wheelDetail(r, o.rim, o.spokes);
    if (!o.noVis) {
      this.vis(visCircle(w, r, { z: o.zw, t: o.tw, color: '#1c1c1c', detail: det }));
      this.vis(visCircle(w, r, { z: -o.zw, t: o.tw, color: '#1c1c1c', detail: det }));
    }
    return w;
  }

  buildTruck(x, y, f) {
    this.name = 'Грузовик';
    this.maxW = 30; this.torque = 3200; this.brake = 600;
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 0.1 }));
    const red = '#c0392b';
    const parts = [
      [R(-2.7, -0.55, 2.55, -0.2), '#2d3035', 1.7],
      [[[1.0, -0.55], [1.0, -2.3], [1.95, -2.3], [2.6, -1.35], [2.6, -0.55]], red, 2.2, 'cab'],
      [R(-2.7, -0.75, 0.95, -0.55), '#7a5230', 2.2, 'bed'],
      [R(0.8, -1.55, 0.95, -0.75), red, 2.2],
      [R(-2.7, -1.3, -2.58, -0.75), red, 2.2],
      [R(2.5, -0.75, 2.8, -0.42), '#26282c', 2.3],
    ];
    const area = parts.reduce((a, p) => a + polyArea(p[0]), 0);
    const dens = 2700 / area;
    for (const [pts, col, t, tag] of parts) {
      let detail = null;
      if (tag === 'cab') detail = (ctx) => this.truckCab(ctx);
      if (tag === 'bed') detail = (ctx) => {
        ctx.strokeStyle = 'rgba(40,25,10,0.5)'; ctx.lineWidth = 0.025;
        for (let xx = -2.4; xx < 0.9; xx += 0.45) { ctx.beginPath(); ctx.moveTo(xx, -0.75); ctx.lineTo(xx, -0.55); ctx.stroke(); }
      };
      this.chassisPart(c, pts, col, t, { density: dens, detail });
    }
    // Боковые борта кузова (только визуально) — дают объём.
    for (const z of [-1.08, 1.08]) {
      this.chassisPart(c, R(-2.7, -1.25, 0.95, -0.72), red, 0.07, {
        vis: true, z,
        detail: (ctx) => {
          ctx.strokeStyle = 'rgba(60,10,10,0.45)'; ctx.lineWidth = 0.03;
          for (let xx = -2.2; xx < 0.9; xx += 0.6) { ctx.beginPath(); ctx.moveTo(xx, -1.25); ctx.lineTo(xx, -0.72); ctx.stroke(); }
        },
      });
    }
    this.chassisPart(c, R(0.92, -2.75, 1.0, -1.6), '#c9ced4', 0.09, { vis: true, z: 0.95 });
    this.chassisPart(c, R(0.25, -0.62, 0.9, -0.22), '#b7bdc4', 0.5, { vis: true, z: -0.85 });
    const wo = { brake: this.brake, hz: 3.6, damp: 0.6, zw: 0.95, tw: 0.38 };
    for (const lx of [1.85, -1.15, -2.15]) this.addWheel(lx, 0, 0.5, 75, wo);
    this.motorWheels = this.wheelJoints;
    this.hp = 900;
  }

  truckCab(ctx) {
    glass(ctx, [[1.15, -2.15], [1.88, -2.15], [2.38, -1.48], [1.15, -1.48]]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(1.3, -1.6); ctx.lineTo(1.6, -2.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.025;
    ctx.strokeRect(1.08, -2.22, 0.85, 1.6);
    ctx.fillStyle = '#222'; ctx.fillRect(1.15, -1.33, 0.16, 0.05);
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.arc(2.52, -1.05, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9f1a'; ctx.fillRect(2.45, -0.85, 0.12, 0.07);
    ctx.fillStyle = '#d0d4d8'; ctx.fillRect(1.98, -0.95, 0.6, 0.06);
    ctx.fillStyle = '#ffcf3a'; ctx.fillRect(1.25, -2.38, 0.5, 0.08);
  }

  buildCar(x, y, f) {
    this.name = 'Легковушка';
    this.maxW = 48; this.torque = 1300; this.brake = 250;
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 0.1 }));
    const blue = '#1e6fd9';
    const lower = [[-2.15, -0.22], [-2.2, -0.72], [1.9, -0.8], [2.25, -0.55], [2.2, -0.22]];
    const cabin = [[-1.45, -0.76], [-0.85, -1.36], [0.55, -1.36], [1.25, -0.78]];
    const area = polyArea(lower) + polyArea(cabin);
    const dens = 1250 / area;
    this.chassisPart(c, lower, blue, 1.75, {
      density: dens,
      detail: (ctx) => {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(-0.15, -0.76); ctx.lineTo(-0.15, -0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0.95, -0.78); ctx.lineTo(0.95, -0.3); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.fillRect(0.1, -0.65, 0.16, 0.04); ctx.fillRect(-1.25, -0.65, 0.16, 0.04);
        ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(2.12, -0.6, 0.09, 0.06, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e53935'; ctx.fillRect(-2.2, -0.68, 0.08, 0.12);
        ctx.fillStyle = '#cfd3d7'; ctx.fillRect(-2.2, -0.36, 4.4, 0.06);
      },
    });
    this.chassisPart(c, cabin, blue, 1.5, {
      density: dens,
      detail: (ctx) => {
        glass(ctx, [[-1.25, -0.8], [-0.78, -1.28], [-0.2, -1.28], [-0.2, -0.8]]);
        glass(ctx, [[-0.1, -0.8], [-0.1, -1.28], [0.5, -1.28], [1.05, -0.8]]);
      },
    });
    const wo = { brake: this.brake, hz: 4.2, damp: 0.6, zw: 0.8, tw: 0.3, rim: '#c9ced4', spokes: 6 };
    for (const lx of [1.35, -1.35]) this.addWheel(lx, 0, 0.36, 25, wo);
    this.motorWheels = this.wheelJoints;
    this.hp = 450;
  }

  buildTank(x, y, f) {
    this.name = 'Танк';
    this.maxW = 20; this.torque = 9000; this.brake = 4000;
    const c = (this.chassis = this.makeBody(x, y, 0, { angularDamping: 0.2 }));
    const olive = '#5b6b3a';
    const hull = [[-3.25, -0.45], [-3.35, -1.15], [2.6, -1.15], [3.45, -0.6], [3.3, -0.45]];
    const turret = [[-1.7, -1.15], [-1.55, -1.95], [0.85, -1.95], [1.45, -1.15]];
    const area = polyArea(hull) + polyArea(turret);
    const dens = 9500 / area;
    this.chassisPart(c, hull, olive, 2.4, {
      density: dens, mat: 'armor',
      detail: (ctx) => {
        ctx.fillStyle = 'rgba(30,40,20,0.35)';
        ctx.fillRect(-3.2, -1.05, 5.6, 0.1);
        ctx.fillStyle = '#3f4a28';
        for (let xx = -2.8; xx < 2.5; xx += 0.9) { ctx.beginPath(); ctx.arc(xx, -0.8, 0.05, 0, TAU); ctx.fill(); }
      },
    });
    this.chassisPart(c, turret, '#56653a', 2.1, {
      density: dens, mat: 'armor',
      detail: (ctx) => {
        ctx.fillStyle = '#3f4a28';
        ctx.fillRect(-0.95, -2.12, 0.6, 0.18);
        ctx.fillStyle = '#2b3220';
        ctx.fillRect(-1.3, -1.7, 0.5, 0.25);
        ctx.fillStyle = '#e8e2c8';
        ctx.save(); ctx.translate(-0.25, -1.45); ctx.scale(0.0035, 0.0035);
        ctx.font = '800 100px system-ui, sans-serif'; ctx.fillText('★', 0, 0); ctx.restore();
      },
    });
    // Боковые экраны над гусеницами.
    for (const z of [-1.62, 1.62]) {
      this.chassisPart(c, R(-3.25, -0.7, 3.15, -0.38), '#4f5d32', 0.06, {
        vis: true, z,
        detail: (ctx) => {
          ctx.strokeStyle = 'rgba(20,25,10,0.5)'; ctx.lineWidth = 0.03;
          for (let xx = -2.6; xx < 3.1; xx += 0.8) { ctx.beginPath(); ctx.moveTo(xx, -0.7); ctx.lineTo(xx, -0.38); ctx.stroke(); }
        },
      });
    }
    // Ствол на шарнире.
    const pivot = c.getWorldPoint(V(1.05 * f, -1.55));
    const bar = (this.barrel = this.makeBody(pivot.x, pivot.y, 0, { angularDamping: 0.5 }));
    const bp = [R(0, -0.1, 3.2, 0.1), R(-0.25, -0.22, 0.32, 0.22), R(3.0, -0.14, 3.35, 0.14)];
    const barea = bp.reduce((a, p) => a + polyArea(p), 0);
    bp.forEach((pts, i) => {
      const p = mirrorPts(pts, f, 1);
      this.fix(bar, polyShape(p), { density: 450 / barea, mat: 'armor' });
      this.vis(visPoly(bar, p, { z: 0, t: i === 1 ? 0.7 : 0.26, color: i === 1 ? '#4f5d32' : '#47542d' }));
    });
    this.barrelJoint = this.sim.world.createJoint(new pl.RevoluteJoint({
      enableLimit: true, lowerAngle: f > 0 ? -0.45 : -0.08, upperAngle: f > 0 ? 0.08 : 0.45,
      enableMotor: true, maxMotorTorque: 80000, motorSpeed: 0,
    }, c, bar, pivot));
    this.barrelT = 0;
    const wo = { brake: this.brake, hz: 5, damp: 0.8, zw: 1.42, tw: 0.32, rim: '#56653a', spokes: 6, noVis: false };
    for (const lx of [-2.55, -1.53, -0.51, 0.51, 1.53, 2.55]) this.addWheel(lx, 0, 0.37, 220, wo);
    this.motorWheels = this.wheelJoints;
    for (const z of [1.4, -1.4]) {
      this.vis({ custom: (r) => this.drawTrack(r, z), z: z + (z < 0 ? 0.04 : 0.01), body: c });
    }
    this.hp = 5000;
  }

  drawTrack(r, z) {
    const ctx = r.ctx;
    const c = this.chassis;
    const f = this.f;
    r.face(z);
    const pts = [];
    const L = (lx, ly) => { const p = c.getWorldPoint(V(lx * f, ly)); pts.push([p.x, p.y]); };
    const ir = 0.33;
    // Верхняя ветвь, передний ленивец, нижняя ветвь по колёсам, задний ленивец.
    L(-3.05, -0.12 - ir);
    L(3.05, -0.12 - ir);
    for (let i = 1; i <= 4; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI; L(3.05 + Math.cos(a) * ir, -0.12 + Math.sin(a) * ir); }
    const d = c.getWorldVector(V(0, 0.43));
    for (let i = this.wheels.length - 1; i >= 0; i--) {
      const p = this.wheels[i].getPosition();
      pts.push([p.x + d.x, p.y + d.y]);
    }
    for (let i = 1; i <= 4; i++) { const a = Math.PI / 2 + (i / 5) * Math.PI; L(-3.05 + Math.cos(a) * ir, -0.12 + Math.sin(a) * ir); }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    const col = this.burn > 0.1 ? '#121110' : '#23241f';
    if (z > 0) { ctx.fillStyle = '#1a1b17'; ctx.fill(); }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.17;
    ctx.stroke();
    ctx.setLineDash([0.08, 0.07]);
    ctx.lineDashOffset = -this.trackPos;
    ctx.strokeStyle = '#3d3e37';
    ctx.lineWidth = 0.11;
    ctx.stroke();
    ctx.setLineDash([]);
    for (const lx of [-3.05, 3.05]) {
      const p = c.getWorldPoint(V(lx * f, -0.12));
      ctx.fillStyle = '#2d3024';
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.27, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4f5d32';
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.12, 0, TAU); ctx.fill();
    }
    r.screen();
  }

  activate() { return 'drive'; }

  flammability(body) {
    if (this.wheels.includes(body)) return 0.7;
    return this.kind === 'tank' ? 0.15 : 0.45;
  }

  onBurn(body, dt) {
    this.burn = Math.min(1, this.burn + dt * 0.02);
    this.damage(dt * (this.kind === 'tank' ? 40 : 35), 'fire');
  }

  preStep(h) {
    const t = this.wrecked ? 0 : this.ctrl.x;
    for (const j of this.motorWheels) {
      if (t !== 0) {
        j.setMotorSpeed(t * this.maxW);
        j.setMaxMotorTorque(this.torque);
      } else {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(this.brake);
      }
    }
    if (this.barrelJoint) {
      const f = this.f;
      if (this.ctrl.aim && !this.wrecked) this.barrelT = clamp(this.barrelT - this.ctrl.aim * f * h * 0.6, f > 0 ? -0.45 : -0.08, f > 0 ? 0.08 : 0.45);
      const err = this.barrelT - this.barrelJoint.getJointAngle();
      this.barrelJoint.setMotorSpeed(clamp(err * 8, -1.5, 1.5));
    }
  }

  update(dt) {
    this.cool -= dt;
    this.mgCool -= dt;
    let sum = 0;
    for (const w of this.wheels) sum += w.getAngle();
    if (this.wheels.length) this.trackPos = (sum / this.wheels.length) * 0.37;
    const fx = this.sim.effects;
    if (this.ctrl.x && !this.wrecked && Math.random() < 0.5) {
      const ex = this.chassis.getWorldPoint(V(this.kind === 'truck' ? 0.96 * this.f : -2.2 * this.f, this.kind === 'truck' ? -2.75 : -0.5));
      fx.smokePuff(ex.x, ex.y, 0.15, '#6a6a6a', 0.35);
    }
    if (this.kind === 'tank' && !this.wrecked) {
      if (this.ctrl.fire) this.fireCannon();
      if (this.ctrl.mg && this.mgCool <= 0) this.fireMG();
    }
    if (this.burning > 0) {
      this.burning -= dt;
      const p = this.chassis.getWorldPoint(V((this.kind === 'truck' ? 1.8 : 0.5) * this.f, -1));
      fx.flame(p.x + rand(-0.4, 0.4), p.y, 0.5);
      if (Math.random() < 0.4) fx.smokePuff(p.x, p.y - 0.5, 0.5, '#2a2a2a', 0.6);
      if (this.burning <= 0) this.wreck();
    }
  }

  fireCannon() {
    if (this.cool > 0) return;
    this.cool = 1.3;
    const b = this.barrel, f = this.f;
    const mz = b.getWorldPoint(V(3.45 * f, 0));
    const dir = b.getWorldVector(V(f, 0));
    const v = b.getLinearVelocity();
    this.sim.add(new Projectile(this.sim, mz.x, mz.y, dir.x * 85 + v.x, dir.y * 85 + v.y, { kind: 'shell', group: this.group, P: 2.4, R: 7.5 }));
    b.applyLinearImpulse(V(-dir.x * 2600, -dir.y * 2600), b.getWorldPoint(V(0, 0)), true);
    const fx = this.sim.effects;
    fx.muzzle(mz.x, mz.y, dir.x, dir.y, 4);
    for (let i = 0; i < 8; i++) fx.smokePuff(mz.x + dir.x * rand(0, 1.2), mz.y + dir.y * rand(0, 1.2), 0.5, '#bdbdbd', 0.55);
    this.sim.shake(6);
    sfx.shot('cannon', mz);
  }

  fireMG() {
    this.mgCool = 0.09;
    const c = this.chassis, f = this.f;
    const mz = c.getWorldPoint(V(1.2 * f, -1.85));
    const dir = this.barrel.getWorldVector(V(f, 0));
    const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.05;
    this.sim.hitscan(mz.x, mz.y, Math.cos(a), Math.sin(a), { damage: 26, impulse: 8, group: this.group });
    this.sim.effects.muzzle(mz.x, mz.y, dir.x, dir.y, 0.9);
    sfx.shot('rifle', mz);
  }

  damage(amount, kind) {
    if (this.wrecked || this.burning > 0) return;
    this.hp -= kind === 'bullet' ? amount * 0.2 : amount;
    if (this.hp <= 0) this.burning = this.kind === 'tank' ? 2 : 3.5;
  }

  onBlast(body, dmg) {
    this.burn = Math.min(1, this.burn + dmg / 600);
    this.damage(dmg * 4, 'blast');
  }

  onImpulse(myFix, otherFix, imp) {
    // Замороженное (статичное) тело имеет массу 0 — от ударов оно не страдает.
    if (!this.chassis.isDynamic()) return;
    const dv = imp / this.chassis.getMass();
    if (dv > 10) this.damage((dv - 10) * 60, 'crash');
  }

  wreck() {
    if (this.wrecked) return;
    this.wrecked = true;
    this.burn = 1;
    const p = this.chassis.getWorldCenter();
    this.sim.explode(p.x, p.y, this.kind === 'tank' ? 3 : 2.2, 9);
    this.sim.defer(() => {
      for (const j of this.wheelJoints) if (Math.random() < 0.5) this.sim.world.destroyJoint(j);
      if (this.barrelJoint) { this.sim.world.destroyJoint(this.barrelJoint); this.barrelJoint = null; }
      this.motorWheels = [];
    });
  }
}
