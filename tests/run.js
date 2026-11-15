/*
 * Dev checks (run: cd tests && npm install && npm test).
 *  1. Every host file must parse as ES3 — After Effects' ExtendScript engine rejects anything newer.
 *  2. Panel scripts must parse as ES2019 — the oldest supported panel runtime is Chromium 88.
 *  3. Unit tests for the pure logic.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = (name) => console.log('  ok   ' + name);
const bad = (name, msg) => { failed++; console.log('  FAIL ' + name + '\n       ' + msg); };

function walk(dir, ext, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

console.log('ES3 syntax (host)');
for (const file of [...walk(path.join(root, 'extension/host'), '.jsx'), ...walk(path.join(root, 'scripts'), '.jsx')]) {
  const rel = path.relative(root, file);
  try {
    acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 3, allowReserved: false });
    ok(rel);
  } catch (e) {
    bad(rel, e.message);
  }
}

console.log('ES2019 syntax (panel)');
for (const file of walk(path.join(root, 'extension/js'), '.js')) {
  const rel = path.relative(root, file);
  try {
    acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2019 });
    ok(rel);
  } catch (e) {
    bad(rel, e.message);
  }
}

console.log('Unit tests');
for (const file of fs.readdirSync(__dirname).filter((f) => /\.test\.js$/.test(f)).sort()) {
  const tests = require(path.join(__dirname, file));
  for (const [name, fn] of Object.entries(tests)) {
    try {
      fn();
      ok(file + ' › ' + name);
    } catch (e) {
      bad(file + ' › ' + name, e.message);
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
