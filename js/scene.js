// Сохранение и загрузка сцены в localStorage (3 слота).
import { V } from './sim.js';
import { findItem } from './catalog.js';
import { makeLink, addWire } from './links.js';

const KEY = (n) => `kaboom.scene.${n}`;
const r3 = (v) => Math.round(v * 1000) / 1000;

function bodyKey(ent, body) {
  if (ent.isRagdoll) {
    const ud = body.getUserData();
    return ud && ud.part;
  }
  return ent.bodies.indexOf(body);
}

function bodyFromKey(ent, key) {
  if (ent.isRagdoll) return ent.parts[key] && !ent.parts[key].gone ? ent.parts[key].body : null;
  return ent.bodies[key] || null;
}

const pose = (b) => [r3(b.getPosition().x), r3(b.getPosition().y), r3(b.getAngle()), b.isStatic() ? 1 : 0];

export function serialize(game) {
  const sim = game.sim;
  const ents = sim.entities.filter((e) => !e.removed && e.spawnRef && !e.isDebris);
  const index = new Map(ents.map((e, i) => [e, i]));
  const out = { v: 1, world: game.worldDef.id, cam: { ...game.r.cam }, ents: [], links: [] };
  for (const e of ents) {
    const s = { cat: e.spawnRef.cat, id: e.spawnRef.id, f: e.spawnRef.f };
    if (e.isRagdoll) {
      s.f = e.facing;
      s.id = e.typeId;
      s.parts = {};
      for (const p of e.partList) if (!p.gone) s.parts[p.name] = pose(p.body);
      s.severed = e.partList.filter((p) => !p.gone && p.name !== 'chest' && !p.joint).map((p) => p.name);
      s.headGone = e.parts.head.gone;
      s.alive = e.alive;
      s.blood = Math.round(e.blood);
      if (e.holding && index.has(e.holding.w)) s.hold = index.get(e.holding.w);
    } else {
      if (e.isWeapon) s.f = e.flipped ? -1 : 1;
      if (e.f !== undefined) s.f = e.f;
      s.b = e.bodies.map(pose);
      if (e.isVehicle && e.wrecked) s.wrecked = true;
    }
    out.ents.push(s);
  }
  const LINKS = ['rope', 'weld', 'hinge', 'spring'];
  for (const l of sim.links) {
    if (l.dead || !LINKS.includes(l.type)) continue;
    const j = l.joint;
    const ba = j.getBodyA(), bb = j.getBodyB();
    const ea = sim.entAt(ba), eb = sim.entAt(bb);
    const ia = ea ? index.get(ea) : -1, ib = eb ? index.get(eb) : -1;
    if (ia === undefined || ib === undefined) continue;
    const la = l.la || ba.getLocalPoint(j.getAnchorA()), lb = l.lb || bb.getLocalPoint(j.getAnchorB());
    out.links.push({
      type: l.type,
      a: ia < 0 ? null : [ia, bodyKey(ea, ba)], b: ib < 0 ? null : [ib, bodyKey(eb, bb)],
      la: [r3(la.x), r3(la.y)], lb: [r3(lb.x), r3(lb.y)], len: l.maxLength ?? l.len,
    });
  }
  out.wires = [];
  for (const w of sim.wires) {
    const ia = index.get(w.a), ib = index.get(w.b);
    if (ia === undefined || ib === undefined) continue;
    out.wires.push({ a: [ia, bodyKey(w.a, w.ba)], b: [ib, bodyKey(w.b, w.bb)], la: [r3(w.la.x), r3(w.la.y)], lb: [r3(w.lb.x), r3(w.lb.y)] });
  }
  return out;
}

export function deserialize(game, data) {
  const sim = game.sim;
  game.clearScene();
  if (data.world) game.setWorld(data.world);
  if (data.cam) Object.assign(game.r.cam, data.cam);
  const ents = [];
  for (const s of data.ents) {
    const item = findItem(s.cat, s.id);
    if (!item) { ents.push(null); continue; }
    const e = game.place(item, 0, -40, s.f || 1, { quiet: true, noLift: true, noHistory: true });
    ents.push(e);
    const set = (b, t) => {
      if (!b || !t) return;
      b.setTransform(V(t[0], t[1]), t[2]);
      b.setLinearVelocity(V(0, 0));
      b.setAngularVelocity(0);
      if (t[3]) b.setStatic();
    };
    if (e.isRagdoll) {
      for (const [name, t] of Object.entries(s.parts || {})) set(e.parts[name] && e.parts[name].body, t);
      for (const name of s.severed || []) if (e.parts[name]) e.sever(e.parts[name]);
      if (s.headGone) e.explodeHead();
      if (s.blood !== undefined) e.blood = s.blood;
      if (s.alive === false) { e.alive = false; e.conscious = false; }
    } else {
      (s.b || []).forEach((t, i) => set(e.bodies[i], t));
      if (s.wrecked) { e.wrecked = true; e.burn = 1; e.hp = -1; }
    }
  }
  data.ents.forEach((s, i) => {
    const e = ents[i];
    if (e && e.isRagdoll && s.hold !== undefined && ents[s.hold]) {
      const w = ents[s.hold];
      sim.defer(() => e.grab(w));
    }
  });
  for (const l of data.links || []) {
    const ba = l.a ? ents[l.a[0]] && bodyFromKey(ents[l.a[0]], l.a[1]) : sim.ground;
    const bb = l.b ? ents[l.b[0]] && bodyFromKey(ents[l.b[0]], l.b[1]) : sim.ground;
    if (!ba || !bb) continue;
    makeLink(sim, l.type, ba, { x: l.la[0], y: l.la[1] }, bb, { x: l.lb[0], y: l.lb[1] }, { len: l.len });
  }
  for (const w of data.wires || []) {
    const ea = ents[w.a[0]], eb = ents[w.b[0]];
    if (!ea || !eb) continue;
    addWire(sim, ea, bodyFromKey(ea, w.a[1]), { x: w.la[0], y: w.la[1] }, eb, bodyFromKey(eb, w.b[1]), { x: w.lb[0], y: w.lb[1] });
  }
  return ents.filter(Boolean).length;
}

export function saveSlot(game, n) {
  const data = serialize(game);
  data.time = Date.now();
  data.count = data.ents.length;
  try {
    localStorage.setItem(KEY(n), JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSlot(game, n) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY(n)) || 'null'); } catch (e) { data = null; }
  if (!data) return -1;
  return deserialize(game, data);
}

export function slotInfo(n) {
  try {
    const raw = localStorage.getItem(KEY(n));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { time: d.time, count: d.count, world: d.world };
  } catch (e) {
    return null;
  }
}
