// Ядро симуляции: мир planck.js, сущности, контакты, пули, взрывы.
import { clamp, rand, len } from './util.js';
import { Effects } from './effects.js';
import { sfx } from './audio.js';

export const pl = window.planck;

export const CAT = { STATIC: 1, OBJ: 2, FLESH: 4, DEBRIS: 8, PROJ: 16 };
export const MASK_ALL = 0xffff;

// Материалы: проникаемость пули (pen), эффект попадания (hit), звук удара (snd).
export const MAT = {
  ground: { pen: 0, hit: 'dust', snd: 'stone' },
  flesh: { pen: 0.6, hit: 'blood', snd: 'flesh' },
  zombie: { pen: 0.65, hit: 'zblood', snd: 'flesh' },
  bone: { pen: 0.7, hit: 'bone', snd: 'wood' },
  metal: { pen: 0.12, hit: 'spark', snd: 'metal' },
  armor: { pen: 0.25, hit: 'spark', snd: 'metal' },
  wood: { pen: 0.55, hit: 'splinter', snd: 'wood' },
  stone: { pen: 0.06, hit: 'dust', snd: 'stone' },
  glass: { pen: 0.9, hit: 'glass', snd: 'glass' },
  rubber: { pen: 0.5, hit: 'dust', snd: 'rubber' },
  plastic: { pen: 0.6, hit: 'dust', snd: 'plastic' },
  melon: { pen: 0.6, hit: 'juice', snd: 'melon' },
};

export const V = (x, y) => new pl.Vec2(x, y);
export const polyShape = (pts) => new pl.Polygon(pts.map((p) => new pl.Vec2(p[0], p[1])));
export const boxShape = (hw, hh, cx = 0, cy = 0, a = 0) => new pl.Box(hw, hh, new pl.Vec2(cx, cy), a);
export const circleShape = (r, cx = 0, cy = 0) => new pl.Circle(new pl.Vec2(cx, cy), r);

export function bodyAABB(b) {
  let lx = Infinity, ly = Infinity, ux = -Infinity, uy = -Infinity;
  for (let f = b.getFixtureList(); f; f = f.getNext()) {
    const a = f.getAABB(0);
    if (a.lowerBound.x < lx) lx = a.lowerBound.x;
    if (a.lowerBound.y < ly) ly = a.lowerBound.y;
    if (a.upperBound.x > ux) ux = a.upperBound.x;
    if (a.upperBound.y > uy) uy = a.upperBound.y;
  }
  return { lx, ly, ux, uy };
}

export class Sim {
  constructor(worldDef, opts = {}) {
    this.def = worldDef;
    this.silent = !!opts.silent;
    this.world = new pl.World({ gravity: V(0, worldDef.gravity) });
    this.entities = [];
    this.deferred = [];
    this.timers = [];
    this.links = [];
    this.time = 0;
    this.groupSeq = 1;
    this.shakeAmt = 0;
    this.flashAmt = 0;
    this.halfWidth = 75;
    this.effects = new Effects(this);
    this.onBodyDestroyed = null;
    this.makeGround();
    this.world.on('begin-contact', (c) => this._begin(c));
    this.world.on('post-solve', (c, imp) => this._post(c, imp));
  }

  makeGround() {
    const g = this.world.createBody({ type: 'static', position: V(0, 0) });
    g.setUserData({ ent: null, ground: true });
    const W = this.halfWidth;
    const fd = { friction: 0.85, restitution: 0.05, filterCategoryBits: CAT.STATIC, userData: { mat: 'ground' } };
    g.createFixture(boxShape(W + 5, 10, 0, 10), fd);
    g.createFixture(boxShape(1, 150, -W - 1, -140), fd);
    g.createFixture(boxShape(1, 150, W + 1, -140), fd);
    this.ground = g;
  }

  newGroup() { return -(this.groupSeq++); }

  add(ent) {
    this.entities.push(ent);
    return ent;
  }

  remove(ent) {
    if (ent.removed) return;
    ent.removed = true;
    this.defer(() => {
      ent.destroy();
      const i = this.entities.indexOf(ent);
      if (i >= 0) this.entities.splice(i, 1);
    });
  }

  clear() {
    for (const e of this.entities.slice()) {
      e.removed = true;
      e.destroy();
    }
    this.entities.length = 0;
    this.links.length = 0;
    this.timers.length = 0;
    this.effects.clear();
  }

  defer(fn) {
    this.deferred.push(fn);
    if (!this.inStep) this.flush();
  }

  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

  flush() {
    if (this.inStep) return;
    let guard = 0;
    while (this.deferred.length && guard++ < 2000) {
      const fn = this.deferred.shift();
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  runTimers() {
    if (!this.timers.length) return;
    const due = [];
    this.timers = this.timers.filter((t) => (t.t <= this.time ? (due.push(t), false) : true));
    for (const t of due) {
      try { t.fn(); } catch (e) { console.error(e); }
    }
  }

  // Шаг симуляции с подшагами для стабильности (рэгдоллы, быстрые объекты).
  step(dt) {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt * 120 - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      for (const e of this.entities) if (!e.removed) e.preStep(h);
      this.inStep = true;
      this.world.step(h, 8, 3);
      this.inStep = false;
      this.time += h;
      this.flush();
      this.updateLinks(h);
    }
    for (const e of this.entities) if (!e.removed) e.update(dt);
    this.runTimers();
    this.flush();
    this.effects.update(dt);
  }

  // ---------- Связи (верёвки, сварка, застрявшие клинки) ----------
  addLink(joint, o = {}) {
    const link = { joint, dead: false, ...o };
    this.links.push(link);
    return link;
  }

  killLink(link) {
    if (link.dead) return;
    link.dead = true;
    try { this.world.destroyJoint(link.joint); } catch (e) { /* уже удалён */ }
    const i = this.links.indexOf(link);
    if (i >= 0) this.links.splice(i, 1);
    if (link.onBreak) link.onBreak(link);
  }

  updateLinks(h) {
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i];
      if (l.dead) continue;
      if (l.breakForce) {
        const f = l.joint.getReactionForce(1 / h);
        if (f.x * f.x + f.y * f.y > l.breakForce * l.breakForce) this.killLink(l);
      }
    }
  }

  destroyBody(body) {
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i];
      if (l.joint.getBodyA() === body || l.joint.getBodyB() === body) this.killLink(l);
    }
    if (this.onBodyDestroyed) this.onBodyDestroyed(body);
    this.world.destroyBody(body);
  }

  shake(v) { this.shakeAmt = Math.max(this.shakeAmt, v); }

  entAt(body) {
    const ud = body && body.getUserData();
    return ud && ud.ent;
  }

  // ---------- Поиск объекта под пальцем ----------
  bodyAt(x, y, rad = 0.15) {
    const p = V(x, y);
    let best = null, bestScore = Infinity;
    const ring = [];
    for (let k = 1; k <= 2; k++) {
      const r = (rad * k) / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ring.push([V(x + Math.cos(a) * r, y + Math.sin(a) * r), r]);
      }
    }
    this.world.queryAABB(new pl.AABB(V(x - rad, y - rad), V(x + rad, y + rad)), (fix) => {
      const b = fix.getBody();
      const ud = b.getUserData();
      if (!ud || !ud.ent || fix.isSensor() || ud.ent.removed) return true;
      let d = Infinity;
      if (fix.testPoint(p)) d = 0;
      else {
        for (const [q, r] of ring) {
          if (r < d && fix.testPoint(q)) d = r;
        }
      }
      if (d === Infinity) return true;
      const a = fix.getAABB(0);
      const area = (a.upperBound.x - a.lowerBound.x) * (a.upperBound.y - a.lowerBound.y);
      const score = d * 4 + Math.sqrt(area) * 0.5 - (ud.ent.pickPriority || 0);
      if (score < bestScore) { bestScore = score; best = b; }
      return true;
    });
    return best;
  }

  raycastAll(p1, p2, filter) {
    const hits = [];
    this.world.rayCast(p1, p2, (fix, point, normal, fraction) => {
      if (fix.isSensor()) return -1;
      if (filter && !filter(fix)) return -1;
      hits.push({ fix, body: fix.getBody(), point: { x: point.x, y: point.y }, normal: { x: normal.x, y: normal.y }, fraction });
      return 1;
    });
    hits.sort((a, b) => a.fraction - b.fraction);
    return hits;
  }

  // ---------- Пули (мгновенный луч с пробитием) ----------
  hitscan(ox, oy, dx, dy, o) {
    const range = o.range || 160;
    const ex = ox + dx * range, ey = oy + dy * range;
    const group = o.group || 0;
    const hits = this.raycastAll(V(ox, oy), V(ex, ey), (fix) => !(group && fix.getFilterGroupIndex() === group));
    let power = 1;
    let end = { x: ex, y: ey };
    const seen = new Set();
    for (const h of hits) {
      if (seen.has(h.body)) continue;
      seen.add(h.body);
      const ud = h.body.getUserData() || {};
      const fud = h.fix.getUserData() || {};
      const mat = MAT[fud.mat] || MAT.plastic;
      const dmg = o.damage * power;
      const imp = o.impulse * power;
      if (h.body.isDynamic()) h.body.applyLinearImpulse(V(dx * imp, dy * imp), V(h.point.x, h.point.y), true);
      if (ud.ent) ud.ent.onBullet(h.body, h.fix, h.point, { x: dx, y: dy }, dmg, h.normal, o);
      else this.effects.impact(fud.mat || 'ground', h.point.x, h.point.y, h.normal.x, h.normal.y, 1);
      power *= mat.pen * (o.pen || 1);
      if (ud.ground) power = 0;
      if (power < 0.12) { end = h.point; break; }
    }
    this.effects.tracer(ox, oy, end.x, end.y, o.tracer || '#ffe7a0', o.tracerW || 1);
    return end;
  }

  // ---------- Взрыв ----------
  explode(x, y, P, R, o = {}) {
    this.effects.explosion(x, y, P, R, !!o.nuke);
    if (!this.silent) {
      if (o.nuke) sfx.nuke(); else sfx.explosion(P, { x, y });
    }
    this.shake(clamp(P * 7, 4, o.nuke ? 60 : 28));
    if (o.nuke) this.flashAmt = 1;

    const bodies = new Set();
    this.world.queryAABB(new pl.AABB(V(x - R, y - R), V(x + R, y + R)), (fix) => {
      bodies.add(fix.getBody());
      return true;
    });
    const maxDv = o.nuke ? 70 : 26;
    for (const b of bodies) {
      const ud = b.getUserData();
      if (!ud || ud.ground) continue;
      const c = b.getWorldCenter();
      const dx = c.x - x, dy = c.y - y;
      const d = Math.max(0.05, len(dx, dy));
      if (d > R) continue;
      let cover = 1;
      if (!o.nuke && d > 0.4) {
        this.world.rayCast(V(x, y), V(c.x, c.y), (fix) => {
          const bb = fix.getBody();
          if (bb === b || fix.isSensor()) return -1;
          const bud = bb.getUserData();
          if (bud && bud.ground) { cover = Math.min(cover, 0.25); return 0; }
          if (bb.getMass() > 400 || bb.isStatic()) { cover = Math.min(cover, 0.4); return 0; }
          return -1;
        });
      }
      const fall = Math.pow(1 - d / R, 1.5) * cover;
      if (fall <= 0) continue;
      let nx = dx / d, ny = dy / d - 0.35;
      const nl = len(nx, ny);
      nx /= nl; ny /= nl;
      if (b.isDynamic()) {
        const bb = bodyAABB(b);
        const size = clamp(((bb.ux - bb.lx) + (bb.uy - bb.ly)) / 2, 0.08, 4);
        const m = b.getMass();
        const J = Math.min(P * 420 * size * fall, m * maxDv);
        b.applyLinearImpulse(V(nx * J, ny * J), V(c.x + rand(-0.05, 0.05), c.y + rand(-0.05, 0.05)), true);
        b.applyAngularImpulse(rand(-1, 1) * J * 0.02, true);
      }
      if (ud.ent && !ud.ent.removed) ud.ent.onBlast(b, P * 120 * fall, nx, ny, fall, P, o);
    }
    if (o.nuke) {
      // Обратная тяга воздуха после ударной волны.
      this.after(1.6, () => this.pull(x, y, R * 0.8, 0.6 * P));
    }
  }

  pull(x, y, R, k) {
    this.world.queryAABB(new pl.AABB(V(x - R, y - R), V(x + R, y + R)), (fix) => {
      const b = fix.getBody();
      if (!b.isDynamic()) return true;
      const c = b.getWorldCenter();
      const dx = x - c.x, dy = y - 6 - c.y;
      const d = Math.max(1, len(dx, dy));
      const J = b.getMass() * k * (1 - Math.min(1, d / R));
      b.applyLinearImpulse(V((dx / d) * J, (dy / d) * J), c, true);
      return true;
    });
  }

  // ---------- Контакты ----------
  _begin(c) {
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const ea = this.entAt(fa.getBody()), eb = this.entAt(fb.getBody());
    if (ea && ea.onBegin) ea.onBegin(c, fa, fb);
    if (eb && eb.onBegin) eb.onBegin(c, fb, fa);
  }

  _post(c, imp) {
    const n = c.getManifold().pointCount;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += imp.normalImpulses[i];
    if (sum < 0.3) return;
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const ba = fa.getBody(), bb = fb.getBody();
    const ea = this.entAt(ba), eb = this.entAt(bb);
    if (ea && ea.onImpulse) ea.onImpulse(fa, fb, sum, c);
    if (eb && eb.onImpulse) eb.onImpulse(fb, fa, sum, c);
    if (this.silent) return;
    const ma = ba.isDynamic() ? ba.getMass() : Infinity;
    const mb = bb.isDynamic() ? bb.getMass() : Infinity;
    const m = Math.min(ma, mb);
    if (!isFinite(m) || m <= 0) return;
    const dv = sum / m;
    if (dv > 1.8) {
      const fud = (ma < mb ? fa : fb).getUserData() || {};
      const mat = (MAT[fud.mat] || MAT.plastic).snd;
      const p = (ma < mb ? ba : bb).getPosition();
      sfx.impact(mat, (dv - 1.5) / 7, p);
      if (dv > 9 && (fud.mat === 'metal' || fud.mat === 'armor')) {
        const wm = c.getWorldManifold(null);
        if (wm && wm.points[0]) this.effects.sparks(wm.points[0].x, wm.points[0].y, 4, 0.6);
      }
    }
  }
}
