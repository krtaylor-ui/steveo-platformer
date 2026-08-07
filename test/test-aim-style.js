// ============================================================
// test-aim-style.js — 3-level controller Aim Style + Player Speed (build 388)
// ------------------------------------------------------------
// Kid-friendly control scheme requested by Kevin:
//   dual      — left stick moves, RIGHT stick aims 360° (Advanced; the default/legacy)
//   single360 — one stick: aim follows the LEFT stick (movement) direction, 360°
//   single8   — one stick: aim follows the LEFT stick direction snapped to 8 compass points
// Plus a Player Speed world setting (horizontal move-speed multiplier), mirroring overhead view.
// Aim/input paths are gamepad+DOM bound → source-level assertions (comment-stripped), plus a
// pure-math check of the 8-way snap.
// ============================================================
const fs = require('fs');
const path = require('path');
const jsDir = path.join(__dirname, '..', 'js');
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

const strip = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const gameSrc  = strip(fs.readFileSync(path.join(jsDir, 'game.js'), 'utf8'));
const playerSrc= strip(fs.readFileSync(path.join(jsDir, 'player.js'), 'utf8'));
const cuSrc    = strip(fs.readFileSync(path.join(jsDir, 'controls-ui.js'), 'utf8'));
const wsSrc    = strip(fs.readFileSync(path.join(jsDir, 'world-settings-ui.js'), 'utf8'));

// ── Aim Style: three levels, stored as an opt, default 'dual' (zero regression) ──
{
  // PER-PLAYER: _aimStyle(idx) reads aimStyle:<idx>, falling back to the legacy global then 'dual'.
  ok(/_aimStyle\(idx = 0\)\s*\{/.test(gameSrc), "_aimStyle(idx) is per-player");
  ok(/getOpt\('aimStyle:' \+ \(idx \| 0\), null\)/.test(gameSrc), "_aimStyle reads the per-player 'aimStyle:<idx>' key");
  ok(/getOpt\('aimStyle', 'dual'\)/.test(gameSrc), '_aimStyle falls back to the legacy global then dual');
  ok(/this\._aimStyle\(0\)/.test(gameSrc), 'P1 aim resolves its own (index 0) style');
  ok(/this\._aimStyle\(i\)/.test(gameSrc), 'P2-P4 aim resolves each player index');
  ok(/_snap8\(ang\)\s*\{[^}]*Math\.PI \/ 4/.test(gameSrc), '_snap8 snaps to 45° (PI/4) steps');
  // P1: single-stick modes aim from the LEFT stick; dual defers to the legacy right-stick toggle.
  ok(/_updateP1Aim\(\)\s*\{/.test(gameSrc), 'P1 has an aim-style-aware _updateP1Aim()');
  ok(/if \(style === 'dual'\) return this\._updateP1StickAim\(\)/.test(gameSrc), 'dual preserves the legacy P1 right-stick toggle (no regression)');
  ok(/if \(!this\._updateP1Aim\(\)\) this\.input\.applyStickCursor/.test(gameSrc), 'the loop calls _updateP1Aim (not the old _updateP1StickAim directly)');
  ok(/if \(style === 'single8'\) ang = this\._snap8\(ang\)/.test(gameSrc), 'single8 snaps the P1 aim angle to 8 directions');
  // P2-P4: dual = right stick; single = left stick (+snap for single8).
  ok(/const style = this\._aimStyle\(i\);/.test(gameSrc), '_secondaryAimAngle branches on the per-player aim style');
  ok(/gp\.moveX \|\| 0, my = gp\.moveY \|\| 0/.test(gameSrc), 'single-stick P2-P4 aim reads the LEFT stick (moveX/moveY)');
  ok(/if \(style === 'single8'\) ang = this\._snap8\(ang\);\s*\/\/|if \(style === 'single8'\) ang = this\._snap8\(ang\);/.test(fs.readFileSync(path.join(jsDir,'game.js'),'utf8')), 'single8 snaps the P2-P4 aim');
  // The bow now shares the one aim angle (was inline right-stick only).
  ok(/this\._secondaryAimAngle\(p, i\);/.test(gameSrc), 'the P2-P4 bow routes aim through _secondaryAimAngle (reticle + arrow + grapple agree)');
  ok(!/if \(aimMag > 0\.15\) p\._aimAngle = Math\.atan2\(gp\.aimY, gp\.aimX\)/.test(gameSrc), 'the old inline right-stick-only bow aim is removed');
}

// ── Controls UI exposes the 3-way selector, PER PLAYER ──
{
  ok(/single360:/.test(cuSrc) && /single8:/.test(cuSrc) && /CONTROLS_UI_AIM_LABEL/.test(cuSrc), 'Controls UI defines the 3 aim-style labels');
  ok(/id="cu-aimstyle"/.test(cuSrc), 'Controls UI renders an Aim Style control');
  ok(/Aim Style \(P\$\{this\._player \+ 1\}\)/.test(cuSrc), 'the Aim Style row is labelled with the selected player');
  ok(/\['dual', 'single360', 'single8'\]/.test(cuSrc), 'the Aim Style button cycles through all three levels');
  ok(/setOpt\('aimStyle:' \+ this\._player/.test(cuSrc), 'clicking it persists the SELECTED player\'s aimStyle key');
  ok(/_aimStyleFor\(player\)/.test(cuSrc) && /getOpt\('aimStyle:' \+ player/.test(cuSrc), 'UI resolves per-player style with the same fallback as the runtime');
}

// ── Player Speed: a move-speed multiplier, per world ──
{
  ok(/_moveSpeedMult \|\| 1/.test(playerSrc), 'player.moveSpeed applies a _moveSpeedMult');
  ok(/get crouchSpeed\(\)[^\n]*_moveSpeedMult \|\| 1/.test(playerSrc), 'crouch speed scales with the same multiplier');
  ok(/p\._moveSpeedMult = aws\.playerMoveSpeed \?\? 1/.test(gameSrc), '_applyMovementConfig wires playerMoveSpeed → _moveSpeedMult');
  ok(/key: 'playerMoveSpeed'/.test(wsSrc) && /label: 'Player Speed'/.test(wsSrc), 'World Settings exposes a Player Speed control');
  const m = wsSrc.match(/key: 'playerMoveSpeed'[^}]*dflt:\s*([0-9.]+)/);
  ok(m && Number(m[1]) === 1, 'Player Speed defaults to 1x (no behaviour change until set)');
}

// ── Pure-math: the 8-way snap lands on compass points ──
{
  const S = Math.PI / 4;
  const snap = (a) => Math.round(a / S) * S;
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(snap(0.10), 0), 'a slight-right aim snaps to due right (0)');
  ok(near(snap(0.50), S), '~29° snaps up to 45°');
  ok(near(snap(-Math.PI / 2), -Math.PI / 2), 'straight up stays straight up');
  ok(near(snap(Math.PI / 2 - 0.1), Math.PI / 2), 'near-straight-down snaps to down');
  // every snapped value is an integer multiple of 45°
  let allOnGrid = true;
  for (let a = -Math.PI; a <= Math.PI; a += 0.137) { const q = snap(a) / S; if (Math.abs(q - Math.round(q)) > 1e-9) allOnGrid = false; }
  ok(allOnGrid, 'every snapped angle is a multiple of 45°');
}

console.log(`\n  aim-style + player-speed: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
