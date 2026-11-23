#!/usr/bin/env node
// Build ZIP files for people who use the Claude app (claude.ai / desktop) without Claude Code:
//
//   dist/skills/<skill>.zip    one skill  → Claude app: Customize → Skills → Upload a skill
//   dist/plugins/<plugin>.zip  one plugin → Claude app: Customize → Plugins → Upload plugin
//
// Each skill ZIP contains a single folder named exactly like the skill (the app requires it).
// Needs the `zip` command (macOS/Linux; on Windows use WSL or Git Bash with zip installed).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'skills'), { recursive: true });
mkdirSync(join(dist, 'plugins'), { recursive: true });

const EXCLUDE = ['*.DS_Store', '*/evals/*', '*/node_modules/*', '*/results/*'];

function zip(cwd, target, out) {
  const r = spawnSync('zip', ['-rq', '-X', out, target, '-x', ...EXCLUDE], { cwd, encoding: 'utf8' });
  if (r.error) {
    console.error('The `zip` command is required. Install it (e.g. `sudo apt install zip`) and try again.');
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`zip failed for ${target}: ${r.stderr}`);
    process.exit(1);
  }
  console.log(`built ${out.slice(root.length + 1)}`);
}

const pluginsDir = join(root, 'plugins');
for (const plugin of readdirSync(pluginsDir)) {
  const dir = join(pluginsDir, plugin);
  if (!statSync(dir).isDirectory()) continue;
  const skillsDir = join(dir, 'skills');
  // Bundles (power-up-kit, power-up-designers …) have no skills, only dependencies. An uploaded
  // ZIP doesn't install dependencies in the Claude app, so a bundle ZIP would install nothing.
  if (!existsSync(skillsDir)) continue;
  zip(pluginsDir, plugin, join(dist, 'plugins', `${plugin}.zip`));
  for (const skill of readdirSync(skillsDir)) {
    if (!statSync(join(skillsDir, skill)).isDirectory()) continue;
    zip(skillsDir, skill, join(dist, 'skills', `${skill}.zip`));
  }
}
