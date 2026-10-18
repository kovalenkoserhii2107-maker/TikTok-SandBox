// Взрывчатка: граната, динамит, мина, C4, авиабомба, бочка, ядерная бомба.
import { Entity, visPoly, visCircle, visRRect, V, CAT, pl, hurt } from './base.js';
import { polyShape, circleShape } from '../sim.js';
import { R, rand, TAU, polyArea, mirrorPts, roundRectPath } from '../util.js';
import { sfx } from '../audio.js';

// Текст в метрах: шрифты меньше 1px браузеры рисуют ненадёжно, поэтому масштабируем.
function tinyText(ctx, txt, x, y, size, color, family = 'system-ui, sans-serif') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = `800 100px ${family}`;
  ctx.fillStyle = color;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

export const EXPLOSIVES = {
  grenade: { name: 'Граната', mass: 0.6, P: 1.1, R: 6, fuse: 3, shrapnel: 26, chain: 15 },
  molotov: { name: 'Коктейль Молотова', mass: 0.9, fire: true },
  dynamite: { name: 'Динамит', mass: 1.2, P: 1.6, R: 7.5, fuse: 4, chain: 12 },
  mine: { name: 'Мина', mass: 3, P: 2, R: 6.5, chain: 10 },
  c4: { name: 'Взрывчатка C4', mass: 1, P: 2.6, R: 9.5, chain: 25, sticky: true },
  barrel: { name: 'Взрывоопасная бочка', mass: 40, P: 1.8, R: 8, chain: 8, hp: 35 },
  bomb: { name: 'Авиабомба', mass: 230, P: 4.2, R: 15, chain: 20 },
  nuke: { name: 'Ядерная бомба', mass: 900, P: 30, R: 80, fuse: 5, nuke: true },
  blackHole: { name: 'Чёрная дыра', mass: 1.5, fuse: 2, blackHole: true },
  gasGrenade: { name: 'Газовая граната', mass: 0.6, fuse: 2.5, gas: true },
  clusterBomb: { name: 'Кассетная бомба', mass: 80, P: 2.2, R: 8, fuse: 3, cluster: true },
};

// Сингулярность: затягивает всё вокруг, рвёт тех, кто попал в центр, и взрывается.
class BlackHoleVortex extends Entity {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Сингулярность';
    this.x = x; this.y = y;
    this.life = 4.5;
    this.age = 0;
    this.rot = 0;
    this.noShadow = true;
    const b = this.makeBody(x, y, 0);
    b.setStatic();
    sfx.blackHole({ x, y });
    this.vis({ custom: (r) => this.drawVortex(r), z: -0.4, t: 0, body: b, outline: null });
  }

  get radius() { return Math.min(1, this.age / 0.6); }

  // Силы — в каждом подшаге физики (после шага planck их обнуляет).
  preStep() {
    const R = 13 * this.radius;
    for (const e of this.sim.entities) {
      if (e === this || e.removed || e.permanentStatic) continue;
      for (const b of e.bodies) {
        if (!b.isDynamic()) continue;
        const p = b.getPosition();
        const dx = this.x - p.x, dy = this.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > R || d < 0.05) continue;
        const acc = Math.min(70, ((R - d) / R) * 90 / Math.max(0.6, d));
        const m = b.getMass();
        b.applyForceToCenter(V((dx / d) * acc * m, (dy / d) * acc * m), true);
        // Закручивание в воронку.
        b.applyForceToCenter(V((-dy / d) * acc * m * 0.35, (dx / d) * acc * m * 0.35), true);
      }
    }
  }

  update(dt) {
    this.life -= dt;
    this.age += dt;
    this.rot += dt * 6;
    const sim = this.sim;
    const x = this.x, y = this.y;
    if (Math.random() < dt * 3) sfx.blackHole({ x, y });
    for (const e of sim.entities) {
      if (e === this || e.removed || !e.damage) continue;
      for (const b of e.bodies) {
        if (!b.isDynamic()) continue;
        const p = b.getPosition();
        if (Math.hypot(x - p.x, y - p.y) < 0.9) {
          hurt(e, b, dt * 120, 'blast', { x: p.x, y: p.y });
          const v = b.getLinearVelocity();
          b.setLinearVelocity(V(v.x * 0.8, v.y * 0.8));
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      const r = rand(1.5, 4.5) * this.radius;
      sim.effects.add({
        type: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a - 0.6) * 7, vy: -Math.sin(a - 0.6) * 7,
        life: 0.4, size: 0.035, g: 0, color: Math.random() < 0.5 ? '#b388ff' : '#00e5ff',
      });
    }
    if (this.life <= 0) {
      sim.remove(this);
      sim.explode(x, y, 3.5, 12);
    }
  }

  drawVortex(r) {
    const ctx = r.ctx;
    const [sx, sy] = r.P(this.x, this.y, 0);
    const k = r.k(0) * this.radius;
    const pulse = 1 + Math.sin(this.age * 9) * 0.05;
    r.screen();
    ctx.save();
    ctx.translate(sx, sy);
    const R = 2.2 * k * pulse;
    const grad = ctx.createRadialGradient(0, 0, 0.25 * k, 0, 0, R);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.28, 'rgba(0,0,0,1)');
    grad.addColorStop(0.4, 'rgba(156,39,176,0.85)');
    grad.addColorStop(0.7, 'rgba(0,229,255,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    // Аккреционный диск.
    ctx.rotate(this.rot);
    ctx.strokeStyle = 'rgba(0,229,255,0.75)';
    ctx.lineWidth = Math.max(1, 0.05 * k);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, R * (0.55 + i * 0.12), R * (0.18 + i * 0.04), 0, i, i + 4.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Облако ядовитого газа: душит живых, кто внутри.
class GasCloud extends Entity {
  constructor(sim, x, y) {
    super(sim);
    this.name = 'Токсичный газ';
    this.x = x; this.y = Math.min(y, -1);
    this.life = 8.5;
    this.noShadow = true;
    const b = this.makeBody(x, y, 0);
    b.setStatic();
  }

  update(dt) {
    this.life -= dt;
    const sim = this.sim;
    const x = this.x, y = this.y;
    if (this.life > 1 && Math.random() < dt * 22) {
      sim.effects.smokePuff(x + rand(-2.4, 2.4), y + rand(-1.2, 1), rand(0.6, 1.3), Math.random() < 0.6 ? '#8bc34a' : '#c0ca33', 0.4);
    }
    for (const e of sim.entities) {
      if (!e.isRagdoll || !e.alive || e.type.robot || e.type.skeleton || e.type.cyborg || e.type.immortal) continue;
      if (e.parts.head.gone) continue;
      const hp = e.parts.head.body.getPosition();
      if (Math.abs(hp.x - x) < 3.8 && Math.abs(hp.y - y) < 2.6) {
        e.damage(e.parts.chest, dt * 16, 'poison');
        e.poison = Math.max(e.poison, 2.5);
        e.stun = Math.max(e.stun, 0.4);
        if (Math.random() < dt * 1.5) sfx.groan(hp);
      }
    }
    if (this.life <= 0) sim.remove(this);
  }
}

export class Explosive extends Entity {
  constructor(sim, x, y, id, f = 1) {
    super(sim);
    this.isExplosive = true;
    this.expId = id;
    this.def = EXPLOSIVES[id];
    this.name = this.def.name;
    this.timer = null;
    this.fuseSet = this.def.fuse || (id === 'barrel' ? 3 : 5); // время таймера, меняется в меню
    this.armed = false;
    this.disarmed = false;
    this.detonating = false;
    this.hp = this.def.hp ?? Infinity;
    this.spawnT = sim.time;
    this.stuck = null;
    this.beepT = 0;
    this.pickPriority = 0.25;
    if (id === 'c4') this.isC4 = true;
    this.f = f;
    const b = this.makeBody(x, y, 0, { angularDamping: 0.1 });
    this.build(b, f);
  }

  build(b, f) {
    const id = this.expId, d = this.def;
    const add = (pts, color, o = {}) => {
      pts = mirrorPts(pts, f, 1);
      if (!o.vis) this.fix(b, polyShape(pts), { density: d.mass / (o.areaTotal || polyArea(pts)), friction: o.friction ?? 0.6, mat: o.mat || 'metal', restitution: o.restitution ?? 0.1 });
      const v = visPoly(b, pts, { z: 0, t: o.t ?? 0.1, color, ...o.v });
      return this.vis(v);
    };
    if (id === 'blackHole') {
      const v = visCircle(b, 0.16, { z: 0, t: 0.16, color: '#120024' });
      this.vis(v);
      this.fix(b, circleShape(0.16), { density: 50, friction: 0.5, mat: 'metal' });
      v.detail = (ctx) => {
        ctx.strokeStyle = '#9c27b0'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(0, 0, 0.19, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath(); ctx.arc(0, 0, 0.05, 0, TAU); ctx.fill();
      };
      return;
    }
    if (id === 'gasGrenade') {
      add(R(-0.08, -0.16, 0.08, 0.16), '#546e7a', { t: 0.16 });
      add(R(-0.082, -0.05, 0.082, 0.05), '#76ff03', { t: 0.17, vis: true });
      add([[-0.03, -0.22], [0.03, -0.22], [0.04, -0.16], [-0.04, -0.16]], '#37474f', { t: 0.08 });
      return;
    }
    if (id === 'clusterBomb') {
      add(R(-0.55, -0.2, 0.45, 0.2), '#37474f', { t: 0.4 });
      add([[0.45, -0.2], [0.72, 0], [0.45, 0.2]], '#263238', { t: 0.35 });
      add([[-0.72, -0.32], [-0.55, -0.15], [-0.55, 0.15], [-0.72, 0.32]], '#ffb300', { t: 0.05 });
      return;
    }
    if (id === 'grenade') {
      this.fix(b, circleShape(0.065), { density: d.mass / (Math.PI * 0.065 * 0.065), friction: 0.6, mat: 'metal', restitution: 0.3 });
      const v = this.vis(visCircle(b, 0.065, { z: 0, t: 0.13, color: '#4b5a32', sphere: true }));
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(20,30,10,0.6)'; ctx.lineWidth = 0.008;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-0.065, i * 0.025); ctx.lineTo(0.065, i * 0.025); ctx.stroke(); }
        ctx.fillStyle = '#8e959e';
        ctx.fillRect(-0.025, -0.095, 0.05, 0.035);
        if (this.timer === null) {
          ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 0.008;
          ctx.beginPath(); ctx.arc(0.04, -0.085, 0.018, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = '#7d848b';
        ctx.fillRect(0.02, -0.095, 0.012, 0.09);
      };
    } else if (id === 'molotov') {
      const body = R(-0.05, -0.08, 0.05, 0.13);
      const neck = R(-0.022, -0.17, 0.022, -0.08);
      const total = polyArea(body) + polyArea(neck);
      const v = add(body, '#3f7a3a', { t: 0.1, mat: 'glass', areaTotal: total, v: { alpha: 0.85 } });
      add(neck, '#3f7a3a', { t: 0.045, mat: 'glass', areaTotal: total, v: { alpha: 0.85 } });
      v.detail = (ctx) => {
        ctx.fillStyle = '#c9822b';
        ctx.fillRect(-0.045, -0.02, 0.09, 0.145);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-0.035, -0.07, 0.015, 0.18);
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(-0.016, -0.22, 0.032, 0.06);
      };
    } else if (id === 'dynamite') {
      const v = add(R(-0.16, -0.06, 0.16, 0.06), '#c0392b', { t: 0.12 });
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(60,10,10,0.6)'; ctx.lineWidth = 0.006;
        for (const y of [-0.02, 0.02]) { ctx.beginPath(); ctx.moveTo(-0.16, y); ctx.lineTo(0.16, y); ctx.stroke(); }
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(-0.05, -0.06, 0.03, 0.12);
        ctx.fillRect(0.05, -0.06, 0.03, 0.12);
        tinyText(ctx, 'TNT', -0.035, 0.013, 0.036, '#f2e6c8');
        ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 0.008;
        ctx.beginPath(); ctx.moveTo(0.16 * f, 0); ctx.quadraticCurveTo(0.22 * f, -0.03, 0.24 * f, -0.08); ctx.stroke();
      };
    } else if (id === 'mine') {
      const pts = [[-0.2, 0.0], [-0.15, -0.06], [0.15, -0.06], [0.2, 0.0]];
      const v = add(pts, '#3d4436', { t: 0.4, friction: 1 });
      add(R(-0.22, 0, 0.22, 0.03), '#2e3329');
      v.detail = (ctx) => {
        const on = this.armed && Math.floor(this.sim.time * 3) % 2 === 0;
        ctx.fillStyle = this.armed ? (on ? '#ff3b30' : '#661510') : '#3fbf4a';
        ctx.beginPath(); ctx.arc(0, -0.065, 0.014, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a6150';
        ctx.fillRect(-0.05, -0.08, 0.1, 0.02);
      };
    } else if (id === 'c4') {
      const v = add(R(-0.15, -0.055, 0.15, 0.055), '#d8cfae', { t: 0.08, friction: 1.2 });
      v.detail = (ctx) => {
        ctx.fillStyle = '#c6bd99';
        ctx.fillRect(-0.15, -0.012, 0.3, 0.024);
        ctx.fillStyle = '#1f2326';
        roundRectPath(ctx, -0.06, -0.045, 0.06, 0.0, 0.008); ctx.fill();
        tinyText(ctx, this.stuck ? 'ARM' : 'C-4', -0.042, -0.012, 0.03, this.stuck ? '#ff3b30' : '#55e06b', 'monospace');
        ctx.strokeStyle = '#e53935'; ctx.lineWidth = 0.007;
        ctx.beginPath(); ctx.moveTo(-0.06, -0.03); ctx.bezierCurveTo(-0.12, -0.08, -0.13, 0.03, -0.1, 0.04); ctx.stroke();
        ctx.strokeStyle = '#1e88e5';
        ctx.beginPath(); ctx.moveTo(0.06, -0.03); ctx.bezierCurveTo(0.12, -0.08, 0.13, 0.03, 0.1, 0.04); ctx.stroke();
      };
    } else if (id === 'barrel') {
      const v = this.vis(visRRect(b, -0.31, -0.46, 0.31, 0.46, 0.06, { z: 0, t: 0.62, color: '#c62828' }));
      this.fix(b, polyShape(R(-0.31, -0.46, 0.31, 0.46)), { density: d.mass / (0.62 * 0.92), friction: 0.6, mat: 'metal' });
      v.detail = (ctx) => {
        ctx.strokeStyle = 'rgba(60,0,0,0.5)'; ctx.lineWidth = 0.035;
        for (const y of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(-0.31, y); ctx.lineTo(0.31, y); ctx.stroke(); }
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(0, -0.17); ctx.lineTo(0.15, 0.1); ctx.lineTo(-0.15, 0.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(0, -0.07); ctx.quadraticCurveTo(0.07, 0.0, 0.035, 0.07); ctx.quadraticCurveTo(0, 0.04, -0.035, 0.07); ctx.quadraticCurveTo(-0.07, 0.0, 0, -0.07);
        ctx.fill();
        if (this.hp < this.def.hp) {
          ctx.fillStyle = '#1a0b0b';
          ctx.beginPath(); ctx.arc(-0.15, -0.15, 0.025, 0, TAU); ctx.fill();
        }
      };
    } else if (id === 'bomb') {
      const body = [[-0.55, -0.2], [0.25, -0.23], [0.6, -0.1], [0.68, 0], [0.6, 0.1], [0.25, 0.23], [-0.55, 0.2]];
      const fins = [[-0.95, -0.3], [-0.55, -0.12], [-0.55, 0.12], [-0.95, 0.3]];
      const total = polyArea(body) + polyArea(fins);
      const v = add(body, '#4f5b3a', { t: 0.46, areaTotal: total });
      add(fins, '#3f4a2e', { t: 0.5, areaTotal: total });
      v.detail = (ctx) => {
        ctx.save(); ctx.scale(f, 1);
        ctx.fillStyle = '#e8c547';
        ctx.fillRect(0.38, -0.2, 0.06, 0.4);
        ctx.fillRect(-0.4, -0.2, 0.05, 0.4);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(-0.5, -0.17, 1.0, 0.05);
        if (this.armed) {
          ctx.fillStyle = Math.floor(this.sim.time * 4) % 2 ? '#ff3b30' : '#7a1010';
          ctx.beginPath(); ctx.arc(0.1, -0.12, 0.03, 0, TAU); ctx.fill();
        }
        ctx.restore();
      };
    } else if (id === 'nuke') {
      const body = [[-1.3, -0.55], [0.7, -0.62], [1.35, -0.3], [1.5, 0], [1.35, 0.3], [0.7, 0.62], [-1.3, 0.55]];
      const fins = [[-2.0, -0.75], [-1.3, -0.35], [-1.3, 0.35], [-2.0, 0.75]];
      const total = polyArea(body) + polyArea(fins);
      const v = add(body, '#e0b52b', { t: 1.2, areaTotal: total });
      add(fins, '#2d2f33', { t: 1.3, areaTotal: total });
      v.detail = (ctx) => {
        ctx.save(); ctx.scale(f, 1);
        ctx.fillStyle = '#1f1f22';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          const x = -1.25 + i * 0.32;
          ctx.moveTo(x, 0.45); ctx.lineTo(x + 0.16, 0.45); ctx.lineTo(x + 0.28, 0.6); ctx.lineTo(x + 0.12, 0.6); ctx.fill();
        }
        // Знак радиации.
        ctx.fillStyle = '#1f1f22';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.36, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e0b52b';
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * TAU) / 3;
          ctx.beginPath(); ctx.moveTo(0, -0.05);
          ctx.arc(0, -0.05, 0.3, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#1f1f22';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e0b52b';
        ctx.beginPath(); ctx.arc(0, -0.05, 0.05, 0, TAU); ctx.fill();
        if (this.timer !== null) {
          ctx.fillStyle = Math.floor(this.sim.time * 6) % 2 ? '#ff2a1a' : '#5a0a05';
          ctx.beginPath(); ctx.arc(0.95, -0.3, 0.07, 0, TAU); ctx.fill();
        }
        ctx.restore();
      };
    }
  }

  // Короткое нажатие. Возвращает подсказку — что произошло.
  activate() {
    const id = this.expId;
    if (id === 'c4') {
      for (const e of this.sim.entities) if (e.isC4 && !e.removed) e.detonate(rand(0, 0.12));
      return true;
    }
    if (id === 'bomb') {
      this.armed = !this.armed;
      sfx.click(this.main.getPosition());
      this.info = this.armed ? 'Авиабомба взведена: взорвётся от удара. Подними и брось!' : 'Авиабомба разряжена';
      return true;
    }
    if (id === 'mine') { this.setArmed(true); this.info = 'Мина взведена: взорвётся, если на неё наступить'; return true; }
    if (id === 'barrel' || id === 'molotov') { this.detonate(0); return true; }
    if (this.timer === null) this.startTimer();
    return true;
  }

  get hint() { return this.info; }

  startTimer(t = this.fuseSet) {
    if (this.detonating) return;
    this.timer = t;
    this.beepT = 0;
    sfx.click(this.main.getPosition());
    if (this.expId === 'grenade') {
      const p = this.main.getPosition();
      this.sim.effects.chunks(p.x, p.y - 0.08, 1, ['#7d848b'], 0.03, 3);
    }
    this.info = `${this.name}: взрыв через ${t} с`;
  }

  setArmed(v) {
    this.armed = v;
    this.disarmed = !v;
    sfx.click(this.main.getPosition());
  }

  // Меню объекта (долгое нажатие): таймер, взвод, взрыв сейчас.
  menu() {
    const id = this.expId;
    if (id === 'molotov') return [];
    const items = [];
    if (this.timer === null) items.push({ label: `Запустить таймер: ${this.fuseSet} с`, icon: '⏱️', fn: () => this.startTimer() });
    else items.push({ label: 'Остановить таймер', icon: '⏹️', fn: () => { this.timer = null; sfx.click(this.main.getPosition()); } });
    items.push({ seg: true, label: 'Время', options: [1, 3, 5, 10, 30], value: this.fuseSet, fmt: (v) => v + ' с', fn: (v) => { this.fuseSet = v; } });
    if (id === 'bomb') items.push({ label: this.armed ? 'Разрядить (не взрываться от удара)' : 'Взвести: взрыв от удара', icon: '🎯', fn: () => { this.armed = !this.armed; sfx.click(this.main.getPosition()); } });
    if (id === 'mine') items.push({ label: this.armed ? 'Разрядить' : 'Взвести', icon: '🎯', fn: () => this.setArmed(!this.armed) });
    items.push({ label: id === 'c4' ? 'Взорвать все C4 (детонатор)' : 'Взорвать сейчас', icon: '💥', fn: () => (id === 'c4' ? this.activate() : this.detonate(0)) });
    return items;
  }

  update(dt) {
    const id = this.expId;
    const b = this.main;
    if (!b) return;
    if (id === 'mine' && !this.armed && !this.disarmed && this.sim.time - this.spawnT > 1.5) this.armed = true;
    if (id === 'molotov' && Math.random() < dt * 14) {
      const w = b.getWorldPoint(V(0, -0.23));
      this.sim.effects.flame(w.x, w.y, 0.06);
    }
    if (this.timer !== null && !this.detonating) {
      this.timer -= dt;
      this.beepT -= dt;
      const p = b.getPosition();
      if (this.beepT <= 0) {
        this.beepT = this.timer < 1.5 ? 0.18 : 0.5;
        if (id === 'nuke' || id === 'grenade') sfx.beep(this.timer < 1.5, p);
      }
      if (id === 'dynamite') {
        const fp = b.getWorldPoint(V(0.24 * this.facingSign(), -0.08));
        this.sim.effects.sparks(fp.x, fp.y, 1, 0.3);
      }
      if (this.timer <= 0) this.detonate(0);
    }
  }

  facingSign() { return this.f; }

  onBegin(c, myFix, otherFix) {
    if (otherFix.isSensor()) return;
    const id = this.expId;
    const ob = otherFix.getBody();
    if (id === 'mine' && this.armed && !this.detonating) {
      const oud = ob.getUserData();
      if (ob.isDynamic() && ob.getMass() > 2 && !(oud && oud.ground)) this.detonate(0.05);
    }
    if (id === 'c4' && !this.stuck && this.sim.dragEnt !== this) {
      const wm = c.getWorldManifold(null);
      if (!wm || !wm.points[0]) return;
      const pt = V(wm.points[0].x, wm.points[0].y);
      this.sim.defer(() => {
        if (this.stuck || this.removed) return;
        const j = this.sim.world.createJoint(new pl.WeldJoint({}, this.main, ob, pt));
        this.stuck = this.sim.addLink(j, { type: 'stick', breakForce: 4000, onBreak: () => { this.stuck = null; } });
        sfx.click(pt);
      });
    }
  }

  onImpulse(myFix, otherFix, imp) {
    const dv = imp / this.main.getMass();
    if (this.expId === 'bomb' && this.armed && dv > 3) this.detonate(0);
    if (this.expId === 'barrel' && dv > 16) this.detonate(0.05);
    if (this.expId === 'molotov' && dv > 3.5 && this.sim.time - this.spawnT > 0.3) this.detonate(0);
    if (this.expId === 'grenade' && dv > 1.5 && !this.sim.silent) sfx.impact('metal', 0.3, this.main.getPosition());
  }

  onBullet(body, fix, point, dir, dmg, normal) {
    super.onBullet(body, fix, point, dir, 0, normal);
    if (this.expId === 'barrel') {
      this.hp -= dmg;
      if (this.hp <= 0) this.detonate(0.1);
    } else if (this.expId === 'bomb' && dmg > 40) this.detonate(0);
    else if (this.expId === 'molotov') this.detonate(0);
    else if (this.expId === 'dynamite' || this.expId === 'grenade') {
      if (dmg > 30) this.detonate(0);
    }
  }

  flammability() {
    return { barrel: 1, dynamite: 1, molotov: 1, c4: 0.5, grenade: 0.3, bomb: 0.3, mine: 0.3 }[this.expId] || 0;
  }

  onBurn(body, dt) {
    this.burnT = (this.burnT || 0) + dt;
    const id = this.expId;
    if (id === 'dynamite' && this.timer === null) this.timer = 1.5;
    else if (id === 'molotov') this.detonate(0);
    else if (this.burnT > (id === 'barrel' ? 2.5 : 3.5)) this.detonate(0);
  }

  onBlast(body, dmg) {
    if (this.def.nuke) return;
    if (dmg > (this.def.chain ?? 10)) this.detonate(rand(0.04, 0.16));
  }

  detonate(delay = 0) {
    if (this.detonating || this.removed) return;
    this.detonating = true;
    this.sim.after(delay, () => {
      if (this.removed) return;
      const b = this.main;
      const p = b.getWorldCenter();
      const x = p.x, y = p.y;
      const d = this.def;
      this.sim.remove(this);
      if (d.fire) { this.splashFire(x, y); return; }
      if (d.blackHole) { this.sim.add(new BlackHoleVortex(this.sim, x, y)); return; }
      if (d.gas) { this.sim.add(new GasCloud(this.sim, x, y)); sfx.flame({ x, y }); return; }
      if (d.cluster) {
        this.sim.explode(x, y, d.P, d.R);
        for (let i = 0; i < 7; i++) {
          const a = rand(Math.PI * 1.1, Math.PI * 1.9);
          const spd = rand(6, 14);
          const sub = new Explosive(this.sim, x + Math.cos(a) * 0.35, y - 0.25 + Math.sin(a) * 0.25, 'grenade');
          this.sim.add(sub);
          sub.timer = rand(0.8, 1.8);
          sub.main.setLinearVelocity(V(Math.cos(a) * spd, Math.sin(a) * spd));
        }
        return;
      }
      this.sim.explode(x, y, d.P, d.R, { nuke: d.nuke });
      if (d.shrapnel) {
        for (let i = 0; i < d.shrapnel; i++) {
          const a = rand(0, TAU);
          this.sim.hitscan(x, y, Math.cos(a), Math.sin(a), { damage: 22, impulse: 4, range: 14, tracer: 'rgba(255,220,160,0.6)', tracerW: 0.6 });
        }
      }
    });
  }

  // Молотов: разбитая бутылка, горящее топливо разливается.
  splashFire(x, y) {
    const sim = this.sim;
    const fx = sim.effects;
    fx.glassShards(x, y, 16, 3);
    sfx.glassBreak({ x, y });
    sfx.fireWhoosh({ x, y });
    for (let i = 0; i < fx.n(22); i++) {
      const a = rand(Math.PI, TAU);
      const s = rand(1, 5);
      fx.add({ type: 'fire', x, y, z: rand(-0.6, 0.6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), size: rand(0.15, 0.32), grow: 0.25, g: 0.6, drag: 1 });
    }
    fx.light(x, y, 6, 0.5, '#ff9a40');
    if (y > -2.5) sim.addGroundFire(x, 2.3, 9);
    const R2 = 2.2;
    sim.world.queryAABB(new pl.AABB(V(x - R2, y - R2), V(x + R2, y + R2)), (fix) => {
      sim.ignite(fix.getBody(), 8);
      return true;
    });
  }

  drawOverlay(r) {
    if (this.timer === null || this.detonating || !this.main) return;
    const p = this.main.getPosition();
    const big = this.expId === 'nuke';
    const [sx, sy] = r.P(p.x, p.y - (big ? 1.2 : 0.35), -0.3);
    const ctx = r.ctx;
    r.screen();
    ctx.font = `800 ${big ? 26 : 15}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const txt = Math.max(0, this.timer).toFixed(1);
    ctx.strokeText(txt, sx, sy);
    ctx.fillStyle = this.timer < 1.5 ? '#ff4a3a' : '#ffffff';
    ctx.fillText(txt, sx, sy);
  }
}
