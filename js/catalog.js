// Каталог объектов для меню «Создать».
import { Ragdoll } from './entities/ragdoll.js';
import { Prop } from './entities/props.js';
import { Firearm, Melee } from './entities/weapons.js';
import { Explosive } from './entities/explosives.js';
import { Vehicle } from './entities/vehicles.js';
import { Button, Timer, Laser, Motor, Piston, Lamp, ShockPlate } from './entities/machines.js';

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
      { id: 'dummy', name: 'Манекен', desc: 'Краш-тест манекен: бессмертный, без мышц, для экспериментов.', make: rd('dummy') },
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
    ],
  },
  {
    id: 'boom', name: 'Взрывчатка', items: [
      { id: 'grenade', name: 'Граната', desc: 'Нажми — 3 секунды до взрыва, осколки.', make: ex('grenade') },
      { id: 'molotov', name: 'Молотов', desc: 'Брось — разобьётся и разольёт горящее топливо.', make: ex('molotov') },
      { id: 'dynamite', name: 'Динамит', desc: 'Нажми — горит фитиль 4 секунды.', make: ex('dynamite') },
      { id: 'mine', name: 'Мина', desc: 'Взводится сама, взрывается при наступлении.', make: ex('mine') },
      { id: 'c4', name: 'C4', desc: 'Прилипает к чему угодно. Взрыв — кнопкой «Детонатор».', make: ex('c4') },
      { id: 'barrel', name: 'Взрывная бочка', desc: 'Взрывается от пуль и сильных ударов.', make: ex('barrel') },
      { id: 'bomb', name: 'Авиабомба', desc: 'Нажми, чтобы взвести, — взорвётся при ударе.', make: ex('bomb') },
      { id: 'nuke', name: 'Ядерная бомба', desc: 'Нажми — 5 секунд и всё сносит. Огромный гриб.', make: ex('nuke') },
    ],
  },
  {
    id: 'special', name: 'Шприцы', items: [
      { id: 'syrHeal', name: 'Лечение', desc: 'Воткни в персонажа — полностью вылечит и потушит.', make: mel('syrHeal') },
      { id: 'syrAdrenaline', name: 'Адреналин', desc: 'Сила и скорость ×1.8, нет боли. Может оживить недавно погибшего.', make: mel('syrAdrenaline') },
      { id: 'syrZombie', name: 'Зомби-вирус', desc: 'Через пару секунд превращает человека в зомби.', make: mel('syrZombie') },
      { id: 'syrPoison', name: 'Яд', desc: 'Судороги и смерть за несколько секунд.', make: mel('syrPoison') },
      { id: 'syrCryo', name: 'Криозаморозка', desc: 'Замораживает в статую на 15 с. Ударишь — расколется.', make: mel('syrCryo') },
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
    ],
  },
  {
    id: 'vehicles', name: 'Техника', items: [
      { id: 'truck', name: 'Грузовик', desc: 'Нажми, чтобы сесть за руль. Кузов возит людей.', make: veh('truck') },
      { id: 'car', name: 'Легковушка', desc: 'Быстрая. Нажми, чтобы управлять.', make: veh('car') },
      { id: 'tank', name: 'Танк', desc: 'Пушка, пулемёт, гусеницы. Нажми, чтобы управлять.', make: veh('tank') },
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
    ],
  },
];

for (const c of CATEGORIES) for (const it of c.items) it.cat = c.id;

export function findItem(catId, itemId) {
  const c = CATEGORIES.find((c) => c.id === catId);
  return c && c.items.find((i) => i.id === itemId);
}
