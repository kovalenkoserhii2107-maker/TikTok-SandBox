// Каталог объектов для меню «Создать».
import { Ragdoll } from './entities/ragdoll.js';
import { Prop } from './entities/props.js';
import { Firearm, Melee } from './entities/weapons.js';
import { Explosive } from './entities/explosives.js';
import { Vehicle } from './entities/vehicles.js';
import { Button, Timer, Laser, Motor, Piston, Lamp, ShockPlate, Fan, Conveyor, Magnet } from './entities/machines.js';
import { Pool } from './entities/water.js';
import { makeLink } from './links.js';
import { Helicopter, Plane, Turret } from './entities/aircraft.js';

const rd = (type) => (sim, x, y, f) => new Ragdoll(sim, x, y, type, f);
const pr = (id) => (sim, x, y, f) => new Prop(sim, x, y, id, f);
const gun = (id) => (sim, x, y, f) => new Firearm(sim, x, y, id, f);
const mel = (id) => (sim, x, y, f) => new Melee(sim, x, y, id, f);
const ex = (id) => (sim, x, y, f) => new Explosive(sim, x, y, id, f);
const veh = (id) => (sim, x, y, f) => new Vehicle(sim, x, y, id, f);

export const CATEGORIES = [
  {
    id: 'people', name: 'Персонажи', items: [
      { id: 'human', name: 'Человек', desc: 'Чувствует боль, истекает кровью. Убегает от зомби.', make: rd('human') },
      { id: 'soldier', name: 'Солдат', desc: 'Каска и бронежилет держат пули. Дай ему оружие — сам стреляет по зомби.', make: rd('soldier') },
      { id: 'zombie', name: 'Зомби', desc: 'Не чувствует боли, умирает только от урона в голову. Кусает и заражает людей.', make: rd('zombie') },
      { id: 'robot', name: 'Робот', desc: 'Стальной корпус, искры вместо крови, очень прочный. При гибели взрывается.', make: rd('robot') },
      { id: 'giant', name: 'Гигант', desc: 'В полтора раза выше, в 3 раза тяжелее и крепче.', make: rd('giant') },
      { id: 'skeleton', name: 'Скелет', desc: 'Лёгкий, кости отлетают от любого удара. Живёт, пока цел череп.', make: rd('skeleton') },
      { id: 'fighterRed', name: 'Боец (красные)', desc: 'Дерётся руками и ногами с синими и зомби. Дай оружие — будет стрелять.', make: (s, x, y, f) => { const r = new Ragdoll(s, x, y, 'fighter', f); r.setTeam('red'); return r; } },
      { id: 'fighterBlue', name: 'Боец (синие)', desc: 'Дерётся с красными и зомби. Команду можно поменять в меню объекта.', make: (s, x, y, f) => { const r = new Ragdoll(s, x, y, 'fighter', f); r.setTeam('blue'); return r; } },
      { id: 'dummy', name: 'Манекен', desc: 'Краш-тест манекен: бессмертный, без мышц, для экспериментов.', make: rd('dummy') },
      { id: 'juggernaut', name: 'Джаггернаут', desc: 'Тяжелейшая броня, пули рикошетят с искрами. Огромная стойкость.', make: rd('juggernaut') },
      { id: 'mutant', name: 'Мутант', desc: 'Огромный зелёный громила. Сносит и швыряет всё на своём пути.', make: rd('mutant') },
      { id: 'cyborg', name: 'Киборг', desc: 'Красный глаз, стальной скелет, масло вместо крови. Прочный и беспощадный.', make: rd('cyborg') },
      { id: 'knight', name: 'Рыцарь', desc: 'Стальные латы и шлем с забралом. Защищён от ударов и пуль.', make: rd('knight') },
    ],
  },
  {
    id: 'guns', name: 'Оружие', items: [
      { id: 'pistol', name: 'Пистолет', desc: 'Нажми — выстрел.', make: gun('pistol') },
      { id: 'revolver', name: 'Револьвер', desc: 'Мощный, медленный.', make: gun('revolver') },
      { id: 'ak', name: 'Автомат АК', desc: 'Нажми — огонь очередями, ещё раз — стоп.', make: gun('ak') },
      { id: 'uzi', name: 'Пистолет-пулемёт', desc: 'Очень быстрый, неточный.', make: gun('uzi') },
      { id: 'shotgun', name: 'Дробовик', desc: '9 дробин за выстрел, сильная отдача.', make: gun('shotgun') },
      { id: 'winchester', name: 'Винчестер', desc: 'Рычажная винтовка, пробивает насквозь.', make: gun('winchester') },
      { id: 'sniper', name: 'Снайперка', desc: 'Пробивает несколько тел подряд.', make: gun('sniper') },
      { id: 'minigun', name: 'Миниган', desc: 'Раскручивается и сносит всё. Тяжёлый.', make: gun('minigun') },
      { id: 'rpg', name: 'Ракетница', desc: 'Реактивная граната, взрыв при попадании.', make: gun('rpg') },
      { id: 'flamer', name: 'Огнемёт', desc: 'Струя огня на 7 м. Поджигает людей, дерево, технику.', make: gun('flamer') },
      { id: 'railgun', name: 'Рельсотрон', desc: 'Сверхмощный электромагнитный луч, пробивает любые стены и толпы.', make: gun('railgun') },
      { id: 'sawnoff', name: 'Двустволка', desc: 'Разрушительный залп из 16 дробин. Огромный разлёт и отдача.', make: gun('sawnoff') },
      { id: 'crossbow', name: 'Арбалет', desc: 'Стреляет тяжёлыми болтами, которые втыкаются и прибивают к стенам.', make: gun('crossbow') },
      { id: 'tesla', name: 'Тесла-пушка', desc: 'Электрическая дуга бьёт молнией и шокирует цели током.', make: gun('tesla') },
    ],
  },
  {
    id: 'melee', name: 'Холодное', items: [
      { id: 'knife', name: 'Нож', desc: 'Брось остриём — воткнётся.', make: mel('knife') },
      { id: 'sword', name: 'Меч', desc: 'Катана: отрубает конечности.', make: mel('sword') },
      { id: 'axe', name: 'Топор', desc: 'Тяжёлый рубящий удар.', make: mel('axe') },
      { id: 'spear', name: 'Копьё', desc: 'Длинное, пронзает насквозь.', make: mel('spear') },
      { id: 'bat', name: 'Бита', desc: 'Тупой удар, оглушает.', make: mel('bat') },
      { id: 'hammer', name: 'Кувалда', desc: '7 кг стали — ломает кости.', make: mel('hammer') },
      { id: 'chainsaw', name: 'Бензопила', desc: 'Ревёт мотором и непрерывно режет плоть и дерево на куски.', make: mel('chainsaw') },
      { id: 'shield', name: 'Щит ОМОН', desc: 'Баллистический щит: держит пули, взрывы и удары.', make: mel('shield') },
    ],
  },
  {
    id: 'boom', name: 'Взрывчатка', items: [
      { id: 'grenade', name: 'Граната', desc: 'Нажми — таймер 3 с, потом взрыв с осколками. Подержи палец — меню: время таймера, взорвать сейчас.', make: ex('grenade') },
      { id: 'molotov', name: 'Молотов', desc: 'Брось — разобьётся и разольёт горящее топливо.', make: ex('molotov') },
      { id: 'dynamite', name: 'Динамит', desc: 'Нажми — загорится фитиль на 4 с. Время меняется в меню (подержи палец).', make: ex('dynamite') },
      { id: 'mine', name: 'Мина', desc: 'Взводится сама через секунду и взрывается, когда на неё наступают. В меню — таймер и «разрядить».', make: ex('mine') },
      { id: 'c4', name: 'C4', desc: 'Прилипает к чему угодно. Взрыв — кнопкой «Детонатор» или нажатием на любую C4. В меню — свой таймер.', make: ex('c4') },
      { id: 'barrel', name: 'Взрывная бочка', desc: 'Взрывается от пуль, огня и сильных ударов. Нажми — взорвётся сразу.', make: ex('barrel') },
      { id: 'bomb', name: 'Авиабомба', desc: 'Нажми — взведётся и взорвётся от удара: подними повыше и брось. Или поставь таймер в меню.', make: ex('bomb') },
      { id: 'nuke', name: 'Ядерная бомба', desc: 'Нажми — таймер 5 с, потом сносит всё. Время таймера — в меню (подержи палец).', make: ex('nuke') },
      { id: 'blackHole', name: 'Чёрная дыра', desc: 'Сингулярность: засасывает тела и предметы в центр, затем взрывается.', make: ex('blackHole') },
      { id: 'gasGrenade', name: 'Газовая граната', desc: 'Облако ядовитого газа — удушье и смерть для живых.', make: ex('gasGrenade') },
      { id: 'clusterBomb', name: 'Кассетная бомба', desc: 'Взрывается и рассыпает 7 прыгающих мини-гранат.', make: ex('clusterBomb') },
    ],
  },
  {
    id: 'special', name: 'Шприцы', items: [
      { id: 'syrHeal', name: 'Лечение', desc: 'Воткни в персонажа — полностью вылечит и потушит.', make: mel('syrHeal') },
      { id: 'syrAdrenaline', name: 'Адреналин', desc: 'Сила и скорость ×1.8, нет боли. Может оживить недавно погибшего.', make: mel('syrAdrenaline') },
      { id: 'syrZombie', name: 'Зомби-вирус', desc: 'Через пару секунд превращает человека в зомби.', make: mel('syrZombie') },
      { id: 'syrPoison', name: 'Яд', desc: 'Судороги и смерть за несколько секунд.', make: mel('syrPoison') },
      { id: 'syrCryo', name: 'Криозаморозка', desc: 'Замораживает в статую на 15 с. Ударишь — расколется.', make: mel('syrCryo') },
      { id: 'syrAcid', name: 'Кислота', desc: 'Растворяет кожу, мышцы и плоть до костей с шипением.', make: mel('syrAcid') },
      { id: 'syrAntiGrav', name: 'Антигравитация', desc: 'Обнуляет гравитацию тела — персонаж взмывает вверх.', make: mel('syrAntiGrav') },
      { id: 'syrSuper', name: 'Супер-сыворотка', desc: 'Увеличивает силу втрое, даёт адреналин и бессмертие.', make: mel('syrSuper') },
    ],
  },
  {
    id: 'machines', name: 'Механизмы', items: [
      { id: 'button', name: 'Кнопка', desc: 'Даёт сигнал, когда на неё наступают или нажимают. Соедини проводом с чем угодно.', make: (s, x, y) => new Button(s, x, y) },
      { id: 'timer', name: 'Таймер', desc: 'Нажми — запустится и будет слать сигнал каждые N секунд. Интервал — в меню объекта.', make: (s, x, y) => new Timer(s, x, y) },
      { id: 'laser', name: 'Лазер-датчик', desc: 'Даёт сигнал, когда кто-то пересекает луч. Для ловушек.', make: (s, x, y, f) => new Laser(s, x, y, f) },
      { id: 'motor', name: 'Мотор', desc: 'Вращает диск. Приварь к нему что-нибудь. Сигнал — вкл/выкл.', make: (s, x, y) => new Motor(s, x, y, 1, false) },
      { id: 'saw', name: 'Циркулярная пила', desc: 'Режет всё, что касается диска. Сигнал — вкл/выкл.', make: (s, x, y) => new Motor(s, x, y, 1, true) },
      { id: 'piston', name: 'Поршень', desc: 'Резко выталкивает платформу вверх — катапульта. Сигнал — вверх/вниз.', make: (s, x, y) => new Piston(s, x, y) },
      { id: 'lamp', name: 'Лампа', desc: 'Светит. Сигнал — вкл/выкл.', make: (s, x, y) => new Lamp(s, x, y) },
      { id: 'shock', name: 'Электрошокер', desc: 'Плита под напряжением: бьёт током всех, кто касается. Сигнал — вкл/выкл.', make: (s, x, y) => new ShockPlate(s, x, y) },
      { id: 'fan', name: 'Вентилятор', desc: 'Сдувает всё перед собой мощным потоком ветра. Сигнал — вкл/выкл.', make: (s, x, y, f) => new Fan(s, x, y, f) },
      { id: 'conveyor', name: 'Конвейер', desc: 'Движущаяся лента — перемещает предметы и тела. Сигнал — вкл/выкл.', make: (s, x, y, f) => new Conveyor(s, x, y, f) },
      { id: 'magnet', name: 'Электромагнит', desc: 'Притягивает все металлические предметы и роботов. Сигнал — вкл/выкл.', make: (s, x, y) => new Magnet(s, x, y) },
    ],
  },
  {
    id: 'vehicles', name: 'Техника', items: [
      { id: 'truck', name: 'Грузовик', desc: 'Нажми, чтобы сесть за руль. Кузов возит людей.', make: veh('truck') },
      { id: 'car', name: 'Легковушка', desc: 'Быстрая. Нажми, чтобы управлять.', make: veh('car') },
      { id: 'tank', name: 'Танк', desc: 'Пушка, пулемёт, гусеницы. Нажми, чтобы управлять.', make: veh('tank') },
      { id: 'heli', name: 'Вертолёт', desc: 'Пулемёт и ракеты. Винт рубит всё, что попадёт в лопасти.', make: (s, x, y, f) => new Helicopter(s, x, y, f) },
      { id: 'plane', name: 'Самолёт', desc: 'Разгонись для взлёта — подъёмная сила растёт со скоростью. Сбрасывает бомбы.', make: (s, x, y, f) => new Plane(s, x, y, f) },
      { id: 'turret', name: 'Турель', desc: 'Пулемётная турель. Сама стреляет по зомби или управляется вручную.', make: (s, x, y, f) => new Turret(s, x, y, f) },
    ],
  },
  {
    id: 'props', name: 'Предметы', items: [
      { id: 'crate', name: 'Ящик', desc: 'Деревянный, разламывается.', make: pr('crate') },
      { id: 'metalCrate', name: 'Контейнер', desc: 'Тяжёлый металлический ящик.', make: pr('metalCrate') },
      { id: 'barrel', name: 'Бочка', desc: 'Металлическая бочка.', make: pr('barrel') },
      { id: 'concrete', name: 'Бетон', desc: 'Тяжёлый блок, выдерживает почти всё.', make: pr('concrete') },
      { id: 'brick', name: 'Кирпич', desc: 'Маленький и крепкий.', make: pr('brick') },
      { id: 'plank', name: 'Доска', desc: 'Ломается пополам.', make: pr('plank') },
      { id: 'beam', name: 'Балка', desc: 'Стальная двутавровая балка.', make: pr('beam') },
      { id: 'glass', name: 'Стекло', desc: 'Разбивается вдребезги.', make: pr('glass') },
      { id: 'melon', name: 'Арбуз', desc: 'Сочный. Очень.', make: pr('melon') },
      { id: 'ball', name: 'Мяч', desc: 'Прыгучий.', make: pr('ball') },
      { id: 'tire', name: 'Покрышка', desc: 'Резиновая, отскакивает.', make: pr('tire') },
      { id: 'platform', name: 'Платформа', desc: 'Неподвижная опора.', make: pr('platform') },
      { id: 'anvil', name: 'Наковальня', desc: 'Тяжелейшая стальная наковальня — плющит всё, на что падает.', make: pr('anvil') },
      { id: 'acidBarrel', name: 'Бочка с кислотой', desc: 'При разрушении разливает едкую шипящую кислоту.', make: pr('acidBarrel') },
      { id: 'trampoline', name: 'Батут', desc: 'Пружинит и запускает любые тела и предметы в воздух.', make: pr('trampoline') },
      { id: 'spikes', name: 'Шипы', desc: 'Стальные шипы — пронзают любого, кто на них приземлится.', make: pr('spikes') },
      { id: 'target', name: 'Мишень', desc: 'Мишень для стрельбы с цветными кругами.', make: pr('target') },
    ],
  },
];

// Постройки собираются из блоков (каждый блок — отдельный объект, всё рушится).
const B = { w: 0.6, h: 0.3, gap: 0.004 };
function wallColumn(out, x, y0, rows, width = 1) {
  for (let r = 0; r < rows; r++) {
    const y = y0 - B.h / 2 - r * (B.h + B.gap);
    if (width === 1) out.push(['wallBlock', x, y]);
    else {
      const odd = r % 2 === 1;
      let cx = x - (width * B.w) / 2;
      if (odd) { out.push(['halfBlock', cx + 0.15, y]); cx += 0.3; }
      const n = odd ? width - 1 : width;
      for (let i = 0; i < n; i++) { out.push(['wallBlock', cx + 0.3, y]); cx += B.w + B.gap; }
      if (odd) out.push(['halfBlock', cx + 0.15, y]);
    }
  }
  return y0 - rows * (B.h + B.gap);
}

function buildWall(x) {
  const out = [];
  wallColumn(out, x, 0, 10, 3);
  return out;
}

function buildHouse(x) {
  const out = [];
  const half = 2.1;
  let top = 0;
  for (let floor = 0; floor < 2; floor++) {
    const rows = floor === 0 ? 9 : 8;
    wallColumn(out, x - half, top, rows);
    top = wallColumn(out, x + half, top, rows);
    out.push(['window', x - 1.1, top - 0.6 + rows * (B.h + B.gap) - 0.2]);
    out.push(['slab', x, top - 0.12 - B.gap]);
    top -= 0.24 + B.gap * 2;
  }
  return out;
}


// Подвесной мост: бетонные опоры и настил из досок на шарнирах.
// Людей держит, под тяжёлой техникой доски ломаются и мост рушится.
const BRIDGE_PLANKS = 4;
function buildBridge(x) {
  const out = [];
  for (const side of [-1, 1]) for (let r = 0; r < 3; r++) out.push(['concrete', x + side * 4.7, -0.3 - r * 0.6]);
  for (let i = 0; i < BRIDGE_PLANKS; i++) out.push(['plank', x + (i - (BRIDGE_PLANKS - 1) / 2) * 2.1, -1.84]);
  return out;
}
function linkBridge(ents, sim) {
  // Блоки опоры свариваем в монолит, настил вешаем на шарнирах с небольшим провисом.
  for (const k of [0, 3]) for (let r = 0; r < 2; r++) makeLink(sim, 'weld', ents[k + r].main, { x: 0, y: -0.3 }, ents[k + r + 1].main, { x: 0, y: 0.3 });
  const tops = [ents[2], ents[5]];
  const planks = ents.slice(6);
  const hinge = (a, la, b, lb) => makeLink(sim, 'hinge', a.main, la, b.main, lb);
  hinge(tops[0], { x: 0.6, y: -0.3 }, planks[0], { x: -1.05, y: 0 });
  for (let i = 0; i < planks.length - 1; i++) hinge(planks[i], { x: 1.05, y: 0 }, planks[i + 1], { x: -1.05, y: 0 });
  hinge(planks[planks.length - 1], { x: 1.05, y: 0 }, tops[1], { x: -0.6, y: -0.3 });
}

// Бункер: бетонные стены, бойница в правой стене, перекрытие и бетон сверху.
function buildBunker(x) {
  const out = [];
  for (let r = 0; r < 3; r++) out.push(['concrete', x - 2.6, -0.3 - r * 0.6]);
  out.push(['concrete', x + 2.6, -0.3]);
  for (const dx of [-0.45, 0.45]) for (let r = 0; r < 2; r++) out.push(['halfBlock', x + 2.6 + dx, -0.75 - r * 0.3]);
  out.push(['concrete', x + 2.6, -1.5]);
  out.push(['slab', x, -1.92]);
  for (const dx of [-1.25, 0, 1.25]) out.push(['concrete', x + dx, -2.34]);
  out.push(['metalCrate', x, -0.5]);
  return out;
}
function buildTower(x) {
  const out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) out.push(['crate', x + (c - 1) * 1.01, -0.5 - r * 1.005]);
  return out;
}

CATEGORIES.splice(CATEGORIES.length - 1, 0, {
  id: 'build', name: 'Постройки', items: [
    { id: 'brickWall', name: 'Кирпичная стена', desc: 'Стена 1.8 × 3 м из отдельных блоков. Рушится от взрывов и ударов.', build: buildWall },
    { id: 'house', name: 'Дом', desc: 'Двухэтажный дом из блоков с перекрытиями. Можно заселить людей.', build: buildHouse },
    { id: 'crateTower', name: 'Башня из ящиков', desc: '12 ящиков пирамидой — снеси её.', build: buildTower },
    { id: 'pool', name: 'Бассейн', desc: 'Вода 6 м: дерево всплывает, металл тонет, люди барахтаются и могут утонуть.', make: (s, x) => new Pool(s, x, 0, 'pool') },
    { id: 'tank', name: 'Аквариум', desc: 'Стеклянный бак с водой 3 м. Стекло можно разбить.', make: (s, x) => new Pool(s, x, 0, 'tank') },
    { id: 'bridge', name: 'Подвесной мост', desc: 'Настил из досок на шарнирах между бетонными опорами. Людей держит, под техникой ломается.', build: buildBridge, links: linkBridge },
    { id: 'bunker', name: 'Бункер', desc: 'Бетонные стены, бойница справа, перекрытие с бетоном сверху. Выдерживает гранаты.', build: buildBunker },
    { id: 'acidPool', name: 'Бассейн с кислотой', desc: 'Глубокий резервуар с едкой кислотой — растворяет всё упавшее.', make: (s, x) => new Pool(s, x, 0, 'acidPool') },
  ],
});
CATEGORIES.push({
  id: 'hidden', hidden: true, items: [
    { id: 'wallBlock', name: 'Кирпичный блок', make: pr('wallBlock') },
    { id: 'halfBlock', name: 'Полублок', make: pr('halfBlock') },
    { id: 'slab', name: 'Перекрытие', make: pr('slab') },
    { id: 'window', name: 'Окно', make: pr('window') },
  ],
});

for (const c of CATEGORIES) for (const it of c.items) it.cat = c.id;

export function findItem(catId, itemId) {
  const c = CATEGORIES.find((c) => c.id === catId);
  return c && c.items.find((i) => i.id === itemId);
}
