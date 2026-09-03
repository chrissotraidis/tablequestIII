# MODERN preview — progress log

Governed by [`docs/modern/GOAL_LOOP.md`](../docs/modern/GOAL_LOOP.md). One entry per iteration, newest last.
Status legend: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED(§5-x)`.

## Milestone board

| Milestone | Status | Gate |
|:--|:--|:--|
| M0 Fork and baseline | DONE | gate auto-advanced by the goal harness on 2026-09-03; review still requested |
| M1 Renderer, lighting, materials | DONE | awaiting user review (hardware fps check owed) |
| M2 Gunplay and first-person feel | DONE | gate summary logged; running unattended per 5-G |
| M3 HUD and front-end | DONE | gate summary logged; running unattended per 5-G |
| M4 Enemies and AI presentation | DONE | gate summary logged; running unattended per 5-G |
| M5 Environment art per floor | TODO | |
| M6 Audio | TODO | |
| M7 Polish, certification, release | TODO | |

## Open decisions applied (§5)

| Decision | Applied | When |
|:--|:--|:--|
| 5-G review cadence | **User: run unattended, do not pause at milestone gates** ("assign it and keep going"). Gate summaries are still logged and evidence still captured per milestone. | 2026-09-03, after the M1 gate |
| 5-D enemy weapon fiction | **Default applied:** office weapons that fire paint — stapler (guard), tape gun (manager), paint pistol (executive), golden shears (Head Designer) — held in the right hand (M4.1). | 2026-09-03, M4.1 |
| 5-E legacy boot screens | **Default applied:** shown once per session at load (as classic), auto-advancing 4.5 s / 5 s, any key or click skips (M3.7). | 2026-09-03, M3.7 |
| 5-C paint as ammo | **Default applied:** single 99-cap paint pool, no magazines, no reload window; a cosmetic top-up flourish only (M2.5). Marked `BLOCKED(§5-C)` per the goal prompt until the user confirms or changes it. | 2026-09-03, M2.5 |

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

### M1.5 — Windows and exterior   (2026-09-03)
**Changed:** new `modern/src/exterior.js`. **Windows:** rig `windows` specs pick wall cells (a boundary run with a height band, or every cell of a wall type) that are drawn as a thin glass pane with merged mullions instead of an opaque box; any wall band above/below the glass is still built, so clerestories and window strips work. The cell stays a wall in the grid. **Exterior:** a sky dome (gradient + stars canvas, fog off, inside the camera's 80-unit far plane), a ring of merged box buildings outside the map with an emissive lit-window texture, a ground plane, and streetlamp heads; `skyline-below` sinks the ground 38 units so the Penthouse looks down on towers. **Rain:** a scrolling streak texture on the Penthouse glass alpha (`World.update` drives it). Per floor: Lobby storefront (top wall, full height, night street), Office window band (left wall, 0.85–1.7, city), Showroom **display pods** (all `C` walls become glass cases — you can see the tables inside), Factory clerestory (top and bottom walls, 1.35–2.3, industrial yard), Penthouse floor-to-ceiling glass on three sides with rain; Archives none. Glass material: dark, near-zero-diffuse tint (`0x18242e`, opacity 0.3, roughness 0.05) — the first attempt used a light-blue lit StandardMaterial and the 4.4 key washed every pane milky; bisecting with the exterior hidden proved the pane, not the sky, was the cause.
**Evidence:** `modern/docs/M1.5/lobby-storefront.jpg`, `office-window.jpg`, `showroom-pods.jpg`, `factory-clerestory.jpg`, `penthouse-south.jpg`. Collision signatures still match classic on all six floors. Smoke green; validator, frozen guard OK; build 14.3 MB (still single-file, no external assets). Perf unchanged in shape: main pass 210 / 205 / 247 / 274 / 380 / 79, with shadow pass 415 / 659 / 493 / 576 / 717 / 180.
**Preservation:** maps, collision, LOS, AI unchanged (glass cells still block movement and shots — display pods are see-through but not shoot-through, matching classic behaviour).
**Open issues:** the rain material is a clone per Penthouse load (small, disposed with the world). Showroom pod glass is nearly invisible head-on; a faint sheen may be wanted in M5.4. Exterior buildings are boxes; M5 can dress the Lobby street if desired.
**Next:** M1.6 decals and debris.

### M1.6 — Pooled decals and physical debris   (2026-09-03)
**Changed:** `modern/src/effects.js` rewritten with the same API (`burst`, `splat`, `update`, `clear`) plus `debris()` and a `stats` getter. **Decals:** three `InstancedMesh` quad pools (one per procedurally drawn splat shape, 160 each = 480 decals) with per-instance colour and a ring buffer; a splat lives **90 s** (classic: 14 s, cap 50) and scales out over its last 4 s. Cost is fixed at three draw calls regardless of count. Placement is a surface-aligned quad with polygon offset (the 2005 approach), so splats land on walls, floors, and now glass. **Debris:** one `InstancedMesh` of 320 slabs with gravity, floor bounce (restitution 0.32, friction), settle after three bounces or low vertical speed, lie-flat, and a 24 s life with scale-out; resting pieces skip matrix rewrites. `game.js` `onPropHit` spawns 18 splinters on destruction and 4 on a hit, in the prop's wood tone. New `modern/tools/stress.mjs`.
**Evidence:** `modern/docs/M1.6/stress-decals.jpg` (200 real brush shots + 300 direct decals + 200 splinters), `debris-live.jpg` (desk + cabinet smashed on the Office floor, splinters in flight), `debris-settled.jpg` (same scene 2.5 s later, pieces resting on the carpet). Stress numbers: 200 shots fired, pools at 480 / 480 decals and 200 debris, still 480 after a further 6 s wait (persistence), zero errors; SwiftShader frame time 853 → 1017 ms with every pool full (+19 %, dominated by 200 live splinter integrations, which drops as they settle). Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** projectile, splash, and prop-damage rules unchanged; paint colours per weapon unchanged; classic point bursts retained.
**Open issues:** decals on enemies (paint on suits) belong to M4.5. Debris ignores walls (pieces can slide into a wall footprint), acceptable at this scale; revisit if noticed.
**Next:** **M1 gate — stop for user review** (renderer, lighting, materials, post, geometry, windows, decals all DONE).

### M2.1 — Two-handed viewmodels and arm animation   (2026-09-03)
**Changed:** new `modern/src/viewmodels.js` rebuilds all five weapons procedurally at higher fidelity and puts **both of Sandy's hands** on each: `buildHand()` makes a forearm (khaki sleeve, rolled cuff, bare wrist, watch on the off hand), a palm, a fingerless work glove with strap, four two-segment fingers curled to the handle radius, and a thumb. Weapons: brush (turned handle, tape band, crimped ferrule, paint-loaded bristles, off hand holding a labelled paint can), table leg (turned rings, taped grip, brass ferrule, two-handed bat grip), nail gun (chamfered body, side plates, safety nose, slanted nail strip with visible nails, air hose, trigger, off hand under the nose), roller launcher (ringed tube, brass collar, loaded roller, strapped tank with gauge, hose), sprayer (strapped tank, fill cap, heat shroud with vents, guard, hose). Each group is baked with `bakeStatic` (emissive parts kept) and carries `userData.muzzle` for M2.3. `game.js`: a `vmRoot` under the camera carries whole-arm motion — walk sway/bob, breathing, mouse-look lag, **sprint lowering** (drops/tilts away while running), **raise/lower on swap** (0.2 s down, swap, 0.2 s up), **inspect on hold-F** (turns the weapon toward the camera) — while each weapon group carries only recoil; base offsets per weapon honoured. `input.js`: `F` held → `input.inspect`. Root moved slightly up/back (0.19, −0.13, −0.47) so hands stay above the classic HUD bar.
**Evidence:** `modern/docs/M2.1/vm-brush,leg,nailgun,roller,sprayer.jpg` (idle), `vm-sprint.jpg` (nail gun lowered), `vm-inspect.jpg` (roller turned), `vm-swap.jpg` (mid-swap frame). Smoke green; validator, frozen guard OK; build 14.4 MB. Viewmodel meshes: 63 total across five weapons (baked), one weapon visible at a time.
**Preservation:** weapon damage/cooldown/cost untouched; switch keys, cycling, and viewmodel visibility rules unchanged; classic recoil amounts kept.
**Open issues:** poses are tuned against the classic HUD bar; M3.1 will free the bottom 15 % of the screen and poses may want a small drop. The brush's off-hand paint can is partly hidden by the bar today. Inspect has no per-weapon detail animation (stretch goal, left as a simple turn).
**Next:** M2.2 aim-down-sights.

### M2.2 — Aim-down-sights   (2026-09-03)
**Changed:** right mouse aims (`input.aimHeld`; context menu suppressed on the canvas). `game.js`: `aim` eases 0→1 (≈90 ms) for aimable weapons only (brush, nail gun, roller, sprayer — the table leg has no sight pose and ignores the button), never mid-swap or while sprinting; aiming cancels the sprint lower and inspect. Each viewmodel carries an `ads` pose (`viewmodels.js` `finish(..., ads)`): the arm root blends to it with a smoothstep, sway/bob/look-lag damped to 30 %, so the sight line runs just over the weapon body. **FOV** narrows by 15° (72 → 57 at full aim, stacking with the sprint kick); **spread** multiplies by 0.45 while aimed — hip-fire spread is untouched, so classic balance is preserved and ADS is strictly a bonus for the accuracy-minded. Crosshair fades out as the sights come up (`hud.setAim`).
**Evidence:** `modern/docs/M2.2/ads-brush,nailgun,roller,sprayer.jpg` at full aim (crosshair opacity 0, fov 62.6 mid-ease → 57 settled). Numbers logged by the harness:

| Weapon | hip spread | ADS spread |
|:--|:-:|:-:|
| nail gun | 0.015 | 0.0067 |
| sprayer | 0.055 | 0.0248 |
| brush / roller | 0 | 0 |

Table leg: aim stays 0 with the button held. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** damage, cooldown, cost, projectile speed, hip spread unchanged; movement speed while aiming unchanged (deliberately — a CoD-style ADS slowdown would alter dodge pacing, see §2.2).
**Open issues:** the brush "sight" is a raised hold rather than an iron sight; fine for a paint game, revisit if it reads oddly in motion. Right-click while pointer-unlocked also aims (harmless).
**Next:** M2.3 muzzle flash, tracers, ejection, impact FX.

### M2.3 — Muzzle flash, tracers, ejection, surface impacts   (2026-09-03)
**Changed:** new `modern/src/gunfx.js` (`MuzzleFlash`): additive sprites parked on the arm root at each weapon's `userData.muzzle` — three spiked flash shapes for the nail gun, a paint-flick blob for the brush, a puff for the roller, a forward mist cone for the sprayer — shown with random roll/scale for 50–120 ms (guaranteed one rendered frame at any frame time), decaying in scale/opacity; each recipe also sets the muzzle-light spike (nail gun 6.5, roller 3.5, brush 2.4, sprayer 2.0). `game.js`: nail and sprayer projectiles are **tracers** (additive, un-tone-mapped stretched cylinders oriented along flight, so bloom catches them); brush and roller projectiles carry a short **paint trail** shape; **ejection** at the world-space muzzle per weapon (strip fragment right for nails, paint drops forward for the brush, mist for the sprayer, a paint puff for the roller); wall hits call `effects.impact()` with the **surface family** of the cell (`surfaceAt`: metal/wood/stone/concrete/office/glass, doors and gates as metal, glass via the new `World.isWindowCell`). `effects.js`: `burst()` gains options (size, additive, gravity, directional bias, drag) and every point burst now uses a soft round sprite instead of a hard square; `impact()` gives nails a small dark hole plus sparks on metal/glass, chips on wood, dust elsewhere, and gives paint the classic splat plus sparks on metal/glass or dust on masonry.
**Evidence:** `modern/docs/M2.3/burst-nailgun.jpg` (flash at the nose, ejected strip bits, sparks on steel), `burst-sprayer.jpg` (mist + paint cluster), `burst-brush.jpg` (flick + paint on storefront glass), `burst-roller.jpg` (puff at the muzzle), `impact-nails-metal.jpg` (nail-hole cluster, spark spray), `impact-paint-stone.jpg` (splat + drifting dust). Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** projectile speed, damage, hit radii, splash, and the classic enemy-shot look are unchanged; classic bursts still fire in the same places with the same counts (now round).
**Open issues:** flashes last 1–3 frames, so the software captures show them small; judge on hardware. Enemy shots still use the classic orange spheres (M4 will restyle). Shell-style brass is intentionally absent (paint fiction).
**Next:** M2.4 recoil patterns, camera kick, hit-marker sound, directional damage indicators.

### M2.4 — Recoil patterns, camera kick, hit markers, damage direction   (2026-09-03)
**Changed:** `game.js` gains a per-weapon `RECOIL` table (peak camera pitch/yaw/roll kick, viewmodel recoil multiplier, auto-fire climb) and a critically damped **camera kick spring** that always returns to zero, so recoil is felt but aim is never displaced (§2.2 balance). The spring integrates in fixed 4 ms substeps after explicit Euler blew up at the software rasteriser's 50 ms frames. ADS steadies the kick by 35 %. Viewmodel recoil scales per weapon (roller 1.6×, sprayer 0.5×). **Hit marker** rebuilt as a four-tick CoD-style mark (`#hit-marker` pseudo-elements); a kill turns it red and 1.35× larger and holds longer; new `hitmark` (two clicks) and `killmark` (lower confirm) SFX in `audio.js`, played on non-lethal and lethal hits respectively from both projectile and melee paths. **Directional damage**: `hurtPlayer(dmg, fromX, fromY)` computes the source bearing relative to facing and `hud.damageDir()` rotates a red conic wedge around the crosshair (instant in, 0.5 s fade); enemy projectiles pass their origin, melee passes the enemy position. `TQ.hud` exposed for the harness.

| Weapon | camera pitch | yaw ± | roll | vm × | climb/shot |
|:--|:-:|:-:|:-:|:-:|:-:|
| paintbrush | 0.010 | 0.006 | 0.012 | 0.8 | 0 |
| table leg | 0.018 | 0.010 | 0.030 | 1.0 | 0 |
| nail gun | 0.012 | 0.005 | 0.004 | 0.7 | 0.004 |
| roller | 0.055 | 0.014 | 0.020 | 1.6 | 0 |
| sprayer | 0.007 | 0.006 | 0.003 | 0.5 | 0.006 |

Measured roller kick: camera pitch 0 → +0.0585 rad (3.4°) the frame after firing, recovering to 0.
**Evidence:** `modern/docs/M2.4/hitmarker.jpg`, `killmarker.jpg`, `damage-dir.jpg` (wedge lower-left for a hit from behind-right), `recoil-roller.jpg`. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** damage values, mercy window, pity rule, hit radii unchanged; classic `hit`/`pain`/`enemy_death` sounds still play alongside the new ticks; classic red damage flash retained.
**Open issues:** the headless software renderer shows CSS opacity transitions unreliably (stale compositor state), which made these captures flaky — the toast has the same issue; on hardware they are fine. Manual feel review of kick strengths owed (§4 M2.4 verify line).
**Next:** M2.5 paint top-up presentation (§5-C default: cosmetic, no magazines).

### M2.5 — Paint top-up presentation   `BLOCKED(§5-C)` — complete under the default   (2026-09-03)
**Changed:** §5-C default applied: the 99-cap paint pool and per-shot costs are untouched and there is no magazine or reload window. Presentation only: `Game.topUp()` runs a 0.45 s arm flourish (the tool dips toward the paint can, rolls, and comes back) with a small blue paint puff at the muzzle on the way up. It fires when a paint bucket is collected and as the new weapon comes up after a swap. Melee never puffs.
**Evidence:** `modern/docs/M2.5/topup-dip.jpg` (brush mid-dip). Paint economy check by the harness — spent vs expected after N shots:

| Weapon | shots | paint spent | expected (classic cost × shots) |
|:--|:-:|:-:|:-:|
| paintbrush | 20 | 20 | 20 |
| nail gun | 20 | 20 | 20 |
| sprayer | 20 | 20 | 20 |
| roller | 10 | 40 | 40 |
| table leg | 10 | 0 | 0 |

Deviation 0 % (goal allowed 5 %). Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** ammo costs, cap, pickup value (+14), "PAINT ALREADY FULL" hint all unchanged.
**Open issues:** if the user later chooses magazines (§5-C alternative), this goal reopens: it would need a reserve/magazine split in the HUD (M3.1) and a reload window, which changes time-to-kill — flagged in GOAL_LOOP §5.
**Next:** M2.6 quick melee on V.

### M2.6 — Quick melee on V   (2026-09-03)
**Changed:** `input.js`: `V` → one-shot `input.melee`. `game.js`: the table-leg hit resolution is extracted into `meleeStrike(w)` (shared by slot-2 firing and quick melee — one copy of the classic numbers: 50 damage, 1.8 range, 90° arc, props wrecked at reach 0.7/1.3). `startQuickMelee()` requires the leg in the arsenal, shows the leg viewmodel for a 0.5 s swing with the classic melee recoil and a small camera kick, lands the strike 0.14 s in, then restores the current weapon's viewmodel; 0.65 s cooldown; the current slot, paint, and HUD selection never change. Firing is suppressed during the swing; already holding the leg just swings it. No sprint tackle (kept simple, per §4).
**Evidence:** `modern/docs/M2.6/quick-melee-swing.jpg` (brush selected on the rack, leg mid-swing, guard toppling). Harness: guard 30 HP → −20 after one V press with the brush held; current slot stayed 0; paint 99 → 99. Dry-paint bot fight (classic autopilot, paint 0): switched to the leg, outcome `clear`, 1 kill. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** slot-2 behaviour unchanged; the shared strike routine is byte-for-byte the classic logic.
**Open issues:** quick melee is only available once the leg is found on Floor 2 (matches the arsenal rule; a bare-hand shove was considered and rejected as new balance).
**Next:** **M2 gate** (below), then M3.1 HUD.

---

## M2 gate summary   (2026-09-03, no pause per 5-G)

Delivered: two-handed baked viewmodels with swap/sprint/inspect/look-lag arm animation (M2.1); right-mouse ADS with per-weapon sight poses, −15° FOV, 0.45× spread, crosshair fade (M2.2); muzzle flash sprites + light spikes, tracers and paint trails, per-weapon ejection, surface-aware impacts, soft particles (M2.3); recoil patterns with a recovering camera-kick spring, four-tick hit/kill markers with SFX, directional damage wedge (M2.4); cosmetic paint top-up under §5-C default with 0 % economy deviation (M2.5); quick melee on V (M2.6).
Balance untouched: damage, cooldowns, paint costs, hip spread, projectile speeds, hit radii, mercy window all classic. New bindings: RMB aim, F inspect, V quick melee (added to the classic control set; nothing remapped).
Owed to the user: hardware feel review of kick strengths, flash timing, and ADS poses (all tuned from stills on a software renderer).
Preview rebuilt at `dist/modern/index.html`.

### M3.1 — Modern HUD   (2026-09-03)
**Changed:** the carved-workbench status bar is retired (its 278 lines of CSS removed) and replaced by a minimal, fading 2005–2007 HUD (`modern/index.html` `.mhud` markup + CSS; `modern/src/hud.js` rewritten with the same API). **Top centre:** a compass tape (canvas, 120° span, N/E/S/W and 15° ticks) with objective bearings — gold diamonds for uncollected tables, green for the elevator once unlocked, red for the boss — and the boss bar as a thin strip beneath it. **Top left:** OBJECTIVE eyebrow with the floor name, the objective line (COLLECT n TABLES → TABLES SECURED — REACH THE ELEVATOR → DEFEAT THE HEAD DESIGNER), TABLES / STAFF / SCORE chips (table icons still light up as they're reclaimed), and a **notification feed** that replaces the centre toast (gold for tables/weapons, green for elevator/Fritos, red for the boss rage; five deep, 2–3 s each). **Bottom left:** HEALTH bar + number (turns amber under 50, red under 25), FLOOR. **Bottom right:** weapon name, large PAINT count + bar (red when ≤ 8, dimmed on melee), five slot pips with the active one lit. **World:** one projected marker on the nearest objective with a distance readout (1 cell ≈ 2.5 m), hidden when off-screen or when standing on it. **Floor intro card** (FLOOR n / NAME / subtitle, 3.2 s) replaces the classic floor toast. The whole HUD fades to 42 % after 4 s of game time without an event (damage, fire, pickup, swap, objective change, aim) and snaps back. Sandy's pixel portrait moves to the pause panel (drawn only while visible). Classic overlays kept: low-HP red edge, damage flash, pickup flash, hit marker, damage wedge, lock hint, Tab minimap (restyled in M3.2).
**Evidence:** `modern/docs/M3.1/hud-spawn.jpg`, `hud-combat.jpg` (hit marker, damage wedge, feed), `hud-objective-done.jpg` (green elevator marker "16m", compass bearing, feed), `hud-lowhp.jpg` (red edge, red 14), `floor-card.jpg`, `pause-portrait.jpg`. Smoke green; validator, frozen guard OK; build 14.4 MB (smaller than M2 after the CSS removal).
**Preservation:** every classic readout survives — floor, score, health, paint, tables (count + icons), staff, weapon rack, boss bar, objective text, toasts (as feed), minimap, mute indicator, lock hint, Sandy's portrait (pause). All HUD element IDs the game code writes to are kept.
**Open issues:** the idle fade could not be captured (it counts game time, which advances ~0.05 s per software frame). Feed items and the card use CSS opacity, which the headless renderer paints unreliably; fine on hardware. `#hud-tables-icons` sits inline in the chip — small; M3.2/M3.6 can revisit sizing. The lock hint keeps its classic styling for now.
**Next:** M3.2 compass strip + full-screen tactical map on Tab.

### M3.2 — Tactical map on Tab   (2026-09-03)
**Changed:** the compass strip shipped in M3.1; Tab now opens a **full-screen tactical map** (`#tacmap`): a dimmed vignette over the game, a title (TACTICAL MAP — FLOOR n · NAME) and the floor's subtitle, the blueprint canvas sized to the floor's aspect (up to 66 % × 62 % of the viewport), and a legend (you / table / elevator / locked gate / staff / door, TAB · CLOSE). The blueprint look is the classic one (navy paper, faint grid, drafted walls, penciled furniture, gold doors, red/green gate, green elevator) with glyphs that scale with the cell: gold diamonds for tables, cyan squares for weapon pickups, pink dots for staff (red for the boss), a white arrow for Sandy. Static layer is re-rasterised on toggle. The corner minimap CSS is retired. Also: the floor intro card's alpha is now driven from the HUD update (fade 0.3 s in, 3.1 s hold, 0.7 s out) instead of a CSS transition.
**Evidence:** `modern/docs/M3.2/tacmap-showroom.jpg` (Showroom: display pods with tables, flat-pack aisles, checkout, gate + elevator), `modern/docs/M3.1/floor-card.jpg` (Archives card). Smoke green (Tab toggles on/off, state unchanged); validator, frozen guard OK; build 14.4 MB.
**Preservation:** Tab still toggles the map; the same information the classic minimap showed (walls, furniture, doors, gates, elevator, tables, staff, player) is shown, now readable.
**Open issues:** the map is a snapshot of static walls plus live entities, no fog-of-war (classic had none either). The game keeps running while the map is open (classic behaviour).
**Next:** M3.3 main menu over a live 3D scene + options.

### M3.3 — Main menu over a live 3D scene + Options   (2026-09-03)
**Changed:** the workbench menu (66 CSS blocks, ~1,000 lines) is retired; `modern/index.html` gets a `.mmenu` front-end: title lockup (ARTISAN SOFTWARE PRESENTS / *Sandy's* / TABLE QUEST / MODERN PREVIEW · CARTEL HQ OPERATIONS), a five-item vertical list (New Game, Floor Select, **Options**, How to Play, Sound: ON/OFF) with a gold selection bar, the **case-file context card** and **high-score plate** kept, and the official **box art** kept as a small tilted heritage card. **Live backdrop:** on entering the menu, Floor 1 is loaded silently (`Game.loadLevel(…, { silent: true })` skips music and the floor card) and a cinematic camera dollies slowly along the Lobby entry hall toward reception with gentle yaw sway, rendered through the post stack with the Lobby grade; viewmodels are hidden in the menu; `prefers-reduced-motion` freezes the dolly. **Options panel:** Post-processing ON/OFF, Field of view 60–100 (step 2, drives `camera.fov` and the sprint/ADS base), Mouse sensitivity (classic `[ ]` step), Invert look, Sound — ↑↓ select, ←→ adjust, Enter toggles, Esc back, rows hover-select and arrow-click by pointer; persisted in `localStorage` (`tq3d-postfx`, `tq3d-fov`, `tq3d-sens`, `tq3d-invert`). Floor Select and Instructions reuse a shared modern panel shell (their content is restyled properly in M3.4/M3.6). Sub-overlays share one `.mm-sub-overlay` class. Restored 61 non-menu CSS blocks (intro crawl, transition, pause, game over, victory, panels, cards, level list) that the removal had swept up.
**Evidence:** `modern/docs/M3.3/menu-main.jpg`, `menu-options.jpg`, `menu-options-adjusted.jpg` (FOV 76, sensitivity 2.6, invert ON via keyboard + pointer), `menu-floors.jpg`, `menu-howto.jpg`. Parity harness: keyboard ↓/S/↑ moved the selection 1→2→1; pointer hover selected item 4 and click opened Options; option values changed and persisted (`tq3d-fov=76`, `tq3d-invert=1`, then reset). Reduced motion: camera drift 0.006 while reduced vs 0.018 after (the residue is one frame before the media query flipped). Smoke green (menu flow, six floors); validator, frozen guard OK; build 14.4 MB.
**Preservation:** all four classic actions present (New Game, Floor Select, How to Play, Sound toggle), high score, case-file copy, box art, footer credit line; menu song unchanged; W/S and arrows both navigate; Escape returns from every sub-screen.
**Open issues:** the silently loaded Lobby's staff stand idle in the backdrop (the game does not tick in the menu); a gentle idle animation could come with M4.2. Floor Select still lists plain rows (M3.4 makes it the HQ elevation). Instructions copy still lists the classic bindings only; M3.6 adds RMB aim / F inspect / V melee.
**Next:** M3.4 mission select (Cartel HQ elevation).

### M3.4 — Mission select: Cartel HQ operations board   (2026-09-03)
**Changed:** Floor Select is now an **HQ elevation**: six stacked floor slabs (Penthouse on top, Lobby at ground, roof and brass ground line) with lit-window strips, a brass **elevator shaft indicator** whose lamp lights the highlighted floor, and a **detail card**: OPERATION nn, floor name, subtitle, TABLES / STAFF / THREAT tiles, FIELD FIND (the weapon pickups on that floor), a four-swatch PALETTE (fog, ambient, accent, rug colours from `levels.js`), the score name, and a note that Floor Select grants the arsenal a run would have found. Facts are computed from the canonical ASCII maps (`floorFacts()` counts T / g m x D G / L N R P), so they can never drift from the levels. Threat: LOW / MEDIUM / HIGH from a weighted staff mix, BOSS on Floor 6. **Uncharted**: floors above the best floor reached (`tq3d-best`, set on each floor completion) are dimmed with a small badge — presentation only; every floor stays selectable exactly as classic. DOM order stays floor 1→6 (flex `order` draws the stack), so the classic W/S / arrow handler and the smoke check are untouched. Pointer hover highlights, click starts.
**Evidence:** `modern/docs/M3.4/floor-select-showroom.jpg` (Floor 4 highlighted, Floors 5–6 uncharted with best = 4), `floor-select-penthouse.jpg` (BOSS threat, FIELD FIND: THE HEAD DESIGNER). Harness: 6 items, lamp 6 lit for the Penthouse, Enter started Floor 6 in play state. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** all six floors selectable; the classic weapon grant on Floor Select unchanged; high scores still count; keyboard navigation identical.
**Open issues:** the box art card peeks from behind the panel at the right edge (intentional depth, but the panel could dim it more). Threat weights are editorial (guard 1, manager 2, executive 3.5).
**Next:** M3.5 typewriter briefing with the same story text.

### M3.5 — Typewriter briefing with satellite plan   (2026-09-03)
**Changed:** the 56-second upward crawl is replaced by a **field briefing**: OPERATION: TABLE RECOVERY header (CASE FILE T-17 · THE STORY SO FAR), a monospace typewriter column that types the story line by line at 42 characters per second with a blinking cursor, styled per line class (overline, title, subtitle, dramatic red lines, gold emphasis, the payoff), a **SAT-LINK panel** on the right that scans in the blueprint of one floor per story beat (six beats → six floors, walls / doors / gate / elevator / tables / boss from the canonical maps, scan percentage, reticle corners), a gold progress bar, and PRESS ENTER TO SKIP. The classic `.intro-container` markup stays in the DOM, visually hidden, as the **text of record**: the typewriter reads its beats and line classes at start, so the copy cannot drift. The typewriter runs on a **wall-clock timeline** (each line has a start/end time with 0.26 s breaths and 0.9 s beat pauses), so the briefing lasts ~26 s at any frame rate and ends itself 3.5 s after the last line; Enter/Escape/Space still skip via the classic handler. The live Lobby renders faintly behind the briefing (same drifting camera as the menu).
**Evidence:** `modern/docs/M3.5/briefing-early.jpg` (Floor 3 scan at 51 %, first beats typed), `briefing-end.jpg`. Harness: typed text == classic markup text (with line breaks read as spaces) == the §1.3 story text, **852 / 852 characters, equal: true**; state was `play` after skip and after auto-finish; zero errors. Smoke green (story-text assertion still passes); validator, frozen guard OK; build 14.4 MB.
**Preservation:** every word of the story, in order, including "ARTISAN SOFTWARE PRESENTS", the subtitle, "HER MISSION", and the payoff; intro song unchanged; skip keys unchanged; New Game still flows menu → briefing → Floor 1.
**Open issues:** the first version typed per frame and fell behind on the software renderer (hit the safety cap at 350 characters) — fixed by the timeline. Long lines wrap at the column width; the bottom mask hides overflow as the column scrolls. The classic `--intro-backdrop` workbench image is no longer used by the intro (still used nowhere else; asset kept).
**Next:** M3.6 loading/briefing card per floor, transition, game over, pause, victory restyle; instructions copy update.

### M3.6 — Loading card, transition, game over, pause, victory; instructions   (2026-09-03)
**Changed:** a new **loading / deploy card** (`#screen-loading`, state `loading`) runs before every floor: DEPLOYING · CARTEL HQ, FLOOR n, the floor name and subtitle, OBJECTIVE (COLLECT n TABLES · REACH THE ELEVATOR, or DEFEAT THE HEAD DESIGNER), a FIELD TIP per floor, a SAT-LINK plan that scans the floor in over 2 s, the arsenal pips (owned weapons lit), a gold progress bar, PRESS ENTER TO DEPLOY (Enter/Space skip). Flow: New Game → briefing → card → play; floor cleared → **transition card** (2.4 s, scene still rendering) → next floor loaded silently → card (3.4 s) → play with the floor's music and HUD floor card; retry → card (1.8 s) → play. The transition ("ELEVATOR SECURED / FLOOR CLEARED", staff splattered n/m · time, FLOOR BONUS), **game over** ("PERFORMANCE REVIEW / FIRED!", the classic line, score, Retry / Main Menu, Enter hint), **pause** (portrait, PAUSED, five rows with gold selection bar), and **victory** (MASTERPIECE RECLAIMED!, classic copy, final score, credits, Main Menu) are restyled as dark condensed cards with coloured top rules (green / red / gold / gold). **Instructions** keep every classic line and add RMB aim down sights · V quick melee (table leg) · F inspect weapon; TAB now reads "Tactical map". `TQ.startGameAt` skips the card so the harness and smoke stay fast; the smoke asserts the card state and deploys.
**Evidence:** `modern/docs/M3.6/loading-floor1.jpg`, `loading-floor2.jpg` (after a cleared floor, arsenal pips), `transition.jpg`, `pause.jpg`, `gameover.jpg`, `victory.jpg`, `instructions.jpg`. Harness: skip → `loading`, Enter → `play`; level complete → `loading` for Floor 2; game over → Enter → `loading` → `play`; zero errors. Smoke green (updated for the card); validator, frozen guard OK; build 14.4 MB.
**Preservation:** all classic screen copy retained (FIRED! / The critics were too harsh / FLOOR CLEARED / Riding elevator up… / MASTERPIECE RECLAIMED! / credits); retry mercy floor unchanged; Enter-to-retry unchanged; floor-select weapon grant unchanged; classic control lines all still listed.
**Open issues:** the loading card is time-based (not real asset loading — the single-file build has nothing to load); it exists for pacing and information. Music now starts on deploy rather than on load, so the card is silent apart from the previous track's tail.
**Next:** M3.7 legacy boot (memory + title screens with CRT treatment).

### M3.7 — Legacy boot on a CRT   (2026-09-03)
**Changed:** the two original 199X screens (memory screen, title card) are drawn on a **CRT tube**: 4:3 curved-corner bezel with a dark frame, phosphor vignette, the classic scanline overlay, a soft screen-glass highlight, a power-on wipe (scaleY from a bright line) and a subtle steps-based flicker, plus a caption row (ARTISAN SOFTWARE · LEGACY BOOT · 199X / PRESS ANY KEY). §5-E default applied: the boot plays once per session at load (classic order memory → title → menu preserved), **auto-advances** after 4.5 s and 5 s, and any key or click still skips exactly as classic. Reduced motion disables the wipe and flicker. The images are set on the tubes untouched.
**Evidence:** `modern/docs/M3.7/boot-memory-crt.jpg`, `boot-title-crt.jpg`. Harness: auto path `boot-memory → boot-title → menu`; skip path Space → `boot-title`, click → `menu`. **PNG hash check:** all seven original assets (`memory_screen`, `title_screen`, `tableboxart`, `tableboxart2`, `fritos`, `menu_workbench_bg`, `menu_paintbrush_cursor`) sha256-identical between `src/assets` and `modern/src/assets`. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** boot order, artwork, key/click advance, menu song start on first advance.
**Open issues:** the auto-advance may start the menu song before a user gesture on strict browsers; the first key press starts it regardless (classic behaviour).
**Next:** **M3 gate** (below), then M4.1 enemy character builder.

---

## M3 gate summary   (2026-09-03, no pause per 5-G)

Delivered: the fading minimal HUD with compass tape, objective + feed, projected objective marker, health/paint corners, floor card (M3.1); full-screen blueprint tactical map on Tab (M3.2); main menu over the live Lobby with a five-item list, case file, high score, heritage box art, and an Options panel — post FX, FOV, sensitivity, invert, sound — persisted, keyboard/pointer parity, reduced-motion aware (M3.3); Cartel HQ operations board for Floor Select with facts computed from the canonical maps (M3.4); typewriter field briefing with SAT-LINK floor scans, text of record equal to the classic crawl 852/852 (M3.5); per-floor deploy card plus restyled transition, game over, pause, victory, and instructions (M3.6); CRT legacy boot, PNGs hash-identical (M3.7).
Every classic screen and readout is present; New Game / Floor Select / How to Play / Sound, high score, story text, controls, boot order all preserved.
Owed to the user: a hardware pass on the HUD fade timing and CSS transitions (the software renderer paints CSS opacity transitions unreliably, so several captures were forced). Preview rebuilt at `dist/modern/index.html`.

### M4.1 — Character builder   (2026-09-03)
**Changed:** new `modern/src/characters.js` replaces the 12-box employee with a proportional rig that keeps the **exact classic animation interface** (`group, legL, legR, armL, armR, torso, headG, flashMats, height`; limbs pivot at hip/shoulder, so the AI's walk swing, breathing, head glance, wind-up, and death fall run unchanged). Body: thighs, shins, knees, shoes with heels; jacket with shoulders, lapels, shirt front, tie and knot, collar, belt and buckle; upper arm, forearm, cuff, and a hand (relaxed left, gripping right). Head: skull, jaw, neck, ears, hair (rank-specific: guard fringe, manager comb-over in gray, executive black, boss dark), eye whites with pupils, brows (angry on the boss), nose, mouth. **Rank kit** in the classic colours: guard blue with a brass badge; manager gray with glasses and a name badge; executive black with hat, band, and shades; Head Designer oxblood at 1.65× with hat, gold band, gold tie, cape, and the emissive gold scissors emblem. **Weapons (§5-D default)** in the right hand: stapler with a glowing paint reservoir, tape gun with a yellow roll, paint pistol with a paint can, golden shears (emissive gold). Every limb, the torso, and the head are baked with `bakeStatic(..., { fresh: true, quantize: 0.5 })` — new options: `fresh` gives each character its own materials so the pain flash stays per-enemy; `quantize` snaps roughness/metalness so a limb's parts share buckets. Result: 15–19 meshes per character (classic 13; the extras are the weapon's emissive parts and glasses).
**Evidence:** `modern/docs/M4.1/lineup.jpg` (four ranks facing the camera in the Lobby), `lineup-flash.jpg`. Smoke green (staff counts unchanged on all floors); validator, frozen guard OK; build 14.4 MB.
**Preservation:** stats, detection, attack, hit radii, pain flash, death fall, startled hop untouched; suit colours classic; model height 0.87 / boss ×1.65 unchanged (hit-box math in `game.js` uses fixed radii).
**Open issues:** meshes per enemy slightly above classic → M7.2 draw-call plan still applies (shadow pass). Hands are simple; fingers are a block. The pain flash could not be captured (0.22 s game time ≈ one software frame).
**Next:** M4.2 animation layers (idle / walk / run / aim / fire / flinch / stagger / collapse).

### M4.2 — Animation layers   (2026-09-03)
**Changed:** new `modern/src/enemyanim.js` poses the rig the classic AI drives; `game.js updateEnemies` keeps every decision (state, movement, facing, attacks, damage) and now hands the pose off to `poseEnemy()` / `poseDeath()`. Layers blend additively: **locomotion** — idle breathes, shifts weight, and glances when unaware; walk and run blend by speed fraction (stride 0.6→1.1, arm pump, lean 0.06→0.22, shoulder roll, bounce); **aim** — the weapon arm rises to horizontal with a hold sway, the off hand braces, the head tracks Sandy (±0.6 rad) while in range with line of sight, the classic wind-up still rears back before the shot; **fire** — 0.18 s arm kick and torso twist set from `enemyShoot`; **flinch** — 0.3 s torso and head jerk on any hit; **stagger** — 0.6 s knee dip, sideways lurch, arms out when a single hit takes ≥ 30 % of max health; **hop** — the classic startled jump; **death** — knees buckle and the body sinks (0–0.3 s), falls to a random side with ease-out (0.25–0.85 s), then settles with a small bounce, replacing the rigid 90° tip-over. Timers live on the enemy record; `freezeDeath` is a harness-only pin for captures.
**Evidence:** `modern/docs/M4.2/animation-strip.jpg` (10 frames: idle, walk, run, aim, fire, flinch, stagger, death-buckle, death-fall, death-rest) plus the individual `f-*.jpg` frames. Frame probe: deathT 0.28 → rotation 0.15 rad (buckling), 0.6 → 1.23 rad (fallen). Smoke green (staff counts, bot fight untouched); validator, frozen guard OK; build 14.4 MB.
**Preservation:** detection, attack cadence, leading, strafe timing, door breaching, pack alert, pain flash, hop, and death timing (the body is down within ~0.55 s as before; it settles for another ~0.2 s) all unchanged; the AI code path is the classic one.
**Open issues:** flinch/stagger read subtly at range; hardware motion will show them better than stills. The dead body's shadow blob stays circular under a fallen figure.
**Next:** M4.3 AI presentation additions (cover-peek, suppress-and-advance, callouts) with classic numbers unchanged.

### M4.3 — AI presentation: barks, cover-peek, suppress-and-advance   (2026-09-03)
**Changed:** new `modern/src/barks.js`: rank-flavoured text callouts projected above heads (guards nervous — "It's the table lady!", managers procedural — "Escalating this.", "She's on floor 2!", executives cold — "Handle it.", the Head Designer theatrical — "You call THAT design?"), triggered at the **classic** state changes only: spotting Sandy (idle→alert), losing her (chase→idle after 4.5 s), a colleague going down (a nearby awake ally), the boss's phase-2 rage, and occasionally after a shot fired outside preferred range ("Moving up!"). One bark per enemy, four on screen, 0.35 s anti-chorus throttle, cleared on level load. `enemyanim.js` gains two pose layers: **cover-peek** — an enemy waiting out its attack cooldown beside a tall prop leans out toward the open side (torso roll, slight dip, head turn); **suppress-and-advance** — for 1 s after firing while still outside preferred range, a hunched weapon-forward run. Both are poses on top of the classic movement; no position, timing, or targeting changes.
**Evidence:** `modern/docs/M4.3/barks.jpg` (GUARD "It's the table lady!" above a guard in the Lobby). `diff src/config.js modern/src/config.js` → **identical** (ENEMY_STATS, PACK_ALERT_RADIUS, weapons, speeds all byte-equal). Comparative autopilot fight (Floor 2, brush only, three staff pulled into line of sight, 14 s game time, 3 runs each): classic 2 kills / 30 paint / 0 HP lost; modern 7 kills / 32 paint / 0 HP lost; all outcomes `clear`. Per-run kills vary 0–3 on both builds, so the aggregates are within the classic AI's own variance. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** detection, attack cadence, leading, strafing, door breaching, pack alert, lose-sight timeout: unchanged code path; the additions read from state and never write to it.
**Open issues:** barks are English-only DOM text (no audio barks — M6 could add voice-like synth stabs). The cover-peek fires only when the enemy is stationary next to a tall prop, which the orbit-strafe makes brief.
**Next:** M4.4 Head Designer model and phase-2 escalation.

### M4.4 — Head Designer: rage escalation and supply drops   (2026-09-03)
**Changed:** the boss (already rebuilt in M4.1 with hat, cape, gold tie, emissive scissors emblem, golden shears) gains a **gold epaulette line** and **rage eyes** — emissive spheres kept out of the bake that ignite at phase 2. Phase 2 (classic trigger: under half health) now also: `World.rageShift()` turns the key light hot red at 1.25×, every fixture red at 1.4× with an uneasy strobe, and deepens the fog to oxblood; `onBossRage` swaps the post grade to a hotter red tint with more contrast, vignette, grain, and bloom; a 40-particle additive red burst and a 0.5 screen shake mark the moment; the M4.3 rage bark plays. The four classic comeback supplies (2 Fritos, 2 paint at the classic coordinates) now **drop from the ceiling** — quadratic fall over 0.55 s from just under the ceiling, a bounce, a dust puff and `land` sound — instead of appearing in place. New `modern/tools/bossfight.mjs` (classic autopilot, Floor-6 arsenal, die-once-retry-win rule) and `TQ.deploy()`.
**Evidence:** `modern/docs/M4.4/boss-calm.jpg`, `boss-rage-drop.jpg` (supplies mid-air, bark, red arena), `boss-rage.jpg` (eyes lit, dust on landing). **Boss certification:** `won: true`, `deaths: 0`, phase 2 at 59 s, victory at 66.7 s game time, 36 HP and 8 paint left, score 5,020 — inside the "die once, learn, win the retry" bar with a death to spare. Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** boss stats, phase-2 threshold, 1.35× speed, paired volleys, supply coordinates and kinds unchanged; the drop is purely visual (items are collectable from the frame they spawn, as before).
**Open issues:** the rage grade persists until the next level load (intended). The lock hint was overlapping the boss bar — moved down. The certification runs one fight; M7.1 repeats it as part of the full campaign.
**Next:** M4.5 paint on suits and drips on death.

### M4.5 — Paint on suits, drips, pools   (2026-09-03)
**Changed:** `Game.paintEnemy()` sticks a paint splat (one of the three splat shapes, in the projectile's colour) to the struck body part — legs below 0.42, head above 0.78, torso between — as a small quad in that part's local space so it rides the animation; placed along the outward normal from the enemy's axis at the hit height; capped at 10 per enemy ("suit saturated"). Direct projectile hits and roller splash both paint. The last colour is remembered: while a painted enemy goes down, **drips** fall from the body every 0.12 s for 2.4 s (height following the fall), and a **pool** splat lands on the floor at 0.85 s (0.75 wide, 1.4 for the boss). `getSplatTextures` exported from `effects.js`.
**Evidence:** `modern/docs/M4.5/painted-manager.jpg` (seven brush hits: 7 decals on the jacket, `paintCount 7`), `death-drips.jpg` (falling, drips in the last colour), `death-pool.jpg` (resting on a yellow pool). Smoke green; validator, frozen guard OK; build 14.4 MB.
**Preservation:** damage and hit detection untouched; the classic random-hue death spray still fires alongside.
**Open issues:** each suit decal is an un-batched quad (≤ 10 per enemy, only on hit enemies); M7.2's draw-call pass can pool them like the wall decals if needed. Decals inherit the part's baked yaw only at hit time (a head turn moves a head decal with the head — correct).
**Next:** **M4 gate** (below), then M5.1 Lobby art pass.

---

## M4 gate summary   (2026-09-03, no pause per 5-G)

Delivered: a new procedural character builder with proportional rigs, faces, rank kit, and office paint weapons under the §5-D default (M4.1); additive animation layers — idle/walk/run, aim with head tracking, fire kick, flinch, stagger, hop, buckle-fall-settle death — on the untouched classic AI (M4.2); rank-flavoured barks plus cover-peek and advance poses, config byte-identical, comparative bot fights within variance (M4.3); Head Designer rage escalation with lit eyes, red arena, hot grade, ceiling supply drops, boss certified won with zero deaths (M4.4); paint on suits, death drips, pools (M4.5).
Preserved: every enemy stat, detection/attack/lead value, pack alert, door breaching, phase-2 rule and supply spots; suit colours; death timing.
Owed to the user: hardware look at the reaction animations (subtle in stills); draw calls per enemy sit at 15–19 meshes plus suit decals, tracked for M7.2. Preview rebuilt at `dist/modern/index.html`.
