#!/usr/bin/env node
// Bump the build number in lockstep across constants.js (GAME_VERSION badge),
// index.html (?v=bNNN cache-busters) and sw.js (CACHE_VERSION shell key).
//
// A badge that understates the build wrecks a QA run, and the three must never
// drift apart — so this is one command, not three manual edits. The GAME_VERSION
// string is a cumulative changelog (prepend-only convention going back to 283);
// we prepend a SHORT note so it stays bounded across a many-commit session.
//
// Usage: node tools/bump-build.js <newBuild> "<short note>"
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const newBuild = parseInt(process.argv[2], 10);
const note = process.argv[3];
if (!Number.isInteger(newBuild) || !note) {
  console.error('Usage: node tools/bump-build.js <newBuild> "<short note>"');
  process.exit(2);
}

// --- constants.js: detect current build, prepend the new note ---
const cPath = path.join(root, 'js/constants.js');
let c = fs.readFileSync(cPath, 'utf8');
const m = c.match(/const GAME_VERSION = '((?:[^'\\]|\\.)*)';/);
if (!m) { console.error('constants.js: GAME_VERSION not found'); process.exit(1); }
const oldValue = m[1];
const oldBuild = parseInt((oldValue.match(/build (\d+)/) || [])[1], 10);
// Escape so an apostrophe in the note (e.g. "unwrap's") cannot terminate the single-quoted
// string and turn constants.js into a syntax error. oldValue is already escaped (the capture
// preserved its backslashes), so only the fresh note needs it.
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const newValue = `v3 build ${newBuild}: ${esc(note)} — earlier notes follow. — ${oldValue}`;
c = c.replace(m[0], `const GAME_VERSION = '${newValue}';`);
fs.writeFileSync(cPath, c);

// --- index.html: swap every cache-buster ---
const iPath = path.join(root, 'index.html');
let i = fs.readFileSync(iPath, 'utf8');
const before = (i.match(/v=b\d+/g) || []).length;
i = i.replace(/v=b\d+/g, `v=b${newBuild}`);
fs.writeFileSync(iPath, i);

// --- sw.js: shell cache key ---
const sPath = path.join(root, 'sw.js');
let s = fs.readFileSync(sPath, 'utf8');
s = s.replace(/steveo-shell-v\d+/g, `steveo-shell-v${newBuild}`);
fs.writeFileSync(sPath, s);

console.log(`bumped ${oldBuild} -> ${newBuild}`);
console.log(`  constants.js GAME_VERSION prepended`);
console.log(`  index.html cache-busters replaced: ${before}`);
console.log(`  sw.js CACHE_VERSION -> steveo-shell-v${newBuild}`);
