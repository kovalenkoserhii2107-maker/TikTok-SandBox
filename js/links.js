// Соединения: верёвка, сварка, шарнир, пружина и провода (сигналы).
import { pl, V } from './sim.js';
import { TAU } from './util.js';

export const LINK_MODES = [
  { id: 'rope', name: 'Верёвка', hint: 'Две точки. Пустое место — крепление к фону.' },
  { id: 'weld', name: 'Сварка', hint: 'Два объекта намертво.' },
  { id: 'hinge', name: 'Шарнир', hint: 'Первая точка — ось вращения, потом второй объект.' },
  { id: 'spring', name: 'Пружина', hint: 'Две точки — упругая связь.' },
  { id: 'wire', name: 'Провод', hint: 'Источник сигнала (кнопка, таймер, лазер) и приёмник.' },
];

export function drawRope(r, l) {
  const j = l.joint;
  const a = j.getAnchorA(), b = j.getAnchorB();
  const ctx = r.ctx;
  r.face(-0.25);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const slack = Math.max(0, l.maxLength - d);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + slack * 0.7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6e5130';
  ctx.lineWidth = 0.045;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,225,170,0.4)';
  ctx.lineWidth = 0.014;
  ctx.setLineDash([0.05, 0.05]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4a4f57';
  for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.045, 0, TAU); ctx.fill(); }
  r.screen();
}

export function drawWeld(r, l) {
  const a = l.joint.getAnchorA();
  const ctx = r.ctx;
  r.face(-0.4);
  ctx.fillStyle = '#ffb02e';
  ctx.strokeStyle = '#5a3a10';
  ctx.lineWidth = 0.015;
  ctx.beginPath(); ctx.arc(a.x, a.y, 0.05, 0, TAU); ctx.fill(); ctx.stroke();
  r.screen();
}

export function drawHinge(r, l) {
  const a = l.joint.getAnchorA();
  const ctx = r.ctx;
  r.face(-0.45);
  ctx.fillStyle = '#c9ced4';
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = 0.02;
  ctx.beginPath(); ctx.arc(a.x, a.y, 0.075, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3f46';
  ctx.beginPath(); ctx.arc(a.x, a.y, 0.025, 0, TAU); ctx.fill();
  r.screen();
}

export function drawSpring(r, l) {
  const j = l.joint;
  const a = j.getAnchorA(), b = j.getAnchorB();
  const ctx = r.ctx;
  r.face(-0.3);
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / d, ny = dx / d;
  const coils = Math.max(6, Math.round(l.len / 0.08));
  const amp = 0.07;
  ctx.strokeStyle = '#9aa3ad';
  ctx.lineWidth = 0.025;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < coils; i++) {
    const t = i / coils;
    const s = i % 2 ? amp : -amp;
    ctx.lineTo(a.x + dx * t + nx * s, a.y + dy * t + ny * s);
  }
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.fillStyle = '#4a4f57';
  for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.04, 0, TAU); ctx.fill(); }
  r.screen();
}

const DRAW = { rope: drawRope, weld: drawWeld, hinge: drawHinge, spring: drawSpring };

// Создать физическую связь. la/lb — локальные точки на телах.
export function makeLink(sim, type, ba, la, bb, lb, o = {}) {
  const pa = ba.getWorldPoint(V(la.x, la.y)), pb = bb.getWorldPoint(V(lb.x, lb.y));
  const dist = Math.max(0.15, Math.hypot(pa.x - pb.x, pa.y - pb.y));
  let j, extra = {};
  switch (type) {
    case 'rope':
      j = new pl.RopeJoint({ bodyA: ba, bodyB: bb, localAnchorA: V(la.x, la.y), localAnchorB: V(lb.x, lb.y), maxLength: o.len ?? dist, collideConnected: true });
      extra = { maxLength: o.len ?? dist, breakForce: 90000 };
      break;
    case 'weld':
      j = new pl.WeldJoint({}, ba, bb, pb);
      extra = { breakForce: 120000 };
      break;
    case 'hinge':
      j = new pl.RevoluteJoint({ collideConnected: false }, ba, bb, pa);
      extra = { breakForce: 150000 };
      break;
    case 'spring':
      j = new pl.DistanceJoint({ frequencyHz: o.hz ?? 2.2, dampingRatio: 0.12, length: o.len ?? dist, collideConnected: true }, ba, bb, pa, pb);
      extra = { len: o.len ?? dist, breakForce: 90000 };
      break;
    default:
      return null;
  }
  const joint = sim.world.createJoint(j);
  ba.setAwake(true);
  bb.setAwake(true);
  return sim.addLink(joint, { type, draw: DRAW[type], la: { x: la.x, y: la.y }, lb: { x: lb.x, y: lb.y }, ...extra });
}

// ---------- Провода ----------
export function addWire(sim, a, ba, la, b, bb, lb) {
  if (!a || !b || a === b) return null;
  const w = { a, b, ba, bb, la: { x: la.x, y: la.y }, lb: { x: lb.x, y: lb.y }, flash: 0 };
  sim.wires.push(w);
  return w;
}

function wirePoint(ent, body, l) {
  const b = body && ent.bodies.includes(body) ? body : ent.main;
  if (!b) return null;
  return b.getWorldPoint(V(l.x, l.y));
}

export function drawWires(r, sim) {
  if (!sim.wires.length) return;
  const ctx = r.ctx;
  r.face(-0.35);
  ctx.lineCap = 'round';
  for (const w of sim.wires) {
    if (w.a.removed || w.b.removed) continue;
    const p = wirePoint(w.a, w.ba, w.la), q = wirePoint(w.b, w.bb, w.lb);
    if (!p || !q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2 + Math.min(1.2, d * 0.15);
    ctx.strokeStyle = '#1b1d22';
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, q.x, q.y); ctx.stroke();
    ctx.strokeStyle = w.flash > 0 ? `rgba(255,230,90,${0.5 + w.flash})` : '#d6452f';
    ctx.lineWidth = w.flash > 0 ? 0.03 : 0.018;
    ctx.stroke();
    ctx.fillStyle = '#d6452f';
    for (const t of [p, q]) { ctx.beginPath(); ctx.arc(t.x, t.y, 0.035, 0, TAU); ctx.fill(); }
  }
  r.screen();
}
