// Процедурные текстуры материалов (серые, накладываются режимом overlay).
import { seeded, clamp } from './util.js';

const SIZE = 128;
const canvases = new Map();
const patterns = new WeakMap();

// Тайл текстуры в метрах и сила наложения.
export const TEX = {
  fabric: { tile: 0.14, a: 0.42 },
  wood: { tile: 0.7, a: 0.55 },
  metal: { tile: 0.6, a: 0.38 },
  concrete: { tile: 0.9, a: 0.5 },
  skin: { tile: 0.18, a: 0.22 },
  rubber: { tile: 0.35, a: 0.4 },
  paint: { tile: 1.0, a: 0.28 },
  ground: { tile: 1.6, a: 0.35 },
};

// Гладкий шум: случайная сетка с билинейной интерполяцией (бесшовный тайл).
function valueNoise(rnd, cells) {
  const g = [];
  for (let i = 0; i < cells * cells; i++) g.push(rnd());
  const at = (x, y) => g[((y + cells) % cells) * cells + ((x + cells) % cells)];
  return (px, py) => {
    const fx = (px / SIZE) * cells, fy = (py / SIZE) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

function generate(kind) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  const d = img.data;
  const rnd = seeded(kind.length * 977 + kind.charCodeAt(0));
  const n1 = valueNoise(rnd, 4), n2 = valueNoise(rnd, 16), n3 = valueNoise(rnd, 32);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = 128;
      const r = rnd();
      switch (kind) {
        case 'fabric': {
          const weave = ((x >> 1) + (y >> 1)) % 2 ? 14 : -14;
          v += weave + (n3(x, y) - 0.5) * 40 + (r - 0.5) * 24;
          break;
        }
        case 'wood': {
          const w = Math.sin((y + n1(x, y) * 30 + n2(x, y) * 6) * 0.42);
          v += w * 34 + (n3(x, y) - 0.5) * 30 + (r - 0.5) * 10;
          if (n2(x * 2, y) > 0.82) v -= 30;
          break;
        }
        case 'metal': {
          const row = Math.sin(y * 12.9898) * 43758.5453;
          v += ((row - Math.floor(row)) - 0.5) * 30 + (n2(x, y) - 0.5) * 36 + (r - 0.5) * 18;
          break;
        }
        case 'concrete':
        case 'ground':
          v += (n1(x, y) - 0.5) * 60 + (n2(x, y) - 0.5) * 40 + (r - 0.5) * 50;
          if (r > 0.985) v -= 70;
          break;
        case 'skin':
          v += (n2(x, y) - 0.5) * 22 + (r - 0.5) * 12;
          if (r > 0.992) v -= 30;
          break;
        case 'rubber':
          v += (n3(x, y) - 0.5) * 30 + (r - 0.5) * 36;
          break;
        case 'paint':
        default:
          v += (n1(x, y) - 0.5) * 26 + (r - 0.5) * 14;
      }
      v = clamp(v, 0, 255);
      const i = (y * SIZE + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (kind === 'paint' || kind === 'metal') {
    // Царапины.
    g.strokeStyle = 'rgba(210,210,210,0.55)';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, l = 8 + rnd() * 24, a = rnd() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }
  return cv;
}

export function texPattern(ctx, kind) {
  let m = patterns.get(ctx);
  if (!m) { m = new Map(); patterns.set(ctx, m); }
  let p = m.get(kind);
  if (!p) {
    let cv = canvases.get(kind);
    if (!cv) { cv = generate(kind); canvases.set(kind, cv); }
    p = ctx.createPattern(cv, 'repeat');
    const tile = (TEX[kind] || TEX.paint).tile;
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([tile / SIZE, 0, 0, tile / SIZE, 0, 0]));
    m.set(kind, p);
  }
  return p;
}

// Материал фикстуры → текстура.
export const MAT_TEX = {
  wood: 'wood', metal: 'metal', armor: 'metal', stone: 'concrete', rubber: 'rubber',
  flesh: 'skin', zombie: 'skin', plastic: 'paint', bone: 'concrete',
};
