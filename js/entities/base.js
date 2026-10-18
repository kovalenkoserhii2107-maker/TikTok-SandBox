// Базовая сущность и визуальные примитивы (объёмные призмы, сферы, капсулы).
import { pl, V, CAT, MASK_ALL, bodyAABB } from '../sim.js';
import { sfx } from '../audio.js';
import { circleOutline, capsuleOutline, rrectOutline, polyPath, roundRectPath, TAU } from '../util.js';

let ID = 0;

function maxRad(pts) {
  let r = 0;
  for (const [x, y] of pts) r = Math.max(r, Math.hypot(x, y));
  return r;
}

// Визуал-многоугольник (локальные координаты тела).
export function visPoly(body, pts, o = {}) {
  return {
    body, outline: pts, rad: maxRad(pts) || 0.1,
    path: (ctx) => polyPath(ctx, pts),
    z: 0, t: 0.3, color: '#888888', ...o,
  };
}

export function visCircle(body, r, o = {}) {
  const cx = o.cx || 0, cy = o.cy || 0;
  return {
    body, outline: circleOutline(r, 18, cx, cy), rad: r + Math.hypot(cx, cy),
    path: (ctx) => ctx.arc(cx, cy, r, 0, TAU),
    z: 0, t: 0.3, color: '#888888', ...o,
  };
}

export function visCapsule(body, hw, hh, o = {}) {
  return {
    body, outline: capsuleOutline(hw, hh), rad: hh + hw,
    path: (ctx) => roundRectPath(ctx, -hw, -hh, hw, hh, hw),
    z: 0, t: 0.15, color: '#888888', cyl: hw, ...o,
  };
}

export function visRRect(body, x0, y0, x1, y1, r, o = {}) {
  const out = rrectOutline(x0, y0, x1, y1, r);
  return {
    body, outline: out, rad: maxRad(out),
    path: (ctx) => roundRectPath(ctx, x0, y0, x1, y1, r),
    z: 0, t: 0.3, color: '#888888', ...o,
  };
}

export class Entity {
  constructor(sim) {
    this.sim = sim;
    this.id = ++ID;
    this.bodies = [];
    this.visuals = [];
    this.group = sim.newGroup();
    this.removed = false;
    this.facing = 1;
    this.name = '';
  }

  makeBody(x, y, angle = 0, o = {}) {
    const b = this.sim.world.createBody({
      type: 'dynamic', position: V(x, y), angle,
      linearDamping: o.linearDamping ?? 0.02,
      angularDamping: o.angularDamping ?? 0.05,
      bullet: !!o.bullet,
    });
    b.setUserData({ ent: this, part: o.part || null });
    this.bodies.push(b);
    return b;
  }

  fix(body, shape, o = {}) {
    return body.createFixture(shape, {
      density: o.density ?? 50,
      friction: o.friction ?? 0.5,
      restitution: o.restitution ?? 0.1,
      filterGroupIndex: o.group ?? this.group,
      filterCategoryBits: o.cat ?? CAT.OBJ,
      filterMaskBits: o.mask ?? MASK_ALL,
      isSensor: !!o.sensor,
      userData: { mat: o.mat || 'plastic', ...(o.ud || {}) },
    });
  }

  vis(v) { this.visuals.push(v); return v; }

  get main() { return this.bodies[0]; }

  mass() {
    let m = 0;
    for (const b of this.bodies) m += b.getMass();
    return m;
  }

  aabb() {
    let lx = Infinity, ly = Infinity, ux = -Infinity, uy = -Infinity;
    for (const b of this.bodies) {
      const a = bodyAABB(b);
      lx = Math.min(lx, a.lx); ly = Math.min(ly, a.ly);
      ux = Math.max(ux, a.ux); uy = Math.max(uy, a.uy);
    }
    return { lx, ly, ux, uy };
  }

  translate(dx, dy) {
    for (const b of this.bodies) {
      const p = b.getPosition();
      b.setTransform(V(p.x + dx, p.y + dy), b.getAngle());
    }
  }

  setVelocity(vx, vy) {
    for (const b of this.bodies) b.setLinearVelocity(V(vx, vy));
  }

  // Смена группы столкновений (например, оружие в руке не задевает владельца).
  setGroup(g) {
    for (const b of this.bodies) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        f.setFilterData({ groupIndex: g, categoryBits: f.getFilterCategoryBits(), maskBits: f.getFilterMaskBits() });
      }
    }
  }

  shadowR(b) {
    const ud = b.getUserData();
    if (ud.sr === undefined) {
      const a = bodyAABB(b);
      ud.sr = Math.max(0.05, Math.min(a.ux - a.lx, 6) / 2);
    }
    return ud.sr;
  }

  preStep() {}
  update() {}
  activate() { return false; }

  onBullet(body, fix, point, dir, dmg, normal) {
    const mat = (fix.getUserData() || {}).mat;
    this.sim.effects.impact(mat, point.x, point.y, -dir.x, -dir.y, 1);
    if (!this.sim.silent && (mat === 'metal' || mat === 'armor')) sfx.ricochet(point);
    if (this.damage) this.damage(dmg, 'bullet', body, point);
  }

  onBlast(body, dmg) {
    if (this.damage) this.damage(dmg, 'blast', body);
  }

  destroy() {
    for (const b of this.bodies) this.sim.destroyBody(b);
    this.bodies.length = 0;
  }
}

export { pl, V, CAT };
