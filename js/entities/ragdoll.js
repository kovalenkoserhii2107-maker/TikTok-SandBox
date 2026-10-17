// Персонажи: активный рэгдолл с мышцами, равновесием, ранениями, кровью,
// расчленением, ИИ (зомби, солдаты, мирные) и заражением.
import { Entity, visCapsule, visCircle, visRRect, pl, V, CAT } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { clamp, rand, pick, chance, wrapAngle, chamferBox, shade, mix, TAU, roundRectPath, lerp } from '../util.js';
import { sfx } from '../audio.js';

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#f6d7c3', '#d9a07a'];
const HAIR = ['#2b1d12', '#4a2f1b', '#1a1a1a', '#a0622d', '#d9b46a', '#6b4a2e', '#8a8a8a'];
const SHIRT = ['#3a7bd5', '#d64545', '#2fa66a', '#e0a030', '#7d4cc2', '#ececec', '#2a2f3a', '#e86aa0', '#1f8a9a'];
const PANTS = ['#2c3e50', '#3d3d45', '#4a5a7a', '#5a4632', '#1f2a44', '#6b6b70'];
const SHOES = ['#222222', '#3b2a1e', '#efefef', '#5a2a1a', '#1d3557'];

export const CHAR_TYPES = {
  human: { id: 'human', name: 'Человек', hp: 1, str: 1, blood: 'blood', mat: 'flesh', infectable: true, painK: 1, ai: 'civil' },
  soldier: { id: 'soldier', name: 'Солдат', hp: 1.3, str: 1.35, blood: 'blood', mat: 'flesh', infectable: true, painK: 0.55, armor: 0.4, helmet: true, ai: 'soldier', shirt: '#56653b', pants: '#4b5432', shoes: '#2a2418' },
  zombie: { id: 'zombie', name: 'Зомби', hp: 1.15, str: 1.05, blood: 'zblood', mat: 'zombie', painK: 0, zombie: true, ai: 'zombie', noBleedDeath: true, skin: '#8fb06a' },
  robot: { id: 'robot', name: 'Робот', hp: 2.6, str: 1.8, blood: 'oil', mat: 'metal', painK: 0, density: 1.7, robot: true, toughDv: 13, noBleedDeath: true, skin: '#a3acb7', shirt: '#7c8794', pants: '#5d6670', shoes: '#3a3f46' },
  giant: { id: 'giant', name: 'Гигант', hp: 3.2, str: 1.3, scale: 1.5, blood: 'blood', mat: 'flesh', painK: 0.35, infectable: true, shirt: '#7a3328', pants: '#3c3f4a', shoes: '#2b1d14', beard: true },
  skeleton: { id: 'skeleton', name: 'Скелет', hp: 0.55, str: 0.85, blood: null, mat: 'bone', painK: 0, density: 0.5, skeleton: true, noBleedDeath: true, skin: '#ece3cc', shirt: '#ece3cc', pants: '#ece3cc', shoes: '#ddd2b6' },
  dummy: { id: 'dummy', name: 'Манекен', hp: 1, str: 0, blood: null, mat: 'plastic', painK: 0, immortal: true, noMuscles: true, skin: '#f2c230', shirt: '#f2c230', pants: '#e3ae22', shoes: '#2a2a2a' },
};

// Геометрия при k=1, стопы в точке y=0, лицом вправо.
const PARTS = {
  chest: { shape: 'box', y: -1.33, hw: 0.15, hh: 0.2, hp: 120, z: 0, t: 0.3, role: 'shirt' },
  belly: { shape: 'box', y: -1.0, hw: 0.135, hh: 0.13, hp: 100, parent: 'chest', jy: -1.13, lim: [-0.5, 0.45], z: 0, t: 0.28, role: 'shirt', tq: 520, fr: 9 },
  head: { shape: 'circle', y: -1.665, r: 0.13, hp: 50, parent: 'chest', jy: -1.52, lim: [-0.6, 0.5], z: 0, t: 0.26, role: 'skin', tq: 70, fr: 3 },
  uarmB: { shape: 'cap', y: -1.36, hw: 0.055, hh: 0.15, hp: 60, parent: 'chest', jy: -1.49, lim: [-3.0, 1.3], side: 'B', role: 'shirt', tq: 140, fr: 2 },
  farmB: { shape: 'cap', y: -1.06, hw: 0.05, hh: 0.15, hp: 50, parent: 'uarmB', jy: -1.21, lim: [-2.6, 0.0], side: 'B', role: 'skin', tq: 85, fr: 1.5 },
  uarmF: { shape: 'cap', y: -1.36, hw: 0.055, hh: 0.15, hp: 60, parent: 'chest', jy: -1.49, lim: [-3.0, 1.3], side: 'F', role: 'shirt', tq: 140, fr: 2 },
  farmF: { shape: 'cap', y: -1.06, hw: 0.05, hh: 0.15, hp: 50, parent: 'uarmF', jy: -1.21, lim: [-2.6, 0.0], side: 'F', role: 'skin', tq: 85, fr: 1.5 },
  thighB: { shape: 'cap', y: -0.65, hw: 0.075, hh: 0.22, hp: 70, parent: 'belly', jy: -0.87, lim: [-1.9, 0.5], side: 'B', role: 'pants', tq: 480, fr: 6 },
  shinB: { shape: 'cap', y: -0.245, hw: 0.062, hh: 0.2, hp: 60, parent: 'thighB', jy: -0.44, lim: [0, 2.5], side: 'B', role: 'pants', tq: 420, fr: 4 },
  footB: { shape: 'box', y: -0.035, hw: 0.1, hh: 0.035, hp: 40, parent: 'shinB', jy: -0.06, lim: [-0.6, 0.6], side: 'B', role: 'shoes', tq: 160, fr: 2 },
  thighF: { shape: 'cap', y: -0.65, hw: 0.075, hh: 0.22, hp: 70, parent: 'belly', jy: -0.87, lim: [-1.9, 0.5], side: 'F', role: 'pants', tq: 480, fr: 6 },
  shinF: { shape: 'cap', y: -0.245, hw: 0.062, hh: 0.2, hp: 60, parent: 'thighF', jy: -0.44, lim: [0, 2.5], side: 'F', role: 'pants', tq: 420, fr: 4 },
  footF: { shape: 'box', y: -0.035, hw: 0.1, hh: 0.035, hp: 40, parent: 'shinF', jy: -0.06, lim: [-0.6, 0.6], side: 'F', role: 'shoes', tq: 160, fr: 2 },
};
const ORDER = ['chest', 'belly', 'head', 'uarmB', 'farmB', 'uarmF', 'farmF', 'thighB', 'shinB', 'footB', 'thighF', 'shinF', 'footF'];

export class Ragdoll extends Entity {
  constructor(sim, x, y, typeId = 'human', f = 1) {
    super(sim);
    this.isRagdoll = true;
    this.typeId = typeId;
    this.type = CHAR_TYPES[typeId];
    this.name = this.type.name;
    const T = this.type;
    this.k = T.scale || 1;
    this.facing = f;
    this.col = {
      skin: T.skin || pick(SKIN),
      hair: pick(HAIR),
      shirt: T.shirt || pick(SHIRT),
      pants: T.pants || pick(PANTS),
      shoes: T.shoes || pick(SHOES),
    };
    if (T.zombie) {
      this.col.shirt = pick(['#5a4b3c', '#4a5560', '#6a3a3a', '#3f4f3a']);
      this.col.pants = pick(['#3a3a48', '#4a3f35']);
      this.col.hair = pick(['#2b2b22', '#4a4030']);
    }
    this.alive = true;
    this.conscious = true;
    this.blood = 100;
    this.pain = 0;
    this.stun = 0;
    this.burn = 0;
    this.vigor = 1;
    this.lean = 0;
    this.phase = rand(0, TAU);
    this.walkDir = 0;
    this.speed = 1.2;
    this.aim = null;
    this.swingT = 0;
    this.downT = 0;
    this.getUpT = 0;
    this.getUpCd = 0;
    this.thinkT = rand(0, 0.4);
    this.biteCd = 0;
    this.blinkT = rand(1, 4);
    this.dripAcc = 0;
    this.infected = false;
    this.onFireT = 0;
    this.adrenaline = 0;
    this.poison = 0;
    this.frozen = 0;
    this.frozenApplied = false;
    this.holding = null;
    this.relaxed = false;
    this.mode = 'idle';
    this.tgt = {};
    this.parts = {};
    this.partList = [];
    const feetY = y + 0.9 * this.k;
    this.origin = { x, feetY };
    for (const name of ORDER) this.createPart(name, x, feetY);
    this.M = this.mass();
    const k3 = this.k * this.k * this.k;
    this.balMax = 1700 * k3 * Math.max(0.5, T.str);
    this.shadowBodies = [this.parts.footB.body, this.parts.footF.body, this.parts.chest.body];
  }

  get shadowList() { return this.shadowBodies; }

  createPart(name, x, feetY) {
    const d = PARTS[name];
    const T = this.type;
    const k = this.k;
    const thin = T.skeleton ? 0.6 : 1;
    const b = this.makeBody(x, feetY + d.y * k, 0, { part: name, angularDamping: 0.6, linearDamping: 0.03 });
    const dens = 120 * (T.density || 1);
    const fo = { density: dens, friction: name.startsWith('foot') ? 1.1 : 0.75, restitution: 0.04, cat: CAT.FLESH, mat: T.mat };
    if (d.shape === 'circle') this.fix(b, circleShape(d.r * k), fo);
    else if (d.shape === 'box') this.fix(b, polyShape(chamferBox(d.hw * k, d.hh * k, Math.min(d.hw, d.hh) * k * 0.35)), fo);
    else this.fix(b, polyShape(chamferBox(d.hw * k * thin, d.hh * k, d.hw * k * thin * 0.85)), fo);
    const old = this.parts[name];
    const p = {
      name, body: b, def: d, side: d.side || null,
      maxHp: d.hp * T.hp, hp: d.hp * T.hp,
      wounds: [], stumps: [], bleed: 0, connected: true, broken: false, gone: false, joint: null,
      tq: (d.tq || 0) * k * k * k * Math.max(0.3, T.str), fr: (d.fr || 0) * k * k * k * (T.noMuscles ? 18 : 1),
    };
    if (old) {
      const i = this.partList.indexOf(old);
      if (i >= 0) this.partList[i] = p;
    } else this.partList.push(p);
    this.parts[name] = p;
    if (d.parent) this.makeJoint(p);
    this.addPartVisual(p);
    return p;
  }

  makeJoint(p) {
    const d = p.def;
    const parent = this.parts[d.parent];
    const k = this.k;
    const pd = PARTS[d.parent];
    // Якорь сустава в локальных координатах родителя.
    const anchor = parent.body.getWorldPoint(V(0, (d.jy - pd.y) * k));
    const f = this.facing;
    const lo = f > 0 ? d.lim[0] : -d.lim[1];
    const hi = f > 0 ? d.lim[1] : -d.lim[0];
    const j = this.sim.world.createJoint(new pl.RevoluteJoint({
      enableLimit: true, lowerAngle: lo, upperAngle: hi,
      enableMotor: true, maxMotorTorque: p.fr, motorSpeed: 0,
    }, parent.body, p.body, anchor));
    p.joint = j;
    p.connected = parent.connected;
  }

  addPartVisual(p) {
    const d = p.def, k = this.k, T = this.type;
    const thin = T.skeleton ? 0.6 : 1;
    const zSide = p.side === 'B' ? 0.1 * k : p.side === 'F' ? -0.1 * k : 0;
    let v;
    const common = { z: zSide + (d.z || 0), t: (d.t || 0.14) * k, role: d.role, side: p.side, part: p, clip: false };
    if (d.shape === 'circle') {
      v = visCircle(p.body, d.r * k, { ...common, sphere: true, detail: (ctx) => this.drawHead(ctx, p) });
    } else if (p.name.startsWith('foot')) {
      const hw = d.hw * k, hh = d.hh * k;
      v = visRRect(p.body, -hw, -hh, hw, hh, hh * 0.9, { ...common, t: 0.13 * k });
      v.path = (ctx) => {
        const fx = this.facing;
        roundRectPath(ctx, fx > 0 ? -hw * 0.75 : -hw * 1.3, -hh * 1.1, fx > 0 ? hw * 1.3 : hw * 0.75, hh, hh * 0.9);
      };
      v.detail = (ctx) => this.drawLimbDetail(ctx, p, v);
    } else if (d.shape === 'box') {
      const hw = d.hw * k, hh = d.hh * k;
      v = visRRect(p.body, -hw, -hh, hw, hh, hw * 0.45, { ...common });
      v.detail = (ctx) => (p.name === 'chest' ? this.drawChest(ctx, p, v) : this.drawBelly(ctx, p, v));
    } else {
      v = visCapsule(p.body, d.hw * k * thin, d.hh * k, { ...common });
      v.detail = (ctx) => this.drawLimbDetail(ctx, p, v);
    }
    // Удаляем старый визуал части (при восстановлении).
    this.visuals = this.visuals.filter((o) => o.part !== p && o.part?.name !== p.name);
    this.visuals.push(v);
    p.vis = v;
  }

  colorOf(v) {
    let c = this.col[v.role] || '#888888';
    if (v.side === 'B') c = shade(c, -0.16);
    if (this.burn > 0.05) c = mix(c, '#1d1510', this.burn * 0.85);
    if (this.frozen > 0) c = mix(c, '#bfe8ff', 0.55);
    return c;
  }

  // ---------- Состояние ----------
  legsOK() {
    const p = this.parts;
    const leg = (t, s) => p[t].connected && !p[t].broken && !p[t].gone && p[s].connected && !p[s].broken;
    return p.belly.connected && (leg('thighB', 'shinB') || leg('thighF', 'shinF'));
  }

  isGrounded() {
    for (const n of ['footB', 'footF', 'shinB', 'shinF']) {
      const p = this.parts[n];
      if (!p.connected || p.gone) continue;
      for (let ce = p.body.getContactList(); ce; ce = ce.next) {
        if (!ce.contact.isTouching()) continue;
        const ud = ce.other.getUserData();
        if (ud && ud.ent === this) continue;
        return true;
      }
    }
    return false;
  }

  touchingAnything() {
    for (const p of this.partList) {
      if (p.gone) continue;
      for (let ce = p.body.getContactList(); ce; ce = ce.next) {
        if (ce.contact.isTouching()) {
          const ud = ce.other.getUserData();
          if (!ud || ud.ent !== this) return true;
        }
      }
    }
    return false;
  }

  setFacing(f) {
    if (f === this.facing) return;
    this.facing = f;
    for (const p of this.partList) {
      if (!p.joint) continue;
      const lim = p.def.lim;
      const lo = f > 0 ? lim[0] : -lim[1];
      const hi = f > 0 ? lim[1] : -lim[0];
      p.joint.setLimits(lo, hi);
    }
    if (this.holding) this.regrip();
  }

  // ---------- Оружие в руках ----------
  handPoint() {
    const p = this.parts.farmF;
    return p.body.getWorldPoint(V(0, 0.16 * this.k));
  }

  canHold() {
    const p = this.parts;
    return this.alive && !this.type.noMuscles && p.farmF.connected && !p.farmF.gone && p.uarmF.connected && !this.holding;
  }

  grab(w) {
    if (!this.canHold() || w.holder) return false;
    const hand = this.parts.farmF.body;
    w.setFlip(this.facing < 0);
    const hp = this.handPoint();
    const ang = hand.getAngle() + Math.PI / 2;
    const [gx, gy] = w.gripLocal();
    const c = Math.cos(ang), s = Math.sin(ang);
    w.main.setTransform(V(hp.x - (gx * c - gy * s), hp.y - (gx * s + gy * c)), ang);
    w.main.setLinearVelocity(hand.getLinearVelocity());
    w.main.setAngularVelocity(0);
    const j = this.sim.world.createJoint(new pl.WeldJoint({}, hand, w.main, hp));
    w.setGroup(this.group);
    w.holder = this;
    const link = this.sim.addLink(j, {
      type: 'hold', breakForce: 9000 * this.k,
      onBreak: () => {
        if (this.holding && this.holding.link === link) this.holding = null;
        w.holder = null;
        w.setGroup(w.group);
        if (w.trigger) w.trigger(false);
      },
    });
    this.holding = { w, link };
    return true;
  }

  drop() {
    if (this.holding) this.sim.killLink(this.holding.link);
  }

  regrip() {
    const w = this.holding.w;
    this.sim.killLink(this.holding.link);
    this.sim.defer(() => { if (!w.removed && this.alive) this.grab(w); });
  }

  // ---------- Физика мышц ----------
  computePose(h) {
    const g = this.tgt;
    const f = this.facing;
    const t = this.sim.time;
    const chestA = this.parts.chest.body.getAngle();
    g.belly = 0; g.head = 0;
    g.uarmF = -0.12 * f; g.farmF = -0.3 * f; g.uarmB = 0.15 * f; g.farmB = -0.25 * f;
    g.thighF = 0; g.shinF = 0.03 * f; g.footF = 0;
    g.thighB = 0; g.shinB = 0.03 * f; g.footB = 0;
    this.lean = 0;
    const dragged = this.sim.dragEnt === this;
    if (dragged) {
      // Барахтается, когда его тащат.
      g.thighF = f * (-0.7 + 0.7 * Math.sin(t * 10));
      g.thighB = f * (-0.7 + 0.7 * Math.sin(t * 10 + 2.2));
      g.shinF = f * (0.9 + 0.6 * Math.sin(t * 11));
      g.shinB = f * (0.9 + 0.6 * Math.sin(t * 11 + 1.7));
      g.uarmF = f * (-2.2 + 0.9 * Math.sin(t * 9));
      g.uarmB = f * (-2.0 + 0.9 * Math.sin(t * 8 + 1));
      g.farmF = -0.8 * f; g.farmB = -0.8 * f;
      return;
    }
    if (this.walkDir) {
      this.phase += h * (this.speed > 1.6 ? 11 : 7);
      const s = Math.sin(this.phase);
      const amp = this.speed > 1.6 ? 0.75 : 0.5;
      g.thighF = -amp * s * f;
      g.thighB = amp * s * f;
      g.shinF = f * Math.max(0, 1.0 * Math.sin(this.phase + 1.9));
      g.shinB = f * Math.max(0, 1.0 * Math.sin(this.phase + 1.9 + Math.PI));
      g.uarmF = 0.45 * s * f;
      g.uarmB = -0.45 * s * f;
      g.farmF = -0.5 * f; g.farmB = -0.5 * f;
      this.lean = 0.12 * f * (this.speed > 1.6 ? 1.6 : 1);
    }
    if (this.poison > 0) {
      g.uarmF = f * (-1 + Math.sin(t * 23) * 1.2); g.uarmB = f * (-1 + Math.cos(t * 19) * 1.2);
      g.farmF = -1.2 * f; g.farmB = -1.2 * f;
      g.head = 0.4 * Math.sin(t * 17);
      g.thighF = f * (-0.3 + 0.4 * Math.sin(t * 21)); g.thighB = f * (-0.3 + 0.4 * Math.cos(t * 18));
      return;
    }
    if (this.mode === 'zombie') {
      g.uarmF = -f * 1.45 + 0.15 * Math.sin(t * 2.1);
      g.uarmB = -f * 1.3 + 0.15 * Math.sin(t * 1.7 + 1);
      g.farmF = -0.15 * f; g.farmB = -0.2 * f;
      g.head = 0.25 * f;
      this.lean = 0.15 * f;
    } else if (this.mode === 'panic') {
      g.uarmF = -f * 2.5 + 0.5 * Math.sin(t * 15);
      g.uarmB = -f * 2.3 + 0.5 * Math.cos(t * 13);
      g.farmF = -0.7 * f; g.farmB = -0.7 * f;
    } else if (this.pain > 60 && this.type.painK > 0) {
      g.uarmF = -0.5 * f; g.farmF = -2.1 * f;
      g.uarmB = -0.3 * f; g.farmB = -1.9 * f;
      g.head = 0.3 * f;
      this.lean = 0.1 * f;
    }
    const held = this.holding && this.holding.w;
    if (held) {
      if (held.isMelee) {
        g.uarmF = -0.75 * f; g.farmF = -0.9 * f;
        if (this.swingT > 0) {
          const p = 1 - this.swingT / 0.45;
          g.uarmF = p < 0.4 ? -2.9 * f : -0.4 * f;
          g.farmF = p < 0.4 ? -0.4 * f : -0.1 * f;
        }
      } else {
        const aim = this.aim ?? (f > 0 ? 0 : Math.PI);
        const a = wrapAngle(aim - Math.PI / 2 - chestA);
        g.uarmF = a; g.farmF = 0;
        g.uarmB = a + 0.3 * f; g.farmB = -0.9 * f;
      }
    }
  }

  preStep(h) {
    const T = this.type;
    if (this.frozen > 0) {
      // Заморожен: суставы как камень.
      if (!this.frozenApplied) {
        this.frozenApplied = true;
        for (const p of this.partList) {
          if (!p.joint) continue;
          p.joint.setMotorSpeed(0);
          p.joint.setMaxMotorTorque(6000 * this.k * this.k * this.k);
        }
      }
      return;
    }
    const active = this.alive && this.conscious && !T.noMuscles;
    if (!active) {
      if (!this.relaxed) {
        this.relaxed = true;
        for (const p of this.partList) {
          if (!p.joint) continue;
          p.joint.setMotorSpeed(0);
          p.joint.setMaxMotorTorque(p.fr);
        }
      }
      return;
    }
    this.relaxed = false;
    this.computePose(h);
    const g = this.tgt;
    const holdBoost = this.holding ? 2.2 : 1;
    const adr = this.adrenaline > 0 ? 1.8 : 1;
    for (const p of this.partList) {
      const j = p.joint;
      if (!j) continue;
      if (p.connected && !p.broken) {
        const isArm = p.name === 'uarmF' || p.name === 'farmF' || p.name === 'uarmB' || p.name === 'farmB';
        const swing = this.swingT > 0 && (p.name === 'uarmF' || p.name === 'farmF');
        const sp = swing ? 32 : 12;
        const err = (g[p.name] || 0) - j.getJointAngle();
        j.setMotorSpeed(clamp(err * sp, -sp, sp));
        j.setMaxMotorTorque(p.tq * this.vigor * adr * (isArm ? holdBoost : 1) * (swing ? 3 : 1));
      } else {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(p.fr);
      }
    }
    if (!this.legsOK()) return;
    const chest = this.parts.chest.body, belly = this.parts.belly.body;
    const grounded = this.isGrounded();
    const err = wrapAngle(this.lean - chest.getAngle());
    const w = chest.getAngularVelocity();
    const I = this.M * this.k * this.k * 0.9;
    let gain = grounded ? 1 : 0.12;
    if (this.getUpT > 0) gain = 2.2;
    const tq = clamp(I * (45 * err - 10 * w) * gain * this.vigor, -this.balMax, this.balMax);
    chest.applyTorque(tq * 0.55, true);
    belly.applyTorque(tq * 0.45, true);
    if (grounded && this.walkDir && Math.abs(err) < 0.6) {
      const vx = belly.getLinearVelocity().x;
      const F = clamp((this.walkDir * this.speed * adr - vx) * this.M * 4, -this.M * 5 * adr, this.M * 5 * adr) * this.vigor;
      belly.applyForceToCenter(V(F * 0.5, 0), true);
      chest.applyForceToCenter(V(F * 0.5, 0), true);
    }
    if (this.getUpT > 0) chest.applyForceToCenter(V(0, -this.M * this.sim.def.gravity * 0.8), true);
  }

  // ---------- Логика ----------
  update(dt) {
    const T = this.type;
    this.stun = Math.max(0, this.stun - dt);
    this.pain = Math.max(0, this.pain - dt * 14);
    this.biteCd -= dt;
    this.swingT = Math.max(0, this.swingT - dt);
    this.blinkT -= dt;
    if (this.blinkT < -0.13) this.blinkT = rand(2, 5);
    this.getUpT -= dt;
    this.getUpCd -= dt;
    this.onFireT -= dt;
    if (this.adrenaline > 0) {
      this.adrenaline -= dt;
      this.pain = 0;
      this.stun = 0;
    }
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0) { this.frozenApplied = false; this.relaxed = false; }
    }
    if (this.poison > 0 && this.alive) {
      this.poison -= dt;
      this.damage(this.parts.chest, dt * 22, 'poison');
      if (Math.random() < dt * 2 && this.type.blood) {
        const hp = this.parts.head.gone ? null : this.parts.head.body.getPosition();
        if (hp) this.sim.effects.drip(hp.x + 0.08 * this.facing, hp.y + 0.08, 'zblood');
      }
    }

    if (T.blood) {
      let total = 0;
      for (const p of this.partList) {
        if (p.bleed <= 0 || p.gone) continue;
        total += p.bleed;
        p.bleed = Math.max(0, p.bleed - dt * 0.04);
      }
      if (total > 0) {
        if (this.alive || this.blood > 10) this.blood = Math.max(0, this.blood - total * dt * 1.1);
        this.dripAcc += Math.min(total, 6) * dt * 10;
        while (this.dripAcc > 1) {
          this.dripAcc -= 1;
          this.emitDrip();
        }
      }
    }
    if (this.alive && T.blood && !T.noBleedDeath && this.blood < 22) this.die('blood');
    this.conscious = this.alive && this.stun <= 0 && this.frozen <= 0 &&
      (T.painK === 0 || this.pain < 150) && (T.noBleedDeath || this.blood > 42);
    this.vigor = T.noBleedDeath || this.adrenaline > 0 ? 1 : clamp((this.blood - 35) / 45, 0.25, 1) * clamp(1 - this.pain / 260, 0.4, 1);

    if (this.infected) {
      this.infectT -= dt;
      this.burn = Math.max(this.burn, 0);
      if (this.infectT <= 0) this.zombify();
    }

    if (this.alive && this.conscious && !T.noMuscles && this.legsOK()) {
      const err = Math.abs(wrapAngle(this.lean - this.parts.chest.body.getAngle()));
      if (err > 0.9 && this.touchingAnything()) {
        this.downT += dt;
        if (this.downT > 1.3 && this.getUpCd <= 0) {
          this.getUpT = 0.75;
          this.getUpCd = 2.4;
          this.downT = 0;
        }
      } else this.downT = 0;
    }

    if (this.alive && this.conscious && !T.noMuscles) this.think(dt);
    else {
      this.walkDir = 0;
      this.aim = null;
      if (this.holding && this.holding.w.trigger) this.holding.w.trigger(false);
    }

    if (!this.alive && this.holding && !this.dropping) {
      this.dropping = true;
      this.sim.after(rand(0.2, 1.2), () => { this.dropping = false; if (!this.alive) this.drop(); });
    }
  }

  emitDrip() {
    const list = this.partList.filter((p) => p.bleed > 0 && !p.gone);
    if (!list.length) return;
    const p = pick(list);
    let lx = 0, ly = 0;
    const src = p.stumps.length && chance(0.6) ? pick(p.stumps) : p.wounds.length ? pick(p.wounds) : null;
    if (src) { lx = src.x; ly = src.y; }
    const wp = p.body.getWorldPoint(V(lx, ly));
    const kind = this.type.blood;
    if (src && src.stump && p.bleed > 1.5) {
      const dir = p.body.getWorldVector(V(src.nx || 0, src.ny || 1));
      this.sim.effects.bloodSpray(wp.x, wp.y, dir.x, dir.y, 2, 2.5, kind);
    } else this.sim.effects.drip(wp.x, wp.y, kind);
  }

  findRagdoll(filter, maxD) {
    const c = this.parts.chest.body.getPosition();
    let best = null, bd = maxD;
    for (const e of this.sim.entities) {
      if (e === this || !e.isRagdoll || e.removed || !filter(e)) continue;
      const p = e.parts.chest.body.getPosition();
      const d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y) * 0.6;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  lineOfSight(target) {
    const a = this.parts.chest.body.getPosition();
    const b = target.parts.head.gone ? target.parts.chest.body.getPosition() : target.parts.head.body.getPosition();
    let clear = true;
    this.sim.world.rayCast(V(a.x, a.y - 0.2), V(b.x, b.y), (fix) => {
      const body = fix.getBody();
      const ud = body.getUserData();
      if (fix.isSensor() || (ud && (ud.ent === this || ud.ent === target || (this.holding && ud.ent === this.holding.w)))) return -1;
      if ((ud && ud.ground) || body.isStatic() || body.getMass() > 150) { clear = false; return 0; }
      if (ud && ud.ent && ud.ent.isRagdoll && ud.ent.alive && !ud.ent.type.zombie) { clear = false; return 0; }
      return -1;
    });
    return clear;
  }

  think(dt) {
    const ai = this.type.ai;
    this.thinkT -= dt;
    const me = this.parts.chest.body.getPosition();
    if (this.onFireT > 0 && this.type.painK > 0) {
      this.mode = 'panic';
      this.speed = 2.3 * this.k;
      if (!this.walkDir || Math.random() < dt * 0.7) this.setFacing(Math.random() < 0.5 ? -1 : 1);
      this.walkDir = this.facing;
      if (Math.random() < dt * 1.5) sfx.scream(me);
      return;
    }
    if (ai === 'zombie') {
      this.speed = 1.0 * this.k;
      if (this.thinkT <= 0) {
        this.thinkT = rand(0.3, 0.6);
        this.target = this.findRagdoll((e) => e.alive && e.type.infectable && !e.type.zombie, 45);
        if (chance(0.15)) sfx.groan(me);
      }
      const t = this.target;
      if (t && t.alive && !t.removed && !t.type.zombie) {
        const dx = t.parts.chest.body.getPosition().x - me.x;
        if (Math.abs(dx) > 0.5 * this.k) {
          this.setFacing(dx > 0 ? 1 : -1);
          this.walkDir = this.facing;
        } else this.walkDir = 0;
      } else this.walkDir = 0;
      return;
    }
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.25, 0.45);
      this.threat = this.findRagdoll((e) => e.alive && e.type.zombie, ai === 'soldier' ? 38 : 9);
      if (this.threat && ai === 'soldier' && !this.lineOfSight(this.threat)) this.threat = null;
    }
    const th = this.threat && this.threat.alive && !this.threat.removed ? this.threat : null;
    const gun = this.holding && !this.holding.w.isMelee ? this.holding.w : null;
    if (ai === 'soldier' && gun) {
      this.walkDir = 0;
      this.mode = 'idle';
      if (th) {
        const tp = th.parts.head.gone ? th.parts.chest.body.getPosition() : th.parts.head.body.getPosition();
        const dx = tp.x - me.x;
        this.setFacing(dx > 0 ? 1 : -1);
        const mz = gun.muzzleWorld();
        const want = Math.atan2(tp.y - mz.y + 0.05, tp.x - mz.x);
        this.aim = want;
        const cur = gun.dirAngle();
        const inRange = !gun.def.range || Math.hypot(tp.x - mz.x, tp.y - mz.y) < gun.def.range;
        gun.trigger(inRange && Math.abs(wrapAngle(cur - want)) < 0.2);
      } else {
        this.aim = null;
        gun.trigger(false);
      }
      return;
    }
    this.aim = null;
    if ((ai === 'civil' || ai === 'soldier') && th) {
      const dx = th.parts.chest.body.getPosition().x - me.x;
      if (Math.abs(dx) < 9) {
        this.mode = 'panic';
        this.speed = 2.1 * this.k;
        this.setFacing(dx > 0 ? -1 : 1);
        this.walkDir = this.facing;
        if (chance(dt * 0.8)) sfx.scream(me);
        return;
      }
    }
    this.mode = 'idle';
    this.walkDir = 0;
  }

  activate() {
    if (this.holding) {
      const w = this.holding.w;
      if (w.isMelee) { this.swingT = 0.45; return true; }
      return w.activate();
    }
    return false;
  }

  // ---------- Урон ----------
  partOf(body) {
    const ud = body.getUserData();
    return ud && this.parts[ud.part];
  }

  addWound(p, wp, kind, dir) {
    if (p.wounds.length > 10) p.wounds.shift();
    const l = p.body.getLocalPoint(V(wp.x, wp.y));
    const a = dir ? Math.atan2(dir.y, dir.x) - p.body.getAngle() : 0;
    p.wounds.push({ x: l.x, y: l.y, kind, a, r: (kind === 'cut' ? 0.06 : 0.022) * rand(0.8, 1.3) });
  }

  damage(p, amount, kind, point, dir) {
    if (!p || p.gone) return;
    const T = this.type;
    if (kind === 'bullet' && point && T.blood) this.addWound(p, point, 'hole', dir);
    if ((kind === 'cut' || kind === 'stab') && point) this.addWound(p, point, kind === 'cut' ? 'cut' : 'hole', dir);
    if (kind === 'bullet' && point && !T.blood) this.addWound(p, point, T.robot ? 'dent' : 'crack', dir);
    if (T.immortal) return;
    if (kind === 'bullet' && T.armor && (p.name === 'chest' || p.name === 'belly')) amount *= T.armor;
    if (kind === 'bullet' && T.helmet && p.name === 'head' && point) {
      const l = p.body.getLocalPoint(V(point.x, point.y));
      if (l.y < 0) amount *= 0.45;
    }
    p.hp -= amount;
    if (this.alive) this.pain += amount * T.painK;
    if (T.blood && (kind === 'bullet' || kind === 'cut' || kind === 'stab' || kind === 'bite')) p.bleed += amount * 0.014;
    if (T.blood && kind === 'blast' && amount > 20) p.bleed += amount * 0.004;
    if (kind === 'blunt' && p.name === 'head' && amount > 12) this.stun = Math.max(this.stun, rand(1.5, 4));

    const limb = p.name !== 'chest' && p.name !== 'belly';
    if (p.hp <= 0) {
      if (p.name === 'head') {
        if (T.blood && amount >= 55 && (kind === 'bullet' || kind === 'blast')) this.explodeHead();
        else if (T.skeleton || T.robot) { if (amount > 25) this.explodeHead(); }
        this.die('head');
      } else if (limb) {
        if (kind === 'cut' || kind === 'blast' || T.fragile || (kind === 'bullet' && amount > 60)) this.sever(p);
        else if (!p.broken) {
          p.broken = true;
          sfx.impact('wood', 0.8, p.body.getPosition());
        }
      } else if (p.hp < -p.maxHp * 0.6 && !T.zombie) this.die('torso');
    }
    if (!T.zombie && !T.skeleton && (this.parts.chest.hp <= 0 || this.parts.belly.hp <= -40)) this.die('torso');
    if (T.zombie && this.parts.chest.hp < -this.parts.chest.maxHp * 1.5) this.die('torso');
    if (T.robot && this.parts.chest.hp <= 0) this.die('core');
  }

  onBullet(body, fix, point, dir, dmg, normal, o) {
    const p = this.partOf(body);
    if (!p) return;
    const T = this.type;
    const fx = this.sim.effects;
    if (T.blood) {
      fx.bloodSpray(point.x, point.y, dir.x, dir.y, 10, 4, T.blood);
      fx.bloodSpray(point.x, point.y, -dir.x, -dir.y, 4, 2, T.blood);
      sfx.hitFlesh(point);
    } else {
      fx.impact(T.mat, point.x, point.y, -dir.x, -dir.y, 1);
      if (T.robot) sfx.ricochet(point);
    }
    this.damage(p, dmg, 'bullet', point, dir);
  }

  onBlast(body, dmg, nx, ny, fall, P, o) {
    const p = this.partOf(body);
    if (!p) return;
    const amount = dmg * rand(0.8, 1.2);
    this.burn = Math.min(1, Math.max(this.burn, o && o.nuke ? (fall > 0.15 ? 1 : fall * 4) : fall * P * 0.18));
    this.stun = Math.max(this.stun, fall * 4);
    if (p.name !== 'chest' && p.name !== 'belly' && amount > p.maxHp * 1.3 && chance(0.4)) {
      this.sever(p);
      if (p.name === 'head' && amount > 90 && this.type.blood) this.explodeHead();
    }
    this.damage(p, amount, 'blast');
  }

  // Давление (раздавливание тяжёлым объектом).
  onImpulse(myFix, otherFix, imp) {
    const p = this.partOf(myFix.getBody());
    if (!p) return;
    const dv = imp / myFix.getBody().getMass();
    if (dv > 60) this.damage(p, (dv - 60) * 0.3, 'blunt');
  }

  onBegin(c, myFix, otherFix) {
    const mb = myFix.getBody(), ob = otherFix.getBody();
    const ud = mb.getUserData();
    const wm = c.getWorldManifold(null);
    const pt = wm && wm.points[0] ? { x: wm.points[0].x, y: wm.points[0].y } : null;
    // Урон от удара — по скорости сближения и массе второго тела.
    if (pt && wm.normal) {
      const va = mb.getLinearVelocityFromWorldPoint(pt);
      const vb = ob.getLinearVelocityFromWorldPoint(pt);
      const n = wm.normal;
      const vn = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
      if (this.frozen > 0 && vn > 4.5 && ud.part !== 'chest') {
        const p = this.parts[ud.part];
        if (p && p.joint) {
          this.sim.effects.glassShards(pt.x, pt.y, 10, 3);
          sfx.glassBreak(pt);
          this.sever(p);
        }
      }
      const thr = this.type.toughDv || 8;
      if (vn > thr) {
        const mo = ob.isDynamic() ? ob.getMass() : Infinity;
        const mp = mb.getMass();
        const k = isFinite(mo) ? mo / (mo + mp * 2) : 1;
        const eff = vn * k;
        const p = this.parts[ud.part];
        if (eff > thr && p) {
          const amount = (eff - thr) * 6;
          this.sim.defer(() => {
            this.damage(p, amount, 'blunt');
            if (amount > 25 && this.type.blood) {
              this.sim.effects.bloodSpray(pt.x, pt.y, -n.x, -n.y, 6, 2, this.type.blood);
              p.bleed += 0.15;
            }
          });
        }
      }
    }
    // Укус зомби.
    if (!this.type.zombie || !this.alive || !this.conscious || this.biteCd > 0) return;
    if (ud.part !== 'head' && ud.part !== 'farmF' && ud.part !== 'farmB') return;
    const other = ob.getUserData();
    const e = other && other.ent;
    if (!e || !e.isRagdoll || e === this || !e.alive || !e.type.infectable || e.type.zombie) return;
    this.biteCd = 0.8;
    const p = e.parts[other.part];
    const bp = pt || ob.getPosition();
    sfx.bite(bp);
    this.sim.defer(() => {
      e.damage(p, 9, 'bite', bp, null);
      this.sim.effects.bloodSpray(bp.x, bp.y, 0, -1, 8, 2.5, 'blood');
      e.infect();
    });
  }

  onBurn(body, dt) {
    const p = this.partOf(body);
    if (!p) return;
    this.damage(p, dt * 5, 'burn');
    this.burn = Math.min(1, this.burn + dt * 0.035);
    if (this.alive) this.onFireT = 0.6;
    if (this.frozen > 0) { this.frozen = 0; this.frozenApplied = false; this.relaxed = false; }
    // Огонь расползается по телу.
    if (Math.random() < dt * 1.3) {
      const q = pick(this.partList);
      if (!q.gone) this.sim.ignite(q.body, 6);
    }
  }

  // Эффект укола шприцем.
  inject(kind) {
    const T = this.type;
    const pos = this.parts.chest.body.getPosition();
    const fx = this.sim.effects;
    const glow = { heal: '#7dffb0', adrenaline: '#ffd23f', zombie: '#b06cff', poison: '#6bbf3a', cryo: '#9fe2ff' }[kind];
    fx.light(pos.x, pos.y, 2.2, 0.5, glow || '#ffffff');
    switch (kind) {
      case 'heal':
        this.heal();
        for (const p of this.partList) this.sim.extinguish(p.body);
        break;
      case 'adrenaline':
        this.adrenaline = 25;
        this.stun = 0;
        this.pain = 0;
        if (!this.alive && !this.parts.head.gone && this.parts.chest.hp > -60 && !T.immortal) {
          this.alive = true;
          this.relaxed = false;
          this.blood = Math.max(this.blood, 45);
          for (const p of this.partList) p.hp = Math.max(p.hp, p.maxHp * 0.25);
        }
        break;
      case 'zombie':
        if (!T.infectable) break;
        if (!this.alive) this.zombify();
        else { this.infected = true; this.infectT = 2.5; }
        break;
      case 'poison':
        if (T.robot || T.skeleton || T.immortal || T.zombie) break;
        this.poison = 8;
        break;
      case 'cryo':
        this.frozen = 15;
        this.frozenApplied = false;
        for (const p of this.partList) this.sim.extinguish(p.body);
        fx.add({ type: 'flash', x: pos.x, y: pos.y, vx: 0, vy: 0, life: 0.3, size: 0.8, color: '#bfe8ff', g: 0 });
        break;
    }
  }

  infect() {
    if (this.infected || !this.type.infectable) return;
    this.infected = true;
    this.infectT = rand(5, 8);
  }

  zombify() {
    this.infected = false;
    if (this.parts.head.gone) return;
    const k = this.k;
    this.type = { ...CHAR_TYPES.zombie, scale: k, hp: CHAR_TYPES.zombie.hp * (k > 1 ? 2.5 : 1) };
    this.typeId = 'zombie';
    this.name = 'Зомби';
    this.col.skin = mix(this.col.skin, '#7fa35a', 0.75);
    this.col.shirt = shade(this.col.shirt, -0.3);
    this.col.pants = shade(this.col.pants, -0.2);
    for (const p of this.partList) {
      p.hp = Math.max(p.hp, p.maxHp * 0.6);
      p.bleed *= 0.2;
      for (let f = p.body.getFixtureList(); f; f = f.getNext()) f.getUserData().mat = 'zombie';
    }
    this.alive = true;
    this.stun = 1.2;
    this.blood = 100;
    this.pain = 0;
    this.drop();
    sfx.groan(this.parts.chest.body.getPosition());
  }

  die(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.conscious = false;
    this.walkDir = 0;
    if (this.type.robot) {
      const p = this.parts.chest.body.getPosition();
      this.sim.effects.sparks(p.x, p.y, 20, 1.2);
      sfx.zap(p);
      this.sim.after(0.6, () => {
        if (this.removed) return;
        const q = this.parts.chest.body.getPosition();
        this.sim.explode(q.x, q.y, 0.7, 4);
      });
    }
  }

  // Отделение части тела.
  sever(p) {
    if (!p.joint || p.gone) return;
    const j = p.joint;
    p.joint = null;
    this.sim.defer(() => {
      if (this.removed) return;
      const parent = this.parts[p.def.parent];
      const anchorW = j.getAnchorA();
      this.sim.world.destroyJoint(j);
      const T = this.type;
      const la = parent.body.getLocalPoint(anchorW);
      const lb = p.body.getLocalPoint(anchorW);
      parent.stumps.push({ x: la.x, y: la.y, stump: true, nx: la.x, ny: la.y });
      p.stumps.push({ x: lb.x, y: lb.y, stump: true, nx: lb.x, ny: lb.y });
      if (T.blood) {
        parent.bleed += 3.5;
        p.bleed += 1.5;
        this.sim.effects.bloodSpray(anchorW.x, anchorW.y, 0, -1, 25, 4, T.blood);
        sfx.squish(anchorW);
      } else {
        this.sim.effects.impact(T.mat, anchorW.x, anchorW.y, 0, -1, 1.5);
        if (T.robot) { this.sim.effects.sparks(anchorW.x, anchorW.y, 12, 1); sfx.zap(anchorW); }
      }
      this.refreshConnections();
      if (p.name === 'head') this.die('head');
      if (this.holding && (p.name === 'farmF' || p.name === 'uarmF')) this.drop();
    });
  }

  refreshConnections() {
    for (const name of ORDER) {
      const p = this.parts[name];
      if (name === 'chest') { p.connected = true; continue; }
      const par = this.parts[p.def.parent];
      p.connected = !!p.joint && par.connected && !par.gone;
    }
  }

  explodeHead() {
    const p = this.parts.head;
    if (p.gone) return;
    this.sim.defer(() => {
      if (p.gone || this.removed) return;
      const pos = p.body.getPosition();
      const T = this.type;
      if (p.joint) { this.sim.world.destroyJoint(p.joint); p.joint = null; }
      const chest = this.parts.chest;
      const la = chest.body.getLocalPoint(V(pos.x, pos.y + 0.12 * this.k));
      chest.stumps.push({ x: 0, y: -PARTS.chest.hh * this.k, stump: true, nx: 0, ny: -1 });
      if (T.blood) {
        chest.bleed += 4;
        this.sim.effects.bloodSpray(pos.x, pos.y, 0, -1, 40, 5, T.blood);
        this.sim.effects.chunks(pos.x, pos.y, 10, T.zombie ? ['#6f8f4f', '#4a2020'] : ['#8a1a1a', '#b03030', '#e8d8c8'], 0.05, 5);
        sfx.squish(pos);
      } else {
        this.sim.effects.chunks(pos.x, pos.y, 12, T.robot ? ['#9aa3ad', '#5d6670', '#36e0ff'] : [this.col.skin, '#cfc4a8'], 0.05, 5);
        if (T.robot) this.sim.effects.sparks(pos.x, pos.y, 16, 1.2);
      }
      void la;
      this.sim.destroyBody(p.body);
      this.bodies = this.bodies.filter((b) => b !== p.body);
      this.visuals = this.visuals.filter((v) => v.part !== p);
      p.gone = true;
      p.connected = false;
      this.shadowBodies = this.shadowBodies.filter((b) => b !== p.body);
      this.die('head');
    });
  }

  // Полное восстановление (инструмент «Лечить»): пришиваем всё обратно.
  heal() {
    const T = this.type;
    const chest = this.parts.chest.body;
    for (const name of ORDER) {
      if (name === 'chest') continue;
      const p = this.parts[name];
      const parent = this.parts[p.def.parent];
      if (p.connected && !p.gone && p.joint) continue;
      if (p.joint) { this.sim.world.destroyJoint(p.joint); p.joint = null; }
      const pd = PARTS[p.def.parent];
      const local = V(0, (p.def.y - pd.y) * this.k);
      const wp = parent.body.getWorldPoint(local);
      if (p.gone) {
        const np = this.createPart(name, 0, 0);
        np.body.setTransform(wp, parent.body.getAngle());
        if (np.joint) this.sim.world.destroyJoint(np.joint);
        this.makeJoint(np);
        this.bodies = this.bodies.filter((b) => b !== p.body);
        if (name === 'head') this.shadowBodies.push(np.body);
        continue;
      }
      p.body.setTransform(wp, parent.body.getAngle());
      p.body.setLinearVelocity(parent.body.getLinearVelocity());
      p.body.setAngularVelocity(0);
      this.makeJoint(p);
    }
    this.refreshConnections();
    for (const p of this.partList) {
      p.hp = p.maxHp;
      p.bleed = 0;
      p.wounds.length = 0;
      p.stumps.length = 0;
      p.broken = false;
    }
    void chest;
    this.alive = true;
    this.blood = 100;
    this.pain = 0;
    this.stun = 0.3;
    this.burn = 0;
    this.infected = false;
    this.relaxed = false;
    this.M = this.mass();
  }

  // ---------- Отрисовка деталей ----------
  drawWounds(ctx, p, v) {
    if (!p.wounds.length && !p.stumps.length) return;
    const T = this.type;
    ctx.save();
    ctx.beginPath();
    v.path(ctx);
    ctx.clip();
    for (const w of p.wounds) {
      if (w.kind === 'cut') {
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.a);
        ctx.fillStyle = T.zombie ? '#3d5418' : '#6e0d0d';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.r, w.r * 0.18, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (w.kind === 'dent') {
        ctx.fillStyle = '#2a2e33';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.9, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d5dbe2'; ctx.lineWidth = w.r * 0.35; ctx.stroke();
      } else if (w.kind === 'crack') {
        ctx.strokeStyle = '#6b5f48'; ctx.lineWidth = 0.008;
        ctx.beginPath(); ctx.moveTo(w.x - w.r, w.y - w.r); ctx.lineTo(w.x, w.y); ctx.lineTo(w.x + w.r * 0.7, w.y + w.r * 1.2); ctx.stroke();
      } else {
        ctx.fillStyle = T.zombie ? '#46601d' : '#8e1010';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = T.zombie ? '#22300c' : '#3d0505';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.75, 0, TAU); ctx.fill();
      }
    }
    for (const s of p.stumps) {
      const r = (p.def.hw || 0.08) * this.k * 1.1;
      if (T.robot) {
        ctx.fillStyle = '#1e2226';
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 0.012;
        ctx.beginPath(); ctx.moveTo(s.x - r * 0.4, s.y); ctx.lineTo(s.x - r * 0.2, s.y - r * 0.5); ctx.stroke();
        ctx.strokeStyle = '#ff4a3a';
        ctx.beginPath(); ctx.moveTo(s.x + r * 0.3, s.y); ctx.lineTo(s.x + r * 0.4, s.y + r * 0.5); ctx.stroke();
      } else {
        ctx.fillStyle = T.zombie ? '#4f6a24' : T.skeleton ? '#cbbf9f' : '#9c1717';
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f2ead8';
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.3, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLimbDetail(ctx, p, v) {
    const k = this.k, T = this.type;
    const hh = p.def.hh * k, hw = p.def.hw * k;
    if (T.robot && p.def.shape === 'cap') {
      ctx.strokeStyle = 'rgba(30,35,40,0.6)';
      ctx.lineWidth = 0.008 * k;
      ctx.beginPath(); ctx.moveTo(-hw * 0.6, -hh * 0.2); ctx.lineTo(hw * 0.6, -hh * 0.2); ctx.stroke();
      ctx.fillStyle = '#5b636c';
      ctx.beginPath(); ctx.arc(0, -hh + hw, hw * 0.55, 0, TAU); ctx.fill();
    }
    if (T.skeleton && p.def.shape === 'cap') {
      ctx.fillStyle = '#e4d9bd';
      ctx.beginPath(); ctx.arc(0, -hh + hw * 0.5, hw * 0.9, 0, TAU); ctx.arc(0, hh - hw * 0.5, hw * 0.9, 0, TAU); ctx.fill();
    }
    if (T.id === 'dummy' && p.def.shape === 'cap') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-hw, -hh * 0.08, hw * 2, hh * 0.16);
    }
    this.drawWounds(ctx, p, v);
    // Кисть на конце предплечья.
    if (p.name === 'farmF' || p.name === 'farmB') {
      const c = this.colorOf(v);
      ctx.fillStyle = T.robot ? '#5d6670' : c;
      ctx.strokeStyle = shade(c, -0.5);
      ctx.lineWidth = 0.008 * k;
      ctx.beginPath();
      ctx.arc(0, hh + hw * 0.25, hw * 1.15, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    if (p.broken && this.type.blood) {
      ctx.fillStyle = 'rgba(90,40,90,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, hw, hh * 0.35, 0, 0, TAU); ctx.fill();
    }
  }

  drawChest(ctx, p, v) {
    const k = this.k, T = this.type, f = this.facing;
    const hw = p.def.hw * k, hh = p.def.hh * k;
    ctx.save();
    ctx.beginPath(); v.path(ctx); ctx.clip();
    if (T.robot) {
      ctx.strokeStyle = 'rgba(25,30,35,0.55)';
      ctx.lineWidth = 0.01 * k;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh * 0.3); ctx.lineTo(hw, -hh * 0.3);
      ctx.moveTo(-hw, hh * 0.45); ctx.lineTo(hw, hh * 0.45);
      ctx.stroke();
      const on = this.alive ? 0.6 + 0.4 * Math.sin(this.sim.time * 5) : 0.1;
      ctx.fillStyle = `rgba(54,224,255,${on})`;
      ctx.beginPath(); ctx.arc(hw * 0.25 * f, hh * 0.08, hw * 0.32, 0, TAU); ctx.fill();
    } else if (T.skeleton) {
      ctx.fillStyle = '#3a3226';
      for (let i = 0; i < 4; i++) {
        const y = -hh * 0.55 + i * hh * 0.33;
        ctx.fillRect(-hw, y, hw * 2, hh * 0.1);
      }
      ctx.fillStyle = '#e4d9bd';
      ctx.fillRect(-hw * 0.15, -hh, hw * 0.3, hh * 2);
    } else if (T.id === 'dummy') {
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(0, 0, hw * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, hw * 0.55, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, hw * 0.55, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    } else {
      // Воротник и складки.
      ctx.fillStyle = this.colorOf({ role: 'skin' });
      ctx.beginPath();
      ctx.moveTo(-hw * 0.35 + hw * 0.25 * f, -hh);
      ctx.lineTo(hw * 0.25 * f, -hh * 0.62);
      ctx.lineTo(hw * 0.35 + hw * 0.25 * f, -hh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.008 * k;
      ctx.beginPath();
      ctx.moveTo(hw * 0.25 * f, -hh * 0.62); ctx.lineTo(hw * 0.25 * f, hh);
      ctx.stroke();
      if (T.armor) {
        ctx.fillStyle = shade(this.colorOf({ role: 'shirt' }), -0.25);
        ctx.fillRect(-hw * 0.95, -hh * 0.55, hw * 1.9, hh * 1.5);
        ctx.fillStyle = shade(this.colorOf({ role: 'shirt' }), -0.4);
        ctx.fillRect(-hw * 0.6 + hw * 0.3 * f, hh * 0.15, hw * 0.5, hh * 0.45);
        ctx.fillRect(hw * 0.05 + hw * 0.3 * f, hh * 0.15, hw * 0.5, hh * 0.45);
      }
      if (T.zombie) {
        ctx.fillStyle = this.colorOf({ role: 'skin' });
        ctx.beginPath(); ctx.arc(-hw * 0.4, hh * 0.3, hw * 0.25, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(hw * 0.5, -hh * 0.2, hw * 0.18, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    this.drawWounds(ctx, p, v);
  }

  drawBelly(ctx, p, v) {
    const k = this.k, T = this.type;
    const hw = p.def.hw * k, hh = p.def.hh * k;
    ctx.save();
    ctx.beginPath(); v.path(ctx); ctx.clip();
    if (T.skeleton) {
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(-hw, -hh, hw * 2, hh * 1.1);
      ctx.fillStyle = '#e4d9bd';
      ctx.fillRect(-hw * 0.15, -hh, hw * 0.3, hh * 1.2);
      ctx.beginPath(); ctx.ellipse(0, hh * 0.45, hw, hh * 0.55, 0, 0, TAU); ctx.fill();
    } else {
      const pc = this.colorOf({ role: 'pants' });
      ctx.fillStyle = this.burn > 0.05 ? pc : this.col.pants;
      ctx.fillRect(-hw * 1.2, hh * 0.05, hw * 2.4, hh * 1.2);
      if (!T.robot && T.id !== 'dummy') {
        ctx.fillStyle = '#2a1e14';
        ctx.fillRect(-hw * 1.2, hh * 0.0, hw * 2.4, hh * 0.18);
        ctx.fillStyle = '#c9a54a';
        ctx.fillRect(hw * 0.2 * this.facing - hw * 0.12, -hh * 0.02, hw * 0.24, hh * 0.22);
      }
    }
    ctx.restore();
    this.drawWounds(ctx, p, v);
  }

  drawHead(ctx, p) {
    const k = this.k, T = this.type, f = this.facing;
    const r = PARTS.head.r * k;
    const v = p.vis;
    ctx.save();
    ctx.scale(f, 1);
    const dead = !this.alive;
    const closed = !dead && (!this.conscious || this.blinkT < 0);
    if (T.robot) {
      ctx.fillStyle = '#2a2f36';
      roundRectPath(ctx, r * 0.05, -r * 0.42, r * 0.95, r * 0.12, r * 0.15);
      ctx.fill();
      ctx.fillStyle = dead ? '#3a2020' : '#36e0ff';
      ctx.globalAlpha = dead ? 1 : 0.85 + 0.15 * Math.sin(this.sim.time * 7);
      roundRectPath(ctx, r * 0.25, -r * 0.3, r * 0.85, -r * 0.02, r * 0.1);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#5d6670'; ctx.lineWidth = r * 0.08;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.95); ctx.lineTo(-r * 0.35, -r * 1.35); ctx.stroke();
      ctx.fillStyle = dead ? '#555' : '#ff5a4a';
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 1.38, r * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5d6670';
      ctx.beginPath(); ctx.arc(-r * 0.25, r * 0.05, r * 0.22, 0, TAU); ctx.fill();
    } else if (T.skeleton) {
      ctx.fillStyle = '#2a241a';
      ctx.beginPath(); ctx.ellipse(r * 0.42, -r * 0.12, r * 0.22, r * 0.25, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.82, r * 0.05); ctx.lineTo(r * 0.92, r * 0.25); ctx.lineTo(r * 0.72, r * 0.25); ctx.fill();
      ctx.fillStyle = '#efe6cf';
      ctx.fillRect(r * 0.3, r * 0.5, r * 0.6, r * 0.25);
      ctx.strokeStyle = '#6b5f48'; ctx.lineWidth = r * 0.04;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r * (0.38 + i * 0.14), r * 0.5); ctx.lineTo(r * (0.38 + i * 0.14), r * 0.75); ctx.stroke(); }
      if (!dead) {
        ctx.fillStyle = '#ff5030';
        ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.1, r * 0.06, 0, TAU); ctx.fill();
      }
    } else if (T.id === 'dummy') {
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.45, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.45, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    } else {
      // Волосы.
      ctx.fillStyle = this.burn > 0.3 ? '#1a1410' : this.col.hair;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.02, Math.PI * 0.92, Math.PI * 1.9);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.55, -r * 0.55, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      // Ухо.
      const skin = this.colorOf(v);
      ctx.fillStyle = shade(skin, -0.12);
      ctx.beginPath(); ctx.ellipse(-r * 0.12, r * 0.02, r * 0.14, r * 0.2, 0, 0, TAU); ctx.fill();
      // Нос.
      ctx.fillStyle = shade(skin, -0.06);
      ctx.beginPath(); ctx.moveTo(r * 0.92, -r * 0.08); ctx.quadraticCurveTo(r * 1.18, r * 0.12, r * 0.9, r * 0.2); ctx.fill();
      // Глаз.
      const ex = r * 0.55, ey = -r * 0.12;
      if (dead) {
        ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = r * 0.09;
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.12, ey - r * 0.12); ctx.lineTo(ex + r * 0.12, ey + r * 0.12);
        ctx.moveTo(ex + r * 0.12, ey - r * 0.12); ctx.lineTo(ex - r * 0.12, ey + r * 0.12);
        ctx.stroke();
      } else if (closed) {
        ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = r * 0.07;
        ctx.beginPath(); ctx.moveTo(ex - r * 0.13, ey); ctx.lineTo(ex + r * 0.13, ey); ctx.stroke();
      } else {
        ctx.fillStyle = T.zombie ? '#e8e070' : '#ffffff';
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.15, r * (this.pain > 60 ? 0.07 : 0.14), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = T.zombie ? '#b01818' : '#1d2a3a';
        ctx.beginPath(); ctx.arc(ex + r * 0.06, ey, r * 0.075, 0, TAU); ctx.fill();
      }
      // Бровь.
      ctx.strokeStyle = this.col.hair; ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      const angry = T.zombie || T.beard || this.mode === 'panic';
      ctx.moveTo(ex - r * 0.17, ey - r * (angry ? 0.3 : 0.24)); ctx.lineTo(ex + r * 0.17, ey - r * (angry ? 0.2 : 0.26));
      ctx.stroke();
      // Рот.
      const open = dead || this.pain > 50 || this.mode === 'panic' || T.zombie;
      ctx.fillStyle = '#4a1414';
      ctx.strokeStyle = '#5a2020'; ctx.lineWidth = r * 0.06;
      if (open) {
        ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.45, r * 0.13, r * (T.zombie ? 0.14 : 0.1), 0, 0, TAU); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(r * 0.48, r * 0.45); ctx.quadraticCurveTo(r * 0.62, r * 0.52, r * 0.78, r * 0.43); ctx.stroke();
      }
      if (T.beard) {
        ctx.fillStyle = this.col.hair;
        ctx.beginPath();
        ctx.moveTo(-r * 0.1, r * 0.2);
        ctx.quadraticCurveTo(r * 0.4, r * 1.25, r * 0.95, r * 0.35);
        ctx.lineTo(r * 0.85, r * 0.55);
        ctx.quadraticCurveTo(r * 0.6, r * 0.3, r * 0.4, r * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      if (T.zombie) {
        ctx.strokeStyle = 'rgba(60,20,20,0.6)'; ctx.lineWidth = r * 0.05;
        ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.6); ctx.lineTo(-r * 0.05, -r * 0.3); ctx.stroke();
      }
      if (T.helmet) {
        ctx.fillStyle = '#4c5a33';
        ctx.beginPath();
        ctx.arc(0, -r * 0.05, r * 1.15, Math.PI * 1.0, Math.PI * 2.0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3c4727';
        ctx.fillRect(-r * 1.25, -r * 0.12, r * 2.5, r * 0.16);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = r * 0.06;
        ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.9, Math.PI * 1.25, Math.PI * 1.6); ctx.stroke();
      }
    }
    ctx.restore();
    this.drawWounds(ctx, p, v);
  }

  drawOverlay(r) {
    if (!this.infected || this.parts.head.gone) return;
    const p = this.parts.head.body.getPosition();
    const [sx, sy] = r.P(p.x, p.y - 0.35 * this.k, -0.2);
    const ctx = r.ctx;
    r.screen();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.sim.time * 8);
    ctx.fillStyle = '#9be15d';
    ctx.font = `bold ${Math.max(10, r.k(0) * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('☣', sx, sy);
    ctx.globalAlpha = 1;
  }
}
