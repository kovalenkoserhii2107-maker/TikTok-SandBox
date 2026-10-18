// Точка входа: игровой цикл, камера, инструменты, спавн.
import { Sim, pl, V } from './sim.js';
import { Renderer, QUALITY, QUALITY_ORDER } from './render.js';
import { WORLDS, worldById } from './worlds.js';
import { UI } from './ui.js';
import { initPWA } from './pwa.js';
import { initAudio, setTimeRate, setListener, setSoundEnabled, engineStart, engineStop, engineSet, sfx } from './audio.js';
import { findItem } from './catalog.js';
import { saveSlot, loadSlot } from './scene.js';
import { makeLink, addWire } from './links.js';
import { clamp, wrapAngle, rand, TAU } from './util.js';

const SETTINGS_KEY = 'kaboom.settings.v1';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.r = new Renderer(this.canvas);
    this.settings = { sound: true, blood: true, gfx: 'auto', fps: false, follow: true, world: 'city' };
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
    this.history = [];
    this.linkMode = 'rope';
    // Стартовый уровень для «Авто» — по мощности устройства.
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    this.autoLevel = weak ? 'medium' : 'high';
    this.perf = { acc: 0, n: 0, t: 0, good: 0, fps: 60 };
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

  get gfxLevel() { return this.settings.gfx === 'auto' ? this.autoLevel : this.settings.gfx; }

  applyQuality() {
    this.r.setQuality(this.gfxLevel);
    if (this.sim) this.sim.effects.quality = this.r.q.particles;
    this.resize();
  }

  // Замер FPS и автоподстройка качества.
  trackPerf(dt) {
    const p = this.perf;
    p.acc += dt; p.n++; p.t += dt;
    if (p.t < 2.5) return;
    const avg = p.acc / p.n;
    p.fps = Math.round(1 / Math.max(avg, 0.001));
    p.acc = 0; p.n = 0; p.t = 0;
    if (this.settings.fps) this.ui.showFps(p.fps, this.r.q.name);
    if (this.settings.gfx !== 'auto' || document.hidden) return;
    const i = QUALITY_ORDER.indexOf(this.autoLevel);
    if (avg > 1 / 38 && i > 0) {
      this.autoLevel = QUALITY_ORDER[i - 1];
      p.good = 0;
      this.applyQuality();
      this.ui.toast(`Графика: ${QUALITY[this.autoLevel].name} (авто)`);
    } else if (avg < 1 / 57) {
      if (++p.good >= 4 && i < 2) {
        p.good = 0;
        this.autoLevel = QUALITY_ORDER[i + 1];
        this.applyQuality();
      }
    } else p.good = 0;
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
  // Создать объект из каталога (общая точка для спавна, копирования, загрузки).
  place(item, x, y, f = 1, o = {}) {
    const sim = this.sim;
    const e = item.make(sim, x, Math.min(y, -0.05), f);
    e.spawnRef = { cat: item.cat, id: item.id, f };
    sim.add(e);
    if (!o.noLift && !e.permanentStatic) {
      const a = e.aabb();
      if (a.uy > -0.005) e.translate(0, -a.uy - 0.01);
    }
    if (!o.noHistory) {
      this.history.push(e);
      if (this.history.length > 60) this.history.shift();
    }
    return e;
  }

  undo() {
    while (this.history.length) {
      const e = this.history.pop();
      if (Array.isArray(e)) {
        const alive = e.filter((x) => !x.removed);
        if (!alive.length) continue;
        for (const x of alive) this.sim.remove(x);
        this.ui.toast(`Отменено: ${e.name}`);
        return true;
      }
      if (e.removed) continue;
      if (this.controlled === e) this.control(null);
      if (this.drag && this.drag.ent === e) this.endDrag();
      this.sim.remove(e);
      this.ui.toast(`Отменено: ${e.name}`);
      return true;
    }
    this.ui.toast('Нечего отменять');
    return false;
  }

  saveScene(n) {
    const ok = saveSlot(this, n);
    this.ui.toast(ok ? `Сцена сохранена в слот ${n}` : 'Не удалось сохранить (память браузера недоступна)');
  }

  loadScene(n) {
    const c = loadSlot(this, n);
    if (c < 0) this.ui.toast('Слот пуст');
    else this.ui.toast(`Загружено объектов: ${c}`);
    this.ui.markWorld();
  }

  // Постройка из многих блоков: ставится на землю, отменяется целиком.
  build(item, x) {
    const parts = item.build(x);
    const ents = parts.map(([id, px, py]) => this.place(findItem(id === 'crate' ? 'props' : 'hidden', id), px, py, 1, { noLift: true, noHistory: true }));
    ents.name = item.name;
    this.history.push(ents);
    this.sim.effects.dust(x, -0.2, 8, 'rgba(255,255,255,0.6)', 0.4);
    sfx.ui();
    return ents;
  }

  spawn(item, x, y) {
    const sim = this.sim;
    if (item.build) return this.build(item, x);
    const e = this.place(item, x, y, this.placeFlip);
    sim.effects.dust(x, Math.min(y, -0.1), 3, 'rgba(255,255,255,0.6)', 0.2);
    sfx.ui();
    if (e.isC4) this.ui.toast('C4 прилипает к поверхностям. Взрыв — кнопкой «Детонатор»', 2600);
    else if (e.isRagdoll && e.typeId === 'soldier') this.ui.toast('Перетащи оружие к руке солдата — он будет стрелять по зомби', 2800);
    else if (e.isMelee && e.def.syringe) this.ui.toast('Перетащи шприц иглой на персонажа или брось в него', 2600);
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
      case 'link':
        this.connect(w, body);
        break;
    }
  }

  connect(w, body) {
    const sim = this.sim;
    const mode = this.linkMode;
    const needBody = mode === 'weld' || mode === 'wire';
    if (needBody && !body) { this.ui.toast('Нажми на объект'); return; }
    const target = body || sim.ground;
    if (!this.pending) {
      this.pending = { body: target, local: target.getLocalPoint(V(w.x, w.y)) };
      this.ui.toast(mode === 'wire' ? 'Теперь приёмник сигнала' : 'Теперь вторая точка');
      return;
    }
    const a = this.pending;
    this.pending = null;
    if (a.body === target) return;
    const lb = target.getLocalPoint(V(w.x, w.y));
    if (mode === 'wire') {
      const ea = sim.entAt(a.body), eb = sim.entAt(target);
      if (!ea || !eb || ea === eb) return;
      addWire(sim, ea, a.body, a.local, eb, target, lb);
      if (!ea.isSource && !eb.isSource) this.ui.toast('Подсказка: на одном конце должен быть источник — кнопка, таймер или лазер', 3000);
    } else {
      makeLink(sim, mode, a.body, a.local, target, lb);
    }
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
    if (e.isMelee && e.def.syringe && e.full > 0 && !e.removed) {
      // Отпустили шприц иглой на персонаже — укол.
      const tip = e.muzzleWorld();
      const b = this.sim.bodyAt(tip.x, tip.y, 0.08);
      const t = b && this.sim.entAt(b);
      if (t && t.isRagdoll) {
        const axis = e.main.getWorldVector(V(1, 0));
        e.embedInto(b, tip, axis, t);
        e.injectInto(t);
        this.ui.toast(`${t.name}: ${e.name.replace('Шприц: ', '')}`);
        return;
      }
    }
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
    const add = (cat, id, x, y, f = 1) => this.place(findItem(cat, id), x, y, f, { noHistory: true });
    add('props', 'crate', -6, -0.5);
    add('props', 'crate', -6, -1.5);
    add('props', 'crate', -4.9, -0.5);
    add('boom', 'barrel', -3.6, -0.5);
    add('people', 'human', -1.5, -1, 1);
    const s = add('people', 'soldier', 1.8, -1, -1);
    const ak = add('guns', 'ak', 1.2, -1.3, -1);
    this.sim.defer(() => s.grab(ak));
    add('props', 'melon', 4.5, -0.3);
    add('vehicles', 'truck', 9.5, -0.6, -1);
  }

  // Действия из контекстного меню объекта.
  ctxAction(act, body) {
    const sim = this.sim;
    const e = sim.entAt(body);
    if (!e || e.removed) return;
    switch (act) {
      case 'activate': {
        const res = e.activate(body);
        if (res === 'drive') this.control(e);
        break;
      }
      case 'freeze': {
        const st = !e.bodies[0].isStatic();
        for (const b of e.bodies) { if (st) b.setStatic(); else { b.setDynamic(); b.setAwake(true); } }
        break;
      }
      case 'fire':
        for (const b of e.bodies) sim.ignite(b, 10);
        if (!e.bodies.some((b) => sim.burning.has(b))) this.ui.toast('Это не горит');
        break;
      case 'extinguish':
        for (const b of e.bodies) sim.extinguish(b);
        break;
      case 'heal': e.heal(); break;
      case 'kill':
        e.die('menu');
        for (const p of e.partList) p.hp = Math.min(p.hp, 0);
        break;
      case 'drop': e.drop(); break;
      case 'team': {
        const next = { null: 'red', red: 'blue', blue: null }[String(e.team)];
        e.setTeam(next);
        this.ui.toast(next ? `Команда: ${next === 'red' ? 'красные' : 'синие'}` : 'Без команды');
        break;
      }
      case 'clone': {
        if (!e.spawnRef) break;
        const a = e.aabb();
        const item = findItem(e.spawnRef.cat, e.spawnRef.id);
        const f = e.isRagdoll ? e.facing : e.spawnRef.f;
        const c = this.place(item, a.ux + (a.ux - a.lx) / 2 + 0.3, (a.ly + a.uy) / 2, f);
        sim.effects.dust((a.lx + a.ux) / 2, (a.ly + a.uy) / 2, 3, 'rgba(255,255,255,0.6)', 0.2);
        void c;
        break;
      }
      case 'unwire':
        sim.wires = sim.wires.filter((w) => w.a !== e && w.b !== e);
        break;
      case 'delete':
        if (this.controlled === e) this.control(null);
        sim.remove(e);
        break;
    }
    sfx.ui();
  }

  // ---------- Цикл ----------
  frame(ts) {
    const rawDt = Math.max(0, (ts - this.last) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.last = ts;
    if (rawDt < 0.5) this.trackPerf(rawDt);
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
}

boot();
