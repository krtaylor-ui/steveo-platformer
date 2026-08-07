# STEVEO PLATFORMER - OUTSTANDING BROWSER-TEST ITEMS

Plain ASCII on purpose (this text has been garbled in transit five times; no special
glyphs, no smart quotes, no box-drawing, no emoji). Current deploy = build 390.

Notation: ">=" means "at least"; "->" means "then/leads to"; "S42" means the item the
old notes wrote with a section sign. Editor top-bar buttons are referred to by word:
Settings, Perf, Test, Save, Import, Export, Exit.


## HOW TO RUN (two rules learned the hard way)

1. STALE-BUILD CHECK. Before each item, confirm the version badge (bottom of the menu)
   reads at least that item's "needs build". If it is lower you are on a stale deploy -
   that trap cost a whole 368 diagnosis. Console check:
       GAME_VERSION.match(/build \d+/)[0]
   The current deploy should read "build 390" or higher.

2. USE THE NAMED INSTRUMENT, do not substitute. Where an item names a console value or a
   specific overlay, use exactly that. In particular for S42 perf: measure with
   window.game._gov._win or the live debug HUD, NOT the Perf overlay - the Perf overlay
   gates the pass OFF while it measures, so it reports the wrong thing.

General:
- Do not stop between items. Record PASS / FAIL / BLOCKED / NOTE plus one line each, and
  write ONE report at the end. A FAIL is the point of the run, not a problem with it.
- Defer anything needing login, a second account, or a file picker to PART B.
- Debug HUD: press the backtick key ( ` , the key left of "1" ) while in Test. It shows
  fps / worst-frame / cells-on-screen / tier, and it slows the death burst to 1/4 speed.
- Console globals in Test: window.game, window.game._gov, window.OH_PERF, window.OH_SOAK,
  window.OH_SETTINGS, window.OH_WORLD_SETTINGS.


## FIXTURES (build once, reuse)

- "Mega Fixture (d4)": a NEW overhead world, grid density = 4, about 40x30. Paint and
  remember: a raised wall (cells at level 2-3) with open ground just NORTH of it; a pit in
  flat ground reachable on foot from all four sides; a lever on flat ground and a second
  lever on top of a raised block; a pipe (building) with a destination and open ground to
  walk into it from below; one or two raised glass blocks; a couple of mobs and an item; a
  player spawn and a goal star.
- "Mega Fixture (d1)": a density-1 copy of a similar layout, for the d1 comparisons.


## STATUS (2026-08-07)

DONE and verified on build 390: 366 (burst height over rim, PASS - clean height arc),
369 (pipe climb-in, PASS at BOTH d4 and d1 - real translation, not a centre collapse),
373 (loading banner + zoom-out, PASS both halves), 363 (lever hit-area, PASS at BOTH d4 and
d1 - at d1 the sprite selects but one full cell above does NOT, the intended contrast with
d4). 368 closed both directions.

Note on the 369 scale factor: NOT quoted. d4 and d1 climb profiles match in SHAPE, direction
(pipe-relative), end state (inside the pipe), and 32 world px per block at both densities -
but the raw pixel displacements (d4 ~35px, d1 ~50px from standing) both include the
post-key-release approach slide, which was not isolated from the climb. Treat 369 as a
qualitative PASS, not a measured ratio.

Still genuinely untested: A9.6 IMPORT PATH. The d1 fixture was side-loaded (fetched from the
served repo file and written into localStorage), which exercises _offlineOverheadWorlds + the
card render but NOT the Import-from-File flow. A9.6 has not moved (still needs the OS picker,
Part B).

FIXED 2026-08-07 (build 391): overhead-editor render-loop flood. Selecting a bare TERRAIN
cell (or a bridge) with the Hand tool made the "click to move" highlight throw
"reading 'col'" every frame (~10k console errors, caught by the loop try/catch so no hard
freeze). Pre-existing editor bug, NOT the side-loaded fixture. No re-test needed beyond
confirming a terrain click no longer floods the console.

INSTRUMENT NOTES (learned this session - use these, they save time):
- SELECTION is window.game._selEnt (or the editor's _selEnt). _sel is ALWAYS null - reading
  it gives a false "nothing selected". Verify a click by comparing _hover (the cell) against
  _selEnt (the picked entity: {kind:'device', txId:N} for a lever).
- DO NOT calibrate clicks with synthetic events into _cellFromEvent - it disagreed with the
  real hover (gave 1,10 where hover read 3,12). And screenshot coords are NOT CSS pixels here
  (about 0.795x). Trust window.game._hover for "which cell is under the cursor".
- On a SMALL world (map smaller than the canvas, e.g. the d1 fixture) the camera is FIXED,
  not player-centred. That is correct, not a bug.
- To load a repo fixture WITHOUT the OS file picker: it is served, so fetch it and write it
  into the overhead store, e.g.
      fetch('/tools/overhead-worlds/mega-fixture-d1.json').then(r=>r.json()).then(w=>{
        const s=JSON.parse(localStorage.getItem('steveo_overhead_worlds')||'{}');
        s['oh-'+w.world_name]=w; localStorage.setItem('steveo_overhead_worlds',JSON.stringify(s));
      });   // then reload; it appears in the Overhead list. (This is NOT a test of Import.)
- PIPE FOOTPRINT is one BLOCK = density x density cells (4x4 at d4, 1 block at d1). "Walk in
  from below" means from SOUTH OF THE FOOTPRINT, not south of the stated anchor col,row - the
  player is blocked about 2 cells short of the anchor at d4 (the footprint is solid).
- If controllers WILL NOT enumerate (getGamepads stays empty even after a button press and
  every page-level gate is open), it can be a per-Chrome-instance failure. Switch to a fresh
  Chrome instance rather than debugging the page.
- Perf subsystems RULED OUT as the frame-pacing loss (measured near-zero): mob AI update
  (mobManager.update ~0.19 ms at 60 mobs), detection (detectCfg.enabled false), pathfinding
  (pathCfg null). The loss is outside JS - profile with the browser Performance + Memory track.

FIXTURE-STATE LANDMINE (tester's environment, 2026-08-07): "Mega Fixture (d4)" was left with
pitMode: "deadly" (set to test 366). Re-running 370's default "solid pit" (block, not death)
check on THAT world will kill instead of block - use a FRESH overhead world for the 370
default. The repo d1 fixture (mega-fixture-d1.json) is non-deadly and safe.

FULL INSTRUMENT SET (18 notes A-F) + the mob-count table live in the tester's
BRIEF-INSERT-2026-08-07-ascii.md (below its CUT HERE line). Merge verbatim when transferred -
the notes above are the highest-value subset already folded in.

Portal FYIs from that run - both are NON-BUGS, confirmed in code, so future runs use the
right instrument:
- _portalCells / _portalByKey are JavaScript Maps. JSON.stringify of a Map is "{}", which is
  why they looked empty - the data is fine. Inspect with .size and [...map.keys()], NOT
  JSON. To check "is this portal linked", read a building's config.dest and confirm
  window.game._portalByKey.get(dest) resolves (and .size == number of pipes/portals).
- _portalCd staying true while you STAND on the destination pipe is the intended re-trigger
  guard (overhead-game.js:392 releases it once you step away, dist > useR*0.6). Not a stuck
  state - step off and back on to trigger again.

READY-TO-IMPORT d1 fixture (unblocks the d1 halves of 363 and 369 without hand-building):
import tools/overhead-worlds/mega-fixture-d1.json via Sandbox -> "Import from file". It is a
density-1 overhead world with a lever on flat ground, a lever on a raised (elev-2) block, two
LINKED pipes (walk in from below), a small pit, a raised wall, a mob and a coin. Generated and
engine-validated headlessly (node tools/gen-d1-fixture.js). Its pit is NON-deadly (pitMode
default), so it will not kill you during the 369 climb test.


## PART A - run all, do not stop

### 363  Lever selectable where it draws - the d1 comparison
needs build >= 363
Instrument: Hand tool; the action bar (Settings / move / trash, named "lever . Tx #..")
appears when a lever is selected.
Steps: On Mega Fixture (d1), click the lever sprite; it should select. Then click a FULL
cell ABOVE the lever - at density 1 that should NOT select (the sprite does not reach
there). On Mega Fixture (d4) you already confirmed you can select the lever anywhere its
sprite draws, including the arm tip and one to two cells to the side.
Expected: d4 = selectable across the whole drawn sprite; d1 = selectable on the sprite,
not a full cell above it. Hover names the Tx channel in both.

### 366  Death burst pieces have decaying height over a pit rim
needs build >= 366
SETUP THAT MATTERS: since 370 the default Pit blocks setting is "Solid obstacle" (walking
into a pit is BLOCKED, not fatal), so no death burst plays by default. First open
Settings -> Advanced ON -> Threats -> set "Pit blocks" to the instant-death / deadly
option. Save. Turn the debug HUD ON (backtick) so the death plays at 1/4 speed.
Steps: In Test, walk the player INTO the pit; the worst case is approaching from the NORTH
edge (up into the pit from below a cliff). Watch the coloured burst pieces near the rim.
Expected: early frames of a piece can fly OVER the rim; as pieces settle they drop BEHIND
the rim (hidden by it). Height decides it, not a flat pop. No piece hovers implausibly on
top of a rim block it should be behind once settled.

### 367  World-card Delete - the destructive (actually-delete) path
needs build >= 367
Steps: Make a throwaway world. From the Sandbox list card click Delete -> an IN-PAGE modal
appears ("Delete this world? ... This cannot be undone.") with Cancel focused and a red
Delete. Press Enter immediately without moving: it must CANCEL (Cancel is focused), not
delete. Reopen, click Delete, click the red Delete: the world is removed. Repeat the
destructive confirm from inside the editor (the trash button in the editor HUD).
Expected: never a native browser dialog; Enter-without-moving cancels; Esc / backdrop
cancels; the red Delete actually deletes the throwaway.

### 369  Pipe climb-in animation at density 4
needs build >= 369
Steps: In Test on Mega Fixture (d4), walk into the pipe from below. Compare with the pipe
on Mega Fixture (d1).
Expected: the "reach up -> grab the rim -> pull up -> sink in" animation plays RELATIVE to
the pipe (grabs the pipe's rim and climbs). It must NOT collapse to a tiny motion buried at
the pipe's centre (that was the density-4 bug). d4 and d1 should read the SAME, just scaled.

### 371  Measured performance (console call + overlay)
needs build >= 375   (IMPORTANT: 371-374 show the old INVERTED numbers - that was the
original FAIL; the measurement was rewritten in 375. Do not judge this below build 375.)
Steps: In Test on Mega Fixture (d4), run in the console:
    window.game.measurePerformance()
Also open the Perf overlay (top bar) and Settings footer "Measure performance".
Expected: returns an object { baselineMs, tiers:[ {label,fps,msPerFrame} ... ],
passes:{shadowsLive,night,glare} }. The Full tier reports a LOWER fps than Flat; numbers
are plausible for the machine (not all 60, not all 0); live shadows is the largest per-pass
cost. The button must never freeze or break the editor (it falls back to a prediction).

### 372  Quality governor - Off never draws; drop order under load
needs build >= 372   (use build >= 375 for any perf MEASUREMENT alongside it)
Instrument (console): window.game._gov.flags = your policy; window.game._gov._stack = the
drop order; window.game._gov.cfg() = what is active right now.
Steps: Settings -> Advanced ON -> Atmosphere group -> three selectors (Shadows / Night
lighting / Glass glare, each Protected / Sacrificeable / Off). Set Glass glare = Off, Save,
Test: glass glare never draws. Set Shadows = Sacrificeable; force load (big/dense map,
zoom out) and watch the debug HUD tier.
Expected: an Off pass never draws. Under sustained load the governor drops the cheapest
SACRIFICEABLE pass first, then lowers the cap, and only touches a PROTECTED pass last.
Fresh-world defaults: glare Sacrificeable, shadows + night Protected.

### 373  Chunked bake - Loading World banner + zoom-out intro
needs build >= 373
Steps: Make/open a BIG, dense overhead world (density 4, large size) and Test it. (A small
world may be near-instant - use a big one, an XL d4 world is ideal.)
Expected on entry: a "Loading World..." banner with a progress bar that FILLS (not an ~8fps
frozen screen). When it completes the view is zoomed in on the player, then ANIMATES zooming
OUT to the world's default zoom, and the banner drops. The zoom happens AFTER the load,
never during. Screenshot the banner mid-progress.

### S42 (374)  Depth occlusion - feet clipping + perf with many mobs   (default OFF)
needs build >= 374
Steps: Settings -> Advanced ON -> View & Controls -> turn ON "Walls hide things behind them
(depth occlusion)". Save. Test. Position so a mob/item stands just NORTH of (behind) your
raised wall, camera looking down.
Judgement calls to report:
- Does the taller wall CONVINCINGLY hide the mob/item behind it? A mob standing high on a
  tall wall must NOT be hidden by a SHORTER wall one row to the south.
- Are the mob's FEET clipped by the block it stands on, especially at HIGH zoom?
- Does frame rate suffer with MANY mobs on a dense map? MEASURE THIS with
  window.game._gov._win or the live debug HUD (backtick) - NOT the Perf overlay, which gates
  the pass off while measuring and would give a false reading. Compare occlusion ON vs OFF.
These decide whether it ships default-on. Turn it OFF -> everything draws on top again
(current deployed behaviour).


## PART B - deferred (needs login / a second account / a file picker) - do last, together

### Arena 4-player controller re-test  (the freeze)   -- STILL OPEN, real test pending
needs build >= 389   (freeze fix 383, bar-grab 382, per-player grapple 386, controller Aim
Style 388-389, and the stall detector 387 are all required)
Login blocker: CLEARED (2026-08-07). Arena lists server worlds, the mode modal opens in-page
with Custom Rules, no expired-session bounce, and the end-of-match leaderboard works.
Bots-only run (2026-08-07): a full 5-min Survival match with P1 keyboard + P2-P4 Medium BOTS
came back clean - 0 [STALL] lines, 66-68 fps, 0 errors, adaptive zoom worked. But this does
NOT close the item: (a) getGamepads() saw 0 pads the whole time, so the USB-HID / controller
path was never exercised (do NOT fake pads - that removes EXTERNAL from the picture and makes
a clean result meaningless); (b) it ended on the timer at Wave 2 with 1 mob killed, so the
heavy wave-4/5 density that might trigger the O(n^2) mob scans was never reached.
REAL TEST (tomorrow, hub + 4 controllers): press a button on EACH pad first (the Gamepad API
only exposes a pad after a button press - that is why it read 0), confirm all four register,
then run a 10-20 MINUTE match so waves 4-5 arrive. The stall detector is armed and proven
quiet, so a real freeze will produce the culprit line.
NEW (build 392): the [STALL] line and window.game._lastStall now carry the ENTITY LOAD
(mobs / arrows / players) and the arena PHASE, and the perf HUD shows them - so a freeze is
self-correlating (no more bare gap number). The [perf] slow-frame line carries phase too.
MOB CAP: NOT happening - the full-range data (per-frame work FALLS 3.17ms -> 1.98ms as mobs
go 4 -> 49, fps up to ~91) disproves it; mob count is not the bottleneck. The loss is frame
pacing / outside JS (~14% CPU util while fps swings 46-121). Highest-value next step is a
browser Performance trace WITH the Memory track during a busy wave - that is a human/browser
task. GATE any Arena perf sampling on arenaState.phase === 'running' (game.state stays
'playing' on the Game Over screen - the liveness gotcha), and confirm the mob subsystem
actually consumed time before trusting a budget.
STILL untested (sat at zero all run, NOT cleared): drops / explosions / webs / particles.
Instrument for the freeze: open the console BEFORE playing. On a freeze the loop prints
    [STALL] <n>s gap between frames | ... culprit: OUR CODE | EXTERNAL
and window.game._lastStall holds the last one; the perf HUD shows "LAST STALL ...". Report
that line verbatim. OUR CODE = a single long frame (read the [perf] line for mobs/arrows).
EXTERNAL = GC / browser / USB-HID between frames (points at the audio-churn fix in 387 or
the USB hub). This one line decides the diagnosis.

### 368 server 403  (two accounts)
Owner marks a world "Hide from export" and shares it; the OTHER account hits
GET /api/worlds/sandbox/<id>/export and must get 403 ("creator has turned off export"); the
OWNER hitting the same URL still gets the file (200). Needs login + two accounts + the real
backend (not the static server).

### File-import rejection (A9.6)
Sandbox -> Import from File -> a non-world JSON and a wrong-engine file. Expected: an
in-page error ("...not a Steveo world - no map data for either engine"), not a native
dialog, and nothing imported. Needs the OS file picker.


## OPTIONAL / LOW PRIORITY

- 368 UI-restore path: 368 is CLOSED and verified both directions on build 390. The one
  path not re-checked is turning the flag back OFF through the SETTINGS UI (the last check
  was done via localStorage + reload, which exercises data+render but not the UI toggle).
  Cheap to confirm: Settings -> Designer Locks -> Hide from export OFF -> Save -> the three
  Export buttons return.


## REPORT TEMPLATE (fill at the END)

    OUTSTANDING PASS - <date>, Chrome <version>, build badge: <...>

    363 lever d1 comparison ........ PASS/FAIL/NOTE - <obs>
    366 burst height over rim ...... ...   (Pit blocks set to deadly? y/n)
    367 delete destructive path .... ...
    369 pipe climb-in at d4 ......... ...
    371 measurePerformance() ....... ...   (Full ?fps / Flat ?fps; shadows/night/glare ms)
    372 governor Off + drop order .. ...
    373 loading banner + zoom-out .. ...
    S42 occlusion feet/perf ........ ...   (feet clipped at high zoom? perf many-mobs on/off?)

    PART B
    Arena 4p controller freeze ..... DONE/STILL-DEFERRED - [STALL] line: <verbatim>
    368 server 403 (two accounts) .. ...
    A9.6 file rejection ............ ...

    OVERALL: <ship / fix-then-ship / not-ready> - <one sentence>
