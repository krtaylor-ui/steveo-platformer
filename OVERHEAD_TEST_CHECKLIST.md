# Overhead Engine — Browser Test Prompt (builds 298–307)

> **Paste everything below the line into the Chrome-enabled Claude session.**
> It's written as a self-contained instruction for a Claude that can drive Chrome
> (navigate / click / screenshot / read the page). You (Kevin) relay its findings back.

---

You are testing an HTML5 canvas game ("Steveo Platformer") in Chrome. I need you to
verify the **Overhead Engine** — a top-down mode. Work through the checklist below,
and for each item report **PASS / FAIL / BLOCKED**, one line of what you saw, and a
screenshot when the result is visual. At the end, give me a compact table.

## Setup
1. Open **http://localhost:8000** (a local dev build — NOT the production site).
2. If a login screen appears, **pause and let me (the human) log in**, then continue.
3. Go to **Sandbox**, switch the view toggle to **🗺 Overhead**, and either:
   - click **🗺 New Overhead World** to build a small test map, or
   - open an existing overhead world and click **Test**.
4. **The debug HUD (top-right) is your instrument.** In Test mode it's on by default.
   It shows six lines:
   ```
   <build> · <mode> · <state>
   map <W>×<H> d<density>  zoom <z>
   plr c<col>,r<row> elev<n> hp<n>/<max> wpn:<weapon>
   keys: <keys held>  sprint:<0|1>
   jumpClear <a>+<b>  day/night: <phase>
   channels ON: <live redstone channels>
   ```
   Press the **backtick ( ` )** key to toggle it. Screenshot it whenever a check
   depends on state you can read there.

## Checks

### A. Debug HUD (build 307)
- **A1** Enter Test mode → confirm the 6-line HUD is visible top-right. Screenshot.
- **A2** Press `` ` `` → HUD hides. Press again → it returns.

### B. Movement, jump, sprint (builds 295–296)
- **B1** Hold **Shift** and move → HUD shows `sprint:1` and the player is faster.
- **B2** Face a **1-level wall** and **jump** (Space) → player mounts it (HUD `elev` rises by 1). With `jumpClear 1+1`, a jump + double-jump should clear **2** levels.
- **B3** Try to **walk** (no jump) into a 1-level wall when climb is None → blocked, `elev` unchanged.

### C. Cliff-fall safety & elevation (build 294)
- **C1** Walk off a high platform edge (drop > max step-down) → you are **blocked** at the edge, you do **not** fall. HUD `elev` stays put.
- **C2** Use a **ramp** to descend → allowed; `elev` decreases smoothly.

### D. Pits, lava, death animation (builds 294–296)
- **D1** Walk into a **deadly pit** → the player figure shrinks/sinks for ~1s then bursts into coloured blocks (family-friendly), then Game Over. Screenshot mid-animation.
- **D2** If the world sets pits to **obstacle** mode → the pit blocks movement even in GOD mode (no death).
- **D3** Step onto **lava** → instant death.

### E. Day / Night (builds 292–293)
- **E1** In a world with Day/Night on → HUD `day/night` phase advances over time; the scene tint shifts (night goes nearly black).
- **E2** Confirm **glowstone / lava** cast light in the dark, and cliff **shadows** appear.

### F. Keys & Lock (build 306)
- **F1** Walk over a **key** item → HUD `keys:` lists it (e.g. `key_gold`).
- **F2** Stand next to a **Lock block** with a matching key and press **E** → the lock powers; HUD `channels ON` gains the lock's transmitter (e.g. `T3`). Screenshot the HUD.
- **F3** If the lock is "consume key" → after use the key leaves `keys:`.

### G. Redstone core, Tx/Rx, gates (builds 298–304)
- **G1** Flip a **Lever** with **E** → HUD `channels ON` toggles that lever's channel; a wired **Lamp** downstream lights.
- **G2** **Dust** propagates power from a source to a lamp across a run.
- **G3** Step on a **Pressure Plate** / load a **Weight** block → its channel turns on while occupied.
- **G4** A **Piston** becomes a **solid barrier** while its channel is powered (you can't pass), and passable when off.
- **G5** **AND** gate lamp lights only when **both** inputs are powered; **NOT**/**NOR** invert. Directional: only the configured input/output sides carry power.

### H. Bridges & drawbridge (builds 298, 305)
- **H1** A plain **bridge** lets you walk across a pit/chasm; without guardrails you can fall off the sides, with them you can't.
- **H2** A **drawbridge** starts open; power its channel (lever/plate) → the whole deck **raises as one unit** (animated ~80° tilt), and lowers when unpowered. Screenshot raised + lowered.

### I. Editor tools (builds 299–303)
- **I1** **H / D / E** keys switch Hand / Draw / Erase; the active tool highlights blue.
- **I2** **Number keys 0–8** set the paint elevation.
- **I3** **G** = fill/bucket flood-fills a region; **Alt-click** eyedrops the block under the cursor.
- **I4** Shape tools (line/rect/circle) draw terrain **and** dust/bridges/ramps as a run.
- **I5** **Ctrl-drag** marquee-selects; **double-click** selects a whole connected run (e.g. a bridge); **Ctrl+C** copies onto the cursor, **click** pastes; **X/Y** flip, **T** rotate the clipboard.
- **I6** The **"Hide above elev N"** view filter hides everything above the active elevation (build inside mountains).
- **I7** **Undo/Redo** must **not** move the camera or change zoom.

## Report format
A table: `Check | PASS/FAIL/BLOCKED | note`. Attach the screenshots inline. List any
console errors you saw (open DevTools console and note red errors).
