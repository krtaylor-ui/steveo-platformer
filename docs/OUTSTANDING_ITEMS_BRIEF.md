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

The AUTHORITATIVE, complete instrument set (18 notes A-F) + the measured mob-count table +
the tester's open-items view are appended at the END of this file under
"INSTRUMENT NOTES (added 2026-08-07 by the tester...)". The short bullets above are a subset;
prefer the appended set where they overlap.

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

===================================================================================

## INSTRUMENT NOTES (added 2026-08-07 by the tester; measured on builds 390 and 391)

These cost real hours to find. Each one is a thing that produced a WRONG result before it was
understood.

### A. Measurement validity (read before trusting any perf number)

1. game.state reads "playing" even when game.arenaState.phase === "ended". It is NOT a liveness
   check in Arena mode. Gate Arena perf sampling on arenaState.phase === 'running', AND also
   require that the mob subsystem actually consumed time during the sample interval, before
   trusting a frame budget. Build 392 puts phase on every perf/stall line, so a sample tagged
   phase=ended is now obvious.
   How this bit: a whole frame budget was measured on the Game Over screen and published before
   being retracted. The tell was entity arrays frozen for 37+ seconds (playerArrows 13, xpOrbs
   42, damageNums 23) and mobManager.update costing EXACTLY 0.000 ms, i.e. never invoked.

2. Frame-INTERVAL sampling cannot reveal headroom. Wall-clock frame deltas sat at p50 16.6 ms,
   which is only the frame cap, so entity counts showed zero-to-negative correlation with it.
   Time the work INSIDE the frame instead: wrap game._update, game._render and
   game.mobManager.update and accumulate per frame.

3. Record document.hasFocus() with every perf sample and DISCARD unfocused samples. Chrome
   deprioritises rendering for an unfocused window. This one gate is what separated the
   trustworthy numbers from the untrustworthy ones in this session. An unfocused run produced 11
   frame gaps over 150 ms (worst 310 ms) that were artifacts, not stalls.

4. Do not fit a cost slope over a narrow slice of the achievable range. A fit over 0-8 mobs, out
   of an achievable 0-60, produced a slope with the WRONG SIGN (+0.43 ms/mob) and a bogus
   "30-35 concurrent mob ceiling". Over the full 0-60 range the slope is -0.0095 ms/mob,
   r = -0.169, i.e. no cost signal. Both of the earlier numbers are withdrawn.

### B. Overhead editor

5. OH_EDITOR._selEnt is the selection. OH_EDITOR._sel is ALWAYS null. Reading _sel gives a false
   "nothing selected" even with an object plainly selected and its action bar on screen.
   Shapes seen: {kind:"device", ref:{col,row,kind,channel,txId}, col, row} for a lever, and
   {kind:"terrain", col, row} for bare ground.

6. OH_EDITOR._hover is the reliable "which cell is under the cursor" readout. Verify every click
   against it instead of trusting coordinate arithmetic. This is what made the 363 d1 result
   unambiguous.

7. Screenshot coordinates are NOT CSS pixels (about 0.795x in this session: the canvas rect was
   1526x954 CSS but rendered about 1210x760 in the screenshot). Two consequences: do not feed
   screenshot coordinates into _cellFromEvent, and do NOT calibrate with a synthetic event.
   _cellFromEvent({clientX:340, clientY:703}) returned (1,10) where the real cursor at that same
   screenshot point gave _hover (3,12).

8. On a density-1 world the camera is FIXED, not player-centred: the map (768x512 world px) is
   smaller than the 800x500 canvas, so nothing scrolls. When cropping canvas frames on a d1
   world, crop around the OBJECT, not the canvas centre.

### C. Portals and pipes

9. _portalCells, _portalByKey and _portalIndex are Maps. JSON.stringify of a Map is "{}", which
   is why they look empty while portals work perfectly. Correct usage, confirmed working:
   game._portalByKey.size, [...game._portalByKey.keys()], and
   game._portalByKey.get(building.config.dest) to confirm a link resolves.
   Verified at d1: size 2, keys ["15,8","20,8"], both config.dest values resolve.

10. _portalCd (portal cooldown) stays true while the player remains inside the destination pipe's
    radius. It did NOT clear in 8 seconds of standing still; walking away cleared it immediately.
    Two E presses looked like failures before this was understood. Both were tester error, not
    defects.

11. Pipe footprints are one BLOCK: 4x4 cells at density 4, 1x1 at density 1. Measured with
    _buildingSolidAt - the pipe recorded at col 130, row 70 was solid across cols 130-133 x rows
    70-73. So "walk into the pipe from below" means the row immediately south of the FOOTPRINT,
    not of the stated col,row. At d4 the player is blocked about 2 cells short of the stated row.

### D. Arena and gamepads

12. _zoomOverride is gated in Arena mode. Setting it to 1.0 or to 0.4 left _resolveViewZoom() at
    0.50, so a controlled zoom sweep is not possible from the console while in Arena.

13. mobManager._createMob('Zombie', x, y) returns null and adds nothing - wrong signature, likely
    grid cells or a spawn-point object. A working console spawn hook would enable controlled
    entity sweeps (which is what would have caught note 4 immediately). The tester declined to
    keep guessing at an internal API.

14. mobManager.arenaMode read false during a live Arena Survival Waves match. Observation only,
    no claim about whether it matters.

### E. Gamepad enumeration (cost hours; nothing to do with the game code)

15. The Gamepad API exposes a pad only AFTER a button press on that pad, and only to a page that
    has FOCUS. The gate is PER PAGE: presses made in another browser, or another tab, do not
    carry over. A connected but idle pad correctly reads as absent, so "0 pads" is NOT evidence
    of a hardware, hub or USB fault.

16. "Guide/Home button works but A does nothing" is the signature of the pads being fine while
    the browser is not the FOREGROUND window. Windows handles Guide globally; A only reaches the
    foreground app.

17. Gamepad enumeration can fail per Chrome INSTANCE. In one automation-driven instance the pads
    never enumerated while every page-level gate was open: isSecureContext true, getGamepads
    present, top frame, Permissions-Policy allowing gamepad and hid, document.hasFocus() true,
    and zero gamepadconnected events. The same four pads enumerated normally in the user's own
    Chrome. If pads will not appear, switch browser instance rather than debugging the page.
    Confirmed working pads: 4x "Xbox 360 Controller (XInput STANDARD GAMEPAD)", indices 0-3,
    17 buttons, 4 axes, mapping "standard".

### F. Stale build

18. A Chrome instance served build 390 while the server was on 391, with no reload prompt: SPA
    navigation does not re-fetch the bundle. Same trap that previously cost a whole 368
    diagnosis. Check the badge, not the deploy.


## ARENA MULTIPLAYER PERF - MEASURED RESULT (2026-08-07, build 391)

Setup: Film Crew Arena, Survival Waves, 4 players (P1 human + 3 Medium Bots), waves set to 15,
20-minute match, played to the final mob. 280 valid buckets after gating on phase === 'running',
focused, and mob subsystem consumed time. 188 buckets rejected as not-live, 0 unfocused,
0 sim-dead.

  mobs    buckets  work ms  _update  _render  mobAI  fps
  0       41       2.10     0.64     1.46     0.06   76
  1-4     95       3.17     1.87     1.30     0.07   60
  5-9     24       2.79     1.15     1.64     0.11   74
  10-19   36       2.53     1.05     1.47     0.12   84
  20-29   30       2.34     0.68     1.65     0.14   81
  30-39   18       2.18     0.58     1.60     0.14   89
  40-49   14       1.98     0.52     1.46     0.14   91
  50-60   22       2.63     0.67     1.96     0.19   80

Work goes DOWN as mobs go UP, and frame rate goes UP. At 40-60 mobs: about 2 ms of work at
80-91 fps. Worst single bucket among all 40+-mob samples: 4.81 ms, under a third of a 16.6 ms
budget. Overall about 2.4 ms of 16.6 ms, roughly 14 per cent utilisation. Frame rate across all
valid buckets ranged 46-121 fps, so the loop is not hard-capped at 60.

The 1-4 bin looks worst because it is dominated by early-wave active combat with the human
fighting and four players spread apart. That is busy for reasons unrelated to mob count, and it
is exactly the confound that produced the retracted 0.43 ms/mob figure.

The only thing that scales with mobs is mob AI, and it is trivial: mobManager.update rose
monotonically 0.06 -> 0.19 ms from 0 to 60 mobs. Extrapolated even to 300 mobs that stays under
1 ms. playerArrows cost about 0.04 ms each. XP orbs and damage numbers showed NEGATIVE slopes,
which are correlation artifacts from quiet post-wave periods, NOT savings.

Confirmed not costing anything in this mode:
  - mobManager.detectCfg.enabled === false. Mob sight/sound detection never runs here
    (sightRange 288, sightArcDeg 120, packAlert false, sprintMobs false). Enabling it for arena
    would add per-mob cost where there currently is none.
  - pathCfg null and _activePathCount 0 throughout. Pathfinding inactive.
  - explosions, webs, droppedItems, _particles, _platformDebris all stayed at 0 for the whole run
    because Disable Mob Drops was on (the default). UNTESTED, NOT exonerated.

Conclusions:
  - Do NOT add a mob cap for performance reasons. 60 concurrent mobs cost nothing measurable. A
    cap for design reasons (readability, difficulty pacing) is a separate and legitimate
    argument, but it must not be justified on performance.
  - Do not trim arrows, XP orbs, damage numbers or particles. All free.
  - The optimisation target is FRAME PACING, not entity load. About 14 per cent CPU utilisation
    while frame rate swings 46-121 fps means the loss is outside JS work. Candidates: GC from
    per-frame allocation, vsync/compositor interaction, audio churn, OS contention. Highest-value
    next step is a browser Performance trace with the Memory track during a busy wave; GC sawtooth
    would show immediately. This is a human/browser task, not a code-reading task.
  - The 4-player zoom-out to 0.50x is NOT hurting. _render held at 1.3-2.0 ms all run. The earlier
    hypothesis that view area was the multiplayer cost is NOT supported.


## OPEN ITEMS AS OF 2026-08-07 (tester view)

Needs four hands - nothing else substitutes:
  - Arena 4-controller freeze. Still unreproduced. Three runs today produced 0 [STALL] lines,
    game._lastStall never set, and 0 pad dropouts. Needs 4 played controllers on a 10-20 minute
    match so waves 4-5 arrive. Owner's own test of ONE pad driving all four players - firing,
    jumping, climbing, killing - was completely smooth, which points away from 4-player load and
    towards either four distinct XInput devices being polled, or system-level contention.

Browser-runnable, not yet done:
  - 367 destructive delete path: throwaway world -> Save -> Exit -> Delete.
  - 371 window.game.measurePerformance() console call.
  - 372 governor Off-never-draws plus drop order.
  - S42 depth occlusion: feet clipping at high zoom, and many-mobs perf ON vs OFF measured with
    game._gov._win or the live debug HUD, NOT the Perf overlay (it gates the pass off while
    measuring).
  - 368 UI-restore path via the Settings toggle (low priority; 368 otherwise closed on 390).
  - Arena perf with mob drops ENABLED, to cover explosions / webs / droppedItems / particles,
    which sat at 0 for the whole profiling run.
  - A pit fixture with a raised block on a pit cell's SOUTH side, to finally test 366's
    "settles behind the rim" sub-clause. Of the 49 pit cells in Mega Fixture (d4) (bbox cols
    80-86 x rows 58-64), ZERO have a raised non-pit cell to the south, and the only tall geometry
    (the elev-2 cliff) is to the NORTH, which is drawn further from camera and cannot occlude.
    That sub-clause is NOT RUN, not failed.

Needs a second account or the OS file picker:
  - 368 server 403 with two accounts.
  - A9.6 file-import rejection. NOTE: the d1 fixture reached the app by localStorage side-load
    (GET /tools/overhead-worlds/mega-fixture-d1.json returned 200, written into
    steveo_overhead_worlds), so the REAL import path is still genuinely untested.

Fixture state left behind by the tester:
  - Mega Fixture (d4) is saved with pitMode "deadly" (required by 366's setup). Re-running 370's
    "solid pit" default check on that world will now kill the player instead of blocking. Use a
    fresh world for the 370 default check.
  - Mega Fixture (d1) unmodified: both levers on=false, pitMode "block", density 1.
  - steveo_theme "modern", 9 overhead worlds. No native dialog appeared on 390 or 391.
