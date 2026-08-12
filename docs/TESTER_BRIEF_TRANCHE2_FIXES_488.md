# Tester Brief — Tranche 2 fixes + Phase A/B (builds 486-488)

Base: branch `speedrunner-phase3` @ build 488, pushed. Suite green. No server changes since 485 (routes
already mounted). Plain-ASCII, relay-safe.

## Re-checks — the six Tranche 2 defects (build 486)

- T2-1 (Copy World legend) - open Copy World in MODERN theme: the "Copy to" legend should be light and
  readable on the dark modal (was 1.18:1 dark-on-dark).
- T2-2 (DIALOG family white) - THIS was an OS-light-mode bug: the dialog family keyed off the OS colour
  scheme, but the app has no light theme. On a LIGHT-OS machine, re-open the new Info modal (world card ->
  Info) and any DIALOG prompt/confirm: they must be DARK now, not white. (If your OS is dark, they were
  already dark - flip your OS to light to actually exercise this fix.)
- T2-3 (Speed Lines not seamless) - place a Wind Zone band, set style = Speed Lines, zoom to 3x: the
  dashes must now be CONTINUOUS across cell boundaries (no clipping at edges), like the chevrons. Still
  flows downwind. Re-measure the boundary/interior gradient ratio - should be near the chevron's ~0.05,
  not 6.85.
- T2-4 (Exit inert after community Play) - community ▶ Play a level, then click the HUD "Exit Game"
  button: it must now exit (was inert).
- T2-5 (exit lands on dashboard) - from a community Play, BOTH the HUD Exit button AND Esc->Pause->Main
  Menu must return to the STOREFRONT (community browser), not the dashboard. The browse list refreshes so
  the +1 play shows.
- T2-6 (Favorite overflows SR card) - an SR community card with Play + Download + Favorite must not
  overflow; buttons wrap to a second row if needed.

## NEW - Phase A: Level music + auto-BPM (build 487)  [browser-only, please verify]

Where: World Settings (a Speed Runner world) -> Beat Grid -> Edit.
- A "Song" dropdown lists the catalog tracks (MUSIC_DISCS). Pick one.
- Click "Detect beat from song": it decodes the track in-browser and fills BPM + Offset, with a
  confidence %. (Big tracks take a moment.) Manual BPM/tap/offset still work as the correction.
- Save. PLAY the level as a Speed Runner run: the chosen song should PLAY during the run (looped),
  muted by the existing music mute/volume. Beat lines should line up with the audio (tightest with
  Constant Speed on).
- PASS/FAIL each: dropdown lists songs; detect fills a plausible BPM+confidence; song plays during the
  run; mute/volume still governs it.
- Note: the pure BPM detector has 6 headless tests (test-bpm-detect.js). What needs YOUR eyes is the
  decode + playback + on-beat alignment.

## NEW - Phase B: Stick + Sketch characters (build 488)  [browser-only, proportions pass]

Where: character pickers (World Settings -> Character, or a world card's character dropdown).
- Two new characters: "Stick" (plain line figure) and "Sketch" (adds a triangle-skirt silhouette).
- Select Stick, play a level: it should be a thin LINE figure with a circle head that runs, jumps,
  spins on double-jump, wall-slides, grabs/climbs ledges, and swings hand-over-hand on bars - animating
  through all of them (it reuses the real skeleton). Same for the overhead engine (thin top-down figure).
- CRITICAL check: the HITBOX must be identical to any other character (cosmetic only) - it should collide
  and die exactly like Classic. Confirm no gameplay difference.
- What needs YOUR eyes: are the PROPORTIONS/animation good across poses? Flag any pose that looks broken
  (esp. crouch, ledge climb, bar swing). Names "Stick"/"Sketch" are provisional - Kevin may rename.

## Still un-run from the last pass (please close before merge)

- Sec 3 end-to-end achievements: define Level Challenges, play to the Goal Star, watch the achievement
  toast fire (creator UI + evaluator verified, but the live fire wasn't run).
- Sec 6 multi-player customs: TWO players each with a DIFFERENT custom character on screen at once.
- Arena / Custom Rules modals in the dark-modal pass (both T2-8 defects were in less-travelled corners).

---

## Build 489 follow-ups (from the 486-488 pass)

- Phase B bar-swing head: the articulated poses (bar-swing, hang, ladder) stick-ified the limbs but drew
  the HEAD as a skin/hair BOX (your 124 skin-tone pixels). Head is now a circle stroke in the stick colour
  there too. RE-CHECK: render Stick in bar-swing/hang/ladder — head should be a circle, ~0 skin-tone px.
  (Ledge-hang rendering blank for Classic too was a capture artifact, not a defect — please re-shoot.)
- Phase A song list: the Song dropdown now lists the FULL catalog (11 tracks; boss tracks tagged
  "(intense)"), not just the 3 background ones.
- Name: "Sketch" -> "Stick (Skirt)" (id unchanged) since the only difference is the skirt.

Still the priority for next pass (unchanged): (1) in-run music playback/mute/on-beat alignment, (2) the
three un-run items — end-to-end achievement FIRE (most important; never observed live), two different
customs on screen at once, Arena/Custom-Rules dark modals. Hold the merge until those close.

---

## Build 490 (from the 489 closeout)

- T3-1 (BLOCKER, fixed): Level Challenges now fire on the SPEED RUNNER finish line too — _srTriggerWin()
  calls _fireAchievements(elapsed); SR stats reset at each GO (fresh per run/retry). Was platformer-goal
  only. RE-CHECK: an SR run with challenges defined should produce _achFired + the toast + a POST, same as
  platformer.
- T3-2 (LOW, fixed): Custom Rules teaching text (win-condition guide, section headings, AND/OR/NOT tags,
  empty state) lifted off the 2.2-2.5:1 dim tokens to readable light on the dark modal.
- Beat Grid modal now shows a "remember to Save your world" reminder on Save (same trap as Level
  Challenges).

### Two known traps (documented, not defects)
1. The Level Challenges AND the Beat Grid modals write only LIVE EDITOR STATE — you MUST then hit the
   editor's top-bar Save or a real game gets no challenges/song. (Both now show a Save reminder.)
2. No POST from Test World is CORRECT — achievement persistence is gated on _launchWorldId, which is
   deliberately null in Test World. Test from a real created game to see the POST.
