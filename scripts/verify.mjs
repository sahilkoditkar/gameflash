#!/usr/bin/env node
// Verify the static shell before publishing.
//
// Checks:
//   1. node --check syntax on every src/**/*.js file
//   2. manifest.webmanifest is valid JSON with required keys
//   3. Every path in sw.js SHELL_PATHS exists on disk
//
// Exits non-zero if any check fails. Designed to run from the repo root,
// both locally (`node scripts/verify.mjs`) and in CI.

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1) Syntax check
console.log('• Checking JS syntax');
const jsFiles = walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js'));
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`syntax error in ${f.slice(ROOT.length + 1)}: ${r.stderr.trim().split('\n')[0]}`);
}
if (failures === 0) ok(`${jsFiles.length} files parsed`);

// 2) Manifest JSON
console.log('• Checking manifest.webmanifest');
try {
  const raw = readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8');
  const m = JSON.parse(raw);
  for (const key of ['name', 'start_url', 'scope', 'display', 'icons']) {
    if (!(key in m)) fail(`manifest missing required key: ${key}`);
  }
  if (Array.isArray(m.icons) && m.icons.length === 0) fail('manifest.icons is empty');
  ok('manifest is valid JSON');
} catch (e) {
  fail(`manifest unreadable: ${e.message}`);
}

// 3) SW precache list
console.log('• Checking sw.js precache list');
try {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const match = sw.match(/SHELL_PATHS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    fail('could not locate SHELL_PATHS in sw.js');
  } else {
    const paths = match[1]
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("'") || s.startsWith('"'))
      .map((s) => s.slice(1, -1));
    let missing = 0;
    for (const p of paths) {
      if (p === './') continue; // virtual entry — served by index.html
      const onDisk = join(ROOT, p.replace(/^\.\//, ''));
      try { statSync(onDisk); }
      catch { fail(`SHELL_PATHS references missing file: ${p}`); missing++; }
    }
    if (missing === 0) ok(`${paths.length} precache entries present`);
  }
} catch (e) {
  fail(`sw.js unreadable: ${e.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
