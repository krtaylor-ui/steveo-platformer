// ============================================================
// crafting.js — Tool data, crafting recipes, and crafting menu
// ============================================================

// `type` routes a crafted tool to its hotbar slot (sword→melee slot 0,
// bow→ranged slot 1, pickaxe→always-on mining). `weaponClass` (Smart Mobs §2)
// selects the WEAPON_TRAITS behaviour set — so a Spear/Axe/Trident ride the
// existing melee-slot plumbing while behaving differently, and a Crossbow rides
// the bow slot but pierces. Weapons with no weaponClass default to sword/bow.
const TOOL_DATA = {
  WOODEN_PICKAXE:    { name: 'Wooden Pickaxe',   type: 'pickaxe', tier: 0, damage: 1,  mineSpeed: 1.0, color: '#C8A55A' },
  WOODEN_SWORD:      { name: 'Wooden Sword',      type: 'sword',   weaponClass: 'sword', tier: 0, damage: 2,  mineSpeed: 0,   color: '#C8A55A' },
  STONE_PICKAXE:     { name: 'Stone Pickaxe',     type: 'pickaxe', tier: 1, damage: 2,  mineSpeed: 1.8, color: '#8A8A8A' },
  STONE_SWORD:       { name: 'Stone Sword',       type: 'sword',   weaponClass: 'sword', tier: 1, damage: 4,  mineSpeed: 0,   color: '#8A8A8A' },
  IRON_PICKAXE:      { name: 'Iron Pickaxe',      type: 'pickaxe', tier: 2, damage: 3,  mineSpeed: 3.2, color: '#D0D0D0' },
  IRON_SWORD:        { name: 'Iron Sword',        type: 'sword',   weaponClass: 'sword', tier: 2, damage: 6,  mineSpeed: 0,   color: '#D0D0D0' },
  DIAMOND_PICKAXE:   { name: 'Diamond Pickaxe',   type: 'pickaxe', tier: 3, damage: 4,  mineSpeed: 5.5, color: '#44DDFF' },
  DIAMOND_SWORD:     { name: 'Diamond Sword',     type: 'sword',   weaponClass: 'sword', tier: 3, damage: 8,  mineSpeed: 0,   color: '#44DDFF' },
  NETHERITE_PICKAXE: { name: 'Netherite Pickaxe', type: 'pickaxe', tier: 4, damage: 5,  mineSpeed: 8.0, color: '#A09070' },
  NETHERITE_SWORD:   { name: 'Netherite Sword',   type: 'sword',   weaponClass: 'sword', tier: 4, damage: 10, mineSpeed: 0,   color: '#A09070' },
  // ── Spear (multi-hit thrust; lower damage, longer narrow reach) ──
  WOODEN_SPEAR:      { name: 'Wooden Spear',      type: 'sword', weaponClass: 'spear', tier: 0, damage: 2,  mineSpeed: 0, color: '#B89050' },
  STONE_SPEAR:       { name: 'Stone Spear',       type: 'sword', weaponClass: 'spear', tier: 1, damage: 4,  mineSpeed: 0, color: '#7E7E7E' },
  IRON_SPEAR:        { name: 'Iron Spear',        type: 'sword', weaponClass: 'spear', tier: 2, damage: 6,  mineSpeed: 0, color: '#C4C4C4' },
  DIAMOND_SPEAR:     { name: 'Diamond Spear',     type: 'sword', weaponClass: 'spear', tier: 3, damage: 8,  mineSpeed: 0, color: '#3FD0F0' },
  NETHERITE_SPEAR:   { name: 'Netherite Spear',   type: 'sword', weaponClass: 'spear', tier: 4, damage: 10, mineSpeed: 0, color: '#948668' },
  // ── Axe (heavy single-target; big knockback, slow swing) ──
  WOODEN_AXE:        { name: 'Wooden Axe',        type: 'sword', weaponClass: 'axe', tier: 0, damage: 2,  mineSpeed: 0, color: '#C89A4A' },
  STONE_AXE:         { name: 'Stone Axe',         type: 'sword', weaponClass: 'axe', tier: 1, damage: 4,  mineSpeed: 0, color: '#8A8A8A' },
  IRON_AXE:          { name: 'Iron Axe',          type: 'sword', weaponClass: 'axe', tier: 2, damage: 6,  mineSpeed: 0, color: '#D0D0D0' },
  DIAMOND_AXE:       { name: 'Diamond Axe',       type: 'sword', weaponClass: 'axe', tier: 3, damage: 8,  mineSpeed: 0, color: '#44DDFF' },
  NETHERITE_AXE:     { name: 'Netherite Axe',     type: 'sword', weaponClass: 'axe', tier: 4, damage: 10, mineSpeed: 0, color: '#A09070' },
  // ── Trident (throwable + melee thrust; recoverable) ──
  TRIDENT:           { name: 'Trident',           type: 'sword', weaponClass: 'trident', tier: 2, damage: 7, mineSpeed: 0, color: '#3FB8C0' },
  // ── Boomerang (§Phase 3 — dual-mode melee + auto-returning throw; opt-in per world) ──
  BOOMERANG:         { name: 'Boomerang',         type: 'sword', weaponClass: 'boomerang', tier: 2, damage: 7, mineSpeed: 0, color: '#C98A3A' },
  // ── Grappling Hook (§Phase 5 — fires a cable, swing/climb). A COLLECTED CAPABILITY like the
  //    pickaxe / flint & steel (type 'grapple' → player.hasGrapple), NOT a hotbar weapon slot;
  //    fired with SHIFT+RIGHT-CLICK once collected. ──
  GRAPPLING_HOOK:    { name: 'Grappling Hook',    type: 'grapple', weaponClass: 'grapple', tier: 0, damage: 0, mineSpeed: 0, color: '#9a7b4f' },
  BOW:               { name: 'Bow',               type: 'bow',   weaponClass: 'bow',      tier: 0, damage: PLAYER_ARROW_DAMAGE, mineSpeed: 0, color: '#C8A55A' },
  // ── Crossbow (piercing arrows; +damage) ──
  CROSSBOW:          { name: 'Crossbow',          type: 'bow',   weaponClass: 'crossbow', tier: 0, damage: PLAYER_ARROW_DAMAGE, mineSpeed: 0, color: '#9A7B4F' },
  SHIELD:            { name: 'Shield',            type: 'shield',      tier: 0, damage: 0,                  mineSpeed: 0, color: '#6B9DB8' },
  FLINT_AND_STEEL:   { name: 'Flint & Steel',     type: 'flint_steel', tier: 0, damage: 0,                  mineSpeed: 0, color: '#CC8833' },
};

// Emoji icon per weapon CLASS (Smart Mobs §2) so spear/axe/trident/crossbow read
// distinctly in the hotbar, sandbox palette and drops — not all as swords.
// (No true crossbow emoji exists; 🎯 stands in — a drawn sprite is a follow-up.)
const WEAPON_CLASS_ICON = { sword: '⚔', spear: '🗡', axe: '🪓', trident: '🔱', boomerang: '🪃', bow: '🏹', crossbow: '🎯', grapple: '🪝' };
// Icon for a TOOL_DATA entry (or palette item) by weapon class, falling back to type.
function weaponIconFor(d) {
  if (!d) return '⚔';
  const cls = d.weaponClass || d.type;
  return WEAPON_CLASS_ICON[cls] || (d.type === 'pickaxe' ? '⛏' : d.type === 'flint_steel' ? '🔥' : d.type === 'shield' ? '🛡' : '⚔');
}

// Draw a weapon icon centred at (cx,cy) in a `size` box, tinted by `color`
// (Smart Mobs §2). These REPLICATE THE HELD-SPRITE shapes exactly (same drawing
// commands as player.js _drawSwordHead/_drawSpearHead/_drawAxeHead/_drawTridentHead
// and _drawBow/_drawCrossbow), just centred + scaled — so the hotbar/palette icon
// matches what the character holds. Returns true if drawn, false to fall back to
// an emoji glyph (armour / non-weapons).
function drawWeaponIcon(ctx, cls, cx, cy, size, color) {
  const metal = color || '#CCCCCC';
  ctx.save();
  ctx.translate(cx, cy);
  if (cls === 'sword' || cls === 'spear' || cls === 'axe' || cls === 'trident') {
    // Melee heads draw "blade up from the grip at origin"; scale to fit + shift
    // down so the head centres in the box.
    ctx.scale(size / 46, size / 46);
    ctx.translate(0, 9);
    if (cls === 'sword') {
      ctx.fillStyle = '#5A3A10'; ctx.fillRect(-2, 0, 4, 8);
      ctx.fillStyle = '#8B5C1A'; ctx.fillRect(-1, 2, 2, 6);
      ctx.fillStyle = '#C8A55A'; ctx.fillRect(-6, -2, 12, 4);
      ctx.fillStyle = '#A07830'; ctx.fillRect(-6, -2, 3, 4); ctx.fillRect(3, -2, 3, 4);
      ctx.fillStyle = '#CCCCCC'; ctx.fillRect(-2, -18, 4, 17);
      ctx.fillStyle = '#EEEEEE'; ctx.fillRect(-1, -18, 2, 17);
      ctx.fillStyle = '#AAAAAA'; ctx.fillRect(-1, -21, 2, 4);
    } else if (cls === 'spear') {
      ctx.fillStyle = '#6B4A1A'; ctx.fillRect(-1, -4, 2, 12);
      ctx.fillStyle = '#7A5520'; ctx.fillRect(-1, -22, 2, 18);
      ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(0, -31); ctx.lineTo(-3, -22); ctx.lineTo(3, -22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#EEEEEE'; ctx.fillRect(-1, -28, 1, 6);
    } else if (cls === 'axe') {
      ctx.fillStyle = '#6B4A1A'; ctx.fillRect(-1.5, -14, 3, 22);
      ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(1, -16); ctx.lineTo(11, -18); ctx.lineTo(12, -7); ctx.lineTo(1, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#EEEEEE'; ctx.fillRect(1, -16, 2, 11);
    } else { // trident
      ctx.fillStyle = '#5A6B20'; ctx.fillRect(-1, -6, 2, 14);
      ctx.fillStyle = metal;
      ctx.fillRect(-1, -24, 2, 18); ctx.fillRect(-6, -24, 2, 11); ctx.fillRect(4, -24, 2, 11); ctx.fillRect(-6, -14, 12, 2);
      ctx.fillStyle = '#EAFFFF'; ctx.fillRect(-1, -24, 1, 10);
    }
  } else if (cls === 'bow') {
    ctx.scale(size / 34, size / 34); ctx.translate(3, 0);
    ctx.strokeStyle = '#8B5C1A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(-8, 0, 0, 14); ctx.stroke();
    ctx.strokeStyle = '#DDDDDD'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-1, 0); ctx.lineTo(0, 14); ctx.stroke();
  } else if (cls === 'crossbow') {
    ctx.scale(size / 30, size / 30); ctx.translate(-5, 0);
    ctx.fillStyle = '#7A5520'; ctx.fillRect(-6, -1.5, 20, 3);
    ctx.strokeStyle = '#9A9A9A'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(11, -8); ctx.lineTo(16, 0); ctx.lineTo(11, 8); ctx.stroke();
    ctx.strokeStyle = '#DDDDDD'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(11, -8); ctx.lineTo(6, 0); ctx.lineTo(11, 8); ctx.stroke();
    ctx.fillStyle = '#5A3A10'; ctx.fillRect(-4, 1, 3, 6);
  } else if (cls === 'pickaxe') {
    ctx.scale(size / 34, size / 34); ctx.translate(0, 8);
    ctx.fillStyle = '#8B5C1A'; ctx.fillRect(-1, -12, 2, 18);
    ctx.fillStyle = '#C8A55A'; ctx.fillRect(-8, -15, 16, 5);
    ctx.fillStyle = '#A07830'; ctx.fillRect(-8, -15, 3, 8); ctx.fillRect(5, -15, 3, 8);
  } else { ctx.restore(); return false; }
  ctx.restore();
  return true;
}

// Draw a pixel-art armour icon (helmet/chestplate/leggings/boots) centred at
// (cx,cy) in a `size` box, tinted by `color` (Smart Mobs §2). Returns true if
// drawn, false to fall back to an emoji glyph.
function drawArmorIcon(ctx, piece, cx, cy, size, color) {
  const c = color || '#B0B4BC';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 32, size / 32);
  ctx.fillStyle = c; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  if (piece === 'head') {                                   // helmet: dome + brim + visor
    ctx.beginPath(); ctx.arc(0, -1, 9, Math.PI, 0); ctx.lineTo(9, 4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(-9, 4, 18, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-4, -3, 8, 5);
  } else if (piece === 'chest') {                           // chestplate: shoulders + torso
    ctx.beginPath();
    ctx.moveTo(-11, -8); ctx.lineTo(11, -8); ctx.lineTo(11, -3); ctx.lineTo(6, -1);
    ctx.lineTo(7, 9); ctx.lineTo(-7, 9); ctx.lineTo(-6, -1); ctx.lineTo(-11, -3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 9); ctx.stroke();
  } else if (piece === 'legs') {                            // leggings: waist + two legs
    ctx.fillRect(-8, -9, 16, 5); ctx.strokeRect(-8, -9, 16, 5);
    ctx.fillRect(-8, -4, 6, 13); ctx.strokeRect(-8, -4, 6, 13);
    ctx.fillRect(2, -4, 6, 13);  ctx.strokeRect(2, -4, 6, 13);
  } else if (piece === 'feet') {                            // boots: two L-shaped boots
    for (const dx of [-8, 2]) {
      ctx.beginPath();
      ctx.moveTo(dx, -4); ctx.lineTo(dx + 6, -4); ctx.lineTo(dx + 6, 4);
      ctx.lineTo(dx + 9, 4); ctx.lineTo(dx + 9, 9); ctx.lineTo(dx, 9); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  } else { ctx.restore(); return false; }
  ctx.restore();
  return true;
}

const ARMOR_DATA = {
  WOOD_HELMET:          { name: 'Wood Helmet',          tier: 0, piece: 'head',  protection: 0.5, color: '#C8A55A', unlockOre: null },
  WOOD_CHESTPLATE:      { name: 'Wood Chestplate',      tier: 0, piece: 'chest', protection: 0.5, color: '#C8A55A', unlockOre: null },
  WOOD_LEGGINGS:        { name: 'Wood Leggings',        tier: 0, piece: 'legs',  protection: 0.5, color: '#C8A55A', unlockOre: null },
  WOOD_BOOTS:           { name: 'Wood Boots',           tier: 0, piece: 'feet',  protection: 0.5, color: '#C8A55A', unlockOre: null },
  IRON_HELMET:          { name: 'Iron Helmet',          tier: 1, piece: 'head',  protection: 1,   color: '#C8C8C8', unlockOre: BLOCK.IRON_ORE },
  IRON_CHESTPLATE:      { name: 'Iron Chestplate',      tier: 1, piece: 'chest', protection: 1,   color: '#C8C8C8', unlockOre: BLOCK.IRON_ORE },
  IRON_LEGGINGS:        { name: 'Iron Leggings',        tier: 1, piece: 'legs',  protection: 1,   color: '#C8C8C8', unlockOre: BLOCK.IRON_ORE },
  IRON_BOOTS:           { name: 'Iron Boots',           tier: 1, piece: 'feet',  protection: 1,   color: '#C8C8C8', unlockOre: BLOCK.IRON_ORE },
  DIAMOND_HELMET:       { name: 'Diamond Helmet',       tier: 2, piece: 'head',  protection: 2,   color: '#44DDFF', unlockOre: BLOCK.DIAMOND_ORE },
  DIAMOND_CHESTPLATE:   { name: 'Diamond Chestplate',   tier: 2, piece: 'chest', protection: 2,   color: '#44DDFF', unlockOre: BLOCK.DIAMOND_ORE },
  DIAMOND_LEGGINGS:     { name: 'Diamond Leggings',     tier: 2, piece: 'legs',  protection: 2,   color: '#44DDFF', unlockOre: BLOCK.DIAMOND_ORE },
  DIAMOND_BOOTS:        { name: 'Diamond Boots',        tier: 2, piece: 'feet',  protection: 2,   color: '#44DDFF', unlockOre: BLOCK.DIAMOND_ORE },
  NETHERITE_HELMET:     { name: 'Netherite Helmet',     tier: 3, piece: 'head',  protection: 4,   color: '#6A5A50', unlockOre: BLOCK.NETHERITE_ORE },
  NETHERITE_CHESTPLATE: { name: 'Netherite Chestplate', tier: 3, piece: 'chest', protection: 4,   color: '#6A5A50', unlockOre: BLOCK.NETHERITE_ORE },
  NETHERITE_LEGGINGS:   { name: 'Netherite Leggings',   tier: 3, piece: 'legs',  protection: 4,   color: '#6A5A50', unlockOre: BLOCK.NETHERITE_ORE },
  NETHERITE_BOOTS:      { name: 'Netherite Boots',      tier: 3, piece: 'feet',  protection: 4,   color: '#6A5A50', unlockOre: BLOCK.NETHERITE_ORE },
};

// unlockOre: null = always visible; a BLOCK id = visible after first mining that ore
const RECIPES = [
  {
    id: 'stone_pickaxe', result: 'STONE_PICKAXE', unlockOre: null,
    materials: [
      { block: BLOCK.STONE,   count: 3, label: 'Stone'   },
      { block: BLOCK.OAK_LOG, count: 2, label: 'Oak Log' },
    ],
  },
  {
    id: 'stone_sword', result: 'STONE_SWORD', unlockOre: null,
    materials: [
      { block: BLOCK.STONE,   count: 2, label: 'Stone'   },
      { block: BLOCK.OAK_LOG, count: 1, label: 'Oak Log' },
    ],
  },
  {
    id: 'iron_pickaxe', result: 'IRON_PICKAXE', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.IRON_ORE, count: 3, label: 'Iron Ore' },
      { block: BLOCK.OAK_LOG,  count: 2, label: 'Oak Log'  },
      { block: BLOCK.COAL_ORE, count: 3, label: 'Coal Ore' },
    ],
  },
  {
    id: 'iron_sword', result: 'IRON_SWORD', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.IRON_ORE, count: 2, label: 'Iron Ore' },
      { block: BLOCK.OAK_LOG,  count: 1, label: 'Oak Log'  },
      { block: BLOCK.COAL_ORE, count: 2, label: 'Coal Ore' },
    ],
  },
  {
    id: 'diamond_pickaxe', result: 'DIAMOND_PICKAXE', unlockOre: BLOCK.DIAMOND_ORE,
    materials: [
      { block: BLOCK.DIAMOND_ORE, count: 3, label: 'Diamond Ore' },
      { block: BLOCK.OAK_LOG,     count: 2, label: 'Oak Log'     },
    ],
  },
  {
    id: 'diamond_sword', result: 'DIAMOND_SWORD', unlockOre: BLOCK.DIAMOND_ORE,
    materials: [
      { block: BLOCK.DIAMOND_ORE, count: 2, label: 'Diamond Ore' },
      { block: BLOCK.OAK_LOG,     count: 1, label: 'Oak Log'     },
    ],
  },
  {
    id: 'netherite_pickaxe', result: 'NETHERITE_PICKAXE', unlockOre: BLOCK.NETHERITE_ORE,
    materials: [
      { block: BLOCK.NETHERITE_ORE, count: 3, label: 'Netherite' },
      { block: BLOCK.OAK_LOG,       count: 2, label: 'Oak Log'   },
      { block: BLOCK.GOLD_ORE,      count: 3, label: 'Gold Ore'  },
    ],
  },
  {
    id: 'netherite_sword', result: 'NETHERITE_SWORD', unlockOre: BLOCK.NETHERITE_ORE,
    materials: [
      { block: BLOCK.NETHERITE_ORE, count: 2, label: 'Netherite' },
      { block: BLOCK.OAK_LOG,       count: 1, label: 'Oak Log'   },
      { block: BLOCK.GOLD_ORE,      count: 2, label: 'Gold Ore'  },
    ],
  },
  {
    id: 'bow', result: 'BOW', unlockOre: null,
    materials: [
      { block: BLOCK.OAK_LOG, count: 3, label: 'Oak Log' },
      { block: BLOCK.STRING,  count: 3, label: 'String'  },
    ],
  },
  // ── New weapons (Smart Mobs §2). Only Swords tier-up (cleave scales by tier);
  //    Spear/Axe/Trident/Crossbow are single-acquisition here. A per-world
  //    "Starting Weapon" selector (World Settings → Combat) also equips them
  //    directly, so they're testable in Sandbox without crafting. ──
  {
    id: 'spear', result: 'IRON_SPEAR', unlockOre: null,
    materials: [
      { block: BLOCK.OAK_LOG,  count: 2, label: 'Oak Log'  },
      { block: BLOCK.IRON_ORE, count: 1, label: 'Iron Ore' },
    ],
  },
  {
    id: 'axe', result: 'IRON_AXE', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.IRON_ORE, count: 3, label: 'Iron Ore' },
      { block: BLOCK.OAK_LOG,  count: 2, label: 'Oak Log'  },
    ],
  },
  {
    id: 'crossbow', result: 'CROSSBOW', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.OAK_LOG,  count: 3, label: 'Oak Log'  },
      { block: BLOCK.STRING,   count: 2, label: 'String'   },
      { block: BLOCK.IRON_ORE, count: 1, label: 'Iron Ore' },
    ],
  },
  {
    id: 'trident', result: 'TRIDENT', unlockOre: BLOCK.DIAMOND_ORE,
    materials: [
      { block: BLOCK.DIAMOND_ORE, count: 2, label: 'Diamond Ore' },
      { block: BLOCK.OAK_LOG,     count: 2, label: 'Oak Log'     },
    ],
  },
  {
    id: 'shield', result: 'SHIELD', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.OAK_PLANKS, count: 3, label: 'Oak Planks' },
      { block: BLOCK.IRON_ORE,   count: 1, label: 'Iron Ore'   },
    ],
  },
  {
    id: 'flint_and_steel', result: 'FLINT_AND_STEEL', unlockOre: BLOCK.IRON_ORE,
    materials: [
      { block: BLOCK.GRAVEL,   count: 1, label: 'Gravel'   },
      { block: BLOCK.IRON_ORE, count: 1, label: 'Iron Ore' },
    ],
  },
  // ── Wood Armor ───────────────────────────────────────────────
  { id: 'wood_helmet',          result: 'WOOD_HELMET',          unlockOre: null,                isArmor: true,
    materials: [{ block: BLOCK.OAK_LOG, count: 5, label: 'Oak Log' }] },
  { id: 'wood_chestplate',      result: 'WOOD_CHESTPLATE',      unlockOre: null,                isArmor: true,
    materials: [{ block: BLOCK.OAK_LOG, count: 8, label: 'Oak Log' }] },
  { id: 'wood_leggings',        result: 'WOOD_LEGGINGS',        unlockOre: null,                isArmor: true,
    materials: [{ block: BLOCK.OAK_LOG, count: 7, label: 'Oak Log' }] },
  { id: 'wood_boots',           result: 'WOOD_BOOTS',           unlockOre: null,                isArmor: true,
    materials: [{ block: BLOCK.OAK_LOG, count: 4, label: 'Oak Log' }] },
  // ── Iron Armor ───────────────────────────────────────────────
  { id: 'iron_helmet',          result: 'IRON_HELMET',          unlockOre: BLOCK.IRON_ORE,      isArmor: true,
    materials: [{ block: BLOCK.IRON_ORE, count: 5, label: 'Iron Ore' }, { block: BLOCK.COAL_ORE, count: 5, label: 'Coal Ore' }] },
  { id: 'iron_chestplate',      result: 'IRON_CHESTPLATE',      unlockOre: BLOCK.IRON_ORE,      isArmor: true,
    materials: [{ block: BLOCK.IRON_ORE, count: 8, label: 'Iron Ore' }, { block: BLOCK.COAL_ORE, count: 8, label: 'Coal Ore' }] },
  { id: 'iron_leggings',        result: 'IRON_LEGGINGS',        unlockOre: BLOCK.IRON_ORE,      isArmor: true,
    materials: [{ block: BLOCK.IRON_ORE, count: 7, label: 'Iron Ore' }, { block: BLOCK.COAL_ORE, count: 7, label: 'Coal Ore' }] },
  { id: 'iron_boots',           result: 'IRON_BOOTS',           unlockOre: BLOCK.IRON_ORE,      isArmor: true,
    materials: [{ block: BLOCK.IRON_ORE, count: 4, label: 'Iron Ore' }, { block: BLOCK.COAL_ORE, count: 4, label: 'Coal Ore' }] },
  // ── Diamond Armor ────────────────────────────────────────────
  { id: 'diamond_helmet',       result: 'DIAMOND_HELMET',       unlockOre: BLOCK.DIAMOND_ORE,   isArmor: true,
    materials: [{ block: BLOCK.DIAMOND_ORE, count: 5, label: 'Diamond Ore' }] },
  { id: 'diamond_chestplate',   result: 'DIAMOND_CHESTPLATE',   unlockOre: BLOCK.DIAMOND_ORE,   isArmor: true,
    materials: [{ block: BLOCK.DIAMOND_ORE, count: 8, label: 'Diamond Ore' }] },
  { id: 'diamond_leggings',     result: 'DIAMOND_LEGGINGS',     unlockOre: BLOCK.DIAMOND_ORE,   isArmor: true,
    materials: [{ block: BLOCK.DIAMOND_ORE, count: 7, label: 'Diamond Ore' }] },
  { id: 'diamond_boots',        result: 'DIAMOND_BOOTS',        unlockOre: BLOCK.DIAMOND_ORE,   isArmor: true,
    materials: [{ block: BLOCK.DIAMOND_ORE, count: 4, label: 'Diamond Ore' }] },
  // ── Netherite Armor ──────────────────────────────────────────
  { id: 'netherite_helmet',     result: 'NETHERITE_HELMET',     unlockOre: BLOCK.NETHERITE_ORE, isArmor: true,
    materials: [{ block: BLOCK.NETHERITE_ORE, count: 5, label: 'Netherite' }, { block: BLOCK.GOLD_ORE, count: 5, label: 'Gold Ore' }] },
  { id: 'netherite_chestplate', result: 'NETHERITE_CHESTPLATE', unlockOre: BLOCK.NETHERITE_ORE, isArmor: true,
    materials: [{ block: BLOCK.NETHERITE_ORE, count: 8, label: 'Netherite' }, { block: BLOCK.GOLD_ORE, count: 8, label: 'Gold Ore' }] },
  { id: 'netherite_leggings',   result: 'NETHERITE_LEGGINGS',   unlockOre: BLOCK.NETHERITE_ORE, isArmor: true,
    materials: [{ block: BLOCK.NETHERITE_ORE, count: 7, label: 'Netherite' }, { block: BLOCK.GOLD_ORE, count: 7, label: 'Gold Ore' }] },
  { id: 'netherite_boots',      result: 'NETHERITE_BOOTS',      unlockOre: BLOCK.NETHERITE_ORE, isArmor: true,
    materials: [{ block: BLOCK.NETHERITE_ORE, count: 4, label: 'Netherite' }, { block: BLOCK.GOLD_ORE, count: 4, label: 'Gold Ore' }] },
  // ── End Items ────────────────────────────────────────────────
  {
    id: 'arrows', result: 'ARROWS', isBlockItem: true, resultBlock: BLOCK.ARROW, resultCount: 4,
    displayName: 'Arrow ×4', displayColor: '#A07840', displayIcon: '→',
    unlockOre: null,
    materials: [
      { block: BLOCK.OAK_LOG, count: 1, label: 'Oak Log' },
      { block: BLOCK.STONE,   count: 1, label: 'Stone'   },
    ],
  },
  {
    id: 'eye_of_ender', result: 'EYE_OF_ENDER', isBlockItem: true, resultBlock: BLOCK.EYE_OF_ENDER,
    displayName: 'Eye of Ender', displayColor: '#1A5A2A', displayIcon: '👁',
    unlockOre: BLOCK.BLAZE_ROD,
    materials: [
      { block: BLOCK.BLAZE_ROD,    count: 1, label: 'Blaze Rod'    },
      { block: BLOCK.ENDER_PEARL,  count: 1, label: 'Ender Pearl'  },
    ],
  },
  {
    id: 'respawn_anchor', result: 'RESPAWN_ANCHOR', isBlockItem: true, resultBlock: BLOCK.RESPAWN_ANCHOR,
    displayName: 'Respawn Anchor', displayColor: '#8833CC', displayIcon: '⚓',
    unlockOre: BLOCK.GLOWSTONE,
    materials: [
      { block: BLOCK.OBSIDIAN,  count: 4, label: 'Obsidian'  },
      { block: BLOCK.GLOWSTONE, count: 4, label: 'Glowstone' },
    ],
  },
];

// ── Crafting Menu ────────────────────────────────────────────

class CraftingMenu {
  constructor() {
    this.open        = false;
    this.selected    = 0;
    this._scrollStart = 0; // tracks scroll offset for draw

    // One-shot key state tracking
    this._eWasDown     = false;
    this._escWasDown   = false;
    this._upWasDown    = false;
    this._downWasDown  = false;
    this._enterWasDown = false;
  }

  // Layout constants (shared between update and draw)
  _layout() {
    const menuW = 580, menuH = 380;
    const menuX = (CANVAS_W - menuW) / 2;
    const menuY = (CANVAS_H - menuH) / 2;
    const listX = menuX + 16;
    const listY = menuY + 46;
    const rowH  = 62;
    const maxShow = Math.floor((menuH - 70) / rowH);
    // Arrow button areas
    const arrowX  = menuX + menuW - 36;
    const upArrowY   = listY;
    const downArrowY = listY + maxShow * rowH - 20;
    return { menuW, menuH, menuX, menuY, listX, listY, rowH, maxShow, arrowX, upArrowY, downArrowY };
  }

  getVisible(player) {
    return RECIPES.filter(r => r.unlockOre === null || player.discoveredOres.has(r.unlockOre));
  }

  // Returns result key string if a tool was just crafted, else null
  update(input, player) {
    const eDown     = input.isDown('KeyE');
    const escDown   = input.isDown('Escape');
    const upDown    = input.isDown('ArrowUp')   || input.isDown('KeyW');
    const downDown  = input.isDown('ArrowDown') || input.isDown('KeyS');
    const enterDown = input.isDown('Enter')     || input.isDown('Space');

    // Toggle open / close
    if (eDown && !this._eWasDown) {
      this.open     = !this.open;
      this.selected = 0;
    }
    if (escDown && !this._escWasDown && this.open) {
      this.open = false;
    }

    this._eWasDown   = eDown;
    this._escWasDown = escDown;

    if (!this.open) {
      this._upWasDown    = upDown;
      this._downWasDown  = downDown;
      this._enterWasDown = enterDown;
      return null;
    }

    const visible = this.getVisible(player);
    const L = this._layout();

    // Clamp selection
    if (visible.length > 0) {
      this.selected = Math.min(this.selected, visible.length - 1);
    }

    // Navigate with keyboard
    if (upDown && !this._upWasDown && visible.length > 0) {
      this.selected = (this.selected - 1 + visible.length) % visible.length;
    }
    if (downDown && !this._downWasDown && visible.length > 0) {
      this.selected = (this.selected + 1) % visible.length;
    }
    this._upWasDown   = upDown;
    this._downWasDown = downDown;

    // Scroll wheel navigation
    if (input.scrollDelta !== 0 && visible.length > 0) {
      this.selected = (this.selected + input.scrollDelta + visible.length) % visible.length;
    }

    // Recompute scroll offset
    this._scrollStart = Math.max(0, Math.min(
      this.selected - Math.floor(L.maxShow / 2),
      Math.max(0, visible.length - L.maxShow)
    ));

    // Mouse click: select row or craft if already selected
    let crafted = null;
    if (input.mouse.clicked) {
      const mx = input.mouse.x, my = input.mouse.y;
      // X close button
      const { menuX, menuW, menuY } = L;
      if (mx >= menuX + menuW - 26 && mx <= menuX + menuW - 6 &&
          my >= menuY + 6 && my <= menuY + 26) {
        this.open = false;
        this._escWasDown = true;
        return null;
      }
    }
    if (input.mouse.clicked && visible.length > 0) {
      const mx = input.mouse.x, my = input.mouse.y;
      // Check ▲ / ▼ arrow buttons
      if (mx >= L.arrowX && mx <= L.arrowX + 20) {
        if (my >= L.upArrowY && my <= L.upArrowY + 20) {
          this.selected = (this.selected - 1 + visible.length) % visible.length;
        } else if (my >= L.downArrowY && my <= L.downArrowY + 20) {
          this.selected = (this.selected + 1) % visible.length;
        }
      } else {
        // Check recipe rows
        for (let i = this._scrollStart; i < Math.min(visible.length, this._scrollStart + L.maxShow); i++) {
          const ry = L.listY + (i - this._scrollStart) * L.rowH;
          if (mx >= L.listX && mx <= L.listX + L.menuW - 32 &&
              my >= ry && my < ry + L.rowH - 4) {
            if (i === this.selected) {
              // Second click on selected = craft
              const recipe = visible[i];
              if (recipe && player.hasMaterials(recipe)) {
                player.craftTool(recipe);
                crafted = recipe.result;
              }
            } else {
              this.selected = i;
            }
            break;
          }
        }
      }
    }

    // Keyboard craft
    if (crafted === null && enterDown && !this._enterWasDown && visible.length > 0) {
      const recipe = visible[this.selected];
      if (recipe && player.hasMaterials(recipe)) {
        player.craftTool(recipe);
        crafted = recipe.result;
      }
    }
    this._enterWasDown = enterDown;

    return crafted;
  }

  draw(ctx, player, input) {
    if (!this.open) return;

    const visible = this.getVisible(player);
    const L       = this._layout();
    const { menuW, menuH, menuX, menuY } = L;
    const mx = input ? input.mouse.x : -1;
    const my = input ? input.mouse.y : -1;

    // Dark screen overlay
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel background
    ctx.fillStyle = '#1A1A2E';
    _roundRect(ctx, menuX, menuY, menuW, menuH, 10);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 2;
    _roundRect(ctx, menuX, menuY, menuW, menuH, 10);
    ctx.stroke();

    // Title
    ctx.fillStyle    = '#FFD700';
    ctx.font         = 'bold 16px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('CRAFTING TABLE', CANVAS_W / 2, menuY + 14);

    // X close button
    const _cbx = menuX + menuW - 26, _cby = menuY + 6;
    const _cbHov = mx >= _cbx && mx <= _cbx + 20 && my >= _cby && my <= _cby + 20;
    ctx.fillStyle   = _cbHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, _cbx, _cby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = _cbHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, _cbx, _cby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle    = _cbHov ? '#fff' : '#AA7777';
    ctx.font         = 'bold 12px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', _cbx + 10, _cby + 10);

    // Divider
    ctx.fillStyle = '#333';
    ctx.fillRect(menuX + 16, menuY + 36, menuW - 32, 1);

    if (visible.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font      = '12px Courier New';
      ctx.fillText('Mine ores to unlock recipes!', CANVAS_W / 2, menuY + menuH / 2 - 6);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const { listX, listY, rowH, maxShow, arrowX, upArrowY, downArrowY } = L;
    const scrollStart = this._scrollStart;
    const scrollEnd   = Math.min(visible.length, scrollStart + maxShow);

    for (let i = scrollStart; i < scrollEnd; i++) {
      const recipe   = visible[i];
      const data     = TOOL_DATA[recipe.result] || ARMOR_DATA[recipe.result];
      const ry       = listY + (i - scrollStart) * rowH;
      const selected = i === this.selected;
      const canCraft = player.hasMaterials(recipe);
      const hovered  = mx >= listX && mx <= listX + menuW - 32 && my >= ry && my < ry + rowH - 4;

      // Row highlight
      if (selected) {
        ctx.fillStyle = 'rgba(255,215,0,0.10)';
        _roundRect(ctx, listX, ry, menuW - 32, rowH - 4, 5);
        ctx.fill();
        ctx.strokeStyle = canCraft ? '#FFD700' : '#886600';
        ctx.lineWidth   = 1.5;
        _roundRect(ctx, listX, ry, menuW - 32, rowH - 4, 5);
        ctx.stroke();
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        _roundRect(ctx, listX, ry, menuW - 32, rowH - 4, 5);
        ctx.fill();
      }

      // Block-item recipes (arrows, eye of ender) — render the block sprite in the swatch
      if (recipe.isBlockItem) {
        ctx.fillStyle = recipe.displayColor || '#555555';
        ctx.fillRect(listX + 6, ry + 8, 36, 36);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
        ctx.strokeRect(listX + 6, ry + 8, 36, 36);
        ctx.save();
        const sc = 36 / BLOCK_SIZE;
        ctx.translate(listX + 6, ry + 8);
        ctx.scale(sc, sc);
        drawBlock(ctx, recipe.resultBlock, 0, 0, 0);
        ctx.restore();
        ctx.fillStyle    = canCraft ? '#FFFFFF' : '#888888';
        ctx.font         = 'bold 12px Courier New';
        ctx.textAlign    = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(recipe.displayName || recipe.result, listX + 52, ry + 6);
        ctx.fillStyle = '#AAAAAA'; ctx.font = '9px Courier New';
        ctx.fillText('Consumable item', listX + 52, ry + 22);
        let matX = listX + 52;
        for (const mat of recipe.materials) {
          const have = player.countItem(mat.block), enough = have >= mat.count;
          ctx.fillStyle = enough ? '#6CDB6C' : '#DD5555';
          ctx.font = '9px Courier New';
          ctx.fillText(`${mat.label}: ${have}/${mat.count}`, matX, ry + 36);
          matX += 112;
        }
        continue;
      }

      // Tool colour swatch with icon
      ctx.fillStyle = data.color;
      ctx.fillRect(listX + 6, ry + 8, 36, 36);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(listX + 6, ry + 8, 36, 36);
      ctx.fillStyle    = 'rgba(0,0,0,0.55)';
      ctx.font         = '18px serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const icon = data.piece === 'head' ? '⛑' : data.piece === 'chest' ? '🛡'
                 : data.piece === 'legs' ? 'L' : data.piece === 'feet' ? '👟'
                 : data.type === 'flint_steel' ? '🔥'
                 : data.type === 'shield' ? '🛡' : data.type === 'sword' ? '⚔' : data.type === 'bow' ? '🏹' : '⛏';
      ctx.fillText(icon, listX + 24, ry + 26);

      // Tool name
      ctx.fillStyle    = canCraft ? '#FFFFFF' : '#888888';
      ctx.font         = 'bold 12px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(data.name, listX + 52, ry + 6);

      // Stats line
      ctx.fillStyle = '#AAAAAA';
      ctx.font      = '9px Courier New';
      const stats = data.piece
        ? `PROT: ${data.protection}/piece  TIER: ${data.tier}  [${data.piece}]`
        : data.type === 'pickaxe'
          ? `DMG: ${data.damage}  SPEED: ${data.mineSpeed}×  TIER: ${data.tier}`
          : data.type === 'shield'
            ? 'Blocks projectiles while crouching  [no inventory slot]'
            : data.type === 'flint_steel'
              ? 'Activate a completed Nether Portal  [non-consumable]'
              : `DMG: ${data.damage}  TIER: ${data.tier}`;
      ctx.fillText(stats, listX + 52, ry + 22);

      // Materials
      let matX = listX + 52;
      for (const mat of recipe.materials) {
        const have   = player.countItem(mat.block);
        const enough = have >= mat.count;
        ctx.fillStyle = enough ? '#6CDB6C' : '#DD5555';
        ctx.font      = '9px Courier New';
        ctx.fillText(`${mat.label}: ${have}/${mat.count}`, matX, ry + 36);
        matX += 112;
      }
    }

    // ▲ / ▼ arrow buttons (only when list is scrollable)
    if (visible.length > maxShow) {
      const drawArrow = (ax, ay, label, active) => {
        const hov = mx >= ax && mx <= ax + 20 && my >= ay && my <= ay + 20;
        ctx.fillStyle = hov || active ? '#FFD700' : '#444455';
        _roundRect(ctx, ax, ay, 20, 20, 4);
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth   = 1;
        _roundRect(ctx, ax, ay, 20, 20, 4);
        ctx.stroke();
        ctx.fillStyle    = '#fff';
        ctx.font         = '12px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, ax + 10, ay + 10);
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      };
      drawArrow(arrowX, upArrowY,   '▲', scrollStart > 0);
      drawArrow(arrowX, downArrowY, '▼', scrollStart + maxShow < visible.length);

      ctx.fillStyle    = '#555';
      ctx.font         = '9px Courier New';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${this.selected + 1}/${visible.length}`, menuX + menuW - 18, menuY + menuH - 12);
      ctx.textAlign    = 'left';
    }

    // Footer hint
    ctx.fillStyle    = '#555';
    ctx.font         = '9px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('[W/↑↓/S / scroll] Navigate   [click] Select   [click again / Enter] Craft   [E/Esc] Close', CANVAS_W / 2, menuY + menuH - 4);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
