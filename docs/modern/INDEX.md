# Sandy's Table Quest — MODERN documentation index

The modern build (generation 3) was produced by fifteen goal-based loops run 2026-09-02 → 2026-09-04. Each loop has a
goal document (what and why, with acceptance criteria) and every pass is logged with its evidence in `PROGRESS.md`.
Start here.

| Document | What it is |
|:--|:--|
| [`GOAL_LOOP.md`](GOAL_LOOP.md) | **The contract.** Baseline review of the classic game, the preservation inventory ("forget nothing"), the mid-2000s target definition, the rules of the loop, milestones M0–M7. |
| [`PROGRESS.md`](PROGRESS.md) | **The log.** One entry per pass, verdict first, then the fix, then the evidence path. Rounds 1–15. |
| [`design.md`](design.md) | Design chapter: visual language of the modern build. |
| [`GOAL_LOOP_2.md`](GOAL_LOOP_2.md) | Round 2 — workbench menu and story crawl restored and modernised, bench HUD with Sandy's reacting face, controls pass. |
| [`GOAL_LOOP_3.md`](GOAL_LOOP_3.md) | Round 3 — Sandy's face from the cover art, bench never fades, generations in Options, promotion to `main`. |
| [`GOAL_LOOP_4.md`](GOAL_LOOP_4.md) | Round 4 — generations corrected (2.0 / 2.1 / 3), fluid face animation, the first hands and tools passes. |
| [`GOAL_LOOP_5.md`](GOAL_LOOP_5.md) … [`GOAL_LOOP_8.md`](GOAL_LOOP_8.md) | Rounds 5–9 — hands and weapons: procedural hands, then the real skinned WebXR hand model, viewmodel camera, lighting on the viewmodel layer, studio and shot tools. |
| [`GOAL_LOOP_9.md`](GOAL_LOOP_9.md) | Round 10 — the measured grip frame, the hand lab, settled shot tools, hard-surface tools. |
| [`GOAL_LOOP_10.md`](GOAL_LOOP_10.md) | Rounds 11–12 — crop tool, dropping forearms, surfaces, poses, the awkwardness verdicts. |
| [`HANDS_REINTRODUCTION.md`](HANDS_REINTRODUCTION.md) | Round 14 — hands and arms **parked** (`SHOW_HANDS = false`): where every asset lives and how to bring them back. |
| [`GOAL_LOOP_11.md`](GOAL_LOOP_11.md) | Round 15 — richer floating weapons, the VERSIONS menu and in-page generation player. |
| [`../evidence/comparison.md`](../evidence/comparison.md) | Classic vs modern, every screen and floor side by side (round 1). |

## Evidence

`docs/evidence/<goal>/` holds the screenshots each verdict was written from (studio sheets, in-game sheets, crops, the
campaign report `R1/campaign.json`, the versions flow `T6/`). `docs/smoke/modern/` holds the latest smoke run on the built
file. `docs/readme/` holds the README captures.

## Tools

All under `tools/`, run from the repository root against a dev or preview server (or `--file dist/index.html` for smoke):

| Tool | Purpose |
|:--|:--|
| `smoke.mjs` | Boot → menu → crawl → every floor; frame times; screenshots; fails on console errors. The gate. |
| `collision_sig.mjs` | Per-floor hashes of solid cells, props and spawn — must match the classic. |
| `campaign.mjs` | Autopilot plays all six floors (run against the preview server). |
| `weapon_shots.mjs`, `vm_crops.mjs`, `studio_shots.mjs` | Viewmodel sheets: full frame, full-resolution crops, studio backdrop. |
| `frontend_shots.mjs`, `hud_shots.mjs`, `state_shots.mjs`, `readme_shots.mjs` | Menus and crawl, bench HUD and face sheet, transition/game-over/victory, README captures. |
| `check_classic_frozen.sh`, `validate_levels.mjs` | The classic generation is byte-identical to its tag; maps are enclosed and reachable. |

## Harness

The browser console exposes `TQ` (see `src/main.js`): `skipBoot`, `startGameAt`, `giveAll`, `godmode`, `teleport`,
`collectAllTables`, `killAll`, `warpElevator`, `settle(n)` (wait n rendered frames — headless renders ~1 frame/s),
`vmStudio`, `handLab`, `faceSheet`, `openOptions`, the autopilot (`botGoto`, `botFight`, `botSleep`), and `THREE`.
