# MODERN preview — progress log

Governed by [`docs/modern/GOAL_LOOP.md`](../docs/modern/GOAL_LOOP.md). One entry per iteration, newest last.
Status legend: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED(§5-x)`.

## Milestone board

| Milestone | Status | Gate |
|:--|:--|:--|
| M0 Fork and baseline | DONE | gate auto-advanced by the goal harness on 2026-09-03; review still requested |
| M1 Renderer, lighting, materials | DONE | awaiting user review (hardware fps check owed) |
| M2 Gunplay and first-person feel | DONE | gate summary logged; running unattended per 5-G |
| M3 HUD and front-end | IN PROGRESS | |
| M4 Enemies and AI presentation | TODO | |
| M5 Environment art per floor | TODO | |
| M6 Audio | TODO | |
| M7 Polish, certification, release | TODO | |

## Open decisions applied (§5)

| Decision | Applied | When |
|:--|:--|:--|
| 5-G review cadence | **User: run unattended, do not pause at milestone gates** ("assign it and keep going"). Gate summaries are still logged and evidence still captured per milestone. | 2026-09-03, after the M1 gate |
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
