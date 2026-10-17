// Огнестрельное оружие, холодное оружие и снаряды (ракеты).
import { Entity, visPoly, V, CAT, pl } from './base.js';
import { polyShape } from '../sim.js';
import { R, rand, gauss, TAU, polyArea, clamp, len, mirrorPts } from '../util.js';
import { sfx } from '../audio.js';

const DARK = '#2b2e33', BLACK = '#1b1c1f', WOOD = '#8a4b22', STEEL = '#8e959e';

// Геометрия: x — вперёд по стволу, y — вниз. phys: участвует в физике.
export const GUNS = {
  pistol: {
    name: 'Пистолет', mass: 0.9, rate: 0.13, dmg: 28, imp: 7, spread: 0.015, recoil: 2.2, snd: 'pistol', flash: 0.8,
    grip: [-0.012, 0.01], muzzle: [0.165, -0.065], eject: [0.05, -0.085],
    shapes: [
      { pts: R(-0.03, -0.085, 0.16, -0.045), color: '#2c3038' },
      { pts: R(-0.025, -0.05, 0.14, -0.025), color: BLACK },
      { pts: [[-0.03, -0.03], [0.02, -0.03], [0.01, 0.07], [-0.045, 0.065]], color: '#191a1d' },
    ],
  },
  revolver: {
    name: 'Револьвер', mass: 1.3, rate: 0.32, dmg: 48, imp: 12, spread: 0.01, recoil: 4.2, snd: 'revolver', flash: 1.1, pen: 1.2,
    grip: [-0.03, 0.01], muzzle: [0.225, -0.068], noCasing: true,
    shapes: [
      { pts: R(0.03, -0.08, 0.22, -0.055), color: STEEL },
      { pts: R(-0.045, -0.085, 0.035, -0.03), color: '#7a828b' },
      { pts: R(-0.02, -0.092, 0.05, -0.035), color: '#6b737c' },
      { pts: [[-0.045, -0.035], [0.0, -0.035], [-0.012, 0.07], [-0.065, 0.06]], color: '#6b3f1f' },
    ],
  },
  ak: {
    name: 'Автомат АК', mass: 3.6, rate: 0.1, auto: true, dmg: 34, imp: 10, spread: 0.028, recoil: 3.2, snd: 'rifle', flash: 1.2, pen: 1.3,
    grip: [-0.115, 0.01], muzzle: [0.475, -0.06], eject: [0.0, -0.09],
    shapes: [
      { pts: [[-0.48, -0.055], [-0.2, -0.072], [-0.2, -0.022], [-0.48, 0.04]], color: WOOD },
      { pts: R(-0.2, -0.085, 0.12, -0.025), color: DARK },
      { pts: R(0.12, -0.08, 0.3, -0.035), color: WOOD },
      { pts: R(0.3, -0.068, 0.47, -0.052), color: BLACK },
      { pts: R(0.12, -0.1, 0.33, -0.083), color: DARK, vis: true },
      { pts: R(0.42, -0.105, 0.437, -0.068), color: BLACK, vis: true },
      { pts: [[-0.02, -0.03], [0.06, -0.03], [0.1, 0.13], [0.03, 0.15]], color: '#33302c' },
      { pts: [[-0.13, -0.03], [-0.08, -0.03], [-0.1, 0.07], [-0.15, 0.065]], color: '#5a2e14' },
    ],
  },
  uzi: {
    name: 'Пистолет-пулемёт', mass: 2.2, rate: 0.065, auto: true, dmg: 21, imp: 5, spread: 0.06, recoil: 1.7, snd: 'smg', flash: 0.8,
    grip: [0.005, 0.03], muzzle: [0.215, -0.06], eject: [0.05, -0.09],
    shapes: [
      { pts: R(-0.12, -0.09, 0.15, -0.03), color: '#2f3235' },
      { pts: R(0.15, -0.07, 0.21, -0.05), color: BLACK },
      { pts: R(-0.02, -0.035, 0.03, 0.14), color: '#232527' },
      { pts: R(-0.3, -0.08, -0.12, -0.065), color: '#3a3d40', vis: true },
      { pts: R(-0.3, -0.08, -0.285, 0.0), color: '#3a3d40', vis: true },
    ],
  },
  shotgun: {
    name: 'Дробовик', mass: 3.4, rate: 0.85, pellets: 9, dmg: 17, imp: 6.5, spread: 0.085, recoil: 13, snd: 'shotgun', flash: 1.6, shellBig: true,
    grip: [-0.24, -0.02], muzzle: [0.555, -0.069], eject: [-0.12, -0.09],
    shapes: [
      { pts: [[-0.56, -0.05], [-0.25, -0.075], [-0.25, -0.025], [-0.56, 0.05]], color: '#6e3b1b' },
      { pts: R(-0.25, -0.085, 0.0, -0.025), color: '#33363b' },
      { pts: R(0.0, -0.08, 0.55, -0.058), color: '#2a2c30' },
      { pts: R(0.0, -0.056, 0.45, -0.035), color: '#25272a', vis: true },
      { pts: R(0.1, -0.062, 0.3, -0.022), color: '#6e3b1b' },
    ],
  },
  winchester: {
    name: 'Винчестер', mass: 3.6, rate: 0.7, dmg: 80, imp: 24, spread: 0.004, recoil: 9, snd: 'revolver', flash: 1.3, pen: 1.6,
    grip: [-0.22, -0.01], muzzle: [0.505, -0.071], eject: [-0.15, -0.09], lever: true,
    shapes: [
      { pts: [[-0.56, -0.04], [-0.24, -0.07], [-0.24, -0.03], [-0.56, 0.06]], color: '#7b4423' },
      { pts: R(-0.24, -0.088, -0.06, -0.03), color: '#c49a35' },
      { pts: R(-0.06, -0.08, 0.5, -0.062), color: '#3a3530' },
      { pts: R(-0.06, -0.06, 0.42, -0.045), color: '#33302b', vis: true },
      { pts: R(-0.06, -0.066, 0.16, -0.035), color: '#7b4423' },
    ],
  },
  sniper: {
    name: 'Снайперская винтовка', mass: 7, rate: 1.3, dmg: 170, imp: 36, spread: 0.0008, recoil: 15, snd: 'sniper', flash: 1.8, pen: 2.6, tracer: '#ffffff', tracerW: 1.8,
    grip: [-0.255, 0.01], muzzle: [0.805, -0.067], eject: [-0.1, -0.095],
    shapes: [
      { pts: [[-0.62, -0.06], [-0.3, -0.08], [-0.3, -0.02], [-0.62, 0.065]], color: '#3d4a2c' },
      { pts: R(-0.3, -0.09, 0.15, -0.03), color: '#2b3021' },
      { pts: R(0.15, -0.075, 0.76, -0.06), color: '#1d1f21' },
      { pts: R(0.74, -0.083, 0.8, -0.052), color: '#141516' },
      { pts: R(-0.19, -0.155, 0.12, -0.11), color: '#151618', vis: true },
      { pts: R(-0.05, -0.115, 0.0, -0.09), color: '#151618', vis: true },
      { pts: [[-0.27, -0.03], [-0.22, -0.03], [-0.24, 0.07], [-0.29, 0.065]], color: '#2b3021' },
      { pts: R(-0.12, -0.035, -0.04, 0.035), color: '#1e211a' },
    ],
  },
  minigun: {
    name: 'Миниган', mass: 16, rate: 0.035, auto: true, spin: true, dmg: 24, imp: 7, spread: 0.05, recoil: 1.9, snd: 'minigun', flash: 1.3, pen: 1.2,
    grip: [-0.175, 0.07], muzzle: [0.77, -0.06], eject: [-0.1, 0.0],
    shapes: [
      { pts: R(-0.36, -0.15, 0.06, 0.02), color: '#3b3f45' },
      { pts: R(0.06, -0.11, 0.75, -0.01), color: '#2a2d31' },
      { pts: R(0.58, -0.125, 0.65, 0.005), color: '#3b3f45', vis: true },
      { pts: R(-0.21, 0.02, -0.14, 0.13), color: '#222427' },
      { pts: R(-0.34, 0.02, -0.24, 0.15), color: '#4a5530', vis: true },
    ],
  },
  flamer: {
    name: 'Огнемёт', mass: 9, rate: 0.04, auto: true, flamer: true, recoil: 0.35, range: 7.5,
    grip: [-0.08, 0.02], muzzle: [0.62, -0.045],
    shapes: [
      { pts: R(-0.36, -0.02, -0.06, 0.15), color: '#b3261e' },
      { pts: R(-0.12, -0.075, 0.46, -0.02), color: '#3b3f45' },
      { pts: R(0.46, -0.065, 0.62, -0.028), color: '#22252a' },
      { pts: [[-0.1, -0.02], [-0.05, -0.02], [-0.06, 0.08], [-0.11, 0.075]], color: '#22252a' },
      { pts: [[0.2, -0.02], [0.25, -0.02], [0.24, 0.07], [0.19, 0.07]], color: '#22252a', vis: true },
      { pts: R(-0.3, 0.03, -0.12, 0.05), color: '#e8b923', vis: true },
    ],
  },
  rpg: {
    name: 'Ракетница РПГ', mass: 7, rate: 1.6, rocket: true, recoil: 5, snd: 'rocket',
    grip: [-0.06, 0.01], muzzle: [0.47, -0.07],
    shapes: [
      { pts: R(-0.5, -0.11, 0.45, -0.03), color: '#4b5a35' },
      { pts: R(-0.6, -0.125, -0.5, -0.015), color: '#3c4829' },
      { pts: R(0.0, -0.165, 0.045, -0.11), color: '#2b2e26', vis: true },
      { pts: [[-0.085, -0.03], [-0.035, -0.03], [-0.045, 0.07], [-0.095, 0.065]], color: '#2b2e26' },
      { pts: [[0.17, -0.03], [0.21, -0.03], [0.2, 0.06], [0.16, 0.06]], color: '#2b2e26', vis: true },
      { pts: [[0.45, -0.115], [0.58, -0.105], [0.7, -0.07], [0.58, -0.035], [0.45, -0.025]], color: '#5d6b3c', vis: true, warhead: true },
    ],
  },
};

class Weapon extends Entity {
  constructor(sim) {
    super(sim);
    this.isWeapon = true;
    this.flipped = false;
    this.holder = null;
    this.curGroup = this.group;
    this.pickPriority = 0.3;
  }

  setGroup(g) {
    this.curGroup = g;
    super.setGroup(g);
  }

  ys() { return this.flipped ? -1 : 1; }

  gripLocal() { return [this.def.grip[0], this.def.grip[1] * this.ys()]; }

  muzzleWorld() {
    const m = this.def.muzzle || this.def.tip;
    return this.main.getWorldPoint(V(m[0], m[1] * this.ys()));
  }

  dirAngle() { return this.main.getAngle(); }

  // Пересобираем фигуры зеркально (для удержания в левой стороне).
  setFlip(flip) {
    if (flip === this.flipped && this.built) return;
    this.flipped = flip;
    this.built = true;
    const b = this.main;
    for (let f = b.getFixtureList(); f;) {
      const n = f.getNext();
      b.destroyFixture(f);
      f = n;
    }
    this.visuals.length = 0;
    const d = this.def;
    const ys = this.ys();
    const phys = d.shapes.filter((s) => !s.vis);
    const area = phys.reduce((a, s) => a + polyArea(s.pts), 0);
    for (const s of d.shapes) {
      const pts = mirrorPts(s.pts, 1, ys);
      if (!s.vis) {
        this.fix(b, polyShape(pts), {
          density: d.mass / area, friction: 0.6, restitution: 0.1, mat: s.mat || 'metal', group: this.curGroup,
          ud: s.sharp ? { sharp: true } : {},
        });
      }
      const v = visPoly(b, pts, { z: 0, t: d.t || 0.055, color: s.color, warhead: s.warhead, alpha: s.alpha });
      this.visuals.push(v);
    }
    if (this.visuals[0] && this.drawDetail) {
      const main = this.visuals[d.detailOn || 0];
      main.detail = (ctx) => { ctx.save(); ctx.scale(1, ys); this.drawDetail(ctx); ctx.restore(); };
    }
  }

  update(dt) {
    const z = this.holder ? -0.1 * this.holder.k - 0.06 : 0;
    for (const v of this.visuals) v.z = z;
  }
}

export class Firearm extends Weapon {
  constructor(sim, x, y, id, f = 1) {
    super(sim);
    this.gunId = id;
    this.def = GUNS[id];
    this.name = this.def.name;
    this.cool = 0;
    this.on = false;
    this.ai = false;
    this.spin = 0;
    this.spinA = 0;
    this.loaded = true;
    this.makeBody(x, y, 0, { bullet: true, angularDamping: 0.4 });
    this.setFlip(f < 0);
    if (f < 0) this.main.setTransform(this.main.getPosition(), Math.PI);
  }

  activate() {
    if (this.def.auto) this.on = !this.on;
    else this.fire();
    return true;
  }

  trigger(v) { this.ai = v; }

  update(dt) {
    super.update(dt);
    const d = this.def;
    this.cool -= dt;
    const want = this.on || this.ai;
    if (d.spin) {
      this.spin = clamp(this.spin + (want ? dt * 1.6 : -dt * 0.8), 0, 1);
      this.spinA += this.spin * dt * 40;
    }
    if (want && (d.auto || this.ai)) {
      let guard = 0;
      while (this.cool <= 0 && guard++ < 3) {
        if (!this.fire()) break;
      }
    }
    for (const v of this.visuals) if (v.warhead) v.hidden = !this.loaded;
  }

  fire() {
    const d = this.def;
    if (this.cool > 0) return false;
    if (d.spin && this.spin < 0.75) return false;
    if (d.rocket && !this.loaded) return false;
    this.cool = Math.max(this.cool, -0.05) + d.rate;
    const b = this.main;
    const mz = this.muzzleWorld();
    const dir = b.getWorldVector(V(1, 0));
    const group = this.curGroup;
    const sim = this.sim;
    if (d.flamer) {
      this.flame(mz, dir, group);
    } else if (d.rocket) {
      this.loaded = false;
      sim.after(d.rate, () => { this.loaded = true; });
      const bv = b.getLinearVelocity();
      const r = new Projectile(sim, mz.x + dir.x * 0.2, mz.y + dir.y * 0.2, dir.x * 26 + bv.x, dir.y * 26 + bv.y, { kind: 'rocket', group, P: 1.8, R: 7.5 });
      sim.add(r);
      const back = b.getWorldPoint(V(-0.6, -0.07 * this.ys()));
      for (let i = 0; i < 6; i++) sim.effects.smokePuff(back.x - dir.x * rand(0, 0.8), back.y - dir.y * rand(0, 0.8), 0.25, '#bbbbbb', 0.5);
      sim.effects.muzzle(mz.x, mz.y, dir.x, dir.y, 1.2);
      sfx.rocket(mz);
    } else {
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < (d.pellets || 1); i++) {
        const a = base + gauss() * d.spread;
        sim.hitscan(mz.x, mz.y, Math.cos(a), Math.sin(a), {
          damage: d.dmg, impulse: d.imp, pen: d.pen || 1, group, tracer: d.tracer, tracerW: d.tracerW, range: d.pellets ? 60 : 160,
        });
      }
      sim.effects.muzzle(mz.x, mz.y, dir.x, dir.y, d.flash || 1);
      if (!d.noCasing && d.eject) {
        const ep = b.getWorldPoint(V(d.eject[0], d.eject[1] * this.ys()));
        const up = b.getWorldVector(V(-0.3, -1 * this.ys()));
        const bv = b.getLinearVelocity();
        sim.effects.casing(ep.x, ep.y, bv.x + up.x * rand(2, 3.5), bv.y + up.y * rand(2, 3.5), d.shellBig);
      }
      sfx.shot(d.snd, mz);
    }
    b.applyLinearImpulse(V(-dir.x * d.recoil, -dir.y * d.recoil), mz, true);
    b.applyAngularImpulse(-this.ys() * d.recoil * 0.012, true);
    if (d.recoil > 8) sim.shake(d.recoil * 0.12);
    return true;
  }

  flame(mz, dir, group) {
    const sim = this.sim;
    const range = this.def.range;
    const a = Math.atan2(dir.y, dir.x) + gauss() * 0.06;
    const dx = Math.cos(a), dy = Math.sin(a);
    const hits = sim.raycastAll(V(mz.x, mz.y), V(mz.x + dx * range, mz.y + dy * range), (fix) => fix.getFilterGroupIndex() !== group);
    let dist = range;
    for (const h of hits) {
      const ud = h.body.getUserData() || {};
      dist = h.fraction * range;
      if (ud.ground) {
        if (Math.random() < 0.12) sim.addGroundFire(h.point.x, 0.9, 4);
        break;
      }
      sim.ignite(h.body, 8);
      if (h.body.isDynamic()) h.body.applyLinearImpulse(V(dx * 1.2, dy * 1.2), V(h.point.x, h.point.y), true);
      if (ud.ent && ud.ent.isRagdoll) ud.ent.damage(ud.ent.partOf(h.body), 1.2, 'burn');
      break;
    }
    const fx = sim.effects;
    for (let i = 0; i < 4; i++) {
      const aa = a + gauss() * 0.05;
      const v = 13 * rand(0.85, 1.1);
      fx.add({ type: 'fire', x: mz.x, y: mz.y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, life: Math.max(0.05, dist / v) * rand(1, 1.25), size: 0.1, grow: 1.3, g: -0.2, drag: 0.3 });
    }
    if (Math.random() < 0.3) fx.smokePuff(mz.x + dx * dist, mz.y + dy * dist, 0.3, '#444444', 0.35);
    fx.light(mz.x + dx * dist * 0.5, mz.y + dy * dist * 0.5, 3, 0.06, '#ff9a40');
    sfx.flame(mz);
  }

  drawDetail(ctx) {
    const d = this.def;
    // Спусковая скоба.
    const g = d.grip;
    ctx.strokeStyle = '#151618';
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.arc(g[0] + 0.035, g[1] - 0.025, 0.022, 0, Math.PI);
    ctx.stroke();
    if (d.lever) {
      ctx.strokeStyle = '#c49a35';
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.ellipse(-0.15, -0.0, 0.07, 0.035, 0, 0, Math.PI);
      ctx.stroke();
    }
    if (this.gunId === 'sniper') {
      ctx.fillStyle = '#3b7bd6';
      ctx.fillRect(0.115, -0.15, 0.01, 0.035);
    }
    if (d.spin) {
      ctx.strokeStyle = 'rgba(160,165,175,0.7)';
      ctx.lineWidth = 0.012;
      for (let i = 0; i < 3; i++) {
        const y = -0.06 + Math.sin(this.spinA + (i * TAU) / 3) * 0.035;
        ctx.beginPath(); ctx.moveTo(0.08, y); ctx.lineTo(0.74, y); ctx.stroke();
      }
    }
    if ((this.on || this.ai) && d.auto) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(d.grip[0] + 0.04, -0.06, 0.012, 0, TAU); ctx.fill();
    }
  }
}

// ---------- Холодное оружие ----------
export const MELEE = {
  knife: {
    name: 'Нож', mass: 0.3, tip: [0.2, 0], grip: [-0.06, 0], stabK: 7, cutK: 4.5,
    shapes: [
      { pts: R(-0.12, -0.018, 0, 0.018), color: '#2b2b2b', mat: 'plastic' },
      { pts: [[0, -0.022], [0.15, -0.018], [0.2, 0.0], [0, 0.02]], color: '#d8dde3', sharp: true },
    ],
  },
  sword: {
    name: 'Меч-катана', mass: 1.2, tip: [0.95, 0], grip: [-0.13, 0], stabK: 8, cutK: 10,
    shapes: [
      { pts: R(-0.26, -0.018, -0.01, 0.018), color: '#2a1d3a', mat: 'wood' },
      { pts: R(-0.015, -0.05, 0.015, 0.05), color: '#b8902f' },
      { pts: [[0.015, -0.017], [0.84, -0.014], [0.95, 0.012], [0.015, 0.017]], color: '#e3e7ec', sharp: true },
    ],
  },
  axe: {
    name: 'Топор', mass: 2.2, tip: [0.3, -0.17], grip: [-0.3, 0], stabK: 4, cutK: 12, noStab: true,
    shapes: [
      { pts: R(-0.42, -0.02, 0.36, 0.02), color: '#9a6a3a', mat: 'wood' },
      { pts: [[0.2, -0.03], [0.34, -0.03], [0.39, -0.18], [0.16, -0.18]], color: '#9aa1a8', sharp: true },
      { pts: R(0.24, 0.02, 0.32, 0.06), color: '#7d848b' },
    ],
  },
  bat: {
    name: 'Бита', mass: 1.0, grip: [-0.3, 0], blunt: true,
    shapes: [
      { pts: [[-0.42, -0.018], [0.0, -0.024], [0.44, -0.042], [0.47, 0.0], [0.44, 0.042], [0.0, 0.024], [-0.42, 0.018]], color: '#d2a86a', mat: 'wood' },
    ],
  },
  hammer: {
    name: 'Кувалда', mass: 7, grip: [-0.35, 0], blunt: true,
    shapes: [
      { pts: R(-0.55, -0.02, 0.32, 0.02), color: '#9a6a3a', mat: 'wood' },
      { pts: R(0.3, -0.13, 0.46, 0.13), color: '#4b4f55' },
    ],
  },
  spear: {
    name: 'Копьё', mass: 2, tip: [0.85, 0], grip: [-0.1, 0], stabK: 10, cutK: 2,
    shapes: [
      { pts: R(-0.95, -0.017, 0.62, 0.017), color: '#a87a48', mat: 'wood' },
      { pts: [[0.6, -0.04], [0.85, 0.0], [0.6, 0.04]], color: '#c9ced4', sharp: true },
    ],
  },
};

// Шприцы: тонкая игла (острая), прозрачный цилиндр с жидкостью.
function syringe(name, kind, liquid) {
  return {
    name, syringe: kind, liquid, mass: 0.08, tip: [0.15, 0], grip: [-0.02, 0], stabK: 0.5, cutK: 0,
    shapes: [
      { pts: R(-0.08, -0.02, 0.05, 0.02), color: '#e8f1f5', mat: 'plastic', alpha: 0.65 },
      { pts: R(-0.13, -0.007, -0.08, 0.007), color: '#9aa3ad', mat: 'plastic' },
      { pts: R(-0.142, -0.022, -0.128, 0.022), color: '#7d848b', mat: 'plastic' },
      { pts: R(0.05, -0.008, 0.066, 0.008), color: '#cfd5db' },
      { pts: [[0.066, -0.006], [0.15, -0.003], [0.15, 0.003], [0.066, 0.006]], color: '#d9dee3', sharp: true },
    ],
  };
}
Object.assign(MELEE, {
  syrHeal: syringe('Шприц: лечение', 'heal', '#3ddc84'),
  syrAdrenaline: syringe('Шприц: адреналин', 'adrenaline', '#ffd23f'),
  syrZombie: syringe('Шприц: зомби-вирус', 'zombie', '#a35cff'),
  syrPoison: syringe('Шприц: яд', 'poison', '#5d8f2a'),
  syrCryo: syringe('Шприц: криозаморозка', 'cryo', '#7fd3ff'),
});

export class Melee extends Weapon {
  constructor(sim, x, y, id, f = 1) {
    super(sim);
    this.isMelee = true;
    this.meleeId = id;
    this.def = MELEE[id];
    this.name = this.def.name;
    this.embeds = [];
    this.stabCd = 0;
    this.full = this.def.syringe ? 1 : 0;
    this.makeBody(x, y, 0, { bullet: true, angularDamping: 0.2 });
    this.setFlip(f < 0);
    if (f < 0) this.main.setTransform(this.main.getPosition(), Math.PI);
  }

  activate() {
    if (this.holder) { this.holder.swingT = 0.45; return true; }
    return false;
  }

  update(dt) {
    super.update(dt);
    this.stabCd -= dt;
    this.embeds = this.embeds.filter((l) => !l.dead);
  }

  onBegin(c, myFix, otherFix) {
    const fud = myFix.getUserData() || {};
    if (!fud.sharp) return;
    const ob = otherFix.getBody();
    const oud = ob.getUserData();
    const e = oud && oud.ent;
    if (!e || e === this.holder) return;
    const wm = c.getWorldManifold(null);
    if (!wm || !wm.points[0]) return;
    const pt = { x: wm.points[0].x, y: wm.points[0].y };
    const b = this.main;
    const va = b.getLinearVelocityFromWorldPoint(pt);
    const vb = ob.getLinearVelocityFromWorldPoint(pt);
    const rx = va.x - vb.x, ry = va.y - vb.y;
    const speed = len(rx, ry);
    const d = this.def;
    const axis = b.getWorldVector(V(1, 0));
    const along = rx * axis.x + ry * axis.y;
    const tip = this.muzzleWorld();
    const tipDist = len(tip.x - pt.x, tip.y - pt.y);
    const sim = this.sim;
    if (e.isRagdoll) {
      const part = e.parts[oud.part];
      if (!part) return;
      if (d.syringe) {
        if (along > 0.9 && tipDist < 0.07 && this.stabCd <= 0) {
          this.stabCd = 0.3;
          sim.defer(() => {
            e.damage(part, 1, 'stab', pt, { x: axis.x, y: axis.y });
            this.embedInto(ob, pt, axis, e);
            this.injectInto(e);
          });
        }
        return;
      }
      if (!d.noStab && along > 2.6 && tipDist < 0.14 && this.stabCd <= 0) {
        this.stabCd = 0.25;
        const dmg = along * d.stabK;
        sfx.stab(pt);
        sim.defer(() => {
          e.damage(part, dmg, 'stab', pt, { x: axis.x, y: axis.y });
          sim.effects.bloodSpray(pt.x, pt.y, -axis.x, -axis.y, 10, 2.5, e.type.blood || 'oil');
          this.embedInto(ob, pt, axis, e);
        });
      } else if (speed > 3.2) {
        const dmg = (speed - 3) * d.cutK;
        sfx.slice(pt);
        sim.defer(() => {
          e.damage(part, dmg, 'cut', pt, { x: rx / speed, y: ry / speed });
          if (e.type.blood) sim.effects.bloodSpray(pt.x, pt.y, rx, ry, 12, 3, e.type.blood);
          else sim.effects.impact(e.type.mat, pt.x, pt.y, rx, ry, 1);
        });
      }
    } else if (e.damage && speed > 3) {
      sim.defer(() => e.damage((speed - 3) * d.cutK * 1.5, 'cut', ob, pt));
    }
  }

  injectInto(e) {
    if (!this.def.syringe || this.full <= 0 || !e.inject) return false;
    this.full = 0;
    e.inject(this.def.syringe);
    sfx.inject(this.main.getPosition());
    return true;
  }

  drawDetail(ctx) {
    const d = this.def;
    if (!d.syringe) return;
    if (this.full > 0) {
      ctx.fillStyle = d.liquid;
      ctx.fillRect(-0.04, -0.016, 0.088 * this.full, 0.032);
    }
    ctx.fillStyle = '#5d646b';
    ctx.fillRect(-0.082 + (1 - this.full) * 0.07, -0.017, 0.01, 0.034);
    ctx.strokeStyle = 'rgba(60,70,80,0.6)';
    ctx.lineWidth = 0.003;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-0.06 + i * 0.022, -0.02); ctx.lineTo(-0.06 + i * 0.022, -0.012); ctx.stroke(); }
  }

  embedInto(body, pt, axis, victim) {
    if (this.removed || this.embeds.length > 2) return;
    const b = this.main;
    const p = b.getPosition();
    b.setTransform(V(p.x + axis.x * 0.05, p.y + axis.y * 0.05), b.getAngle());
    const j = this.sim.world.createJoint(new pl.WeldJoint({}, b, body, V(pt.x + axis.x * 0.05, pt.y + axis.y * 0.05)));
    const prev = this.curGroup;
    if (!this.holder) this.setGroup(victim.group);
    const link = this.sim.addLink(j, {
      type: 'embed', breakForce: 2600 * (victim.k || 1),
      onBreak: () => {
        if (!this.removed && !this.holder && this.embeds.length <= 1) this.setGroup(prev === victim.group ? this.group : prev);
        if (victim.type && victim.type.blood && !victim.removed) {
          const q = this.muzzleWorld();
          this.sim.effects.bloodSpray(q.x, q.y, 0, -1, 8, 2, victim.type.blood);
        }
      },
    });
    this.embeds.push(link);
  }
}

// ---------- Снаряды ----------
export class Projectile extends Entity {
  constructor(sim, x, y, vx, vy, o) {
    super(sim);
    this.o = o;
    this.kind = o.kind;
    this.name = o.kind === 'rocket' ? 'Ракета' : 'Снаряд';
    this.life = 8;
    this.hit = false;
    this.noShadow = true;
    const ang = Math.atan2(vy, vx);
    const b = this.makeBody(x, y, ang, { bullet: true, angularDamping: 0 });
    b.setFixedRotation(true);
    const pts = o.kind === 'rocket'
      ? [[-0.22, -0.045], [0.12, -0.045], [0.24, 0], [0.12, 0.045], [-0.22, 0.045]]
      : [[-0.18, -0.06], [0.1, -0.06], [0.2, 0], [0.1, 0.06], [-0.18, 0.06]];
    this.fix(b, polyShape(pts), { density: o.kind === 'rocket' ? 60 : 400, group: o.group || this.group, cat: CAT.PROJ, mat: 'metal' });
    b.setLinearVelocity(V(vx, vy));
    if (o.kind === 'rocket') b.setGravityScale(0.25);
    this.vis(visPoly(b, pts, { z: 0, t: 0.09, color: o.kind === 'rocket' ? '#5d6b3c' : '#b8902f' }));
    if (o.kind === 'rocket') this.vis(visPoly(b, [[-0.26, -0.08], [-0.16, -0.045], [-0.16, 0.045], [-0.26, 0.08]], { z: 0, t: 0.02, color: '#3c4829' }));
  }

  preStep(h) {
    const b = this.main;
    if (!b) return;
    const v = b.getLinearVelocity();
    if (this.kind === 'rocket' && this.life > 6.6) {
      const s = Math.max(0.1, len(v.x, v.y));
      b.applyForceToCenter(V((v.x / s) * b.getMass() * 40, (v.y / s) * b.getMass() * 40), true);
    }
  }

  update(dt) {
    this.life -= dt;
    const b = this.main;
    if (!b) return;
    const v = b.getLinearVelocity();
    b.setTransform(b.getPosition(), Math.atan2(v.y, v.x));
    const p = b.getPosition();
    if (this.kind === 'rocket') {
      const s = Math.max(0.1, len(v.x, v.y));
      const tx = p.x - (v.x / s) * 0.3, ty = p.y - (v.y / s) * 0.3;
      this.sim.effects.flame(tx, ty, 0.12);
      if (Math.random() < 0.8) this.sim.effects.smokePuff(tx, ty, 0.15, '#cfcfcf', 0.45);
      this.sim.effects.light(tx, ty, 1.2, 0.05, '#ffb050');
    }
    if (this.life <= 0 || p.y > 2) this.boom();
  }

  onBegin() {
    if (this.hit) return;
    this.hit = true;
    this.sim.defer(() => this.boom());
  }

  boom() {
    if (this.removed) return;
    const p = this.main.getPosition();
    this.sim.remove(this);
    this.sim.explode(p.x, p.y, this.o.P, this.o.R);
  }
}
