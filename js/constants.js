// ============================================================
// constants.js — Game-wide tunable constants
// ============================================================

// Single source of truth for the build version. BUMP THE BUILD NUMBER ON EVERY
// COMMIT so the in-game badge (dashboard header + menu + pause screen) identifies
// exactly which build is running. Shown via `.app-version` DOM badge + GAME_VERSION.
const GAME_VERSION = 'v3 build 319 (OVERHEAD — cube-SIDE shadows, trees shade, player-height elevation scale): SHADOWS now fill the whole block CUBE (the vertical stack of squares from footprint to the up-left top) as it sweeps, so a run reads as one solid shape instead of stepped top-face stamps (fixes the jagged edge). TREES (and any leaf canopy) now CAST shadows — the shadow pass no longer skips leaves, so trees shade the ground (they are terrain, so the shadow is cell-accurate). NEW: the world "Player height (levels)" setting now also SCALES the elevation visuals — a height-2 player makes each elevation level render at ½ height, height-3 at ⅓, etc. (elevOffset honours a shared _elevScale so terrain, entities, and shadows all agree). Plus a design spec for a TEMPLATE / building-skin creator (TEMPLATE_CREATOR_SPEC.md) — a "template mode" in the world editor to author reusable multi-cell models (trees/houses) + building skins whose shadows come from their cells, not a bounding box. Original 318 note follows. — v3 build 318 (OVERHEAD — cube shadows + glass glare): SHADOWS reworked to project the whole BLOCK CUBE, not just one edge — each raised cell SWEEPS its footprint to a ground-projection in the light direction (displacement grows with height), so a tall block casts a longer, cube-shaped shadow. FIXED a shadow landing ON TOP of a block during the dawn/dusk fade: the erase pass now clears the full drawn cube of each block (footprint AND the up-left-shifted top face), so a cast shadow always falls on the ground beyond the block, never on it. NEW glass GLARE — a bright glint sweeps across each glass pane as the sun / moon crosses the sky (its position tracks the disc), stronger by DAY and when the disc rides high. Original 317 note follows. — v3 build 317 (SIDE-SCROLL — glass polish: melee + TNT shatter): the side-scroll GLASS block now completes its shatter set — a MELEE attack (a click on a nearby glass block) shatters it even in non-mining modes where you cannot mine (in Normal, mining still breaks it), and TNT / EXPLOSIONS now shatter glass into proper shards while honouring the "Glass Shatters" world setting (the blast radius skips glass so the game can add the shard FX; with shatter OFF, glass survives the blast — indestructible except mining). Original 316 note follows. — v3 build 316 (SIDE-SCROLL — glass block + shatter): NEW GLASS block (Mechanics palette tab) — a solid, see-through pane, minable in Normal like any block. A world setting "Glass Shatters" (default on) lets it SHATTER into shards (reusing the classic-block shatter FX) when hit by: an ARROW, a head-butt from below, a HARD fall onto it (a glass floor you crash through — a gentle landing keeps it solid), or an EXPLOSION. Off = indestructible except mining. This mirrors the overhead glass added in build 313. (Follow-up polish: a dedicated melee-swing shatter in non-mining modes + TNT shard FX.) Original 315 note follows. — v3 build 315 (OVERHEAD — hide-redstone-in-play + reveal fix): NEW world setting "Redstone wiring in play" — Always shown (default) / Reveal when active / Hidden. Hidden + Reveal hide the WIRING, LOGIC and passive sinks (dust, gates, lamp, piston) during play so a mechanism can stay concealed, while operable SOURCES (lever/button/plate/weight/lock) stay visible so the player can still find + use them; the editor + Test mode always show the wiring (ghosted when it would be hidden). "Reveal when active" shows a wire once it is (or has ever been) powered. BOTH engines: a wire/gate that is CURRENTLY powered now reveals even without a recorded transition — a puzzle that STARTS with an active signal (or a mid-play save) shows that live wire instead of hiding it. Original 314 note follows. — v3 build 314 (OVERHEAD — click-to-connect Tx picker + selected-at-top): wiring a receiver (lamp / piston / drawbridge) to its transmitters no longer means hunting a long checklist — a new "＋ Pick on map" button arms a CLICK-TO-CONNECT mode: every transmitter on the map shows a pulsing ring + its #N badge (green if already wired, blue if available), and clicking one TOGGLES it into the receiver rxIds (click again to disconnect); Esc / Enter reopens the config with the change applied. The checklist also now sorts SELECTED transmitters to the top and shows a "Listening to: Tx #…" summary so the current wiring is always clear. Original 313 note follows. — v3 build 313 (OVERHEAD — glass block + flat-overlay logic gates): NEW GLASS terrain — a solid, glossy, see-through pane (Terrain palette). A world setting "Glass can be shattered" (default on) lets a MELEE swing or a RANGED hit break a raised glass wall into a walkable gap, throwing jagged glass shards that scatter and fade (family-friendly). Glass is still a normal block otherwise (minable in Normal). LOGIC GATES (AND/NOT/NOR) now render as translucent OVERLAYS on the terrain (like dust) instead of opaque blocks, so they blend in / can be hidden rather than standing out as their own block; the blue/green input/output side-dots are unchanged. Original 312 note follows. — v3 build 312 (OVERHEAD — QA follow-ups: lock keys, lava migration, world dates): FIXED the Lock "Accepted keys" list always being empty — _keysOnMap did [].slice.call(aSet), but a Set is not array-like so it always returned [], meaning a lock could never be restricted to a key. It now uses Array.from and derives each keyId robustly (keys / jewels / passcard, and legacy items). FIXED legacy lava not migrating in the EDITOR: a pre-311 world normalises its settings on load, so the World Settings menu shows the true lava mode (Damage vs Death) and re-saving no longer silently drops it. Overhead worlds saved offline now stamp a created_at, so their Sandbox card shows a date and Newest-sort has something to order on. Original 311 note follows. — v3 build 311 (OVERHEAD — drawbridge polarity toggle, weight threshold, two-state lava): DRAWBRIDGE gained a per-bridge toggle in the bridge modal — "Rests DOWN, signal RAISES it to block" (classic castle) vs the default "rests raised, signal LOWERS it to cross" (puzzle gate) — so a designer chooses whether a bridge is safe or a challenge at rest. WEIGHT sensor threshold now defaults to 1 (a solo player triggers it out of the box; raise it for multi-entity puzzles). LAVA now has TWO states: DAMAGE (default — you take damage continuously while touching it, configurable amount) and DEATH (insta-kill on touch), chosen in World Settings; old lavaDeadly worlds migrate (true→death, false→damage). Original 310 note follows. — v3 build 310 (OVERHEAD — QA batch: sinks receive-only, click-coords, offline overhead list): SINKS (lamp/piston/receiver) are now RECEIVE-ONLY — they get no Tx number and their config reads "Receives a signal" instead of "Broadcasts as Tx #N" (only real transmitters — levers/buttons/plates/weight/locks/gates — broadcast; the core refuses to transmit for sinks/dust even in older saves). FIXED a click bug where a mouse click with no preceding move fired at stale (0,0) coords — it now maps the click position on mousedown, so clicking the Test-mode God button (or anywhere) no longer exits the session. FIXED overhead worlds saved OFFLINE never appearing in the Sandbox list (they live in their own store) — the Overhead view now lists, edits, and deletes them. The debug HUD sprint field now shows LIVE state (ON/ready/off) rather than just the enabled setting. Original 309 note follows. — v3 build 309 (OVERHEAD REDSTONE — dust is pure wire): redstone DUST no longer transmits a numbered channel — it is a pure CONDUCTOR that just passes power to adjacent blocks/devices. Previously EVERY placed device, dust included, was auto-assigned a Tx number and broadcast it while powered (cluttering the channel list + debug HUD and letting dust act like a transmitter). Now dust gets no Tx number on placement, never shows up in a transmitter picker for receivers, and the core refuses to broadcast for dust even in older saved worlds that baked a txId onto it — only real transmitters (levers/buttons/plates/weight/locks/gates) broadcast. Original 308 note follows. — v3 build 308 (OVERHEAD — lit lamps + cleaner shadows): a POWERED redstone LAMP is now a real light source at night (warm-yellow glow that punches through the darkness like glowstone/lava, configurable lampBrightness) instead of just a yellow sprite that dims with the scene. SHADOWS reworked: a cast shadow no longer paints over the lit block top itself (raised-block footprints are erased from the shadow layer so shadows fall on the GROUND beyond the block, away from the light), and the composited shadow is lightly BLURRED so the stepped per-cell edges soften into a smooth edge (a group of blocks now reads as one grouped shadow). Original 307 note follows. — v3 build 307 (OVERHEAD — debug HUD for browser testing): a test-mode DEBUG HUD (top-right; the backtick ` key toggles it) mirrors the side-scroller readout so a browser / Chrome-MCP tester can verify game state straight from a screenshot — build · mode · state, map size · density · zoom, player cell/elevation/HP/weapon, KEYS on the key-ring, sprint, jump clearance, day/night phase, and the LIVE redstone channels currently ON (critical for drawbridge / lock / plate puzzles). On by default in Test mode, off in normal play. Original 306 note follows. — v3 build 306 (OVERHEAD — hide-above view, KEYS + LOCK block): editor VIEW filter "Hide above elev N" (next to Elevation map) hides everything above the active elevation so you can see + build inside mountains (great for hidden redstone). NEW KEY items — gold/red/blue keys, emerald/amethyst jewels, a passcard — collected onto the player key-ring. NEW LOCK block (Redstone palette): stand next to it with a matching key and press E to power it (emit its redstone signal / Tx channel); its modal picks which keys it accepts (only keys actually placed on the map), whether the key is CONSUMED, and whether it can be turned off again. A complete key → lock → redstone puzzle loop. (DOORS + CHESTS are the planned next batch.) Original 305 note follows. — v3 build 305 (OVERHEAD — SPAN bridges + single-unit drawbridge): bridges are now SPAN entities that connect two cliffs — place one from the BUILDINGS tab by clicking the two cliff edges (a straight run between them). A DRAWBRIDGE now raises as ONE COMPLETE UNIT — the whole deck tilts up ~80° about its hinge cliff with perspective, then swings back down when powered (Animated style); Vanishing still just appears/disappears. A plain bridge is simply a drawbridge that never moves (unified). GUARDRAILS are now a PER-BRIDGE setting in the bridge modal (the world setting is the default for new bridges); the modal also toggles drawbridge on/off + multi-selects which transmitters raise it, and has Move + Delete. Original 304 note follows. — v3 build 304 (OVERHEAD — consistent device config, Move/Delete modals, 1×1 directional gates): all devices are consistent now — SOURCES (levers/plates/weight) carry an auto Tx number; SINKS (lamp/piston/drawbridge/receiver) have built-in receivers that multi-select which transmitters they listen to; and every config modal has MOVE and DELETE buttons. Hand-CLICK a configurable device opens its modal; a device with NO config (redstone dust) hand-clicks straight into click-to-move. LOGIC GATES are now discrete 1×1 blocks (AND / NOT / NOR) with a side-config modal — pick which sides are INPUTS (blue) and which are OUTPUTS (green), exactly like the side-scroller; the engine routes power directionally through the chosen sides. Original 303 note follows. — v3 build 303 (OVERHEAD — numbered Tx/Rx, device move, H/D/E keys, animated drawbridge, scatter brush): the Tx→Rx system now mirrors side-scroll — every redstone device is auto-assigned a numbered TRANSMITTER (labelled by its type), and a device or drawbridge can MULTI-SELECT the transmitters it listens to (Hand-DOUBLE-CLICK to open the config; single Hand-click now SELECTS a device to move it, like mobs). NEW keyboard shortcuts H = Hand · D = Draw · E = Erase (clipboard flips moved to X / Y, rotate T), and typing in a config field no longer triggers shortcuts. NEW world setting Drawbridge Style: Vanishing or ANIMATED (the deck tilts up ~80° with perspective as it raises/lowers). NEW Scatter brush (place terrain at 25/50/75% for natural foliage/rubble). Original 302 note follows. — v3 build 302 (OVERHEAD REDSTONE — devices + logic gates + transmit/receive config): the redstone core grew logic + generalized wireless channels — NEW devices sized to the player: PRESSURE PLATE + WEIGHT block (sources that fire when stepped on / loaded), PISTON (a barrier that becomes SOLID while powered), and AND + NOT logic GATES. EVERY device can TRANSMIT on a channel (broadcast while on) and/or RECEIVE from a channel (on while that channel is powered) — Hand-CLICK any device (or a drawbridge) to open a CONFIG MODAL for its transmit/receive channels (a receiving device must name a source — it cannot be left blank), lever start-state, and weight threshold. Pressure plates + drawbridges share the channel "gate" by default, so stepping on a plate raises the bridge out of the box. Original 301 note follows. — v3 build 301 (OVERHEAD EDITOR — selection + clipboard; bridge guardrails → world setting): NEW marquee SELECTION + copy/paste. Ctrl-drag highlights an area (at the start cell elevation); DOUBLE-CLICK selects every connected same-type cell (a whole bridge run at once, across elevations); DELETE clears the selection (a bridge selection removes only the bridge, keeping the terrain underneath); CTRL+C copies the pattern (terrain + bridges/ramps/dust/lamps/mobs/items) onto the cursor and CLICK pastes it; H / V flip and T rotate the clipboard before pasting; ESC cancels the paste / selection. The per-bridge "guardrails" checkbox is gone — bridge guardrails are now a WORLD SETTING (off = players can fall off bridges, like cliffs). Original 300 note follows. — v3 build 300 (OVERHEAD EDITOR — rail restructure + highlighting + undo-camera fix): the left rail now leads with three equal buttons — HAND / DRAW / ERASE — each setting the cursor; the ACTIVE tool plus its brush/shape/palette highlight light-blue (one consistent blue everywhere), the Terrain header shows the actual BLOCK, and the order is Elevation · Brush · Shape, a gap, then Terrain · Mobs · Items · Buildings, a gap, then Redstone (its own palette). BRIDGE + DRAWBRIDGE moved into the Terrain palette as two separate line/rect-able items. FIXED: Undo / Redo no longer jump the camera to the corner (view + zoom are kept). Draw restores the last terrain + brush/shape; Erase removes every block/mob/item/building the brush touches. Original 299 note follows. — v3 build 299 (OVERHEAD EDITOR — painting tools + reveal window): the LINE / RECT / CIRCLE shape tools now also draw redstone DUST, BRIDGES and RAMPS (a run at a time, not one-by-one); a new FILL / BUCKET tool (G) flood-fills a region of the selected terrain (4-connectivity — a diagonal line seals it). ALT-click = eyedropper (pick the block under the cursor into the pen); SHIFT-scroll = brush size; B / L / R / O / G = shape hotkeys. The canvas cursor shows a PEN when drawing, a HAND in hand mode, and an arrow when placing buildings/mobs/items (ghost preview kept). ESC returns to the Hand tool; ESC again (already on Hand) offers Save-&-Quit / Quit. LEVERS / LAMPS render at CHARACTER scale (~2 blocks) regardless of density; the TOWER is now 3×3. NEW world setting "Always show player" — a configurable-radius reveal window punches through canopy so the player + nearby ground stay visible under trees. (Deferred to the next batch: the marquee SELECTION + copy/paste clipboard, and the 2-wide bridge auto-stamp.) Original 298 note follows. — v3 build 298 (OVERHEAD ENGINE — BRIDGE item + REDSTONE core): NEW grid-agnostic REDSTONE core (the §32 foundation, headless-tested) — levers/buttons, redstone DUST wire, lamps, transmitter/receiver — with a named-CHANNEL table. Place a Lever (flip it with E), dust, and a Lamp from the new "Bridge & Redstone" palette. NEW BRIDGE tool: a walk-over-gap DECK that spans pits/chasms, with GUARDRAILS on/off (rails stop you falling off the sides; without them you can) and a DRAWBRIDGE option that starts OPEN and CLOSES while its redstone channel is powered — a Lever and a Drawbridge share the channel "gate" by default, so flipping the lever raises/lowers the span. The runtime evaluates the network each frame; bridges + redstone are saved, undoable, and shown with placement ghosts. (Grid-agnostic core so the side-view engine can adopt it later.) Original 297 note follows. — v3 build 297 (OVERHEAD ENGINE — dodge/melee/death micro-fixes): a DODGED ranged attack now flies ON past the player (it is flagged, not destroyed) instead of vanishing; during a melee swing the held weapon DISAPPEARS from the hand (the enlarged swinging weapon stands in for it); and the death-burst pieces now scatter OUTWARD and settle in place (no downward gravity — correct for the top-down view) before fading. Original 296 note follows. — v3 build 296 (OVERHEAD ENGINE — number-key elevation, jump-dodge, weapon-accurate melee arc + pit-death polish): in the map editor the NUMBER KEYS 0-8 now set the paint elevation directly. NEW jump-to-dodge world settings — jumping can dodge ATTACKS (ranged shots) and/or dodge MOBS (body contact), each None / Single-jump / Double-jump-only. The MELEE SWING now draws the ACTUAL held weapon (pickaxe/sword/trident/boomerang/bow) and pressing F melee-swings with a held weapon (click still fires it); the damage cone is now a configurable ARC (degrees, default a tighter 50°) shared by the hit test and the visual, and the weapon scales up to fill a wider arc. The pit-fall death now starts the flailing figure at the proper overhead size and sinks it fully into the pit before it bursts. Original 295 note follows. — v3 build 295 (OVERHEAD ENGINE — jump-clear, sprint, melee swing, pit/lava death modes + editor ghost/undo): JUMP CLEARANCE world settings — a jump can now clear/mount walls up to N blocks (default 1), ADDITIVE with the double jump (default +1), so jump 1 + double 1 clears two (a walk still cannot climb unless you raise the climb setting). SPRINT on Shift with a configurable multiplier. A visible MELEE SWING sweeps a weapon through the attack cone. PITS are now a clear MODE — Deadly (fall in and die) or a solid OBSTACLE that blocks even in GOD mode; a deadly-pit death shows a front-facing figure with flailing limbs SHRINKING for ~1s before it bursts into its own coloured sprite blocks (family-friendly, no gore). Optional LAVA insta-death. Max walk-down gains a 0 (never) option. EDITOR: a placement GHOST of the selected block/mob/item/building now follows the cursor (a building shows a red X when it will not fit); UNDO/REDO track only content + settings (never zoom/scroll) and pop a notification of what was undone/redone. Original 294 note follows. — v3 build 294 (OVERHEAD ENGINE — pits, death FX, cliff safety + light/atmosphere polish): NEW deadly PIT block (fall in and you die; a world toggle makes pits harmless hard obstacles instead); a family-friendly DEATH animation (the player bursts into its own coloured sprite blocks that fly out, spin, fall and fade — no gore) before Game Over; a CLIFF-FALL guard world setting (default ON) so a walk cannot drop more than N levels off a high platform (ramps/bridges are the intended way down) — pits stay dangerous regardless. Atmosphere: the LAVA/glow lighting is reworked — a UNIVERSAL reach-per-brightness slider plus PER-OBJECT brightness for lava and glowstone, and big lava lakes now light UNIFORMLY (stride-sampled, no more bright-top/dark-bottom) with no additive blowout; the sun/moon can be a CIRCLE or a SQUARE; and shadows now FADE out and back in across the dawn/dusk swap instead of snapping direction. The erase tool uses the brush size (confirmed). Original 293 note follows. — v3 build 293 (OVERHEAD ENGINE — ramps forgiving + Day/Night depth): RAMPS now climb even when placed a cell off from the true collision edge — a ramp counts on its own cell OR any orthogonal neighbour, because the 2.5D up-left elevation offset makes exact placement hard; verified in a headless collision harness (adjacent, one-cell-off, vertical approaches, densities 1-2; no-ramp control still blocks). DAY/NIGHT reworked per Kevin: the warm dusk/dawn tint is GONE (a clean cool night-to-clear-day fade); nights can go nearly BLACK (darkness up to 0.95) so lamps matter; a faint, TOGGLEABLE sun/moon disc tracks across the sky; dynamic ELEVATION SHADOWS cast from cliff edges away from the sun/moon (composited offscreen so overlaps do not stack darker, edge-only for perf, toggleable) render regardless of whether the disc is shown; and GLOWSTONE + LAVA are LIGHT SOURCES that punch through the darkness with configurable reach (blocks) + brightness. Original 292 note follows. — v3 build 292 (OVERHEAD ENGINE — playtest fixes + DAY/NIGHT cycle): the map no longer hides under the top command bar (a scaled top inset keeps the map and its edge indicator fully visible); tree TRUNKS block reliably now — collision samples the player width at THREE points so a single-cell trunk or a thin wall cannot be slipped past when walking vertically, while ramps stay lenient so a wide player can still climb a narrow ramp; RAMPS climb again (undo/redo no longer drops the ramp + settings data on restore); the grey mob ring is a MAP-CREATOR-only indicator now (the live game shows just a drop shadow, no ring); a pipe next to a statue now TELEPORTS on E — portals/pipes take PRIORITY over the generic decoration notice, and an unlinked pipe tells you instead of silently doing nothing. NEW DAY / NIGHT cycle (Atmosphere world settings, off by default): an ambient tint sweeps midnight-blue to a warm dawn to a clear noon to dusk over a configurable cycle length, with an on-screen sun/moon clock, and mobs see a little farther at night. Original 291 note follows. — v3 build 291 (OVERHEAD ENGINE — Move-from-config, weapon switch, map-edge, somersault facing): the config modals (portal/pipe, Goal Star, Player Spawn) gained a MOVE button that closes the modal and arms a "click to move" indicator so the next canvas click relocates that object; a compact WEAPON HOTBAR with Q / Tab to cycle between collected weapons (mirrors the platformer); the double-jump SOMERSAULT now flips in the direction the player is FACING (it always spun down-right before); leaves render as ONE floating level with visible height and a gap below at any elevation; a bolder MAP-EDGE indicator (hazard stripes PLUS a dashed magenta world-boundary line so the edge is unmistakable while panning); walking-climb hardening — legacy rules.autoClimb is no longer folded into the climb setting and new worlds start with rules {}, so a walk cannot step up a 1-level wall when climb is None. DEFERRED to the future SKIN EDITOR tool: block-built portals + block-built buildings (obsidian frame / glowing-purple blocks assembled from a larger hidden palette). Original 290 note follows. — v3 build 290 (OVERHEAD ENGINE — CRASH FIX + view filters): FIXED a crash where the portal building draw referenced an undefined var (cs) — any world with a portal (incl. the demo) threw mid-render, so mobs/buildings/items vanished and Test would not run. Added editor top-bar VIEW FILTERS (show/hide Buildings, Mobs, Items) + an ELEVATION MAP view that recolours the terrain as a purple(low)→pink(high) heat map with per-cell level numbers. Original 289 note follows. — OVERHEAD ENGINE — solid buildings, vertical portals, somersault, castle: all buildings are now SOLID (no walking through; portals used by standing next to them + E, teleport drops you in front of the destination); FIXED jump-mounting 1-high walls (an invalid-elevation landing bounces you back); portals render as a STANDING vertical 4×5 obsidian frame (4×1 footprint) that covers ~5 elevation levels + a Two-way link; leaves are a floating canopy (no more leaf-sides through low elevations); mobs get a grey outline; double jump defaults to a SOMERSAULT (head-over-heels) with a spin option; the Hand tool can now SELECT + MOVE mobs/items (click to select, click a new cell to move); ramps redrawn as a right-triangle prism (90° face at the high edge); buildings blockified top-down — healer=white hospital+cross, shop=building+$ sign, Tower-Defense core=CASTLE (6×6), MOBA nexus=crystal cluster, pipe=block edges, statue=grey top-down character; a hazard-striped map-edge indicator. Original 288 note follows. — OVERHEAD ENGINE — portals/detection/jump polish: test-mode GOD toggle (invincible); mob detection is now an absolute world setting in BLOCKS (default 10, was a vague scale factor); portals + pipes trigger by PROXIMITY + the E button with a "Press E" glow prompt (no accidental walk-through, and the trigger offset is gone); portals redrawn as a 4×5 OBSIDIAN FRAME with a glowing-purple centre (3D block-cubes) + a Two-way link option; trident + boomerang now respect the attack wall-height (rebound to the player off a too-high wall); DOUBLE JUMP is a world setting (default on) with a spin animation; trees place relative to the ground (leaves only on levels 3 & 4); ramps redrawn as a 3D wedge; a distinct hazard-striped MAP-EDGE indicator; all buildings non-solid for now (block-based solids later). Original 287 note follows. — OVERHEAD ENGINE — bug fixes + stacked-cube terrain + hand tool: FIXED mobs not moving (they lacked an elevation → collision NaN-blocked them) + they now WANDER when idle; FIXED portals/pipes being unusable (enter-type buildings are now walkable, all others solid) — use a PIPE with the E button, portals trigger on walk, both glow purple; FIXED walking through walls — the collision model now treats any raised NON-leaves terrain as SOLID (climb only within the climb setting or via a ramp), while leaves/canopy stay pass-under (trees block shots at the trunk only). Detection lowered + varied first-shot timing. Terrain now renders as STACKED CUBES (top offset 1/4-block up AND left per elevation level, darker south+east exposed faces). Placed items show as the real item at player scale; portal/pipe #s enlarged + always shown; the editor highlights the active elevation. NEW HAND tool (drag to pan, click to configure — replaces the Configure button); ramps orient to the gap direction. Trees: trunk levels 1-2, leaves levels 3-4 (never covering the trunk), elevation picker 0-8. Original 286 note follows. — OVERHEAD ENGINE — mobs move, LOS attacks, diagonal shadows: mobs now detect at ~10 player-blocks + WANDER randomly when idle (they were sitting still); PIPES + GOAL enlarged to 2×2; pipes need the Action button (E) to use while portals trigger on walk, both ends GLOW purple on teleport; portals/pipes NUMBERED (#N badge + "#N (c,r)" in the destination picker); NEW attack wall-height setting (default 2) — a target/obstacle 2+ elevations above the attacker blocks the shot, attacking DOWN always works (high ground behind a 1-high wall can fire down safely); terrain cliff SIDES now render as diagonal parallelograms so elevation reads as diagonal shadows. Confirmed: an elevation-+1 block blocks a walk when climb=0 (older worlds created before build 284 resolve the legacy auto-climb=1 → open ⚙ Settings and set climb to 0). DEFERRED (roadmap): the full pipe climb-in/out animation + a day/night cycle with dynamic elevation shadows. Original 285 note follows. — OVERHEAD ENGINE — shapes, prefabs, building models, portals/config: editor SHAPE tools (line/rectangle/circle-oval + fill or brush-width outline, live preview); TREE prefab (2-high trunk + 5-diameter leaf-canopy overhang); RAMP/LADDER placeables (climb any elevation); distinct pre-built BUILDING MODELS at their real footprints (Portal 1×4, Pipe 1×1, Healer/Shop 4×4, SavePoint 2×2, Spawner 3×3, Statue/Tower 2×2, Nexus/Core 5×5) with a skin field (default skin drawn now; skin builder roadmapped); a "⚙ Configure" tool with modals for portals/pipes (teleport destination = any other portal/pipe, OR "ends the level" goal, OR link a Player Spawn to emerge from a portal) + Goal-Star colour (campaign routing); faster weapons + a separate Overhead World Settings menu (build 283–284) incl. climb-levels + player-height + the static-terrain render cache that makes dense grids cheap. Redstone-in-overhead config still deferred. Original 284 note follows. — OVERHEAD ENGINE — static-terrain cache + climb/height + ramps: the density-4 slowdown is fixed by pre-rendering the STATIC terrain to an offscreen canvas ONCE and blitting it each frame (runtime terrain cost is now density-independent). New world settings: how many elevation levels a WALK can climb (default 0) + player HEIGHT in levels (default 1) — a block within [climb+1 .. height] above you is a wall, taller is an overhang you pass under; RAMP + LADDER placeables (Buildings tab) let a walk cross ANY elevation delta. Original 283 note follows. — OVERHEAD ENGINE — settings menu + perf + test-exit: a NEW, SEPARATE Overhead World Settings menu (⚙ in the editor; not a side-view tab) storing per-world tunables on world.settings — player speed, auto-climb, jump float/scale, WEAPON SPEEDS (crossbow/trident/boomerang) + boomerang range/width, melee reach, mob detection ×, control scheme + aim-lock, default zoom, hidden-indicator. Faster default weapon speeds. DENSITY performance/feel fixes: gameplay speed + sizes are now in density-independent UNITS (fixes the player crawling on a density-4 grid); the brush now interpolates a LINE between mouse samples (fixes the spotty drag path); the tile renderer skips its clip/texture/bevel below ~13px (fixes the dense-grid slowdown). Test mode now returns to the designer on ESC (or a top-left "◀ Designer" button) instead of opening the pause menu. Original 282 note follows. — OVERHEAD ENGINE — art rev 3 + editor fix: FIXED the world-editor chrome that had vanished (the container div was never created) — rebuilt as a TOP command bar (Undo/Redo/Zoom/Test/Save/Exit) + a LEFT hover-rail (Brush/Elevation/Erase + Terrain/Buildings/Mobs/Items tabs that open on hover). Player/mobs: CONNECTED limbs (arms = shirt, legs = pants) from body to a small hand/foot — no floating parts; a waist block; feet point forward in line with the hips; LEGS follow the movement direction while the head/arms/weapon follow the AIM (decoupled lower/upper body). Spider: legs now only on the two SIDES (4 each), red eyes on the leg-free FRONT edge. Blocks: side reduced to 1/4-block per elevation level, noticeably darker than the top, with a divider line per level; block TOPS are now one uniform colour at every elevation (depth reads from the side only). Jump: sprite now floats UP slightly + scales up (impression of getting closer) instead of dipping down. Thrown trident/boomerang now render AS the weapon (leaving the hand); the boomerang bends its circular return toward the player\'s live position so it always comes home. Original 281 note follows. — OVERHEAD ENGINE — art rev 2: player sprite reworked to Kevin\'s spec — smaller head (~half the sprite), arms AND legs swing fore/aft in opposite phase (natural gait), and the sprite ALWAYS holds a weapon pointing where it aims (sword/bow/trident/boomerang/pickaxe; default pickaxe when unarmed; Campaign pulls the level-finish weapon via opts.playerWeapon). Mobs rebuilt: zombie = the player body with green skin, skeleton = bony (front-edge eye sockets, thin neck→parallel shoulder-bone, narrow limbs, holds a bow), spider = a square body with 8 little legs (4/side) + red eyes on the leading edge. Blocks now render a 3D EXTRUSION: bevelled top + a darker extruded side that is covered by whatever block sits in front of it (only front/edge blocks and raised-block drops show a side), with the side height dropping to meet the block in front — matching the elevation staircase. Colours flow through the OH_SPRITE palette (future user-config; 2D should share). Art-options artifact updated to match. Original 280 note follows. — OVERHEAD ENGINE — playtest pass 1: server-backed overhead worlds (saved to the worlds table, viewMode:overhead) with a Side-scroll/Overhead toggle in the Sandbox browser (edit/delete like any world); friendlier dropdown creation modal (Custom→WxH, no size limits); FIXED grid density (now bakes into a finer grid = more/smaller blocks in the same map area); left tool-rail palette (Brush/Elevation/Erase + hover-slide Terrain/Buildings/Mobs/Items tabs); full side-scroller terrain SET (Grass..Leaves) as top-down shaded tiles; ELEVATION-RELATIVE collision (a cell +1 above you is a wall, +2 is an overhang you pass under and are hidden beneath — replaces separate decorations; optional designer visibility indicator); mobs (zombie/skeleton/spider) + weapon items (crossbow straight shot / trident throw+recall / boomerang OVAL arc out-to-aim-and-back); undo/redo, Shift+click elevation-scoped erase, keyboard shortcuts (elevation [ ], zoom − =, Ctrl+Z/Y); new overhead player sprite (square hair head, shirt shoulders, offset arm-swing + distance-grounded legs) via an OH_SPRITE colour palette (future user-config; 2D should share). +11 weapon assertions. Original 279 note follows. — OVERHEAD ENGINE — MVP foundation: a new shared top-down substrate (NOT a new physics fork). Depth-first foundation: headless-tested pure modules — grid/zoom (fixed grid size+density, object-scale mode, live master zoom, smooth coords, scrolling clamped camera), elevation (2.5D staircase Y-offset + cliff + autotile edge bitmask + draw-order sort + tiered auto-climb + configurable maxElevationJump, default 0), building taxonomy registry, Map-vs-World version-linking (snapshot default, non-committing Test overlay, Relink, placement validation) + Extract-Map tool (mode-aware validity matrix), jump (parabola lift, speed-carry, double-jump+flip, hazard/gap-only landing edge-detection) + simple overhead limb anim, three control schemes (Move-to-Aim / Twin-Stick / Free-Aim, world-force vs player-pref, weapon twin-stick override), cone/radius/line combat. Plus a PLAYABLE OverheadGame runtime (rendered elevation/cliffs/autotile, scrolling zoomable camera, 3-scheme movement + jump + limb anim, cone melee, mobs 3-state, Goal-Star win) launched via a Sandbox "🗺 Overhead (beta)" demo world. 99 headless assertions across 3 new test files. All additive — no existing mode changed. PARTIAL by design (see report): full Sandbox overhead editor, Campaign World Map Creator, and TD/MOBA/Arena rulesets are scaffolded/next. Original 278 note follows. — CAMPAIGN MODE — MVP: a new Campaign container (NOT a new physics mode) that sequences existing Platformer worlds into Zones ending in a Boss World. A world\'s coloured Goal-Star exits are its branches — Goal Star 1 (Gold) leads to the next level (or, on a Boss World, the next Zone / campaign completion); Goal Stars 2–10 are creator-routed Bonus or Connect exits (secret loops, skip paths). Campaign Builder (Sandbox tool + Campaign screen): Zone tabs, guided [+] flows per Goal Star, publish validation gate (every world needs a Goal Star; every star must be routed). Server-backed (campaigns + campaign_progress tables, run server/sql/campaigns.sql); only krtaylor@gmail.com may publish, one campaign live at a time. Playthrough carries inventory (resetInventoryAt), best-ever score per world, running emeralds/lives; health resets each world; per-Zone progression tracker on completion + from the pause menu. All additive — no existing mode changed. Original 277 note follows. — BRANCHING RAILS — Rail Switch: a new Plumbing-tab tool. Place it by clicking a PIVOT, then ROUTE A end, then ROUTE B end; re-click the pivot to configure (trigger channel, switch time, default route, remove). It is a pivoting 2-point rail (pivot → live route end) that ROTATES A↔B over the configurable switch time when flipped. It flips to route B when its listen channel is powered OR an adjacent redstone signal is present (else the default route); works with levers/weight sensors/conducting devices/etc. RAIL-TO-RAIL HAND-OFF: when a switch route end (or the pivot) coincides with another rail terminal, a platform rides straight through the junction onto that rail (direction preserved, anchor re-based so redstone/render/solid lookups stay aligned); a platform on a normal rail whose end touches the switch flows in too. Handoff only fires when a switch is involved, so plain rails behave exactly as before. Serialized in game-state + saves. Headless-verified (13 rail-switch assertions: route geometry, terminal cells, redstone animation, transfer + the plain-rail no-handoff guard).';
// PRIOR: build 276 (platform wrap-up Tier 1 polish): (1) anchor + direction-block SKINS now render in the EDITOR too (a static frame overlaid on the cell — Wheel/Pointer/Steering/block skins), read live from the platform + direction-controller config so they update as you change them; previously skins only showed in Play. (2) A platform lamp now renders its on/colour from the CAPTURED lamp component reference (fallback: colour snapshot, then positional getAt) — so a lamp riding a moving platform keeps BOTH its colour AND its lit/unlit state stable, extending the build-275 colour fix to on-state. Headless-verified (20 block-skin assertions incl. captured-component drives colour+on). PRIOR: build 275 (fix: platform lamps turning red/off while moving): lamp colour on a moving platform was re-resolved via getAt at the moved cell; now snapshotted onto the platform cell at load.';
// PRIOR: build 275: a redstone lamp that belongs to a MOVING platform is drawn by _platformCellState, which re-looked-up its colour via getAt at the CURRENT (moved) cell — so while the platform travelled (e.g. Super Mario 1-1, rail climbing toward row 49) each lamp cell resolved to a DIFFERENT lamp (colour 0 = red) or none (off), flipping White/Cyan lamps to red. Fix: _initPlatformsRuntime now snapshots each lamp cell authored colour onto the platform cell (lampColor) at load (redstone is restored before platform init, so the real colour is captured), and _platformCellState renders from that stable value, falling back to getAt only when unset. Colour is immutable at runtime, so this is safe and repairs existing saves on load with no rebuild. Headless-verified (19 block-skin assertions incl. the turns-red case).';
// PRIOR: build 274 (sticky config now covers BRUSH + Shift-drag placement): the multi-place path (_sandboxBrushPlace, used by both N×N brush and Shift-drag strokes) previously only set grid blocks and never created the redstone component, so brush/shift-dragged weight sensors (etc.) came up with plain defaults. It now creates the component at placement via _ensureRsComponent and applies the same per-type sticky defaults as single-click placement — so a row of Shift-dragged weight sensors all inherit your last Wood+Conduct setup. Covers lever/trapdoor/plate/weight/tnt/target/lamp/piston/converter. Headless-verified (17 block-skin+sticky assertions incl. brush-place inherits defaults + no duplicate on re-place).';
// PRIOR: build 273 (STICKY block config + palette reorg): (1) STICKY CONFIG — after you set a configurable block\'s options (weight sensor→Wood+Conduct, lamp colour, target mode, piston dir, etc.), the NEXT placed block of that type inherits those settings automatically (per-type template remembered while its modal is open, applied at placement). (2) PALETTE — the Overworld tab is renamed "World" and now includes the nether blocks, each shown with a nether-tinted icon background so its biome reads at a glance (tint is palette-only, never placed). (3) New "Red Stone" tab collects all redstone blocks in a sensible order: dust → sources (Lever/Pressure Plate/Weight Sensor/Target) → wireless (Tx/Rx) → sinks (Lamp/Trap Door/Piston/TNT) → logic (AND/NOT/Pulse Converter); removed from the Other tab. Headless-verified: 15 block-skin+sticky assertions.';
// PRIOR: build 272 (ANIMATED SKINS for Anchor + Direction blocks): the Anchor block can be skinned as a WHEEL that spins as the platform moves (angle accumulates from real distance travelled, reverses with direction, stops when stopped — any rail orientation); the Direction block can be a POINTER dial or STEERING wheel that faces the platform\'s actual movement vector (reflecting the steering signal, works on diagonal/vertical rails). Both also accept plain block skins (Wood/Stone). Skin lives on the platform record (anchor) + direction-controller config, picked via a new Skin row in each modal, persisted in game-state + saves. Animated/anchor+direction skins render in PLAY (test) mode; weight/plate skins still render in editor + play. Headless-verified: 11 block-skin assertions (wheel accumulation/reverse/idle, pointer facing, _cellSkin resolution).';
// PRIOR: build 271 (CONDUCT toggle on all redstone devices + block SKINS): every device modal now has a "Conduct signals" toggle (lamps/trapdoors/pistons default ON = classic all-sink behavior; pressure plates/target blocks/weight sensors opt-in). Conduct-enabled devices form a shared-power network by adjacency — energize any one (stood-on sensor, pressed plate, adjacent source/dust) and the whole connected group powers INSTANTLY (one flood, no per-hop delay), driving adjacent sinks; turn conduct off to isolate a block. Relay-to-neighbors (TNT/gates) is gated to EXPLICITLY-enabled devices so untouched sinks keep exact 265 behavior (no accidental TNT arming). Also: per-block SKINS — weight sensor + pressure plate can render as another block (Default/Wood/Stone/Dirt/Log/Grass) while keeping behavior (e.g. disguise a plate as plain wood); PNG-upload-ready (same `skin` field). New modals for pressure plate / lamp / trap door; conduct added to target + piston modals. Persisted in game-state + saves. Headless-verified: 16 conduction assertions (chain lighting, no latch, isolation, no cross-lighting, defaults, persistence, no-265-regression) + 11 weight-sensor assertions.';
// PRIOR: build 270 (WEIGHT SENSOR block + plate-on-platform flicker fix): new SOLID redstone block (Other palette) that emits a signal while a player/mob/both stands ON TOP — click it to pick the trigger (players/mobs/both). Unlike a pressure plate (a thin pad you stand INSIDE), it is a full block you stand on, and detection reads the platform SMOOTH surface Y so it never flickers off on a vertically-moving platform. Same smooth-surface fix now backs pressure plates riding platforms too (via a composed extra-on source). Bonus orphan guard: erasing ANY redstone block (lamp/target/converter/weight — previously only lever/plate/TNT/piston/trapdoor) now drops its component, preventing the orphaned-component class that caused the lamp cross-lighting. Persisted in game-state + saves; headless-verified (11 assertions: all trigger modes, adjacent-sink conduction, sub-cell platform detection).';
// PRIOR: build 269 (DELETE WHOLE PLATFORM + stale-state fix): the Anchor modal now has a "⌫ Delete Whole Platform (blocks + redstone)" button that purges EVERY construction block, dust overlay, and redstone device (lamps/levers/gates/TX/RX/dir-controllers) belonging to the platform for a true clean-slate rebuild — plain "Remove" only unbinds the anchor and LEFT the build + its redstone in the maps, which is how orphaned/duplicate components accumulate across place→test→edit→re-test cycles (the likely root of the "cross-lighting" glitch: a clean symmetric build propagates correctly in headless repro, left lever→left lamp only, right→right only, bottom never — so stray leftover components were lighting the extra lamps). Delete also drops any queued redstone signals aimed at the purged cells. Headless-verified: 23-cell platform tears down to 0 comps / 0 dust / 0 rx / 0 grid blocks.';
const CANVAS_W    = 800;
const CANVAS_H    = 500;
const BLOCK_SIZE  = 32;

// Goal-star colours (campaign-prep). Index 0 = classic gold (the default look).
// Up to 10 supported so future Campaign exits can route by colour. Each entry:
// { name, hex } — hex used to tint the star, name shown in the sandbox picker.
const GOAL_COLORS = [
  { name: 'Gold',   hex: '#ffd700' },
  { name: 'Red',    hex: '#ff4d4d' },
  { name: 'Blue',   hex: '#4da6ff' },
  { name: 'Green',  hex: '#4dff88' },
  { name: 'Purple', hex: '#b366ff' },
  { name: 'Orange', hex: '#ff9933' },
  { name: 'Pink',   hex: '#ff66cc' },
  { name: 'Cyan',   hex: '#33e6e6' },
  { name: 'White',  hex: '#f2f2f2' },
  { name: 'Lime',   hex: '#b3ff33' },
];

// Physics  (×1.5 speed increase applied 2026-04-24)
const GRAVITY         = 0.66;
const MAX_FALL_SPEED  = 21.6;
const JUMP_VELOCITY   = -12.0;  // ≈ 3.4 blocks apex at GRAVITY=0.66 — comfortably clears 3-block platforms

// Player movement
const MOVE_SPEED   = 6.0;    // normal walking speed
const CROUCH_SPEED = 3.36;   // walk speed while crouching
const PLAYER_W    = 20;
const PLAYER_H    = 52;   // standing hitbox height
const CROUCH_H    = 30;   // crouching hitbox height

// Mining
const BREAK_REACH         = 5;   // max block distance in blocks (normal mode)
const SANDBOX_BREAK_REACH = 15;  // sandbox mode: extended reach

// Combat
const PLAYER_MAX_HP         = 20;
const ATTACK_COOLDOWN       = 30;   // frames (0.5 s at 60 fps)
const ATTACK_REACH          = 80;   // px from player centre for melee
const IFRAMES               = 40;   // invincibility frames after being hit
const KNOCKBACK_FORCE       = 9;    // vx applied on knockback

// ── Weapon traits (Smart Mobs §2) ──────────────────────────────────
// Composable attack traits per weapon CLASS. The attack resolver reads these
// (merged with per-world overrides in _worldAdvSettings.weapons) rather than
// hardcoding behaviour per weapon — so the future Enchantment system
// (FUTURE_ROADMAP §17) can grant/modify a single trait onto any weapon.
//   kind         'melee' | 'ranged'
//   reachMult    × ATTACK_REACH (melee radius / thrust range)
//   arcDeg       hit-cone width centred on facing (360 = all around)
//   cleave       max mobs one hit damages; 'tier' = by sword tier; 0 = unlimited
//   knockback    × KNOCKBACK_FORCE
//   cooldownMult × ATTACK_COOLDOWN (swing speed; >1 = slower)
//   dmgMult      × the weapon's base TOOL_DATA damage
//   pierce       (ranged) arrow passes through mobs instead of stopping
//   throwable    (melee) can be thrown as a recoverable projectile (Trident)
const WEAPON_TRAITS = {
  sword:    { kind: 'melee',  reachMult: 1.0,  arcDeg: 360, cleave: 'tier', knockback: 1.0, cooldownMult: 1.0,  dmgMult: 1.0 },
  // `slide: 'launch'` = the weapon's special move when triggered from a ground
  // slide (Smart Mobs §2). Generic hook so other weapons can define their own
  // slide/context specials later; only 'launch' (AoE upward toss) is implemented.
  spear:    { kind: 'melee',  reachMult: 1.55, arcDeg: 65,  cleave: 3,      knockback: 0.7, cooldownMult: 1.15, dmgMult: 0.7, slide: 'launch' },
  axe:      { kind: 'melee',  reachMult: 0.95, arcDeg: 200, cleave: 1,      knockback: 1.9, cooldownMult: 1.7,  dmgMult: 1.45 },
  trident:  { kind: 'melee',  reachMult: 1.45, arcDeg: 90,  cleave: 1,      knockback: 1.2, cooldownMult: 1.35, dmgMult: 1.1, throwable: true },
  // §Phase 3 — Boomerang: dual-mode. MELEE = a close swing, LOWER damage than Sword
  // (dmgMult 0.75). RANGED = thrown, AUTO-returning (boomerangThrow), reusing the
  // guided-projectile substrate. Opt-in per world (new-weapon pattern).
  boomerang:{ kind: 'melee',  reachMult: 1.0,  arcDeg: 200, cleave: 1,      knockback: 0.8, cooldownMult: 1.0,  dmgMult: 0.75, boomerangThrow: true },
  bow:      { kind: 'ranged', pierce: false, dmgMult: 1.0 },
  crossbow: { kind: 'ranged', pierce: true,  dmgMult: 1.25 },
};
// §Phase 3 — Boomerang throw tuning (all overridable per world via _worldAdvSettings).
// Outbound is FASTER than the trident's throw and DECELERATES toward the arc's end;
// it auto-returns to the player, steering toward the cursor on BOTH legs.
const BOOM_RANGE_BLOCKS   = 10;   // outbound reach before it turns back (blocks)
const BOOM_SPEED          = 17;   // outbound launch speed (px/f) — faster than trident's ~14–26 curve start
const BOOM_MIN_SPEED_MULT = 0.35; // speed floor at the end of deceleration (× BOOM_SPEED)
const BOOM_DECEL_PCT      = 0.75; // fraction of the range at which deceleration begins
const BOOM_RETURN_MULT    = 1.0;  // return-leg speed (× BOOM_SPEED) — separate feel knob
const BOOM_STEER_PCT      = 30;   // homing/steer intensity toward the cursor (0-100 → up to 0.20 rad/f)
const BOOM_SPIN_RATE      = 0.5;  // visual spin (rad/frame)
const BOOM_MAX_LIFE       = 600;  // safety expiry (frames) if it never gets home
// §Follow-up — the charged-shot GLOW only appears after the bow's been drawn this long, so a
// quick tap doesn't flash it (it means "meaningfully charging"). ~0.75s: a touch under a full
// second so the tail of the yellow→orange→red ramp still shows at default charge speed
// (full charge ≈ 0.83s). Raise toward 60 for a stricter 1-second gate.
const BOW_GLOW_DELAY_FRAMES = 45;
// Sword cleave count by tier: Wood/Stone=1, Iron/Diamond=2, Netherite=3.
function swordCleaveForTier(tier) { return tier >= 4 ? 3 : tier >= 2 ? 2 : 1; }

// XP
const PLAYER_MAX_XP         = 5;    // max XP level
const XP_PER_ORB            = 0.5;  // each orb adds 0.5 levels

// Mob behaviour
const MOB_ATTACK_RATE       = 60;   // frames between melee hits
const SKELETON_SHOOT_RATE   = 180;  // frames between arrows (3 s)
const ARROW_SPEED           = 13.0; // px per frame (skeleton arrows — Phase 3A.3 faster)
const CREEPER_FUSE_FRAMES   = 300;  // 5 seconds
const CREEPER_EXPLODE_RADIUS= 2;    // blocks

// World / biome
const WORLD_W            = 650;
const WORLD_H            = 60;
const BIOME_PLAINS_END   = 150;   // col boundary plains→cave
const BIOME_CAVE_END     = 300;   // col boundary cave→nether
const BIOME_END_START    = 500;   // col boundary nether→end (transition zone 450-499)

// End dimension
const END_TOWER_COLS          = [525, 550, 575, 600, 625];
const END_FLOOR_ROW           = 58;   // top of bedrock floor
const END_TOWER_TOP_ROW       = 48;   // top row of obsidian towers
const END_TOWER_BOT_ROW       = 57;   // bottom row of obsidian towers (sits on bedrock)
const END_CRYSTAL_ROW         = 47;   // End Crystal row (1 above tower top)
const END_PORTAL_ARRIVAL_COL  = 575;  // column player arrives at when entering End Portal
const END_PORTAL_ARRIVAL_ROW  = 55;   // row player arrives at (above bedrock floor)

// Bow
const BOW_CHARGE_FRAMES  = 50;
const BOW_GRAVITY        = 0.216;
const BOW_MIN_SPEED      = 9.0;   // Phase 3A.3 — faster player arrows
const BOW_MAX_SPEED      = 26.0;
const PLAYER_ARROW_DAMAGE= 9;

// Mob respawn
const MOB_RESPAWN_FRAMES    = 10800; // 3 min at 60 fps
const MOB_ACTIVATION_RANGE  = 900;  // px from player to activate spawn
const MOB_MIN_SPAWN_DIST    = 500;  // px — don't spawn this close to player

// Item drops
const ITEM_DROP_LIFETIME    = 18000; // 5 min at 60 fps

// Checkpoints
const CHECKPOINT_PLAINS_COL = 138;
const CHECKPOINT_CAVE_COL   = 255;  // before the nether portal (cols 270-273)
const CHECKPOINT_RADIUS     = 96;   // px

// Ender Dragon (Phase 11A-2)
const DRAGON_SPEED      = 2;       // px per frame
const DRAGON_BODY_W     = 320;     // body sprite width (px)
const DRAGON_BODY_H     = 80;      // body sprite height (px)
const DRAGON_HEAD_W     = 60;      // head sprite width (px)
const DRAGON_HEAD_H     = 40;      // head sprite height (px)
const DRAGON_SPAWN_COL  = 575;     // initial spawn column
const DRAGON_SPAWN_ROW  = 48;      // initial spawn row
const DRAGON_HEAD_ROT   = 0.349;   // 20° in radians — fixed downward gaze angle
const DIVE_GROUND_Y     = (END_FLOOR_ROW - 2) * BLOCK_SIZE - DRAGON_BODY_H; // dragon ground-skim y

// Gamepad input (Phase 11K-1)
const GP_DEADZONE_STICK   = 0.20;   // left/right stick dead zone (ignore drift below this)
const GP_DEADZONE_TRIGGER = 0.10;   // analog trigger dead zone

// Player 2 keyboard fallback (Phase 12 — IJKL for debug/testing without a second controller)
const P2_KEY_JUMP   = 'KeyI';
const P2_KEY_LEFT   = 'KeyJ';
const P2_KEY_CROUCH = 'KeyK';
const P2_KEY_RIGHT  = 'KeyL';
const P2_KEY_ATTACK = 'KeyU';

// Day/night cycle (Phase 11F)
const DAY_CYCLE_DEFAULT_MINUTES = 10;         // full cycle (day + night), configurable
const DAWN_DUSK_MS              = 30 * 1000;  // 30 s transition
const SUN_ARC_START_ROW  = 18;  // world row at horizon (start/end of arc)
const SUN_ARC_PEAK_ROW   =  5.0;  // world row at zenith (top of arc)

// Phase 13.5 — Sound & Music System
const MAX_AUDIO_VOLUME     = 0.10;  // hard ceiling: 100% slider = 10% actual browser volume
const DEFAULT_MUSIC_VOLUME = 0.5;   // slider value (0–1); actual volume = this × MAX_AUDIO_VOLUME
const DEFAULT_SFX_VOLUME   = 0.5;   // slider value (0–1); actual volume = this × MAX_AUDIO_VOLUME
// Smart Mobs §4 — per-sound multipliers for the quiet movement SFX, tunable
// independently of the master SFX slider (final vol = sfxVolume × MAX_AUDIO_VOLUME
// × these). Bump/drop to taste, or expose as World-Settings sliders later.
const FOOTSTEP_SFX_VOL     = 1.0;
const LAND_SFX_VOL         = 1.0;

// Smart Mobs §4 — DETECTION default tuning (per-world overridable in World Settings →
// Combat → Detection). Ranges are in BLOCKS (converted to px in game._detectionConfig).
const DETECT_SIGHT_RANGE_DEF = 9;    // how far a mob can SEE the player (blocks)
const DETECT_SIGHT_ARC_DEF   = 120;  // frontal vision cone (degrees) — sneak up from behind
const DETECT_SOUND_WALK_DEF  = 5;    // radius a WALKING footstep is heard (blocks)
const DETECT_SOUND_RUN_DEF   = 9;    // radius a RUNNING footstep is heard (blocks)
const DETECT_SOUND_LOUD_DEF  = 14;   // radius when touching a LOUD block (gravel), blocks
const DETECT_ACTION_RANGE_DEF = 8;   // radius an attack/jump is heard (blocks)
const DETECT_PACK_RADIUS_DEF = 7;    // §5 — alert-propagation radius between mobs (blocks)

// Smart Mobs §7 — melee-mob SPRINT (opt-in "Sprinting Mobs"). A sprint is always
// TELEGRAPHED: a wind-up (mob slows + a pulsing cue) precedes the burst, so a fast
// approach reads as a fair, reactable threat rather than a cheap ambush.
const SPRINT_TELE_FRAMES   = 42;    // wind-up / telegraph duration (~0.7s @60fps)
const SPRINT_RUN_FRAMES    = 46;    // burst duration (~0.75s)
const SPRINT_COOLDOWN      = 150;   // frames before a mob can sprint again (~2.5s)
const SPRINT_SPEED_MULT    = 2.4;   // speed multiplier during the burst
const SPRINT_WINDUP_MULT   = 0.35;  // speed during the telegraph (visibly gathers itself)
const SPRINT_TRIGGER_CHANCE = 0.02; // per-eligible-frame chance to start a sprint
const SPRINT_MIN_BLOCKS    = 3;     // only sprint when the player is this far …
const SPRINT_MAX_BLOCKS    = 12;    // … up to this far (closing distance, not point-blank)

// Smart Mobs §6 — WAYFINDING (opt-in "Path-Aware Mobs"). Once a mob is pursuing,
// it follows a real A* route (js/pathfinding.js) around terrain instead of a
// straight-line beeline. The two main feel/perf levers (Kevin can retune):
const PATH_RECOMPUTE_FRAMES = 12;   // recompute cadence (~5×/sec) — cache the route between
const PATH_SEARCH_RADIUS    = 24;   // bounded search radius (blocks); player farther than this
                                    //   → fall back to legacy chase/wander (not actionable yet)
const PATH_MAX_EXPANSIONS    = 1500; // A* node-expansion cap (runaway backstop). Lowered again
                                     // (5000→2500→1500): a 24-radius chase route fits well under
                                     // it, and on a big OPEN level the full scan is the residual
                                     // per-frame cost, so a tighter cap keeps each call ~6-8 ms.
const MOB_PATH_MAX_DROP      = 8;    // per-node DOWN-scan cap for mob/bot A* (vs NAV_MAX_DROP 40
                                     // for the generator). The down-loop dominates per-node cost;
                                     // 8 handles normal ledges, deep falls become a walk-off.
const PATH_FLANK_BIAS_BLOCKS = 2.5;  // §5 surround: path GOAL offset past the player (per side)
// ── Bounded pathfinding (the real perf fix). A* is EXPENSIVE per call (see above), so
// letting every mob run it tanks the framerate (Kevin: 8–10 mobs → "impossible to play").
// Instead only the NEAREST few actively-chasing mobs are "smart" (pathfind); everyone
// else uses the cheap legacy beeline+hop ("simple" nav). And at most a couple of A* runs
// are allowed per FRAME (the rest keep their cached route / beeline), so the cost never
// spikes no matter how many mobs are on screen. These are the primary perf levers.
const MOB_PATH_BUDGET            = 4; // max mobs allowed to pathfind at all (nearest-first)
const MOB_PATH_RECOMPUTES_PER_FRAME = 2; // max A* runs per frame across ALL mobs (spikes-guard)
// Crowd-adaptive throttle (secondary safety): degrade the pathers' config if MORE than
// this many are ever active. Set to the budget so the nearest few "smart" mobs normally
// run at FULL config (snappy pursuit) — the per-frame A* cap is what guards the framerate,
// not this. It only bites if MOB_PATH_BUDGET is raised beyond this.
const PATH_CROWD_THRESHOLD      = 4;
const PATH_CROWD_RECOMPUTE_MULT = 2.5; // ×recompute interval when crowded (12f → 30f, ~2/sec)
const PATH_CROWD_RADIUS_MULT    = 0.6; // ×search radius + node cap when crowded (24bl → ~14bl)

// ════════════════════════════════════════════════════════════════════════════
// BOT AI (Competitive + Cooperative) — a bot occupies a real player SLOT and
// drives SYNTHETIC input through the same input.pXxx(i) pipeline a human uses
// (js/bot-ai.js). It reads the Arena Rules Engine's declared ELEMENTS to decide
// its goal, and the Phase-0-verified pathfinder (js/pathfinding.js) to move.
// Everything here is OPT-IN — no bots spawn unless a match is configured with
// them, so human-only play is byte-identical.
//
// DIFFICULTY = real wired parameters (NOT hardcoded behaviour). Kevin chose
// PER-BOT difficulty, so each bot slot resolves one of these presets. MEDIUM is
// the calibrated baseline; EASY/HARD are best-guess starting values explicitly
// flagged for playtest calibration (that is what the Phase-7 telemetry is for —
// see BOT_TELEMETRY_SCHEMA.md). Tune these numbers, not the strategy code.
const BOT_DIFFICULTY_PRESETS = {
  EASY: {
    label: 'Easy',
    brainTick:      30,   // frames between full decisions (~2/sec) — slow, indecisive
    reactionFrames: 24,   // extra delay before acting on a NEW threat/opportunity (~0.4s)
    navRecompute:   20,   // path recompute cadence (frames) — laggier route updates
    navPrecision:   0.55, // 0..1 follow fidelity: lower = sloppier jump timing + move jitter
    detectRange:    12,   // blocks: how far it NOTICES a target/objective
    aggression:     0.40, // 0..1 bias to engage (vs. objective / retreat) + mob-kill competition
    aimError:       0.42, // radians of random aim offset (bigger = wilder shots)
    aimJitter:      18,   // frames between aim-error resamples
    fireChargeMin:  0.35, // min bow charge before releasing (weaker/shorter shots)
    alwaysRun:      false,// dawdles at partial move speed sometimes (via navPrecision)
    loseInterest:   90,   // frames of no-progress before re-deciding a goal
  },
  MEDIUM: {                // ← the ONE calibrated baseline tier (default)
    label: 'Medium',
    brainTick:      15,   // ~4/sec
    reactionFrames: 10,   // ~0.17s
    navRecompute:   12,   // matches the mob PATH_RECOMPUTE_FRAMES cadence
    navPrecision:   0.82,
    detectRange:    22,
    aggression:     0.70,
    aimError:       0.20,
    aimJitter:      12,
    fireChargeMin:  0.55,
    alwaysRun:      true,
    loseInterest:   150,
  },
  HARD: {
    label: 'Hard',
    brainTick:      8,    // ~7.5/sec — snappy
    reactionFrames: 3,    // ~0.05s
    navRecompute:   8,
    navPrecision:   1.0,  // tight, always-running, clean jump timing
    detectRange:    40,   // sees across most arenas
    aggression:     1.0,
    aimError:       0.05, // near-perfect aim
    aimJitter:      8,
    fireChargeMin:  0.75, // charges hard for max range/power
    alwaysRun:      true,
    loseInterest:   240,
  },
};
const BOT_DEFAULT_DIFFICULTY = 'MEDIUM';

// PvP target selection = a configurable HIGHEST-THREAT BLEND (Kevin's choice).
// threat(target) = wProximity·nearness + wLowHp·(1-hpFrac) + wRecentDamage·hitMe
// where nearness = 1 at point-blank → 0 at detectRange, hpFrac = target hp/maxHp,
// hitMe = 1 if the target damaged this bot within BOT_THREAT_RECENT_FRAMES.
// Exposed as tunables now (may be hidden later) so fine-tuning is easy.
const BOT_THREAT_WEIGHTS = { proximity: 1.0, lowHp: 0.6, recentDamage: 0.9 };
const BOT_THREAT_RECENT_FRAMES = 180;  // "recently damaged me" window (~3s)

// Bot pathing envelope reuses the player jump model (pathfinder defaults). Search
// radius scales with the bot's detectRange but is capped so a far objective still
// falls back gracefully rather than running an unbounded A*.
const BOT_PATH_MAX_RADIUS   = 64;    // raised for mazes/long corridors (path length >> straight-line)
const BOT_PATH_MAX_EXPANSIONS = 12000; // A* node budget — mazes fan out (weak heuristic), so give more room
// Vertical heuristic bias for BOT A* (bots only). The base heuristic is horizontal-
// only (admissible) which floods a maze; a small vertical pull focuses the search so
// it reaches farther within the budget (mildly non-optimal, fine for following/objectives).
const BOT_PATH_VBIAS = 0.4;
const BOT_MELEE_RANGE_BLOCKS = 1.6;   // switch-to/prefer melee when this close
const BOT_ARCHER_RANGE_BLOCKS = 9;    // archer bot approaches to ~this, then holds + fires
const BOT_OBJECTIVE_REACH_BLOCKS = 1.4; // "arrived at objective cell" tolerance

// Phase 4 companion (friendly follower in Platformer/Normal/Campaign):
const BOT_FOLLOW_NEAR = 2;    // blocks: closer than this → stop crowding the player
const BOT_FOLLOW_FAR  = 5;    // blocks: farther than this → catch up (tighter = more responsive)
const BOT_COMPANION_BRAINTICK = 6;   // companion re-decides follow/fight fast (~10/sec) regardless of difficulty
const BOT_COMPANION_LOOT_DELAY = 150; // frames an unclaimed pickup waits before the
                                      // companion may grab it (~2.5s) — player gets first pick
// Companion teleport (fast-pace catch-up): when ON, warp beside the player once the
// DIRECT (Euclidean, so vertical levels count) distance exceeds the configured range.
// Predictable + never makes the player wait. Kevin tunes the range per level.
const BOT_COMPANION_WARP_DIST  = 18;  // default teleport range (blocks) — configurable
const BOT_COMPANION_WARP_STUCK = 45;  // frames of no closing progress → "stuck" (~0.75s; teleport-OFF path)
// Stuck-escape: after this many consecutive fruitless escapes on one goal, stop
// escaping (it's a genuine dead-end) and re-decide, so a bot never paces endlessly.
const BOT_ESCAPE_MAX = 2;
// Wall-jump-aware reachability: with Wall Slide on, a bot can scrabble UP a wall it's
// pressed against (wall-jump), so the planner grants extra reachable height beside a
// wall (approximate — a true chimney climb is iterative). Gated to wall-adjacent cells.
const BOT_WALLJUMP_UP_BONUS = 4;      // extra blocks of climb allowed alongside a wall
// Stuck → Follow ("mirror") mode: show a "!", wait for the player to come near, then
// copy their inputs for a stretch to thread the same route; warp as a last resort.
const BOT_MIRROR_RANGE  = 5;    // blocks: player must be at least this close to start mirroring
const BOT_MIRROR_FRAMES = 210;  // how long to mirror the player before giving up → warp (~3.5s)
const BOT_STUCK_WARP_DELAY = 30; // "!" shown this long before a stuck-teleport warp (~0.5s)

const VICTORY_MUSIC_FILE   = 'music/boss/victory.mp3';  // ~20s fanfare after Ender Dragon defeat

// Music disc registry — each entry maps a disc key to its audio file and display name.
// audioFile paths are relative to the game root (e.g. "music/background/newday.mp3").
// Add more discs here; no other code changes needed.
// Wither Boss (Phase 14)
const WITHER_MAX_HP        = 200;
const WITHER_ARENA_MIN_COL = 550;   // camera west bound during Wither fight
const WITHER_ARENA_MAX_COL = 600;   // camera east bound during Wither fight
// Camera Y lock: row 39 sits at the bottom edge of the canvas (no vertical scroll during fight)
const WITHER_CAM_LOCK_Y    = 40 * BLOCK_SIZE - CANVAS_H;   // = 780 px
const WITHER_SPAWN_COL     = 570;   // Wither spawn column (block units)
const WITHER_SPAWN_ROW     = 30;    // Wither spawn row    (block units)
const WITHER_PLAYER_COL    = 575;   // player arrival column (block units)
const WITHER_PLAYER_ROW    = 35;    // player arrival row    (block units)
const WITHER_BODY_W        = 96;    // forward-facing sprite width  (3 blocks)
const WITHER_BODY_H        = 96;    // sprite height                (3 blocks)
const WITHER_SIDE_W        = 32;    // left/right-facing sprite width (1 block)
const WITHER_BASE_ROW      = 30;    // vertical centre row for sinusoidal bob
const WITHER_MUSIC_FILE    = 'music/boss/wither.mp3';

// Phase 16 — Multiplayer player colours (player 1-4)
const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];

const MUSIC_DISCS = {
  NEW_WORLD: {
    discName:       'New World',
    audioFile:      'music/background/New_World.mp3',
    category:       'background',   // 'background' | 'boss'
    defaultUnlocked: true,           // available from start without collecting
  },
  AXOLOTL: {
    discName:       'Axolotl Paradise',
    audioFile:      'music/background/Axolotl_Paradise.mp3',
    category:       'background',
    defaultUnlocked: true,
  },
  BREEZE: {
    discName:       'Breeze',
    audioFile:      'music/background/Breeze.mp3',
    category:       'background',
    defaultUnlocked: true,
  },
  CLOUDS: {
    discName:       "Clouds",
    audioFile:      'music/background/clouds.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NETHERITE: {
    discName:       "Netherite",
    audioFile:      'music/background/netherite.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NIGHTFALL: {
    discName:       "Night Fall",
    audioFile:      'music/background/Nightfall.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NO_ESCAPE: {
    discName:       "No Escape",
    audioFile:      'music/background/No_Escape.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  SHRIEKER: {
    discName:       "Shrieker",
    audioFile:      'music/background/Shrieker.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  SHULK: {
    discName:       "Shulk",
    audioFile:      'music/background/Shulk.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  THUNDERSTORM: {
    discName:       "Thunder Storm",
    audioFile:      'music/background/Thunder_Storm.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  DRAGONS_LAMENT: {
    discName:       "The End",
    audioFile:      'music/boss/The_End.mp3',
    category:       'boss',
    defaultUnlocked: false,
    droppedBy:      'ENDER_DRAGON',  // drops when this boss is defeated
  },
};
