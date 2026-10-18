// Механизмы: кнопка, таймер, лазер-датчик, мотор, пила, поршень, лампа, электрошокер.
import { Entity, visPoly, visCircle, visRRect, V, CAT, pl } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, TAU, clamp, polyArea, roundRectPath } from '../util.js';
import { sfx } from '../audio.js';

function tinyText(ctx, txt, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = '800 100px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

class Machine extends Entity {
  constructor(sim) {
    super(sim);
    this.isMachine = true;
    this.on = false;
    this.pickPriority = 0.2;
  }
  box(b, pts, mass, color, o = {}) {
    if (!o.vis) this.fix(b, polyShape(pts), { density: mass / polyArea(pts), friction: o.friction ?? 0.7, mat: o.mat || 'metal', mask: o.mask });
    return this.vis(visPoly(b, pts, { z: 0, t: o.t ?? 0.4, color, tex: o.tex, ...o.v }));
  }
  onSignal() { this.toggle(); }
  toggle() { this.on = !this.on; sfx.click(this.main.getPosition()); }
  activate() { this.toggle(); return true; }
}

// ---------- Источники сигнала ----------
export class Button extends Machine {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Кнопка';
    this.isSource = true;
    this.pressed = 0;
    this.cool = 0;
    const b = this.makeBody(x, y, 0);
    this.box(b, R(-0.35, -0.08, 0.35, 0), 18, '#3a3f46', { t: 0.6 });
    this.fix(b, polyShape(R(-0.24, -0.2, 0.24, -0.08)), { sensor: true });
    const cap = this.vis(visRRect(b, -0.22, -0.16, 0.22, -0.08, 0.04, { z: 0, t: 0.45, color: '#d63c2f' }));
    this.capVis = cap;
  }
  colorOf(v) { return v === this.capVis && (this.pressed > 0 || this.cool > 0.3) ? '#7a1a12' : v.color; }
  press() {
    if (this.cool > 0) return;
    this.cool = 0.5;
    sfx.click(this.main.getPosition());
    this.sim.signal(this);
  }
  activate() { this.press(); return true; }
  onBegin(c, my, other) {
    if (!my.isSensor() || other.isSensor()) return;
    const ob = other.getBody();
    if (ob === this.main || !(ob.isDynamic() ? ob.getMass() > 0.4 : false)) return;
    this.pressed++;
    if (this.pressed === 1) this.sim.defer(() => this.press());
  }
  onEnd(c, my, other) {
    if (!my.isSensor() || other.isSensor()) return;
    const ob = other.getBody();
    if (ob === this.main || !ob.isDynamic() || ob.getMass() <= 0.4) return;
    this.pressed = Math.max(0, this.pressed - 1);
  }
  update(dt) { this.cool -= dt; }
}

export class Timer extends Machine {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Таймер';
    this.isSource = true;
    this.interval = 2;
    this.t = 0;
    const b = this.makeBody(x, y, 0);
    const v = this.box(b, R(-0.22, -0.16, 0.22, 0.16), 3, '#2b2f36', { t: 0.3 });
    v.detail = (ctx) => {
      ctx.fillStyle = '#0e1a10';
      roundRectPath(ctx, -0.17, -0.11, 0.17, 0.05, 0.02); ctx.fill();
      const txt = this.on ? Math.max(0, this.t).toFixed(1) : `${this.interval}с`;
      tinyText(ctx, txt, 0, 0.02, 0.1, this.on ? '#55ff7a' : '#3e7a4a');
      ctx.fillStyle = this.on ? '#ff3b30' : '#5a1a14';
      ctx.beginPath(); ctx.arc(0.12, 0.1, 0.025, 0, TAU); ctx.fill();
    };
  }
  toggle() { this.on = !this.on; this.t = this.interval; sfx.click(this.main.getPosition()); }
  menu() {
    return [{ label: `Интервал: ${this.interval} с`, icon: '⏱️', fn: () => { const opts = [0.5, 1, 2, 3, 5, 10]; this.interval = opts[(opts.indexOf(this.interval) + 1) % opts.length]; this.t = this.interval; } }];
  }
  update(dt) {
    if (!this.on) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t += this.interval;
      sfx.beep(true, this.main.getPosition());
      this.sim.signal(this);
    }
  }
}

export class Laser extends Machine {
  constructor(sim, x, y, f = 1) {
    super(sim);
    this.name = 'Лазер-датчик';
    this.isSource = true;
    this.on = true;
    this.f = f;
    this.base = null;
    this.hitDist = 25;
    this.tripped = false;
    const b = this.makeBody(x, y, f < 0 ? Math.PI : 0);
    const v = this.box(b, R(-0.16, -0.09, 0.16, 0.09), 2, '#2f3540', { t: 0.25 });
    this.box(b, R(0.16, -0.04, 0.22, 0.04), 0.1, '#111111', { vis: true, t: 0.12 });
    v.detail = (ctx) => {
      ctx.fillStyle = this.on ? (this.tripped ? '#ffcf3a' : '#ff2a2a') : '#3a1010';
      ctx.beginPath(); ctx.arc(-0.06, 0, 0.03, 0, TAU); ctx.fill();
    };
    this.vis({ custom: (r) => this.drawBeam(r), z: -0.05, body: b });
  }
  update(dt) {
    if (!this.on) { this.base = null; return; }
    const b = this.main;
    const p = b.getWorldPoint(V(0.23, 0));
    const d = b.getWorldVector(V(1, 0));
    let best = 25;
    this.sim.world.rayCast(p, V(p.x + d.x * 25, p.y + d.y * 25), (fix, pt, n, fr) => {
      if (fix.isSensor() || fix.getBody() === b) return -1;
      best = fr * 25;
      return fr;
    });
    this.hitDist = best;
    const moving = b.getLinearVelocity().length() > 0.05 || Math.abs(b.getAngularVelocity()) > 0.05;
    if (this.base === null || moving) { this.base = best; this.tripped = false; return; }
    if (best < this.base - 0.12) {
      if (!this.tripped) { this.tripped = true; this.sim.signal(this); sfx.beep(false, p); }
    } else {
      this.tripped = false;
      if (best > this.base) this.base = best;
    }
  }
  drawBeam(r) {
    if (!this.on || !this.main) return;
    const b = this.main;
    const p = b.getWorldPoint(V(0.23, 0));
    const d = b.getWorldVector(V(1, 0));
    const q = { x: p.x + d.x * this.hitDist, y: p.y + d.y * this.hitDist };
    const ctx = r.ctx;
    r.face(-0.05);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,40,40,0.25)';
    ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.strokeStyle = this.tripped ? '#ffd23f' : '#ff3030';
    ctx.lineWidth = 0.015;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,80,80,0.8)';
    ctx.beginPath(); ctx.arc(q.x, q.y, 0.04, 0, TAU); ctx.fill();
    r.screen();
  }
}

// ---------- Приёмники ----------
export class Motor extends Machine {
  constructor(sim, x, y, f = 1, saw = false) {
    super(sim);
    this.saw = saw;
    this.name = saw ? 'Циркулярная пила' : 'Мотор';
    this.on = true;
    this.cutCd = 0;
    const h = this.makeBody(x, y, 0);
    const hp = saw ? R(-0.3, -0.12, 0.3, 0.5) : R(-0.32, -0.32, 0.32, 0.32);
    // Корпус мотора не мешает тому, что приварено к диску (сталкивается только с землёй).
    const hv = this.box(h, hp, saw ? 60 : 45, saw ? '#c9a227' : '#3d4652', { t: 0.5, tex: 'paint', mask: saw ? undefined : CAT.STATIC });
    hv.detail = (ctx) => {
      ctx.fillStyle = this.on ? '#55ff7a' : '#1f4a2a';
      ctx.beginPath(); ctx.arc(saw ? 0.18 : 0.22, saw ? 0.38 : 0.22, 0.03, 0, TAU); ctx.fill();
    };
    const rr = saw ? 0.48 : 0.26;
    const rotor = (this.rotor = this.makeBody(x, y, 0, { angularDamping: 0.05 }));
    this.fix(rotor, circleShape(rr), { density: (saw ? 6 : 8) / (Math.PI * rr * rr), friction: 0.9, mat: 'metal', ud: saw ? { sharp: true } : {} });
    const rv = this.vis(visCircle(rotor, rr, { z: -0.3, t: saw ? 0.03 : 0.12, color: saw ? '#d5dbe1' : '#6d7783', tex: 'metal' }));
    rv.detail = (ctx) => {
      if (saw) {
        ctx.fillStyle = '#b7bec6';
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * rr * 0.96, Math.sin(a) * rr * 0.96);
          ctx.lineTo(Math.cos(a + 0.12) * rr * 1.1, Math.sin(a + 0.12) * rr * 1.1);
          ctx.lineTo(Math.cos(a + 0.24) * rr * 0.96, Math.sin(a + 0.24) * rr * 0.96);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(80,90,100,0.5)';
        ctx.lineWidth = 0.01;
        ctx.beginPath(); ctx.arc(0, 0, rr * 0.6, 0, TAU); ctx.stroke();
      } else {
        ctx.strokeStyle = '#2b2f36';
        ctx.lineWidth = 0.04;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rr * 0.85, Math.sin(a) * rr * 0.85); ctx.stroke();
        }
      }
      ctx.fillStyle = '#2b2f36';
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.18, 0, TAU); ctx.fill();
    };
    this.joint = sim.world.createJoint(new pl.RevoluteJoint({ enableMotor: true, maxMotorTorque: saw ? 900 : 4000, motorSpeed: 0 }, h, rotor, V(x, y)));
  }
  preStep() {
    this.joint.setMotorSpeed(this.on ? (this.saw ? 28 : 5) * (this.dir || 1) : 0);
    this.joint.setMaxMotorTorque(this.on ? (this.saw ? 900 : 4000) : this.saw ? 2 : 60);
  }
  menu() {
    return this.saw ? [] : [{ label: 'Сменить направление', icon: '🔄', fn: () => { this.dir = -(this.dir || 1); } }];
  }
  // Удар зубьями: урон по относительной скорости.
  onBegin(c, my, other) {
    if (!this.saw || !this.on || my.getBody() !== this.rotor || other.isSensor()) return;
    const ud = other.getBody().getUserData();
    const e = ud && ud.ent;
    if (!e || !e.isRagdoll) return;
    const p = e.parts[ud.part];
    const wm = c.getWorldManifold(null);
    if (!p || !wm || !wm.points[0]) return;
    const pt = { x: wm.points[0].x, y: wm.points[0].y };
    const va = this.rotor.getLinearVelocityFromWorldPoint(pt), vb = other.getBody().getLinearVelocityFromWorldPoint(pt);
    const vr = Math.hypot(va.x - vb.x, va.y - vb.y);
    this.sim.defer(() => {
      e.damage(p, vr * 4.5, 'cut', pt, { x: va.x - vb.x, y: va.y - vb.y });
      this.sim.effects.bloodSpray(pt.x, pt.y, va.x, va.y, 14, 5, e.type.blood || 'oil');
      sfx.slice(pt);
    });
  }

  update(dt) {
    if (!this.saw || !this.on) return;
    this.cutCd -= dt;
    const pos = this.rotor.getPosition();
    if (Math.random() < dt * 8) sfx.zap(pos);
    for (let ce = this.rotor.getContactList(); ce; ce = ce.next) {
      if (!ce.contact.isTouching()) continue;
      const ud = ce.other.getUserData();
      const e = ud && ud.ent;
      if (!e || e === this) continue;
      const wm = ce.contact.getWorldManifold(null);
      const pt = wm && wm.points[0] ? wm.points[0] : pos;
      if (e.isRagdoll) {
        const p = e.parts[ud.part];
        if (!p) continue;
        e.damage(p, dt * 70, 'cut');
        if (Math.random() < dt * 25) this.sim.effects.bloodSpray(pt.x, pt.y, 0, -1, 4, 4, e.type.blood || 'oil');
        if (this.cutCd <= 0) { this.cutCd = 0.15; sfx.slice(pt); }
      } else {
        if (e.damage) e.damage(dt * 60, 'cut', ce.other, pt);
        if (Math.random() < dt * 20) this.sim.effects.sparks(pt.x, pt.y, 2, 0.8);
      }
    }
  }
}

export class Piston extends Machine {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Поршень';
    const base = this.makeBody(x, y, 0);
    this.box(base, R(-0.28, -0.3, 0.28, 0.3), 60, '#3d4652', { t: 0.6, tex: 'paint' });
    this.box(base, R(-0.32, 0.2, 0.32, 0.3), 1, '#2b2f36', { vis: true, t: 0.65 });
    const rod = (this.rod = this.makeBody(x, y - 0.36, 0));
    this.fix(rod, polyShape(R(-0.5, -0.06, 0.5, 0.06)), { density: 25 / (1 * 0.12), friction: 0.8, mat: 'metal' });
    this.fix(rod, polyShape(R(-0.06, 0.06, 0.06, 0.62)), { density: 0.1, friction: 0.5, mat: 'metal' });
    this.vis(visPoly(rod, R(-0.06, 0.06, 0.06, 0.62), { z: 0, t: 0.12, color: '#c9ced4', tex: 'metal' }));
    this.vis(visPoly(rod, R(-0.5, -0.06, 0.5, 0.06), { z: 0, t: 0.6, color: '#e3b23c', tex: 'paint' }));
    this.joint = sim.world.createJoint(new pl.PrismaticJoint({
      enableLimit: true, lowerTranslation: 0, upperTranslation: 1.1, enableMotor: true, maxMotorForce: 60000, motorSpeed: -4,
    }, base, rod, V(x, y), V(0, -1)));
  }
  preStep() {
    this.joint.setMotorSpeed(this.on ? 22 : -4);
    this.joint.setMaxMotorForce(this.on ? 60000 : 8000);
  }
  toggle() { this.on = !this.on; sfx.impact('metal', 0.6, this.main.getPosition()); }
}

export class Lamp extends Machine {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Лампа';
    this.on = true;
    const b = this.makeBody(x, y, 0);
    this.box(b, R(-0.12, 0.05, 0.12, 0.2), 1.2, '#3a3f46', { t: 0.25 });
    this.fix(b, circleShape(0.15, 0, -0.08), { density: 0.3 / 0.07, friction: 0.5, mat: 'glass' });
    this.bulb = this.vis(visCircle(b, 0.15, { cy: -0.08, z: 0, t: 0.3, color: '#fff3c4', sphere: true, tex: null }));
  }
  colorOf(v) { return v === this.bulb ? (this.on ? '#fff3c4' : '#8a8a80') : v.color; }
  update() {
    if (!this.on) return;
    const p = this.main.getWorldPoint(V(0, -0.08));
    this.sim.effects.light(p.x, p.y, 3, 0.05, '#ffe2a0');
  }
}

export class ShockPlate extends Machine {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Электрошокер';
    this.zapT = 0;
    const b = this.makeBody(x, y, 0);
    const v = this.box(b, R(-0.9, -0.07, 0.9, 0.07), 70, '#46505c', { t: 1.2, tex: 'metal' });
    v.detail = (ctx) => {
      ctx.fillStyle = '#ffcf3a';
      for (let x0 = -0.8; x0 < 0.8; x0 += 0.32) {
        ctx.beginPath(); ctx.moveTo(x0, -0.07); ctx.lineTo(x0 + 0.16, -0.07); ctx.lineTo(x0 + 0.06, 0.07); ctx.lineTo(x0 - 0.1, 0.07); ctx.fill();
      }
      ctx.fillStyle = this.on ? '#5ad1ff' : '#1d3a4a';
      ctx.beginPath(); ctx.arc(0.82, 0, 0.035, 0, TAU); ctx.fill();
    };
    this.vis({ custom: (r) => this.drawArcs(r), z: -0.7, body: b });
  }
  update(dt) {
    if (!this.on) return;
    const b = this.main;
    const pos = b.getPosition();
    if (Math.random() < dt * 6) sfx.zap(pos);
    for (let ce = b.getContactList(); ce; ce = ce.next) {
      if (!ce.contact.isTouching()) continue;
      const ud = ce.other.getUserData();
      const e = ud && ud.ent;
      if (!e || !e.shock) continue;
      e.shock(ce.other, dt);
      const wm = ce.contact.getWorldManifold(null);
      if (wm && wm.points[0] && Math.random() < dt * 20) this.sim.effects.sparks(wm.points[0].x, wm.points[0].y, 2, 0.6);
    }
  }
  drawArcs(r) {
    if (!this.on || !this.main) return;
    const ctx = r.ctx;
    const b = this.main;
    r.face(-0.7);
    ctx.strokeStyle = 'rgba(140,220,255,0.9)';
    ctx.lineWidth = 0.015;
    for (let k = 0; k < 3; k++) {
      const x0 = rand(-0.8, 0.6);
      ctx.beginPath();
      let p = b.getWorldPoint(V(x0, -0.07));
      ctx.moveTo(p.x, p.y);
      for (let i = 1; i <= 4; i++) {
        p = b.getWorldPoint(V(x0 + i * 0.06, -0.07 - Math.abs(Math.sin(i + r.cam.x)) * rand(0.03, 0.12)));
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    r.screen();
  }
}
