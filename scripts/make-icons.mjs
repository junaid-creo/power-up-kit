#!/usr/bin/env node
// Draw the plugin icons (512×512 PNG: a lightning bolt on a coloured rounded square)
// with no dependencies, so they can be regenerated exactly:  node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;
const SS = 3; // supersampling per axis for smooth edges

const ICONS = {
  'power-up-kit': ['#f97316', '#7c3aed'],
  'powerup-core': ['#fb923c', '#c2410c'],
  'powerup-seo': ['#34d399', '#047857'],
  'powerup-design': ['#c084fc', '#7e22ce'],
  'powerup-agency': ['#60a5fa', '#1d4ed8'],
};

const BOLT = [[300, 52], [128, 300], [244, 300], [204, 460], [384, 196], [264, 196], [300, 52]];

function hex(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function inRoundedRect(x, y) {
  const r = 112;
  const cx = Math.min(Math.max(x, r), SIZE - r);
  const cy = Math.min(Math.max(y, r), SIZE - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function draw([from, to]) {
  const a = hex(from);
  const b = hex(to);
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      let bg = 0;
      let bolt = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (inRoundedRect(px, py)) {
            bg++;
            if (inPolygon(px, py, BOLT)) bolt++;
          }
        }
      }
      const n = SS * SS;
      const t = (x + y) / (2 * SIZE);
      const base = a.map((v, i) => v + (b[i] - v) * t);
      const k = bg ? bolt / bg : 0;
      const rgb = base.map((v) => Math.round(v * (1 - k) + 255 * k));
      const o = y * (SIZE * 4 + 1) + 1 + x * 4;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
      raw[o + 3] = Math.round((bg / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [plugin, colors] of Object.entries(ICONS)) {
  const out = join(root, 'plugins', plugin, '.claude-plugin', 'icon.png');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, draw(colors));
  console.log(`wrote plugins/${plugin}/.claude-plugin/icon.png`);
}
mkdirSync(join(root, 'docs', 'assets'), { recursive: true });
writeFileSync(join(root, 'docs', 'assets', 'logo.png'), draw(ICONS['power-up-kit']));
console.log('wrote docs/assets/logo.png');
