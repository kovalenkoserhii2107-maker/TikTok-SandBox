// Точка входа: игровой цикл, камера, инструменты, спавн.
import { Sim, pl, V } from './sim.js';
import { Renderer } from './render.js';
import { WORLDS, worldById } from './worlds.js';
import { UI } from './ui.js';
import { initPWA } from './pwa.js';
import { initAudio, setTimeRate, setListener, setSoundEnabled, engineStart, engineStop, engineSet, sfx } from './audio.js';
import { findItem } from './catalog.js';
import { clamp, wrapAngle, rand, TAU } from './util.js';
import { Ragdoll } from './entities/ragdoll.js';
import { Firearm } from './entities/weapons.js';
import { Prop } from './entities/props.js';
import { Explosive } from './entities/explosives.js';
import { Vehicle } from './entities/vehicles.js';

const SETTINGS_KEY = 'kaboom.settings.v1';

function drawRope(r, l) {
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

function drawWeld(r, l) {
  const a = l.joint.getAnchorA();
  const ctx = r.ctx;
  r.face(-0.4);
  ctx.fillStyle = '#ffb02e';
  ctx.strokeStyle = '#5a3a10';
  ctx.lineWidth = 0.015;
  ctx.beginPath(); ctx.arc(a.x, a.y, 0.05, 0, TAU); ctx.fill(); ctx.stroke();
  r.screen();
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.r = new Renderer(this.canvas);
    this.settings = { sound: true, blood: true, quality: true, follow: true, world: 'city' };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* нет хранилища */ }
    this.worldDef = worldById(this.settings.world);
    this.sim = this.makeSim();
    this.tool = 'drag';
    this.placeItem = null;
    this.placeFlip = 1;
    this.timeScale = 1;
    this.slowValue = 0.25;
    this.paused = false;
    this.controlled = null;
    this.drag = null;
    this.pending = null;
    this.mouse = null;
    setSoundEnabled(this.settings.sound);
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
    this.resetCamera();
    this.ui = new UI(this);
    this.demoScene();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  makeSim() {
    const sim = new Sim(this.worldDef);
    sim.effects.blood = this.settings.blood;
    sim.onBodyDestroyed = (b) => {
      if (this.drag && this.drag.body === b) {
        this.sim.dragEnt = null;
        this.drag = null;
      }
      if (this.pending && this.pending.body === b) this.pending = null;
    };
    return sim;
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* нет хранилища */ }
  }

  applyQuality() {
    this.r.maxDpr = this.settings.quality ? 2 : 1.25;
    if (this.sim) this.sim.effects.quality = this.settings.quality ? 1 : 0.5;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h > w;
    this.r.vpFrac = portrait ? 0.45 : 0.42;
    this.r.resize(w, h);
    if (this.wasPortrait !== undefined && this.wasPortrait !== portrait) this.resetCamera();
    this.wasPortrait = portrait;
  }

  resetCamera() {
    const r = this.r;
    const portrait = r.H > r.W;
    r.cam.s = portrait ? clamp(r.W / 12, 14, 60) : clamp(Math.min(r.W / 22, r.H / 11), 14, 70);
    r.cam.x = 0;
    const groundY = portrait ? r.H - 200 : r.H * 0.8;
    r.cam.y = -(groundY - r.vp.y) / r.cam.s;
  }

  // Смена мира сохраняет объекты сцены — меняется фон и гравитация.
  setWorld(id) {
    this.worldDef = worldById(id);
    this.sim.def = this.worldDef;
    this.sim.world.setGravity(V(0, this.worldDef.gravity));
    for (let b = this.sim.world.getBodyList(); b; b = b.getNext()) b.setAwake(true);
    this.settings.world = id;
    this.saveSettings();
  }

  clearScene() {
    this.control(null);
    if (this.drag) this.endDrag();
    this.pending = null;
    this.sim.clear();
  }

  setSlow(v) {
    this.timeScale = v;
    setTimeRate(v);
  }

  zoomAt(sx, sy, factor) {
    const r = this.r;
    const before = r.toWorld(sx, sy);
    r.cam.s = clamp(r.cam.s * factor, 6, 180);
    const after = r.toWorld(sx, sy);
    r.cam.x += before.x - after.x;
    r.cam.y += before.y - after.y;
    this.clampCam();
  }

  pan(dx, dy) {
    const r = this.r;
    r.cam.x -= dx / r.cam.s;
    r.cam.y -= dy / r.cam.s;
    this.clampCam();
  }

  clampCam() {
    const c = this.r.cam;
    c.x = clamp(c.x, -80, 80);
    const maxY = -(this.r.H * 0.55 - this.r.vp.y) / c.s;
    c.y = clamp(c.y, -150, Math.max(maxY, -1));
  }

  // ---------- Действия ----------
  spawn(item, x, y) {
    const sim = this.sim;
    const e = item.make(sim, x, Math.min(y, -0.05), this.placeFlip);
    sim.add(e);
    const a = e.aabb();
    if (a.uy > -0.005) e.translate(0, -a.uy - 0.01);
    sim.effects.dust(x, Math.min(y, -0.1), 3, 'rgba(255,255,255,0.6)', 0.2);
    sfx.ui();
    if (e.isC4) this.ui.toast('C4 прилипает к поверхностям. Взрыв — кнопкой «Детонатор»', 2600);
    else if (e.isRagdoll && e.typeId === 'soldier') this.ui.toast('Перетащи оружие к руке солдата — он будет стрелять по зомби', 2800);
    else if (e.isWeapon) this.ui.toast('Нажми на оружие — выстрел. Отпусти рядом с рукой — персонаж возьмёт его', 2800);
    else if (e.isVehicle) this.ui.toast('Нажми на технику, чтобы сесть за руль', 2200);
    return e;
  }

  tap(w) {
    const sim = this.sim;
    if (this.placeItem) { this.spawn(this.placeItem, w.x, w.y); return; }
    const rad = Math.max(0.12, 16 / this.r.cam.s);
    const body = sim.bodyAt(w.x, w.y, rad);
    const ent = body && sim.entAt(body);
    switch (this.tool) {
      case 'drag': {
        if (!ent) return;
        const res = ent.activate(body);
        if (res === 'drive') this.control(this.controlled === ent ? null : ent);
        break;
      }
      case 'freeze':
        if (!body) return;
        if (body.isStatic()) { body.setDynamic(); body.setAwake(true); } else body.setStatic();
        sfx.click(w);
        break;
      case 'delete':
        if (!ent) return;
        if (this.controlled === ent) this.control(null);
        sim.effects.dust(w.x, w.y, 6, 'rgba(255,255,255,0.7)', 0.3);
        sim.remove(ent);
        sfx.ui();
        break;
      case 'heal':
        if (ent && ent.isRagdoll) {
          ent.heal();
          const p = ent.parts.chest.body.getPosition();
          sim.effects.light(p.x, p.y, 2.5, 0.5, '#7dffb0');
          for (let i = 0; i < 12; i++) sim.effects.add({ type: 'spark', x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.6, 0.6), vx: rand(-0.5, 0.5), vy: rand(-3, -1), life: 0.7, size: 0.02, color: '#8dffb5', g: 0 });
          this.ui.toast(`${ent.name}: здоров`);
        }
        break;
      case 'rope':
      case 'weld':
        this.connect(w, body);
        break;
    }
  }

  connect(w, body) {
    const sim = this.sim;
    if (this.tool === 'weld' && !body) { this.ui.toast('Нажми на объект'); return; }
    const target = body || sim.ground;
    if (!this.pending) {
      this.pending = { body: target, local: target.getLocalPoint(V(w.x, w.y)) };
      this.ui.toast('Теперь вторая точка');
      return;
    }
    const a = this.pending;
    this.pending = null;
    if (a.body === target) return;
    const pa = a.body.getWorldPoint(a.local), pb = V(w.x, w.y);
    if (this.tool === 'rope') {
      const len = Math.max(0.15, Math.hypot(pa.x - pb.x, pa.y - pb.y));
      const j = sim.world.createJoint(new pl.RopeJoint({
        bodyA: a.body, bodyB: target, localAnchorA: a.local, localAnchorB: target.getLocalPoint(pb), maxLength: len, collideConnected: true,
      }));
      sim.addLink(j, { type: 'rope', maxLength: len, breakForce: 90000, draw: drawRope });
    } else {
      const j = sim.world.createJoint(new pl.WeldJoint({}, a.body, target, V((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)));
      sim.addLink(j, { type: 'weld', breakForce: 120000, draw: drawWeld });
    }
    a.body.setAwake(true);
    target.setAwake(true);
    sfx.click(w);
  }

  startDrag(body, w) {
    const sim = this.sim;
    const ent = sim.entAt(body);
    if (!ent) return;
    const m = Math.max(1, ent.mass());
    const g = Math.max(4, this.worldDef.gravity);
    const joint = sim.world.createJoint(new pl.MouseJoint({ maxForce: m * g * 14 + 300, frequencyHz: 5, dampingRatio: 0.9 }, sim.ground, body, V(w.x, w.y)));
    body.setAwake(true);
    this.drag = { joint, body, ent, rot: null, damp: body.getAngularDamping() };
    body.setAngularDamping(Math.max(3, this.drag.damp));
    sim.dragEnt = ent;
  }

  dragTo(w) {
    if (!this.drag) return;
    this.drag.joint.setTarget(V(w.x, w.y));
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.sim.dragEnt = null;
    try { this.sim.world.destroyJoint(d.joint); } catch (e) { /* уже удалён */ }
    d.body.setAngularDamping(d.damp);
    const e = d.ent;
    if (e.isWeapon && !e.holder && !e.removed) {
      // Если отпустили оружие рядом с рукой — персонаж его берёт.
      const g = e.main.getWorldPoint(V(...e.gripLocal()));
      let best = null, bd = Infinity;
      for (const r of this.sim.entities) {
        if (!r.isRagdoll || r.removed || !r.canHold()) continue;
        const h = r.handPoint();
        const dist = Math.hypot(h.x - g.x, h.y - g.y);
        if (dist < 0.55 * r.k && dist < bd) { bd = dist; best = r; }
      }
      if (best && best.grab(e)) this.ui.toast(`${best.name} взял: ${e.name}`);
    }
  }

  control(v) {
    if (this.controlled) {
      this.controlled.ctrl = { x: 0, aim: 0, fire: false, mg: false };
      engineStop();
    }
    this.controlled = v;
    this.ui.showDrive(v);
    if (v) {
      initAudio();
      engineStart(v.kind);
      this.ui.toast(v.kind === 'tank' ? 'Езда ◀ ▶, ствол ▲ ▼, огонь — «Пушка»' : 'Езда — кнопки ◀ ▶', 2400);
    }
  }

  demoScene() {
    const sim = this.sim;
    const add = (e) => { sim.add(e); const a = e.aabb(); if (a.uy > 0) e.translate(0, -a.uy - 0.01); return e; };
    add(new Prop(sim, -6, -0.5, 'crate'));
    add(new Prop(sim, -6, -1.5, 'crate'));
    add(new Prop(sim, -4.9, -0.5, 'crate'));
    add(new Explosive(sim, -3.6, -0.5, 'barrel'));
    add(new Ragdoll(sim, -1.5, -1, 'human', 1));
    const s = add(new Ragdoll(sim, 1.8, -1, 'soldier', -1));
    const ak = add(new Firearm(sim, 1.2, -1.3, 'ak', -1));
    sim.defer(() => s.grab(ak));
    add(new Prop(sim, 4.5, -0.3, 'melon'));
    add(new Vehicle(sim, 9.5, -0.6, 'truck', -1));
  }

  // ---------- Цикл ----------
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    const sim = this.sim;
    const r = this.r;
    if (this.drag && this.drag.rot != null && !this.drag.body.isStatic()) {
      const b = this.drag.body;
      b.setAngularVelocity(clamp(wrapAngle(this.drag.rot - b.getAngle()) * 14, -25, 25));
    }
    if (!this.paused) {
      try { sim.step(dt * this.timeScale); } catch (e) { console.error(e); }
    }
    if (this.controlled && this.controlled.removed) this.control(null);
    if (this.controlled) {
      engineSet(this.controlled.ctrl.x);
      if (this.settings.follow) {
        const p = this.controlled.chassis.getPosition();
        r.cam.x += (p.x - r.cam.x) * Math.min(1, dt * 3);
        const ty = Math.min(p.y - 2.5, r.cam.y);
        r.cam.y += (ty - r.cam.y) * Math.min(1, dt * 2);
        this.clampCam();
      }
    }
    sim.flashAmt = Math.max(0, sim.flashAmt - dt * 0.6);
    const sh = sim.shakeAmt;
    if (sh > 0.05) {
      r.shakeX = (Math.random() - 0.5) * sh * 0.04;
      r.shakeY = (Math.random() - 0.5) * sh * 0.04;
      sim.shakeAmt *= Math.exp(-dt * 5);
    } else { r.shakeX = r.shakeY = 0; sim.shakeAmt = 0; }
    setListener(r.cam.x, r.cam.y, r.cam.s);
    r.drawScene(sim, this.worldDef, { overlay: (rr) => this.overlay(rr) });
    this.ui.tick(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  overlay(r) {
    const ctx = r.ctx;
    if (this.pending) {
      const a = this.pending.body.getWorldPoint(this.pending.local);
      const [ax, ay] = r.P(a.x, a.y, 0);
      r.screen();
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath(); ctx.arc(ax, ay, 6, 0, TAU); ctx.fill();
      if (this.mouse) {
        ctx.strokeStyle = 'rgba(255,176,46,0.8)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(this.mouse.x, this.mouse.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

// ---------- Запуск ----------
function boot() {
  const game = new Game();
  window.game = game;
  initPWA();
  const start = document.getElementById('start');
  const list = document.getElementById('startWorlds');
  for (const w of WORLDS) {
    const b = document.createElement('button');
    b.className = 'world' + (w.id === game.worldDef.id ? ' on' : '');
    b.dataset.world = w.id;
    b.innerHTML = `<i style="background:linear-gradient(180deg,${w.thumb[0]} 0%,${w.thumb[1]} 58%,${w.thumb[2]} 58%)"></i><b>${w.name}</b><small>${w.desc}</small>`;
    b.onclick = () => {
      game.setWorld(w.id);
      game.ui.markWorld();
      for (const o of list.children) o.classList.toggle('on', o === b);
    };
    list.appendChild(b);
  }
  document.getElementById('btnPlay').onclick = () => {
    initAudio();
    sfx.ui();
    start.classList.add('hidden');
  };
  void findItem;
}

boot();
