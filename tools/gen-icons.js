// Generates the app icons from the in-game player head (faithful side view,
// eye right of center). Pixel coordinates are lifted directly from
// js/player.js `_drawStanding` so the icon matches the sprite.
//
//   node tools/gen-icons.js
//
// Outputs (repo root): icon.svg, icon-192.png, icon-512.png,
// icon-maskable-512.png, apple-touch-icon-180.png
// Requires the `sharp` devDependency.

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

// ── Palette (from player.js) ──────────────────────────────
const SKIN = '#F4C78A', HAIR = '#7D4E1A', EYEW = '#ffffff', PUP = '#1A50C0', MOUTH = '#9A4020';
const GROUND_OUTER = '#16181f', GROUND_PANEL = '#1e2130';

// The 16×16 head on a grid. `ox/oy` = top-left offset, `u` = pixel unit.
function headRects(ox, oy, u) {
  const r = (x, y, w, h, c) =>
    `<rect x="${ox + x * u}" y="${oy + y * u}" width="${w * u}" height="${h * u}" fill="${c}"/>`;
  return [
    r(0, 0, 16, 16, SKIN),   // face
    r(0, 0, 16, 5,  HAIR),   // hair top
    r(0, 5, 3,  3,  HAIR),   // sideburn (left)
    r(8, 6, 4,  4,  EYEW),   // eye white — right of center
    r(9, 7, 2,  2,  PUP),    // pupil
    r(6, 12, 2, 1,  MOUTH),  // mouth
    r(9, 12, 2, 1,  MOUTH),
  ].join('\n  ');
}

// Paneled icon (rounded ground + inner panel + head). bleed=true fills the
// square edge-to-edge (opaque, for Apple touch which rounds corners itself).
function panelSVG(S, { bleed = false, headFrac = 0.60 } = {}) {
  const region = S * headFrac, u = region / 16;
  const ox = (S - region) / 2, oy = (S - region) / 2;
  const m = S * 0.085;
  const outerRx = bleed ? 0 : S * 0.1875;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" shape-rendering="crispEdges">
  <rect width="${S}" height="${S}" rx="${outerRx}" fill="${GROUND_OUTER}"/>
  <rect x="${m}" y="${m}" width="${S - 2 * m}" height="${S - 2 * m}" rx="${S * 0.14}" fill="${GROUND_PANEL}"/>
  ${headRects(ox, oy, u)}
</svg>`;
}

// Maskable: full-bleed single ground colour, head kept in the safe zone so it
// survives an aggressive circle mask.
function maskableSVG(S, { headFrac = 0.54 } = {}) {
  const region = S * headFrac, u = region / 16;
  const ox = (S - region) / 2, oy = (S - region) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" shape-rendering="crispEdges">
  <rect width="${S}" height="${S}" fill="${GROUND_PANEL}"/>
  ${headRects(ox, oy, u)}
</svg>`;
}

async function png(svg, size, outName) {
  const out = path.join(ROOT, outName);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('wrote', outName, `(${size}×${size})`);
}

(async () => {
  // Master vector — favicon + manifest SVG entry.
  const master = panelSVG(512);
  fs.writeFileSync(path.join(ROOT, 'icon.svg'), master + '\n');
  console.log('wrote icon.svg');

  await png(master,            192, 'icon-192.png');
  await png(master,            512, 'icon-512.png');
  await png(maskableSVG(512),  512, 'icon-maskable-512.png');
  await png(panelSVG(180, { bleed: true }), 180, 'apple-touch-icon-180.png');

  console.log('done.');
})();
