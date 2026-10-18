// Интерфейс: инструменты, каталог, меню, управление техникой, жесты.
import { CATEGORIES, findItem } from './catalog.js';
import { WORLDS } from './worlds.js';
import { Sim, pl, V } from './sim.js';
import { Renderer } from './render.js';
import { initAudio, sfx, setSoundEnabled, isSoundEnabled } from './audio.js';
import { clamp, wrapAngle, TAU } from './util.js';
import { showInstall, canInstall } from './pwa.js';
import { slotInfo } from './scene.js';
import { LINK_MODES } from './links.js';

const $ = (s) => document.querySelector(s);

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 013 0V12M11 11V5a1.5 1.5 0 013 0v6M14 11V6.5a1.5 1.5 0 013 0V14c0 4-2.5 6-5.5 6S6 18.5 5 16l-1.6-3.2a1.4 1.4 0 012.4-1.4L8 14"/>',
  freeze: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 2 3-2M9 19.5l3-2 3 2"/>',
  rope: '<path d="M6 3v4M6 7c0 6 12 4 12 10v4M18 17a2 2 0 11-.01 0"/><circle cx="6" cy="7" r="1.6"/>',
  weld: '<path d="M4 20l7-7M13 11l3-3 4 4-3 3zM9 7l2 2M6 10l1.5 1.5"/>',
  heal: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
  del: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flip: '<path d="M12 4v16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M10 3h4"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  fire: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  link: '<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>',
  hinge: '<circle cx="12" cy="12" r="3"/><path d="M12 9V3M14.5 13.5l5 4M9.5 13.5l-5 4"/>',
  spring: '<path d="M12 2v3l-5 2 10 3-10 3 10 3-5 2v4"/>',
  wire: '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="18" r="1.6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  cam: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const TOOLS = [
  { id: 'drag', name: 'Рука', icon: 'hand', hint: 'Тяни объекты. Короткое нажатие — активировать (выстрел, таймер, техника).' },
  { id: 'freeze', name: 'Заморозить', icon: 'freeze', hint: 'Нажми на объект — он замрёт в воздухе. Ещё раз — разморозить.' },
  { id: 'link', name: 'Связь', icon: 'link', hint: 'Выбери тип: верёвка, сварка, шарнир, пружина или провод.' },
  { id: 'heal', name: 'Лечить', icon: 'heal', hint: 'Нажми на персонажа — полностью исцелит и пришьёт конечности.' },
  { id: 'delete', name: 'Удалить', icon: 'trash', hint: 'Нажми на объект, чтобы удалить.' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.pointers = new Map();
    this.gesture = null;
    this.toastT = 0;
    this.detT = 0;
    this.thumbs = new Map();
    this.cat = 'people';
    this.build();
    this.bindCanvas();
    this.bindKeys();
  }

  // ---------- Построение DOM ----------
  build() {
    const g = this.game;
    $('#btnMenu').innerHTML = icon('menu');
    $('#btnClear').innerHTML = icon('trash');
    $('#btnUndo').innerHTML = icon('undo');
    $('#btnUndo').onclick = () => { g.undo(); sfx.ui(); };
    $('#btnSpawn').innerHTML = icon('plus') + '<span>Создать</span>';
    $('#placeFlip').innerHTML = icon('flip');
    $('#placeClose').innerHTML = icon('close');
    $('#catClose').innerHTML = icon('close');
    $('#menuClose').innerHTML = icon('close');
    this.updatePause();
    this.updateSlow();

    const tools = $('#tools');
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.title = t.name;
      b.innerHTML = icon(t.icon) + `<span>${t.name}</span>`;
      b.onclick = () => { this.setTool(t.id); sfx.ui(); };
      tools.appendChild(b);
    }
    this.setTool('drag', true);
    const lm = $('#linkModes');
    const modeIcon = { rope: 'rope', weld: 'weld', hinge: 'hinge', spring: 'spring', wire: 'wire' };
    for (const m of LINK_MODES) {
      const b = document.createElement('button');
      b.dataset.mode = m.id;
      b.innerHTML = icon(modeIcon[m.id]) + `<span>${m.name}</span>`;
      b.onclick = () => { g.linkMode = m.id; g.pending = null; this.markLink(); this.toast(m.hint, 2400); sfx.ui(); };
      lm.appendChild(b);
    }
    this.markLink();

    $('#btnMenu').onclick = () => this.openMenu();
    $('#menuClose').onclick = () => this.closeMenu();
    $('#btnPause').onclick = () => { g.paused = !g.paused; this.updatePause(); sfx.ui(); };
    $('#btnSlow').onclick = () => { g.setSlow(g.timeScale === 1 ? g.slowValue : 1); this.updateSlow(); sfx.ui(); };
    $('#btnSlowPick').onclick = (e) => { e.stopPropagation(); $('#speedPick').classList.toggle('hidden'); };
    for (const b of document.querySelectorAll('#speedPick button')) {
      b.onclick = () => {
        g.slowValue = parseFloat(b.dataset.v);
        g.setSlow(g.slowValue);
        this.updateSlow();
        $('#speedPick').classList.add('hidden');
      };
    }
    $('#btnClear').onclick = () => {
      if (!g.sim.entities.length) return;
      if (confirm('Удалить все объекты со сцены?')) { g.clearScene(); this.toast('Сцена очищена'); }
    };
    $('#btnSpawn').onclick = () => this.openCatalog();
    $('#catClose').onclick = () => this.closeCatalog();
    $('#catalog').addEventListener('click', (e) => { if (e.target.id === 'catalog') this.closeCatalog(); });
    $('#menu').addEventListener('click', (e) => { if (e.target.id === 'menu') this.closeMenu(); });
    $('#placeClose').onclick = () => this.setPlace(null);
    $('#placeFlip').onclick = () => { g.placeFlip *= -1; this.renderPlaceThumb(); sfx.ui(); };
    $('#btnDetonate').onclick = () => {
      for (const e of g.sim.entities) if (e.isC4 && !e.removed) { e.activate(); break; }
    };

    // Табы каталога.
    const tabs = $('#catTabs');
    for (const c of CATEGORIES) {
      if (c.hidden) continue;
      const b = document.createElement('button');
      b.textContent = c.name;
      b.dataset.cat = c.id;
      b.onclick = () => { this.cat = c.id; this.renderCatalog(); };
      tabs.appendChild(b);
    }

    // Меню: миры и настройки.
    const wl = $('#worldList');
    for (const w of WORLDS) {
      const b = document.createElement('button');
      b.className = 'world';
      b.dataset.world = w.id;
      b.innerHTML = `<i style="background:linear-gradient(180deg,${w.thumb[0]} 0%,${w.thumb[1]} 58%,${w.thumb[2]} 58%)"></i><b>${w.name}</b><small>${w.desc}</small>`;
      b.onclick = () => { g.setWorld(w.id); this.markWorld(); this.closeMenu(); this.toast(`Мир: ${w.name}`); };
      wl.appendChild(b);
    }
    this.markWorld();
    const st = g.settings;
    this.bindToggle('#optSound', st.sound, (v) => { st.sound = v; setSoundEnabled(v); });
    this.bindToggle('#optBlood', st.blood, (v) => { st.blood = v; g.sim.effects.blood = v; });
    this.bindToggle('#optFps', st.fps, (v) => { st.fps = v; $('#fps').classList.toggle('hidden', !v); });
    $('#fps').classList.toggle('hidden', !st.fps);
    for (const b of document.querySelectorAll('#optGfx button')) {
      b.onclick = () => {
        st.gfx = b.dataset.q;
        g.saveSettings();
        g.applyQuality();
        this.markGfx();
        sfx.ui();
      };
    }
    this.markGfx();
    this.bindToggle('#optFollow', st.follow, (v) => { st.follow = v; });
    $('#btnInstall').onclick = () => { this.closeMenu(); showInstall(true); };
    $('#btnFull').onclick = () => {
      const el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };
    $('#btnHelp').onclick = () => { this.closeMenu(); $('#help').classList.remove('hidden'); };
    $('#helpClose').onclick = () => $('#help').classList.add('hidden');
    $('#btnWipe').onclick = () => { g.clearScene(); this.closeMenu(); this.toast('Сцена очищена'); };

    // Пульт техники.
    const hold = (sel, on, off) => {
      const el = $(sel);
      const down = (e) => { e.preventDefault(); el.classList.add('on'); on(); };
      const up = (e) => { e.preventDefault(); el.classList.remove('on'); off(); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    $('#dLeft').innerHTML = icon('left');
    $('#dRight').innerHTML = icon('right');
    $('#dUp').innerHTML = icon('up');
    $('#dDown').innerHTML = icon('down');
    $('#dFire').innerHTML = icon('fire') + '<span>Пушка</span>';
    $('#dMg').innerHTML = icon('bolt') + '<span>Пулемёт</span>';
    $('#dExit').innerHTML = icon('close');
    const c = () => g.controlled && g.controlled.ctrl;
    hold('#dLeft', () => c() && (c().x = -1), () => c() && c().x === -1 && (c().x = 0));
    hold('#dRight', () => c() && (c().x = 1), () => c() && c().x === 1 && (c().x = 0));
    hold('#dUp', () => c() && (c().aim = 1), () => c() && (c().aim = 0));
    hold('#dDown', () => c() && (c().aim = -1), () => c() && (c().aim = 0));
    hold('#dFire', () => c() && (c().fire = true), () => c() && (c().fire = false));
    hold('#dMg', () => c() && (c().mg = true), () => c() && (c().mg = false));
    $('#dExit').onclick = () => g.control(null);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.slowmo') && !e.target.closest('#speedPick')) $('#speedPick').classList.add('hidden');
    });
  }

  bindToggle(sel, val, fn) {
    const el = $(sel);
    el.checked = val;
    el.onchange = () => { fn(el.checked); this.game.saveSettings(); };
  }

  markGfx() {
    const st = this.game.settings;
    for (const b of document.querySelectorAll('#optGfx button')) b.classList.toggle('on', b.dataset.q === st.gfx);
    const hints = {
      auto: `Сейчас: ${this.game.r.q.name}. Подстраивается под скорость телефона.`,
      low: 'Для слабых телефонов: без теней и текстур.',
      medium: 'Объёмные грани, простые тени.',
      high: 'Тени от солнца, текстуры материалов.',
      ultra: 'Мягкие тени, свечение огня, блики, цветокоррекция. Нужен мощный телефон.',
    };
    $('#gfxHint').textContent = hints[st.gfx] || '';
  }

  showFps(fps, q) {
    const el = $('#fps');
    el.textContent = `${fps} FPS · ${q}`;
    el.classList.toggle('bad', fps < 35);
  }

  markWorld() {
    for (const b of document.querySelectorAll('#worldList .world')) b.classList.toggle('on', b.dataset.world === this.game.worldDef.id);
  }

  setTool(id, silent) {
    const g = this.game;
    g.tool = id;
    g.pending = null;
    this.setPlace(null, true);
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
    $('#linkModes').classList.toggle('hidden', id !== 'link');
    const t = TOOLS.find((t) => t.id === id);
    if (!silent && t) {
      const m = LINK_MODES.find((m) => m.id === g.linkMode);
      this.toast(id === 'link' && m ? `${m.name}: ${m.hint}` : t.hint, 2600);
    }
  }

  markLink() {
    for (const b of document.querySelectorAll('#linkModes button')) b.classList.toggle('on', b.dataset.mode === this.game.linkMode);
  }

  updatePause() {
    $('#btnPause').innerHTML = this.game.paused ? icon('play') : icon('pause');
    $('#btnPause').classList.toggle('on', this.game.paused);
  }

  updateSlow() {
    const g = this.game;
    const slow = g.timeScale !== 1;
    $('#btnSlow').innerHTML = icon('clock') + `<span>${slow ? g.timeScale + '×' : 'Замедлить'}</span>`;
    $('#btnSlow').classList.toggle('on', slow);
    document.body.classList.toggle('slowmo-on', slow);
  }

  toast(text, ms = 1800) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- Каталог ----------
  openCatalog() {
    $('#catalog').classList.remove('hidden');
    this.renderCatalog();
    sfx.ui();
  }

  closeCatalog() { $('#catalog').classList.add('hidden'); }

  renderCatalog() {
    for (const b of document.querySelectorAll('#catTabs button')) b.classList.toggle('on', b.dataset.cat === this.cat);
    const grid = $('#catGrid');
    grid.innerHTML = '';
    const cat = CATEGORIES.find((c) => c.id === this.cat);
    for (const it of cat.items) {
      const b = document.createElement('button');
      b.className = 'item';
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 110;
      b.appendChild(cv);
      const label = document.createElement('b');
      label.textContent = it.name;
      b.appendChild(label);
      const d = document.createElement('small');
      d.textContent = it.desc;
      b.appendChild(d);
      b.onclick = () => { this.setPlace(it); this.closeCatalog(); sfx.ui(); };
      grid.appendChild(b);
      this.drawThumb(it, cv, 1);
    }
  }

  // Миниатюры рисуются тем же рендером из временного мира.
  drawThumb(it, cv, f) {
    const key = it.id + f + cv.width;
    const cached = this.thumbs.get(key);
    const ctx = cv.getContext('2d');
    if (cached) { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(cached, 0, 0); return; }
    if (!this.thumbR) {
      this.thumbCanvas = document.createElement('canvas');
      this.thumbR = new Renderer(this.thumbCanvas, { vpFrac: 0.5, maxDpr: 1 });
      this.thumbR.showFrozen = false;
    }
    const r = this.thumbR;
    r.resize(cv.width, cv.height);
    r.dpr = 1;
    const sim = new Sim(this.game.worldDef, { silent: true });
    try {
      const ents = it.build
        ? it.build(0).map(([id, px, py]) => findItem(id === 'crate' ? 'props' : 'hidden', id).make(sim, px, py, 1))
        : [it.make(sim, 0, -3, f)];
      const a = { lx: Infinity, ly: Infinity, ux: -Infinity, uy: -Infinity };
      for (const e of ents) {
        sim.add(e);
        const b = e.aabb();
        a.lx = Math.min(a.lx, b.lx); a.ly = Math.min(a.ly, b.ly); a.ux = Math.max(a.ux, b.ux); a.uy = Math.max(a.uy, b.uy);
      }
      const w = a.ux - a.lx, h = a.uy - a.ly;
      r.cam.s = Math.min((cv.width * 0.8) / w, (cv.height * 0.78) / h, 480);
      r.cam.x = (a.lx + a.ux) / 2;
      r.cam.y = (a.ly + a.uy) / 2;
      r.ctx.setTransform(1, 0, 0, 1, 0, 0);
      r.ctx.clearRect(0, 0, cv.width, cv.height);
      r.collect(sim);
      r.drawItems();
      const out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      out.getContext('2d').drawImage(this.thumbCanvas, 0, 0);
      this.thumbs.set(key, out);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(out, 0, 0);
    } catch (err) {
      console.error(err);
    }
    sim.clear();
  }

  setPlace(it, silent) {
    const g = this.game;
    g.placeItem = it;
    $('#placeBar').classList.toggle('hidden', !it);
    if (!it) return;
    $('#placeName').textContent = it.name;
    $('#placeDesc').textContent = it.desc;
    this.renderPlaceThumb();
    if (!silent) this.toast('Нажми на сцену, чтобы поставить', 1500);
  }

  renderPlaceThumb() {
    const it = this.game.placeItem;
    if (it) this.drawThumb(it, $('#placeThumb'), this.game.placeFlip);
  }

  // ---------- Меню ----------
  renderSlots() {
    const el = $('#slots');
    el.innerHTML = '';
    for (let n = 1; n <= 3; n++) {
      const info = slotInfo(n);
      const row = document.createElement('div');
      row.className = 'slot';
      const when = info ? new Date(info.time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      row.innerHTML = `<div><b>Слот ${n}</b><small>${info ? `${info.count} объектов · ${when}` : 'пусто'}</small></div>`;
      const save = document.createElement('button');
      save.className = 'save';
      save.textContent = 'Сохранить';
      save.onclick = () => {
        if (info && !confirm(`Перезаписать слот ${n}?`)) return;
        this.game.saveScene(n);
        this.renderSlots();
      };
      const load = document.createElement('button');
      load.textContent = 'Загрузить';
      load.disabled = !info;
      load.onclick = () => { this.game.loadScene(n); this.closeMenu(); };
      row.append(save, load);
      el.appendChild(row);
    }
  }

  // ---------- Контекстное меню объекта ----------
  openCtx(body, sx, sy) {
    const g = this.game;
    const e = g.sim.entAt(body);
    if (!e || e.removed) return;
    const m = $('#ctx');
    m.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'ctitle';
    title.textContent = e.name || 'Объект';
    m.appendChild(title);
    const add = (act, label, ic, cls) => {
      const b = document.createElement('button');
      if (cls) b.className = cls;
      b.innerHTML = `<i>${ic}</i>${label}`;
      b.onclick = () => { g.ctxAction(act, body); this.closeCtx(); };
      m.appendChild(b);
    };
    if (e.isVehicle) add('activate', 'Сесть за руль', '🚗');
    else if (e.isRagdoll) { if (e.holding) add('activate', 'Атаковать', '💥'); }
    else add('activate', 'Активировать', '⚡');
    const frozen = e.bodies[0] && e.bodies[0].isStatic();
    if (!e.permanentStatic) add('freeze', frozen ? 'Разморозить' : 'Заморозить', '❄️');
    const burning = e.bodies.some((b) => g.sim.burning.has(b));
    add(burning ? 'extinguish' : 'fire', burning ? 'Потушить' : 'Поджечь', burning ? '💧' : '🔥');
    if (e.isRagdoll) {
      add('heal', 'Вылечить', '❤️');
      if (e.alive && !e.type.immortal) add('kill', 'Убить', '💀');
      if (e.holding) add('drop', 'Бросить оружие', '✋');
      if (!e.type.zombie && !e.type.noMuscles) add('team', `Команда: ${{ red: 'красные', blue: 'синие' }[e.team] || 'нет'}`, e.team === 'red' ? '🟥' : e.team === 'blue' ? '🟦' : '⬜');
    }
    if (e.spawnRef) add('clone', 'Копировать', '⧉');
    if (e.menu) {
      for (const m of e.menu()) {
        const b = document.createElement('button');
        b.innerHTML = `<i>${m.icon}</i>${m.label}`;
        b.onclick = () => { m.fn(); sfx.ui(); this.closeCtx(); };
        m && this.ctxInsert(b);
      }
    }
    if (g.sim.wires.some((w) => w.a === e || w.b === e)) add('unwire', 'Убрать провода', '✂️');
    add('delete', 'Удалить', '🗑️', 'danger');
    m.classList.remove('hidden');
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = clamp(sx + 12, 8, window.innerWidth - w - 8) + 'px';
    m.style.top = clamp(sy - h / 2, 8, window.innerHeight - h - 8) + 'px';
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* нет вибрации */ } }
  }

  closeCtx() { $('#ctx').classList.add('hidden'); }

  ctxInsert(b) { $('#ctx').appendChild(b); }

  openMenu() {
    this.renderSlots();
    this.markGfx();
    $('#menu').classList.remove('hidden');
    $('#btnInstall').classList.toggle('hidden', !canInstall());
    sfx.ui();
  }
  closeMenu() { $('#menu').classList.add('hidden'); }

  showDrive(v) {
    const pad = $('#drive');
    pad.classList.toggle('hidden', !v);
    if (!v) return;
    for (const b of pad.querySelectorAll('[data-kinds]')) b.classList.toggle('hidden', !b.dataset.kinds.split(' ').includes(v.kind));
    const fire = { tank: 'Пушка', heli: 'Ракеты', plane: 'Бомба', turret: 'Огонь' }[v.kind] || 'Огонь';
    $('#dFire').innerHTML = icon('fire') + `<span>${fire}</span>`;
    $('#driveName').textContent = v.name;
  }

  tick(dt) {
    this.detT -= dt;
    if (this.detT <= 0) {
      this.detT = 0.3;
      const has = this.game.sim.entities.some((e) => e.isC4 && !e.removed);
      $('#btnDetonate').classList.toggle('hidden', !has);
    }
  }

  // ---------- Жесты на сцене ----------
  bindCanvas() {
    const cv = this.game.canvas;
    const g = this.game;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      initAudio();
      this.closeCtx();
      clearTimeout(this.lpTimer);
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        if (g.drag) {
          // Второй палец во время перетаскивания — вращение предмета.
          this.gesture = { type: 'rotate', a0: Math.atan2(b.y - a.y, b.x - a.x), base: g.drag.body.getAngle() };
          g.drag.rot = this.gesture.base;
        } else {
          this.gesture = { type: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), s0: g.r.cam.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
          g.pending = null;
        }
        return;
      }
      if (this.pointers.size > 2) return;
      const w = g.r.toWorld(e.clientX, e.clientY);
      this.gesture = { type: 'tap', w };
      if (g.tool === 'drag' && !g.placeItem && e.button !== 2 && e.button !== 1) {
        const body = g.sim.bodyAt(w.x, w.y, Math.max(0.12, 14 / g.r.cam.s));
        if (body && !body.isStatic()) {
          this.gesture = { type: 'maybeDrag', w, body };
        }
        // Долгое нажатие на объекте — контекстное меню.
        const lpBody = body;
        if (lpBody) {
          const id = e.pointerId;
          this.lpTimer = setTimeout(() => {
            const p = this.pointers.get(id);
            const G = this.gesture;
            if (p && !p.moved && this.pointers.size === 1 && G && (G.type === 'maybeDrag' || G.type === 'tap')) {
              this.gesture = { type: 'consumed' };
              this.openCtx(lpBody, p.x, p.y);
            }
          }, 480);
        }
      }
      if (e.button === 2) {
        const body = g.sim.bodyAt(w.x, w.y, Math.max(0.12, 14 / g.r.cam.s));
        if (body) { this.gesture = { type: 'consumed' }; this.openCtx(body, e.clientX, e.clientY); return; }
      }
      if (e.button === 2 || e.button === 1) this.gesture = { type: 'pan' };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      g.mouse = { x: e.clientX, y: e.clientY };
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 7) { p.moved = true; clearTimeout(this.lpTimer); }
      const G = this.gesture;
      if (!G) return;
      if (G.type === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        g.zoomAt(mx, my, (G.s0 * d) / G.d0 / g.r.cam.s);
        g.pan(mx - G.mx, my - G.my);
        G.mx = mx; G.my = my;
        return;
      }
      if (G.type === 'rotate' && this.pointers.size >= 2 && g.drag) {
        const [a, b] = [...this.pointers.values()];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.drag.rot = G.base + wrapAngle(ang - G.a0);
        return;
      }
      if (G.type === 'maybeDrag' && p.moved) {
        g.startDrag(G.body, G.w);
        this.gesture = { type: 'drag' };
      }
      if (this.gesture.type === 'drag' && g.drag) {
        g.dragTo(g.r.toWorld(e.clientX, e.clientY));
        return;
      }
      if ((G.type === 'tap' && p.moved) || G.type === 'pan') {
        this.gesture = { type: 'pan' };
        g.pan(dx, dy);
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      clearTimeout(this.lpTimer);
      const G = this.gesture;
      if (!p) return;
      if (G && G.type === 'consumed') { if (this.pointers.size === 0) this.gesture = null; return; }
      if (G && (G.type === 'pinch' || G.type === 'rotate')) {
        if (G.type === 'rotate') { if (g.drag) g.drag.rot = null; this.gesture = { type: 'drag' }; return; }
        if (this.pointers.size === 0) this.gesture = null;
        return;
      }
      if (this.pointers.size > 0) return;
      this.gesture = null;
      if (G && G.type === 'drag') { g.endDrag(); return; }
      const quick = !p.moved && performance.now() - p.t < 450;
      if (!quick || !G) return;
      if (e.type === 'pointercancel') return;
      g.tap(G.w || g.r.toWorld(e.clientX, e.clientY));
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (g.drag && e.shiftKey) { g.drag.rot = (g.drag.rot ?? g.drag.body.getAngle()) + Math.sign(e.deltaY) * 0.15; return; }
      g.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  bindKeys() {
    const g = this.game;
    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      keys.add(e.code);
      const c = g.controlled && g.controlled.ctrl;
      switch (e.code) {
        case 'Space': e.preventDefault(); if (c) c.fire = true; else { g.paused = !g.paused; this.updatePause(); } break;
        case 'KeyT': g.setSlow(g.timeScale === 1 ? g.slowValue : 1); this.updateSlow(); break;
        case 'ArrowLeft': case 'KeyA': if (c) c.x = -1; break;
        case 'ArrowRight': case 'KeyD': if (c) c.x = 1; break;
        case 'ArrowUp': case 'KeyW': if (c) c.aim = 1; break;
        case 'ArrowDown': case 'KeyS': if (c) c.aim = -1; break;
        case 'KeyF': if (c) c.fire = true; break;
        case 'KeyG': if (c) c.mg = true; break;
        case 'Escape': g.control(null); this.setPlace(null); g.pending = null; this.closeCtx(); break;
        case 'KeyZ': if (e.ctrlKey || e.metaKey) { e.preventDefault(); g.undo(); } break;
        case 'KeyQ': if (g.drag) g.drag.rot = (g.drag.rot ?? g.drag.body.getAngle()) - 0.2; break;
        case 'KeyE': if (g.drag) g.drag.rot = (g.drag.rot ?? g.drag.body.getAngle()) + 0.2; break;
        default: {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= TOOLS.length) this.setTool(TOOLS[n - 1].id);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      keys.delete(e.code);
      const c = g.controlled && g.controlled.ctrl;
      if (!c) return;
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) {
        c.x = keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0;
      }
      if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) c.aim = 0;
      if (e.code === 'Space' || e.code === 'KeyF') c.fire = false;
      if (e.code === 'KeyG') c.mg = false;
    });
  }
}

export { TAU, clamp, pl, V, isSoundEnabled };
