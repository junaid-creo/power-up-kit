#!/usr/bin/env node
// Copy shared files into every skill that uses them, so each skill folder is
// self-contained (needed for Claude app ZIP uploads and `npx skills add`).
//
//   shared/powerup-lib.mjs   → every skill whose scripts import './powerup-lib.mjs'
//   shared/<other file>  → every skill that already has a file with that name
//
//   node scripts/sync-shared.mjs          copy
//   node scripts/sync-shared.mjs --check  fail if any copy is out of date (used in CI)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedDir = join(root, 'shared');
const check = process.argv.includes('--check');
const sharedFiles = readdirSync(sharedDir).filter((f) => !f.startsWith('.'));

const scriptDirs = [];
for (const plugin of readdirSync(join(root, 'plugins'))) {
  const skillsDir = join(root, 'plugins', plugin, 'skills');
  if (!existsSync(skillsDir)) continue;
  for (const skill of readdirSync(skillsDir)) {
    const scripts = join(skillsDir, skill, 'scripts');
    if (existsSync(scripts)) scriptDirs.push(scripts);
  }
}

let stale = 0;
for (const file of sharedFiles) {
  const content = readFileSync(join(sharedDir, file), 'utf8');
  for (const dir of scriptDirs) {
    const target = join(dir, file);
    const wanted = file === 'powerup-lib.mjs'
      ? readdirSync(dir).some((f) => f.endsWith('.mjs') && f !== file && readFileSync(join(dir, f), 'utf8').includes("from './powerup-lib.mjs'"))
      : existsSync(target);
    if (!wanted) continue;
    const rel = target.slice(root.length + 1);
    if (existsSync(target) && readFileSync(target, 'utf8') === content) {
      console.log(`ok      ${rel}`);
    } else if (check) {
      console.error(`STALE   ${rel} — run: node scripts/sync-shared.mjs`);
      stale++;
    } else {
      writeFileSync(target, content);
      console.log(`updated ${rel}`);
    }
  }
}
if (stale) process.exit(1);
