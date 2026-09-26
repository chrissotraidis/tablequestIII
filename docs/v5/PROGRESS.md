# Table Quest 5.0 — progress log

The loop from [GOAL_LOOP.md](GOAL_LOOP.md), run in one pass as requested (26 September 2026), using the user's §6 decisions:

- 5.0 is a new version, and 4.1 stays playable under Versions
- generated textures
- more detailed characters
- first-person hands back on
- top quality on the Mac
- no review stops
- Arena stays Office-only

Before/after shots from fixed cameras are in `docs/v5/shots/baseline-4.1` and `docs/v5/shots/final-5.0` (14 each, 1440×900).

## What changed, by milestone

| ID | Change | Evidence |
|:--|:--|:--|
| V0 | 4.1 archived byte-for-byte as `public/generations/v4` (the frozen check now covers it). Fixed-shot and perf tool `tools/v5_shots.mjs`. `npm run gate` refuses to test a stale build. | 4.1 opens and plays from Versions |
| V1 | Bounded lag compensation: hits resolve where the shooter saw the target, capped at 200 ms. The push from walking into another player is predicted. | Walk-into-player correction 12.3 → 3.2 cm (model test); rewind test in `test_arena_connection` |
| V2 | Quality presets (Ultra/High/Medium/Low, Ultra on Apple Pro/Max). Ground-truth ambient occlusion, SMAA, preset-driven shadows and anisotropy, per-floor reflections captured from the room. Arena uses the same post stack as the campaign. | Ultra at 2× Retina 1440×900: 115–119 fps (median), p95 about 10 ms |
| V3 | Every wall, floor and ceiling surface rebuilt: an explicit height field (real bevels, grout, grain, pores), tiling fractal noise, up to 2048 px floors. | Collision hashes identical to 4.1 on all six floors |
| V4 | First-person hands restored in the campaign and Arena. Leg and brush grips retuned, slimmer sleeves, skin shading, watch removed. `TQ.game.retuneHands` for grip tuning. | Hand crops per tool |
| V5 | Pooled particles (no per-hit allocation), lit wet paint decals, allocation-free decal ring. | 1,500 impacts: 5.0 retains 0.4 MB heap vs 2.8 MB for 4.1, with about 8× the live particles |
| V6 | Bevelled, vertex-shaded staff with a fabric weave; Arena uses the detailed campaign staff in each player's paint. | Lobby and in-play character shots |
| V7 | Version labels, "Return to 5.0", Graphics quality in Options and Arena settings. | Versions screen |
| V8 | 5.0.0, changelog, README. | This log |

## Measurements

- **Frame rate** (vsync off, this M3 Max, 1440×900 at 2× Retina):
  - 4.1: 300–417 fps at its 1.25× cap
  - 5.0 Ultra: 115–119 fps with AO, bloom, SMAA and reflections
  - A first Ultra attempt with multisampled composer targets ran at 40 fps. It was replaced by SMAA.
- **Draw calls** roughly double, mostly from the AO and SMAA passes. Frame budget holds at 60 Hz, with p95 at 16.7–16.8 ms on every shot, the same as 4.1.
- **Arena soak** (one client plus seven bots, 16 min, 7 rounds):
  - server tick p95 at most 0.87 ms, event loop p99 at most 26 ms
  - heap flat at 10–19 MB
  - 0 server errors
  - An earlier 30-minute soak (13 rounds) also showed 0 errors.
- **Autopilot:** clears floors 1–5 on both 4.1 and 5.0. The campaign bot and `tools/bossfight.mjs` fail to beat the Head Designer on **both** versions (4.1: 34 boss deaths; 5.0 across three boss runs: 87–250 s). This is a limit of the bot, not a 5.0 regression. Balance, maps and AI code are unchanged from 4.1: only a harness hook was added to `src/game.js`.

## Bugs found and fixed during the pass

- **Arena rendered black under the new post stack:** the viewmodel pass repainted the scene background over the world.
- **A failed build was hidden behind an older one**, so a smoke test passed on stale output. `npm run gate` now builds first and stops.
- **The Factory's reflection capture overflowed half floats** and turned the floor black. Bad captures are now rejected and fall back to the default environment.
- **The particle shader failed to compile.** GLSL directives must be on their own lines.

## Not verified

- how it feels with real players and mouse input
- audio
- lower-end hardware (the Low preset exists but was not measured on a real low-end machine)
- a human winning the boss fight in 5.0
