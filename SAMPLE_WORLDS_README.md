# Sample Worlds — How to Try Them (Kevin's read-me)

**9 test worlds** live in `sample-worlds/` as `.json` files. They're generated content for your
review — keep / edit / discard, then give me a follow-up direction. Concepts are in
`SAMPLE_WORLDS_CONCEPTS.md`; the build record is appended to `DECISIONS_LOG.md`.

---

## 1. How to import & play (the one gotcha)

The offline **Import** always brings a file in as **Normal** mode — so after importing you set the
real mode on the world card. Steps:

1. Open the app **offline** (Play Offline) → **Sandbox**.
2. **Import File** → pick a `sample-worlds/*.json` → confirm (it'll warn about mode conversion; that's expected — proceed).
3. On the imported world's **card**, use the **Mode** dropdown to set the intended mode:
   - `SR_*.json` → **Speed Runner**
   - `Arena_*.json` → **Arena**
4. Play it. (Arena worlds launch through the Arena picker; Speed Run worlds through Speed Runner.)

All nine are named with a **`[Sample]`** prefix so they're easy to spot and bulk-delete later.

| File | Set Mode to | What it is |
|---|---|---|
| `SR_First_Steps.json` | Speed Runner | Easy intro run (Overworld) |
| `SR_Cavern_Dash.json` | Speed Runner | Medium technical run (Cave) |
| `SR_Nether_Gauntlet.json` | Speed Runner | Hard run over lava (Nether) |
| `Arena_Grassland_Melee.json` | Arena | 4-Player FFA (Overworld) |
| `Arena_Void_Twins.json` | Arena | 2v2 team islands (End) |
| `Arena_Fortress_Rush.json` | Arena | Capture the Flag (Nether) |
| `Arena_Crater_Crown.json` | Arena | King of the Hill (Cave) |
| `Arena_Keep_Siege.json` | Arena | Defend the Tower (Overworld) |
| `Arena_Switch_Sever.json` | Arena | Creative + redstone puzzle (Cave) |

To regenerate/tweak the batch: `node tools/gen-sample-worlds.js` (writes to `sample-worlds/`, runs the structural check, exits non-zero if any world fails).

---

## 2. What to try first (and where I'm unsure about fun-factor)

**Try first, most likely to feel good right away:**
- **`SR_First_Steps`** — the safest, most-polished one. If the *speed/jump feel* is right here, it's right everywhere.
- **`Arena_Fortress_Rush` (CTF)** and **`Arena_Crater_Crown` (KOTH)** — the two arena layouts I'm most confident about structurally; symmetric and read clearly.

**Built but genuinely uncertain about fun — focus your playtesting here:**
- **`SR_Nether_Gauntlet`** — every jump is provably within the physics envelope, but a continuous lava floor + tight rhythm may feel *punishing* rather than *thrilling*. Pacing is a guess; I couldn't feel it.
- **`Arena_Void_Twins` (End 2v2)** — the void drop makes falls lethal; the symmetric jump routes to the centre island are within budget but might feel *fiddly* under combat pressure.
- **`Arena_Switch_Sever` (redstone)** — the mechanic is wired correctly (verified), but whether "flip a lever to open the vault" is *interesting* in an arena vs. just a speed bump is exactly the open question — see §4.
- **General:** none of these are hand-tuned for combat balance or "flow" — the automated check only proves they're **not broken**, not that they're **fun**. Spawn fairness, sightlines, and pacing are all your call.

---

## 3. Movement physics review (Section 2A of the brief)

Computed from `js/constants.js` and used as the literal basis for every gap/step:

| Quantity | Value |
|---|---|
| Gravity | 0.66 px/frame² |
| Jump velocity | −12.0 px/frame |
| Run speed (non-sprint) | 6.0 px/frame |
| Terminal fall | 21.6 px/frame |
| **Max jump height** | **109 px ≈ 3.4 blocks** (clears 3-up, not 4) |
| **Airtime, same level** | **36.4 frames** |
| **Max same-level gap** | **≈ 6.8 blocks** (downward jumps reach farther) |

**Design rule applied:** platform-to-platform jumps kept to **lip-to-lip ≤ 4 blocks** and **rise ≤ 2** (well inside the 6−rise budget), so the routes are reachable *by construction*; the reachability BFS re-confirms it. Raised arena platforms are all **≤ 3 blocks** above their approach.

**Feel note for you (physics are open to revisiting, per the brief):** at 6 px/f with a 3.4-block apex, the jump is **floaty and forgiving** — great for approachable Speed Run, but it robs "hard" runs of tension (you can over-shoot and still land). If you want a *tighter, twitchier* feel later, try `JUMP_VELOCITY` ≈ −11 and `GRAVITY` ≈ 0.72 (shorter, snappier apex ≈ 2.6 blocks). I did **not** change any constants this pass; every map is built with enough margin that a modest tightening wouldn't break them, but a big change would (they'd need a regen — trivial via the generator).

---

## 4. Redstone experiment assessment (Section 5B — gates the follow-up)

**Verdict: SOLID enough to greenlight a follow-up — with one scoping note.**

- I located your **`Platformer - V2`** file (you dropped it into `saves/`) and studied its *actual* working
  redstone: 238 dust, 13 levers, 5 trapdoors, 6 pistons, 12 gates, 10 transmitter/receiver pairs. I reverse-engineered
  the propagation model from `js/redstone.js` + `js/game.js`: **lever toggle → orthogonally-adjacent dust chain →
  adjacent device (OR-logic)**. Components (lever 27, trapdoor 23, piston 24) live in the grid *and* their arrays; dust is overlay-only.
- The **lever → dust → trapdoor door** primitive is **reliable and legible**. Both circuits in `Arena_Switch_Sever` are
  verified wired (lever@15→dust 16,17,18→trapdoor@19; lever@30→dust 31,32→trapdoor@33) and the doors are walled so they
  can't be jumped over. This is the exact construction your V2 world uses, so it's proven, not first-principles guesswork.
- **Why trapdoor doors and not pistons here:** pistons work by *pushing a block* into a gap — the outcome depends on
  what's in front of the head and beyond it (`_PISTON_UNPUSHABLE`, air-beyond checks). That's harder to get right blind
  and easy to build subtly broken. For a *simple* arena gate, the trapdoor door is the low-risk primitive, so I used it
  for both circuits rather than force a piston in.
- **Follow-up greenlight:** yes — a next session can attempt **full platformer levels with more ambitious puzzles**
  modeled on V2. **First thing that follow-up should validate in a browser:** a **piston gate** (inverted piston
  default-extended blocking a path, lever retracts it) and a **gate-logic** puzzle (AND/NOT), since those are the two
  primitives I did *not* ship here and can't confirm feel right without playing. The dust/trapdoor foundation is safe to build on.
- **Whether it's *fun* in an arena:** unproven. A lever-gated vault is a nice objective hook, but it may play as a minor
  detour. If it lands, the natural pairing is a **Custom Rules** "reach/hold the vault" objective (not built this pass —
  flagged as a follow-up).

---

## 5. Structural safety check (Section 2)

Every world passes an automated best-effort check (in `tools/gen-sample-worlds.js`) before shipping — this catches
*broken* maps, not *bad* ones:

- **Spawn/objective grounding:** each player-spawn, hill, CTF base, tower, and Heal Tower verified sitting on solid
  ground with 2-block headroom (not embedded, not floating over void/lava).
- **Reachability:** a physics-honest BFS (jump envelope: ≤3 up, ≤6 across, shrinking with rise; drop-offs allowed;
  lava/void non-standable) confirms every spawn and objective is mutually reachable from the start.
- **Arena spawn counts:** all 6 arenas have 4 player spawns (CTF/Team/Defend intended for 2v2, FFA/KOTH/Creative up to 4) —
  meets the app's spawn-per-player requirement without duplicating its logic.

**This is not a fun/fairness check.** Combat balance, sightlines, and pacing are your judgment after playing.

---

## 6. Proposed new block types

None required. Existing palette reads each biome adequately. One *palette-only* idea for later (low-risk, sprite/color
only): a dedicated **End Stone** block (End currently reads via obsidian + the End sky theme). Left as a proposal, not built.
