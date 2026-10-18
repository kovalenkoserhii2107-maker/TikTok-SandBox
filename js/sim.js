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

// Горючесть материалов (0 — не горит).
export const FLAMMABLE = { wood: 1, plastic: 0.8, rubber: 0.7, flesh: 0.55, zombie: 0.6, bone: 0.15, melon: 0.05 };

// «Плотность» воды в тех же единицах, что и тела (кг/м² в 2D).
export const WATER_D = 140;

export function bodyArea(b) {
  let a = 0;
  for (let f = b.getFixtureList(); f; f = f.getNext()) {
    if (f.isSensor()) continue;
    const s = f.getShape();
    if (s.getType() === 'circle') a += Math.PI * s.getRadius() * s.getRadius();
    else if (s.m_vertices) {
      const vs = s.m_vertices;
      let k = 0;
      for (let i = 0; i < vs.length; i++) { const p = vs[i], q = vs[(i + 1) % vs.length]; k += p.x * q.y - q.x * p.y; }
      a += Math.abs(k) / 2;
    }
  }
  return a;
}

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
    this.halfWidth = 4000; // мир практически бесконечный по ширине
    this.effects = new Effects(this);
    this.onBodyDestroyed = null;
    this.onEvent = null; // заметные события (взрывы, расчленение) — для повтора и кинокамеры
    this.onStepped = null;
    this.burning = new Set();
    this.groundFires = [];
    this.wires = [];
    this.waters = [];
    this.makeGround();
    this.world.on('begin-contact', (c) => this._begin(c));
    this.world.on('post-solve', (c, imp) => this._post(c, imp));
    this.world.on('end-contact', (c) => this._end(c));
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
    this.ceilingFix = null;
    this.setCeiling(this.def.ceiling);
  }

  // Потолок (космическая станция): статичная плита на высоте y.
  setCeiling(y) {
    if (this.ceilingFix) { this.ground.destroyFixture(this.ceilingFix); this.ceilingFix = null; }
    this.ceilingY = y ?? null;
    if (y === undefined || y === null) return;
    this.ceilingFix = this.ground.createFixture(boxShape(this.halfWidth + 5, 5, 0, y - 5), {
      friction: 0.6, restitution: 0.1, filterCategoryBits: CAT.STATIC, userData: { mat: 'metal' },
    });
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

  // ---------- Вода ----------
  waterAt(x, y) {
    for (const pool of this.waters) {
      const w = pool.water;
      if (x > w.x0 && x < w.x1 && y > w.top && y < w.bottom) return w;
    }
    return null;
  }

  // Плавучесть по Архимеду + сопротивление воды.
  applyWater(h) {
    const g = this.def.gravity;
    for (const pool of this.waters) {
      if (pool.removed) continue;
      const w = pool.region();
      const seen = new Set();
      this.world.queryAABB(new pl.AABB(V(w.x0, w.top - 0.5), V(w.x1, w.bottom)), (fix) => {
        const b = fix.getBody();
        if (!b.isDynamic() || seen.has(b) || fix.isSensor()) return true;
        seen.add(b);
        const ud = b.getUserData();
        if (!ud || !ud.ent) return true;
        const a = bodyAABB(b);
        const hgt = Math.max(0.02, a.uy - a.ly), wid = Math.max(0.02, a.ux - a.lx);
        const fy = clamp((Math.min(a.uy, w.bottom) - Math.max(a.ly, w.top)) / hgt, 0, 1);
        const fx = clamp((Math.min(a.ux, w.x1) - Math.max(a.lx, w.x0)) / wid, 0, 1);
        const sub = fy * fx;
        const was = !!ud.wet;
        ud.wet = sub > 0.05;
        if (sub <= 0) return true;
        if (ud.area === undefined) ud.area = bodyArea(b);
        const c = b.getWorldCenter();
        const v = b.getLinearVelocity();
        const F = WATER_D * ud.area * sub * g;
        const drag = ud.area * sub * 55;
        b.applyForce(V(-v.x * drag, -F - v.y * drag), V(c.x, c.y - (1 - fy) * hgt * 0.25), true);
        b.applyTorque(-b.getAngularVelocity() * b.getInertia() * sub * 3, true);
        if (!was && ud.wet && v.y > 2.5 && !this.silent) this.effects.splash(c.x, w.top, Math.min(1.5, v.y / 8) * Math.sqrt(wid));
        if (sub > 0.35 && ud.fire > 0) this.extinguish(b);
        return true;
      });
    }
  }

  // ---------- Огонь ----------
  flammability(body) {
    const ud = body.getUserData();
    if (!ud || !ud.ent || ud.ground) return 0;
    if (ud.ent.flammability) return ud.ent.flammability(body);
    const f = body.getFixtureList();
    const mat = f && f.getUserData() && f.getUserData().mat;
    return FLAMMABLE[mat] || 0;
  }

  ignite(body, dur = 7) {
    if (!body || this.silent) return false;
    const ud = body.getUserData();
    if (!ud || !ud.ent || ud.ent.removed) return false;
    const fl = this.flammability(body);
    if (fl <= 0) return false;
    const d = dur * (0.5 + fl * 0.7) * (this.def.noAir ? 0.25 : 1);
    if ((ud.fire || 0) < d) ud.fire = d;
    this.burning.add(body);
    return true;
  }

  extinguish(body) {
    const ud = body.getUserData();
    if (ud) ud.fire = 0;
    this.burning.delete(body);
  }

  addGroundFire(x, r = 1.5, t = 6) {
    if (this.silent) return;
    for (const g of this.groundFires) {
      if (Math.abs(g.x - x) < r * 0.6) { g.t = Math.max(g.t, t); g.r = Math.max(g.r, r); return; }
    }
    if (this.groundFires.length > 24) this.groundFires.shift();
    this.groundFires.push({ x, r, t, tick: 0 });
    this.effects.decal(x, rand(-0.3, 0.3), r * 0.8, '#1a120c', 0.6, 'scorch');
  }

  updateFire(dt) {
    const fx = this.effects;
    const q = fx.quality;
    for (const b of this.burning) {
      const ud = b.getUserData();
      if (!ud || !ud.ent || ud.ent.removed || !(ud.fire > 0)) {
        this.burning.delete(b);
        if (ud) ud.fire = 0;
        continue;
      }
      ud.fire -= dt;
      const c = b.getWorldCenter();
      const r = ud.ent.shadowR(b);
      let n = dt * 30 * q * Math.min(2, 0.4 + r);
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        fx.flame(c.x + rand(-r, r) * 0.8, c.y + rand(-r, r) * 0.5, rand(0.12, 0.28) * Math.min(2, 0.6 + r));
      }
      if (Math.random() < dt * 4) fx.smokePuff(c.x, c.y - r, 0.25 + r * 0.3, '#3a3633', 0.4);
      if (Math.random() < dt * 6) fx.light(c.x, c.y, 1.5 + r, 0.2, '#ff9a40');
      if (ud.ent.onBurn) ud.ent.onBurn(b, dt);
      // Распространение на соприкасающиеся тела.
      for (let ce = b.getContactList(); ce; ce = ce.next) {
        if (ce.contact.isTouching() && Math.random() < dt * 0.9) this.ignite(ce.other, 6);
      }
    }
    for (let i = this.groundFires.length - 1; i >= 0; i--) {
      const g = this.groundFires[i];
      g.t -= dt;
      if (g.t <= 0) { this.groundFires.splice(i, 1); continue; }
      const k = Math.min(1, g.t / 2);
      let n = dt * 20 * q * g.r * k;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        fx.add({ type: 'fire', x: g.x + rand(-g.r, g.r), y: -0.05, z: rand(-0.8, 0.8), vx: rand(-0.3, 0.3), vy: rand(-2.2, -0.8), life: rand(0.3, 0.7), size: rand(0.16, 0.36) * k, grow: -0.15, g: 0 });
      }
      if (Math.random() < dt * 5) fx.light(g.x, -0.5, 2 + g.r, 0.25, '#ff9040');
      if (Math.random() < dt * 3) fx.smokePuff(g.x + rand(-g.r, g.r), -1, 0.4, '#3a3633', 0.35);
      g.tick -= dt;
      if (g.tick <= 0) {
        g.tick = 0.25;
        this.world.queryAABB(new pl.AABB(V(g.x - g.r, -0.9), V(g.x + g.r, 0.1)), (fix) => {
          this.ignite(fix.getBody(), 6);
          return true;
        });
      }
    }
  }

  clear() {
    this.burning.clear();
    this.wires.length = 0;
    this.waters.length = 0;
    this.groundFires.length = 0;
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
      if (this.waters.length) this.applyWater(h);
      this.inStep = true;
      this.world.step(h, 8, 3);
      this.inStep = false;
      this.time += h;
      this.flush();
      this.updateLinks(h);
    }
    for (const e of this.entities) if (!e.removed) e.update(dt);
    this.runTimers();
    this.updateFire(dt);
    if (this.wires.length) {
      this.wires = this.wires.filter((w) => !w.a.removed && !w.b.removed);
      for (const w of this.wires) if (w.flash > 0) w.flash -= dt;
    }
    this.flush();
    this.effects.update(dt);
    if (this.onStepped) this.onStepped(dt);
  }

  event(type, x, y, w = 1) {
    if (this.onEvent && !this.silent) this.onEvent({ type, x, y, w, t: this.time });
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
    this.burning.delete(body);
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
    this.event(o.nuke ? 'nuke' : 'boom', x, y, o.nuke ? 100 : P * 4);

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
      if ((o.nuke && fall > 0.08) || (P >= 1 && fall > 0.4 && Math.random() < fall)) this.ignite(b, o.nuke ? 12 : 5);
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

  _end(c) {
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const ea = this.entAt(fa.getBody()), eb = this.entAt(fb.getBody());
    if (ea && ea.onEnd) ea.onEnd(c, fa, fb);
    if (eb && eb.onEnd) eb.onEnd(c, fb, fa);
  }

  // Сигнал по проводам: источник → все подключённые приёмники.
  signal(src) {
    if (src.removed) return;
    const now = this.time;
    if (src._sigT === now) return;
    src._sigT = now;
    for (const w of this.wires) {
      let dst = null;
      if (w.a === src) dst = w.b; else if (w.b === src) dst = w.a;
      if (!dst || dst.removed) continue;
      w.flash = 0.35;
      if (dst.isSource) continue;
      this.defer(() => { if (!dst.removed) dst.onSignal(src); });
    }
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
