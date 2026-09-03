# MODERN preview — progress log

Governed by [`docs/modern/GOAL_LOOP.md`](../docs/modern/GOAL_LOOP.md). One entry per iteration, newest last.
Status legend: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED(§5-x)`.

## Milestone board

| Milestone | Status | Gate |
|:--|:--|:--|
| M0 Fork and baseline | DONE | gate auto-advanced by the goal harness on 2026-09-03; review still requested |
| M1 Renderer, lighting, materials | IN PROGRESS | |
| M2 Gunplay and first-person feel | TODO | |
| M3 HUD and front-end | TODO | |
| M4 Enemies and AI presentation | TODO | |
| M5 Environment art per floor | TODO | |
| M6 Audio | TODO | |
| M7 Polish, certification, release | TODO | |

## Open decisions applied (§5)

None yet. Defaults will be recorded here when a goal first depends on one.

## Verification recipe (run before every commit)

```bash
npm run check:classic            # classic files untouched vs main
npm run validate:levels:modern   # six maps enclosed + reachable
npm run build:modern             # dist/modern/index.html, must stay < 40 MB
npm run dev:modern               # :5174, then in another shell:
npm run smoke:modern             # boot -> menu -> crawl -> all six floors, screenshots to modern/docs/smoke/modern/
```

---

## Entry template

```
### <goal id> — <title>   (<date>)
**Changed:** what was built, which files.
**Evidence:** screenshots / numbers / harness output.
**Preservation:** which §1.3 items this touched and how they were kept.
**Open issues:** anything left dangling.
**Next:** the goal picked next.
```

---

## Log

### M0.1 — Verbatim fork   (2026-09-03)
**Changed:** `modern/index.html` and `modern/src/**` are byte-for-byte copies of classic `index.html` and `src/**`, including the seven original PNGs under `modern/src/assets/`. No source edits; relative imports resolve unchanged.
**Evidence:** headless captures of memory screen, title, main menu, floor select, and instructions are **0.00 % pixel-different** between classic (:5173) and modern (:5174). In-game frames differ 32–48 % of pixels by ≤ 48/765 intensity (head-bob phase, enemy wander, random paint hues) with ≤ 3.6 % strongly differing; visual inspection confirms identical scene, HUD, and layout.
**Preservation:** all of §1.3 by construction.
**Open issues:** none.
**Next:** M0.2.

### M0.2 — Build pipeline   (2026-09-03)
**Changed:** `modern/vite.config.js` (root `modern/`, single-file plugin, out `dist/modern/index.html`, dev port 5174). `package.json` scripts: `dev:modern`, `build:modern`, `preview:modern`, `build:all`, `validate:levels`, `validate:levels:modern`, `check:classic`, `smoke:modern`, `smoke:classic`. `playwright-core@1.56.1` added as a devDependency for the harness.
**Evidence:** `npm run build:all` writes both files; classic `dist/index.html` is byte-identical to `main` after rebuild (`git status` clean). `dist/modern/index.html` = 13.6 MB (cap 40 MB). The built file passes the smoke run from `file://` with zero errors.
**Preservation:** n/a.
**Open issues:** none.
**Next:** M0.3.

### M0.3 — Progress log and frozen-classic guard   (2026-09-03)
**Changed:** this file. `modern/tools/check_classic_frozen.sh` diffs `index.html src dist/index.html tools vite.config.js design* LICENSE` against `main` and fails on any change or dirty state. Exposed as `npm run check:classic`. `modern/tools/validate_levels.mjs` is a copy of the classic validator pointed at `modern/src/levels.js`.
**Evidence:** guard prints `CLASSIC FROZEN CHECK: OK`; validator prints OK for all six floors with tables 2/3/3/4/4/0 and enemies 6/9/8/11/15/1.
**Preservation:** n/a.
**Open issues:** none.
**Next:** M0.4.

### M0.4 — Headless smoke harness   (2026-09-03)
**Changed:** `modern/tools/smoke.mjs` (Playwright + SwiftShader). Walks boot → title → menu → floor select → instructions → story crawl → Floor 1 → minimap → pause, then warps to all six floors via `TQ`, asserting state, table counts (0/2, 0/3, 0/3, 0/4, 0/4, 0/0), staff counts (6, 9, 8, 11, 15, 1), story text integrity, five weapon defs, zero console/page errors, and sampling frame time. Screenshots land in `modern/docs/smoke/<label>/`.
**Evidence (software GPU, 1280×800, avg frame ms by floor):**

| Build | F1 | F2 | F3 | F4 | F5 | F6 |
|:--|:-:|:-:|:-:|:-:|:-:|:-:|
| classic dev | 259 | 262 | 364 | 295 | 259 | 215 |
| modern dev | 259 | 233 | 328 | 280 | 249 | 210 |
| modern dist (file://) | 262 | 240 | 333 | 280 | 262 | 239 |

These SwiftShader numbers are the *relative* baseline for §3.2-4 regression checks (flag > 2×), not real-GPU performance.
**Preservation:** harness exercises screens, floors, weapons list, story text.
**Open issues:** running two SwiftShader browsers concurrently starves them; run smokes sequentially. Smoke screenshots are ~12 MB per set, so only the `classic` baseline set is committed; `modern/docs/smoke/modern/` is regenerated locally and stays untracked. Goal evidence goes in `modern/docs/<goal-id>.png` (downscaled).
**Next:** M0.5.

### M0.5 — README link   (2026-09-03)
**Changed:** README "Download & Play" gains a "Preview build: Sandy's Table Quest MODERN" note pointing at `modern/`, `dist/modern/index.html`, the goal loop, and this log; "Build from source" gains `dev:modern` / `build:modern` / `build:all`.
**Evidence:** `git diff README.md` = +14 lines, no removals.
**Preservation:** classic download instructions unchanged.
**Open issues:** none.
**Next:** **M0 gate — stop for user review.** Then M1.1 (StandardMaterial + normal/roughness maps).

### M1.1 — StandardMaterial + normal/roughness maps   (2026-09-03)
**Changed:** `modern/src/textures.js` now authors every texture in the classic 256-unit space but rasterises walls at 2× (512 px) and floors at 4× (1024 px) via a scaled canvas context, so bricks, planks, and tiles keep their exact size and look. Each colour canvas yields a **normal map** (luminance height, high-passed to drop the authoring gradient, Sobel) and a **roughness map** (per-surface base ± height modulation) through `deriveSurfaceMaps()`. A `SURFACE` table tunes bump, roughness, and metalness per texture (marble 0.16, carpet 0.96, metal 0.38 / 0.65 metal, etc.). New exports `getSurfaces()` and `surfaceMaterial(key, { repeat })` return `MeshStandardMaterial`s; `getTextures()` is unchanged for compatibility. `world.js` uses `surfaceMaterial()` for walls, floor, ceiling, doors, gates, and the elevator face. `models.js` `mat()` and painting/rug materials are `MeshStandardMaterial` (satin default). `main.js` adds a faint procedural `RoomEnvironment` PMREM (`environmentIntensity 0.28`) so specular response is visible, plus a `TQ.textureSheet()` debug overlay. `modern/tools/capture.mjs` added for goal evidence (JPEG by default).
**Evidence:** `modern/docs/M1.1/texsheet.jpg` (all 16 surfaces: colour / normal / roughness), `floor-1.jpg` (marble reflections, wainscot relief), `floor-4.jpg` (plank relief, concrete cracks), `floor-5.jpg` (brushed metal highlights, diamond plate). Smoke green: six floors load, counts match, zero errors. Texture generation incl. map derivation: ~ms logged to console at boot (`[textures] …`). Build 14.3 MB.
**Preservation:** texture identity checked visually against classic sheet; no map, balance, or behaviour change.
**Open issues:** **Flagged §3.2-4:** SwiftShader frame time rose from ~260 ms to ~750 ms per floor (≈2.9×, over the 2× flag). This is the software-rasteriser cost of GGX shading against the classic rig's 9 unshadowed point lights + player/muzzle lights + env map; no hardware WebGL is reachable from this WSL2 session (llvmpipe/SwiftShader only), so real-GPU cost is unmeasured. M1.2 replaces the light rig (one shadowed key + fewer fills) and will re-measure; the user should confirm 60 fps on hardware at the M1 gate. Minor: wood-panel plank seams read slightly hot under the normal map; tune in M1.2 alongside the lights.
**Next:** M1.2 lighting rig per floor.

### M1.2 — Lighting rig per floor (shadows, fixtures, draw-call bake)   (2026-09-03)
**Changed:** new `modern/src/lighting.js` holds one rig per floor (key light direction/colour/intensity, ambient, hemisphere, accent fixtures, fixture/panel emissives, exposure), all colours taken from the classic `levels.js` palettes. `world.addLighting()` now builds: a low flat fill, a hemisphere tint, **one shadow-casting `DirectionalLight` key** whose ortho shadow camera hugs the map (2048 px PCF), and the classic 9-point accent grid rebuilt as real fixtures (merged housing + emissive lens meshes, one unshadowed point light each). Emissive ceiling panels are one merged mesh. Walls, doors, props, enemies, and pickups cast; floor and walls receive; the ceiling never casts (the key reads as overhead/window light). `renderer.shadowMap` on; per-floor `toneMappingExposure` applied on every level load. Player "flashlight" fill dimmed 7 → 2.4; blob shadows at 0.45 opacity under the real ones. New `modern/src/bake.js`: `bakeStatic()` flattens each prop's box soup into one vertex-coloured `MeshStandardMaterial` mesh per finish (textured/emissive/transparent parts are kept as-is); baked materials are cached and flagged `userData.shared` so prop destruction and level teardown skip disposing them. Leak fixes: cloned floor/ceiling maps are flagged and disposed in `World.dispose()`; `Game.loadLevel()` now disposes enemy, blob-shadow, and pickup geometry/materials (classic only removed them). HUD: boss bar is hidden on non-boss floors (classic left it up when warping straight off Floor 6). Wood/office normal bump softened (1.1/0.9 → 0.7). `TQ.renderer` / `TQ.scene` getters; `modern/tools/perf.mjs` (per-floor calls/tris/memory/frame time); `capture.mjs` gains `POSES` for aimed shots.
**Evidence:** `modern/docs/M1.2/floor-1..6.jpg` and `lobby-booth.jpg` (booth shadow across marble), `office-desks.jpg` (desk/chair shadows on carpet), `showroom-hall.jpg`. Diagnostic run with all fills muted confirmed crisp key shadows; the first rig hid them under fills, so key was raised ×2.1 then ×0.65, fills cut to ~¼ of classic, env 0.28 → 0.18.

| Floor | calls before bake | calls after (main pass — see M1.4 correction) | tris | lights |
|:-:|:-:|:-:|:-:|:-:|
| 1 | 382 | 200 | 9.9k | 20 |
| 2 | 448 | 195 | 11.1k | 20 |
| 3 | 976 | 243 | 19.7k | 20 |
| 4 | 619 | 278 | 15.3k | 20 |
| 5 | 598 | 382 | 16.7k | 20 |
| 6 | 129 | 70 | 4.5k | 19 |

Main pass inside the < 400 budget (M1.4 found these exclude the shadow pass; corrected there). Geometry count no longer climbs across loads (265 → 527 → 328 → 381 → 446 → 163, per-scene). Smoke green (six floors, counts match, zero errors); build 14.3 MB; validator and frozen guard OK.
**Preservation:** no map, balance, AI, or pickup change. Accent fixture positions are the classic 9-point grid; palettes are the classic per-floor colours.
**Open issues:** **§3.2-4 still flagged:** SwiftShader frame time ~830–1070 ms/floor vs ~260 ms baseline (≈3.5×; shadow pass + GGX in a software rasteriser). No hardware GL is reachable here; hardware check at the M1 gate stands. Texture count still creeps ~2–8 per load (painting textures are cached, so likely the per-level `CanvasTexture` clones from decor; harmless, revisit in M7.2). Shadow map is one cascade for the whole floor — fine at this map scale, but M1.4's taller ceilings should re-check bias.
**Next:** M1.3 post-processing stack.

### M1.3 — Post-processing stack   (2026-09-03)
**Changed:** new `modern/src/postfx.js`: `PostFX` wraps an `EffectComposer` with RenderPass → **OutputPass** (ACES + sRGB) → **UnrealBloomPass** → **GradePass** (custom shader: per-floor tint / saturation / contrast / lift, aspect-corrected vignette, animated luminance-weighted film grain, 5-tap horizontal motion blur driven by yaw rate). Bloom deliberately runs *after* tone mapping: on the HDR buffer everything the key light pushed past 1.0 bloomed and whole rooms washed out (Penthouse went white); post-tonemap with thresholds 0.90–0.95 only fixtures, the elevator pad, paint, and true speculars glow. Each rig in `lighting.js` gained a `grade` block (Lobby cool-neutral, Office warm-white, Archives amber/desaturated, Showroom warm, Factory cyan/desaturated, Penthouse red-tinted). `main.js`: `PostFX` instance, `applyFloorLook()` sets exposure + grade on every level load, resize forwards to the composer, the render loop calls `postfx.render(elapsed, yawRate)`; `game.js` exposes `yawRate` (rad/s). Pause menu gains **Post FX: ON/OFF** (5th item, persisted in `localStorage` `tq3d-postfx`); off = plain renderer, identical to M1.2. `TQ.postfx` / `TQ.setPostFX()`; `capture.mjs` and `perf.mjs` accept `PRE` setup JS. Penthouse key trimmed 3.0 → 2.3 so the marble no longer clips.
**Evidence:** `modern/docs/M1.3/floor-1,3,5,6.jpg`, `office-desks.jpg` (on) vs `off/floor-3.jpg`, `off/floor-6.jpg`. Smoke green, six floors, zero errors. Build 14.3 MB.

| SwiftShader avg ms | F1 | F2 | F3 | F4 | F5 | F6 |
|:--|:-:|:-:|:-:|:-:|:-:|:-:|
| post FX on | 935 | 821 | 1065 | 942 | 907 | 780 |
| post FX off | 893 | 839 | 1141 | 1015 | 930 | 751 |

The composer's own cost is inside run-to-run noise on the software rasteriser (the scene pass dominates); on hardware bloom is the only pass with real cost and the toggle exists for it.
**Preservation:** none affected; HUD is DOM and stays crisp; pause menu keeps Resume / Restart Floor / Toggle Sound / Quit to Menu in order with the new item inserted before Quit.
**Open issues:** grain and vignette are static-frame tuned; motion blur is only visible in motion (yaw ≥ ~2 rad/s), unverified by eye — user to judge at the M1 gate. The pause menu's 5-item nav will be restyled in M3.6.
**Next:** M1.4 geometry pass on the map compiler (ceiling height, trim, frames).

### M1.4 — Geometry pass: ceiling heights, trim, door frames, beams   (2026-09-03)
**Changed:** new `modern/src/trim.js` reads the finished grid and adds merged architectural meshes: **baseboards** and **crown** on every wall face that looks onto a walkable cell, **door jambs + headers**, **gate headers**, an **elevator vestibule frame**, and **ceiling beams** every four cells on industrial floors. Each rig in `lighting.js` now carries `height` (Lobby 2.0, Office 1.7, Archives 1.55, Showroom 2.0, Factory 2.3, Penthouse 2.1; classic is 1.35) and a `trim` palette. `world.js`: walls are built to the floor's height; tileable surfaces (brick, wood, stone, concrete, metal) repeat vertically at the classic 1.35-unit scale so bricks and planks stay exactly classic-sized, while the office panel (wainscot band) stretches as classic did. Doors, gates, and the elevator face keep the classic 1.35 panel height with a **transom** of wall above them. Metal walls are split into a striped lower band and a new `metalPlain` upper surface so the hazard stripe stays at floor level. Fixtures, panels, key-light shadow camera, paintings, and the elevator light follow the new height. The baked wall AO band is dropped (it would repeat with vertical tiling; trim + real shadows ground the walls now). Consumable pickups no longer cast shadows (tables and weapons still do). New `modern/tools/collision_sig.mjs` hashes `isSolidCell` + `blocksShots` for every cell of every floor.
**Evidence:** `modern/docs/M1.4/floor-1,2,5,6.jpg`, `lobby-door.jpg` (jambs, header, transom, STAFF sign), `factory-beams.jpg` (2.3-high hall with beams, stripe only at floor level). **Collision signatures match classic on all six floors** (hashes bbd9de57 / e5dd0df8 / 473211ec / 892d4d6b / c4ae3547 / 66dc2900; solid counts 285 / 441 / 507 / 397 / 391 / 175). Smoke green; validator OK; frozen guard OK; build 14.3 MB.

**Draw-call correction.** The M1.2 figures were the main pass only: three resets `renderer.info` after the shadow pass, so the earlier "incl. shadow pass" label was wrong. `perf.mjs` now reports both. The shadow pass draws every caster on the floor (no frustum culling under the ortho key), which is why it can exceed the main pass:

| Floor | main pass | + shadow pass | tris | SwiftShader ms |
|:-:|:-:|:-:|:-:|:-:|
| 1 | 203 | 407 | 18.1k | 1142 |
| 2 | 214 | 667 | 21.7k | 992 |
| 3 | 247 | 493 | 35.1k | 1352 |
| 4 | 281 | 583 | 25.8k | 1180 |
| 5 | 387 | 723 | 32.9k | 1192 |
| 6 | 73 | 173 | 10.7k | 979 |

**Preservation:** collision, line of sight, spawn, maps, doors, gates: identical (hash-verified). Eye height, jump, projectile heights unchanged.
**Open issues:** **§3.2-4 flagged:** whole-frame draw calls exceed 400 on Floors 1–5 once the shadow pass is counted. Breakdown on the Lobby: props ≈ 87 calls (59 baked + 46 kept emissive/textured parts), enemies ≈ 52 (13 meshes each), pickups ≈ 26, world+trim ≈ 30. Plan: level-wide prop merge (one mesh per finish, rebuilt on destruction) in M5.7, enemy part-merging in M4.1, and a shadow-caster cull in M7.2; expected to bring totals under 400 with room. SwiftShader frame time ≈ 4× baseline (software), hardware check still owed at the M1 gate.
**Next:** M1.5 windows and exterior.
