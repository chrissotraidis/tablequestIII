# Sandy's Table Quest: MODERN — Goal Loop

> **One-line brief:** Fork *Sandy's Table Quest 3D* (v2.x, a 1990s-style shooter) into a new **preview build** that plays like a **mid-2000s military-shooter-era game** (Call of Duty 2 / Call of Duty 4 presentation), while keeping it **the exact same game**: same six floors, same level layouts, same weapons, same enemies, same story, same music (re-orchestrated), same art heritage.
>
> **Status:** DRAFT for alignment. Nothing in this document has been built yet.

---

## 0. How to read this document

This is the contract for an autonomous, goal-based work loop. It has four parts:

| Part | Purpose |
|:--|:--|
| **§1 Baseline review** | What the current game is, verified by running it. Inventory of everything that must survive the fork. |
| **§2 Target definition** | What "mid-2000s, Call of Duty style" concretely means for this game. The taste reference. |
| **§3 Rules of the loop** | The fork structure, the hard guardrails, the iteration protocol, the verification gates. |
| **§4 Goals** | The ordered milestones (M0–M7), each with sub-goals, acceptance criteria, and how they are verified. |
| **§5 Open decisions** | The handful of choices that need a human answer before or during the loop. |
| **§6 Goal prompt** | The short assignment text that is pasted into chat to start the loop. |

The loop agent re-reads §3 and §4 on every iteration. §1 is the "do not forget anything" checklist.

---

## 1. Baseline review (verified 2026-09-02)

### 1.1 What was verified

The current build was launched from source (`npm run dev` on Vite 8, three.js 0.184) and driven headless through the full front-end: memory screen → title card → workbench main menu → story crawl → Floor 1 gameplay, plus direct warps to Floors 2, 4, 5, and 6 via the `TQ` console harness. All screens rendered, no console errors, no page errors. Screenshots of that run are the visual baseline for comparison later.

### 1.2 Architecture (as it exists today)

```
index.html          UI shell: all screens + HUD + CSS (~1,600 lines of CSS)
src/main.js         boot state machine, menus, render loop, TQ playtest harness, autopilot bot
src/game.js         player controller, weapons, projectiles, enemies + AI, pickups, boss, camera feel
src/world.js        ASCII map → merged wall geometry, doors, gates, elevator, lighting, zone furnishing
src/levels.js       six floor definitions (ASCII map + zones + palette + music key)
src/models.js       procedural low-poly enemies, pickups, viewmodels, 19 prop types, paintings, rugs
src/textures.js     15 procedural canvas textures (walls, floors, ceilings, door, gate, elevator)
src/audio.js        Web Audio synth engine, sequencer, 9 songs, ~32 SFX
src/effects.js      particle bursts + paint splat decals
src/hud.js          DOM HUD, pixel Sandy face, blueprint minimap
src/input.js        keyboard, pointer lock, wheel
src/config.js       all tuning constants
tools/validate_levels.js   map enclosure/reachability validator
dist/index.html     single-file production build (~14 MB, everything inlined)
```

Everything visual except seven PNGs is generated in code at runtime. That is the single most important fact for the fork: **there is no asset pipeline to migrate; the "assets" are functions.**

### 1.3 Preservation inventory — the "forget nothing" list

Every item below must exist in the modern build. The loop checks this list at every milestone gate.

**Original 199X artwork (hand-authored, must be reused, never redrawn):**
- `src/assets/memory_screen.png` — DOS boot / "Available Memory" screen
- `src/assets/title_screen.png` — pixel title card
- `src/assets/tableboxart.png`, `tableboxart2.png` — box art
- `src/assets/fritos.png` — the Fritos health sprite
- `src/assets/menu_workbench_bg.png`, `menu_paintbrush_cursor.png` — v2 menu art

**Screens / flow (10 states):** boot-memory → boot-title → main menu (New Game, Floor Select, How to Play, Sound toggle, high score, case-file context card) → story crawl (full text below, skippable) → play → pause (Resume, Restart Floor, Toggle Sound, Quit) → floor transition card (kills/total, time, +1000 bonus) → game over (retry restores floor-start snapshot with mercy floor 75 HP / 20 paint) → victory + credits. High score persisted in `localStorage` (`tq3d-highscore`); sensitivity persisted (`tq3d-sens`).

**Story text (verbatim, keep every beat):** "In the year 199X, the Interior Design Cartel declared war on durability. They replaced craftsmanship with 'fast furniture' — flimsy, soulless, and impossible to repair. St. Louis fell first. Then the world. Grandmothers wept as their oak dining sets were seized and replaced by honeycomb cardboard. But one artisan refused to fold. Sandy. She didn't design for trends. She built tables that could survive a nuclear winter. When they raided her workshop, they made one fatal mistake: They left her alive. Tonight, she enters their headquarters — six floors of beige carpet, particle board, and armed middle-management. HER MISSION: Reclaim the tables. Splatter the critics. Remind them what 'solid wood' feels like. They took the tables. She's taking them back."

**Six floors (exact ASCII maps in `src/levels.js` are canonical; the modern build must load the same maps):**

| # | Name | Subtitle | Tables | Staff | Wall | Floor/Ceil | Music | Zones |
|:-:|:--|:--|:-:|:-:|:--|:--|:--|:--|
| 1 | The Lobby | Ground floor. Smile for the receptionist. | 2 | 6 | office panel | marble / ceiling tile | "Beige Carpet Lounge" 112 BPM | garden, reception, lounge×2, breakroom, managerOffice, security |
| 2 | The Office | Cubicle farm. The guards are unionized. | 3 | 9 | office panel | carpet / ceiling tile | "Cubicle Crusade" 135 BPM | cubicles×2, conference, managerOffice, breakroom, supply, copyRoom |
| 3 | The Archives | Where they bury the warranty claims. | 3 | 8 | stone | stone / stone | "Dust & Echoes" 96 BPM | vault×4, aisles×2, supply×2, readingRoom×2 |
| 4 | The Showroom | Fast furniture as far as the eye can see. | 4 | 11 | wood | wood floor / ceiling tile | "Particle Board Funk" 122 BPM | vignette×4, lounge, flatpack, gallery, checkout |
| 5 | The Factory | Where masterpieces become particle board. | 4 | 15 | metal | factory / metal ceiling | "Assembly Line Fury" 152 BPM | dock×2, assembly, paintstock, lumberyard×2 |
| 6 | The Penthouse | The Head Designer will see you now. | boss | 1 | metal | marble / metal ceiling | "The Final Critique" 168 BPM | gallery, garden×4 |

Plus menu song "Workshop Dreams" (88 BPM) and intro song "The Artisan's Lament" (60 BPM). Nine songs total.

**Map legend (must keep working):** walls `# W B M O C`, door `+`, elevator gate `X` (locked until all tables), elevator pad `E`, start `S`, table `T`, enemies `g m x D G`, pickups `A H $ Z`, weapon pickups `L N R P`.

**Weapons (5, same roles and unlock floors):**

| Slot | Key | Damage | Cooldown | Paint cost | Notes | Found |
|:-:|:--|:-:|:-:|:-:|:--|:--|
| 1 | paintbrush | 16 | 0.25s | 1 | auto, lit projectile, random hue | start |
| 2 | tableLeg | 50 | 0.5s | 0 | melee, 1.8 range, 90° arc, wrecks furniture | Floor 2 (`L`) |
| 3 | nailgun | 11 | 0.13s | 1 | fast, tight spread, silver nails | Floor 2 supply / Floor 3 (`N`) |
| 4 | roller | 30 (+30 splash r1.7) | 0.95s | 4 | slow lob, splash wrecks furniture | Floor 4 (`R`) |
| 5 | sprayer | 9 | 0.11s | 1 | full-auto, wide spread | Floor 5 (`P`) |

Floor Select grants weapons a player would have found by then (leg ≥F3, nailgun ≥F4, roller ≥F5, sprayer ≥F6).

**Enemies (4):** Guard (blue suit, 30 HP, 7.5 dmg, no lead), Manager (gray suit + glasses, 45 HP, 8.5 dmg, 0.25 lead), Executive (black suit + hat, 60 HP, 11.5 dmg, 0.55 lead), Head Designer boss (1.65× scale, oxblood suit, cape, gold scissors emblem, 480 HP, 11.5 dmg, phase 2 under 50%: 1.35× speed, paired volleys, spawns two Fritos + two paint buckets at fixed arena coords). AI behaviors to keep: idle wander, detect on line-of-sight within range after 3s spawn grace, startled hop, pack alert within 5.5 units, orbit-strafe at 55% of attack range, shot leading, crossfire cap of 4 enemy projectiles, door breaching while chasing, lose-sight timeout 4.5s, melee scratch when adjacent, pain flash, fall-over death.

**Pickups / economy:** table +500 (objective), paint bucket +14 paint (cap 99), Fritos +25 HP (cap 100), cash +100, gold bar +250, demolition +5 per prop, 12% hidden cash in destroyed furniture, floor bonus +1000, boss +5000 masterpiece bonus. "ALREADY FULL" hint when at cap.

**Props (19 destructible types):** plant, cooler, cabinet, crate, barrel, shelf, desk, bench, pallet, statue, machine, counter, sofa, vending, fridge, floorLamp, bigTable, lumber, copier. Tall props block shots; short ones are shot over. Paintings (3 variants) and rugs are non-blocking decor. Zone furnishing patterns: perimeter, rows, line, center, cluster, with flood-fill reachability protection.

**Player feel:** speed 3.7 / sprint 5.6, accel 14, smoothed mouse look with pitch clamp, keyboard turn, jump (2.7 impulse, 10.5 gravity), head-bob with lateral figure-8 sway, strafe/turn banking, sprint FOV +7, screen shake, recoil on viewmodel, muzzle flash light, player-following light, hit markers, damage flash, pickup flash, low-HP vignette + heartbeat under 25 HP, footsteps.

**Controls:** WASD, mouse look, ←→ turn, click/Ctrl fire, Space jump, Shift sprint, E door, 1–5 select, Q/wheel cycle, [ ] sensitivity, Tab minimap, U mute, Esc pause, focus loss pauses.

**SFX (32):** alert, boss_roar, collect, door_close, door_open, elevator, empty, enemy_death, enemy_pain, fanfare, gate, heartbeat, hit, jump, land, menu_move, menu_select, money, munch, nail, pain, roller_boom, roller_fire, shoot, splat, spray, step, swing, table, weapon_switch, wood_break, wood_hit.

**Tooling:** the `TQ` console harness (`skipBoot`, `startGameAt`, `godmode`, `giveAll`, `teleport`, `collectAllTables`, `killAll`, `warpElevator`, `setTestMode`, `botGoto`, `botFight`, `botSleep`, `snapshot`), the hidden-tab MessageChannel pump, and `tools/validate_levels.js`.

### 1.4 What dates the current build to the 1990s (the gap to close)

Observed in the run, in order of visual impact:

1. **Flat lighting.** Lambert materials, ambient + hemisphere + nine unshadowed point lights per floor. No shadows anywhere except blob discs under enemies. Ceiling "light panels" are unlit emissive quads.
2. **Box-world geometry.** Every wall is a unit cube 1.35 high; floor and ceiling are single tiled planes. No trim, no beams, no ceiling variation, no windows, no verticality.
3. **Procedural textures at 256px with no normal/roughness.** Readable and charming, but every surface is matte and identical up close.
4. **Blocky characters.** Enemies are 12-box figures with swing-limb animation; no hands, no weapons in hand, no facial detail, no hit reaction beyond a red flash, and death is a 90° tip-over.
5. **Projectile "paint balls."** All shots are visible slow spheres. There are no tracers, muzzle sprites, shell ejection, impact sparks, or smoke.
6. **HUD is a full-width wooden bench** occupying the bottom 15% of the screen, with a pixel face. It is lovely but it is a Doom status bar.
7. **Menus are 2D DOM over a static painting.** No 3D background, no camera fly-through, no loading screens, no mission briefings.
8. **Chiptune-adjacent synth music.** Well-composed, but the instrument set is subtractive synth voices and an 808-style kit.
9. **No post-processing.** No bloom, grain, vignette, color grading, motion blur, or depth of field.
10. **Weapon handling is arcade.** No aim-down-sights, no reload, no magazine, no sprint-lowering, no weapon raise/lower on switch.

---

## 2. Target definition: "mid-2000s, Call of Duty style"

The reference window is **2005–2007**: *Call of Duty 2*, *Call of Duty 4: Modern Warfare*, with *F.E.A.R.*, *Half-Life 2*, and *Gears of War* as supporting taste references. The modern build should feel like a game from that window running in a browser, not like a 2020s game. Restraint matters: no ray tracing, no PBR showroom look, no ultra-wide cinematic bars everywhere.

### 2.1 Visual pillars

- **Lit, shadowed, graded.** One dominant light direction per space with real shadow maps, bounced fill, and warm/cool color grading per floor. Slight desaturation, crushed blacks, bloom on highlights, subtle film grain, vignette. ACES stays.
- **Same rooms, more geometry.** Every floor keeps its exact ASCII map and zones, but walls get baseboards, crown/ceiling trim, door frames, exposed beams or drop-ceiling grids, wall-mounted fixtures, and windows where the fiction supports it (lobby glass, showroom display glass, factory clerestory). Ceiling height rises to something believable for each space while preserving the 1-unit grid for gameplay.
- **Materials with response.** Normal + roughness maps generated procedurally at 512–1024px, so marble reflects, carpet scatters, metal picks up highlights. Still generated in code, still single-file.
- **Characters with intent.** Enemies get proportional bodies, articulated hands holding a visible weapon (paint pistols / staple guns / roller rifles by rank), faces with a few features, layered animation (walk, run, aim, fire, flinch, stagger, fall), and a "collapse and settle" death instead of a tip-over. The Head Designer gets a properly menacing silhouette.
- **Combat readability.** Tracers, muzzle flash sprites + light, shell/brush-flick ejection, impact sparks and dust, wall decals that persist longer, enemy hit reactions, directional damage indicators.
- **Modern-era HUD.** Minimal, mostly-transparent, fades when idle: compass strip with objective bearing, health as a red screen edge (plus the numeric readout, see §5), paint/ammo bottom-right with weapon name and reserve, hit marker "X", objective text top-left with distance marker, "Floor 3 · The Archives" intro card, notifications feed (TABLE RECLAIMED, NEW WEAPON, ELEVATOR UNLOCKED). Sandy's face returns as a small portrait on the pause and briefing screens instead of the HUD.
- **Cinematic front-end.** Main menu over a live 3D scene (Sandy's workshop or Cartel lobby exterior) with slow camera drift; vertical menu list; mission select as a Cartel HQ elevation with six floors; typewriter mission briefing with floor plan; loading screens with tips; the 199X memory and title screens kept as a "legacy boot" that plays once with CRT treatment and can be skipped.

### 2.2 Gameplay pillars ("same game, new decade")

The test: a player who has finished v2.x can navigate any floor of the modern build from memory, find the same tables in the same rooms, and beat the boss with the same strategy.

- Identical maps, spawn, objectives, enemy placement, pickups, scoring, unlock order, and boss phases.
- Identical weapon roles and balance numbers (damage, cooldown, cost). New *presentation* (ADS, reload/pump animation, sprint lowering, raise/lower on swap) must not change time-to-kill or paint economy. Where a modern mechanic would change balance, it is an open decision in §5.
- Same AI behaviors, extended only with cover-peek and reaction animations, never replaced.
- Same controls, plus the mid-2000s standard bindings (right-click ADS, V quick-melee with the table leg, R reload where applicable, C/Ctrl crouch as a stretch).

### 2.3 Audio pillars

- **Same nine songs, re-orchestrated.** Keep every melody, chord progression, BPM, and structure. Swap the palette to a 2005-era cinematic-hybrid score: sampled-style strings and brass built from additive/FM synthesis, taiko-style percussion, distorted guitar for Factory, choir pads for Boss, warm piano for Menu and Intro. The synth engine is extended, not replaced.
- **Layered SFX.** Every one of the 32 effects keeps its trigger and a recognisable character but gets layered transients, tails, and reverb sends per floor material.
- **Ambience beds** per floor (HVAC hum, fluorescent buzz, factory machinery, penthouse rain on glass) and **music ducking** under heavy combat, swelling on objective events.

### 2.4 Things that stay deliberately un-modern

- Paint, not blood. The rating stays "M for Mahogany."
- The dry jokes: case-file labels, Fritos, "The guards are unionized."
- Procedural everything. No downloaded models, textures, or audio. The single-file HTML distribution is a feature.
- The memory screen and title card are heritage and open the modern build too.

---

## 3. Rules of the loop

### 3.1 Fork structure (proposed; confirm in §5-A)

```
tablequestIII/
|-- index.html, src/, dist/index.html      CLASSIC v2.x — frozen, never edited by the loop
|-- modern/
|   |-- index.html                          modern UI shell
|   |-- src/                                forked engine (starts as a verbatim copy of ../src)
|   |   `-- assets/                         verbatim copies of the seven original PNGs
|   |-- docs/                               progress screenshots, comparison sheets
|   |-- PROGRESS.md                         running log, one entry per iteration
|   `-- vite.config.js                      builds to ../dist/modern/index.html
|-- docs/modern/GOAL_LOOP.md                this document
`-- package.json                            gains: dev:modern, build:modern, build:all
```

The loop works on a branch `modern-preview` off `main`. Classic remains playable from `dist/index.html` throughout. The README gains one "Preview build" link once M0 passes.

### 3.2 Hard guardrails

1. **Never edit classic files.** `index.html`, `src/**`, `dist/index.html`, `tools/**` are read-only to the loop. Only `README.md`, `package.json`, `CHANGELOG.md`, and new `modern/**` / `docs/modern/**` paths may change. A CI-style check (`git diff --stat main -- index.html src dist/index.html tools`) must be empty at every commit.
2. **The preservation inventory (§1.3) is a test, not a guideline.** A milestone is not done while any listed item is missing or behaves differently in a way §2.2 forbids.
3. **Single-file distribution stays.** `dist/modern/index.html` must run from `file://` with no network. Size cap: 40 MB.
4. **Performance budget:** 60 fps at 1080p on a 2020-era integrated GPU; under 400 draw calls per frame; no per-frame allocations in the hot loop; shader compile pre-warm before play. Headless verification measures frame time via the harness at 1280×800 with SwiftShader and flags regressions above 2× baseline.
5. **No external runtime assets or CDNs.** three.js addons (EffectComposer, passes, BufferGeometryUtils) from the npm package are fine.
6. **Keep the `TQ` harness working** in the modern build; every verification step depends on it.
7. **Balance numbers live in `modern/src/config.js`** and must diff-match classic `src/config.js` for every value listed in §1.3 unless §5 says otherwise.
8. **Commit per iteration** on `modern-preview` with a message that names the goal ID (e.g. `M2.3 tracers + muzzle sprites`). No pushes, no PRs, no merges to `main` without the user.

### 3.3 Iteration protocol

Each pass through the loop:

1. **Read** `docs/modern/GOAL_LOOP.md` §3–§4 and the last three entries in `modern/PROGRESS.md`.
2. **Pick** the lowest-numbered goal whose status is not DONE and whose prerequisites are DONE. Within a milestone, sub-goals may be reordered for dependency reasons; milestones may not.
3. **Implement** in `modern/**` only.
4. **Verify** with the gate for that goal (see each goal's "Verify" line) plus the universal checks:
   - `npm run build:modern` succeeds; `node tools/validate_levels.js` passes against `modern/src/levels.js`.
   - Headless smoke: boot → menu → each of the six floors loads, `TQ.snapshot()` reports the expected table/staff counts (2/6, 3/9, 3/8, 4/11, 4/15, boss/1), zero console errors.
   - Screenshot the affected surface at 1280×800 into `modern/docs/<goal-id>.png`.
   - Classic-diff check from §3.2-1 is empty.
5. **Log** an entry in `modern/PROGRESS.md`: goal ID, what changed, evidence (screenshot paths, numbers), open issues, next goal.
6. **Commit.**
7. **Stop for review** at every milestone boundary (M0…M7) and at any §5 decision the loop hits. Post a short summary with before/after screenshots and wait.

### 3.4 Definition of done for the whole loop

- M0–M7 all DONE.
- A full autopilot playthrough (`TQ.botGoto` / `botFight`) clears Floors 1–6 and defeats the boss in the modern build.
- A side-by-side comparison sheet (`modern/docs/comparison.md`) shows every screen and floor in classic vs modern.
- README links the preview build; CHANGELOG has a "Modern preview" section.

---

## 4. Goals

Status legend: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED(§5-x)`.

### M0 — Fork and baseline `TODO`

The clone must run identically before anything is modernized. This is what guarantees nothing is forgotten.

| ID | Goal | Verify |
|:--|:--|:--|
| M0.1 | Create `modern/` with verbatim copies of `index.html`, `src/**`, and the seven PNGs. Rewire imports/paths. | `npm run dev:modern` serves; screenshot matches classic pixel-for-pixel at menu and Floor 1 spawn. |
| M0.2 | Add `vite.config.js` in `modern/` building to `dist/modern/index.html`; add `dev:modern`, `build:modern`, `build:all` scripts. | `npm run build:all` produces both files; classic `dist/index.html` byte-identical to `main`. |
| M0.3 | Create `modern/PROGRESS.md` with the template and the first entry. Add the classic-diff guard script (`tools/check_classic_frozen.sh` or an npm script). | Script exits 0 on clean tree, 1 when a classic file is touched. |
| M0.4 | Headless verification script `modern/tools/smoke.mjs` (Playwright, SwiftShader) that runs the §3.3-4 smoke and writes screenshots. | Runs green against the unmodified clone; produces six floor screenshots. |
| M0.5 | README: add "Preview build (modern)" link and a two-line explanation. | Rendered README shows both builds. |

**Gate:** user review. Nothing visual has changed yet; this confirms structure.

### M1 — Renderer, lighting, materials `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M1.1 | Switch world materials to `MeshStandardMaterial`; generate normal + roughness maps for all 15 procedural textures at 512px (1024 for floors). Keep the same visual identity of each texture. | Side-by-side of each texture, classic vs modern, in `modern/docs/M1.1.png`. |
| M1.2 | Lighting rig per floor: one shadow-casting directional/spot key from the fiction (skylight, window bank, overhead rail), point fills without shadows, real ceiling fixtures with emissive + light. Floor palettes from `levels.js` become color-grade targets. | Shadows visible under props and enemies; per-floor screenshots; draw calls and fps within §3.2-4. |
| M1.3 | Post-processing stack: bloom, vignette, film grain, color grading (per-floor LUT-like curve), optional light motion blur on turn. Toggle in pause menu. | Screenshots with/without; frame-time delta logged. |
| M1.4 | Geometry pass on the map compiler: taller ceilings per floor, baseboards, ceiling trim, door frames, drop-ceiling grid or beams, elevator vestibule dressing. Grid collision unchanged. | Bot walkthrough of all six floors completes; `validate_levels` green; no new collision cells. |
| M1.5 | Windows and exterior: lobby glass with a night-city skybox, showroom display glass, factory clerestory, penthouse floor-to-ceiling glass with rain. Skybox procedural. | Screenshots; still single-file. |
| M1.6 | Decals: paint splats become projected decals that last 60s+ with pooling; wood splinter debris as small meshes with physics-lite. | Fire 200 shots at a wall; fps stable; decals persist. |

**Gate:** user review with a six-floor before/after sheet.

### M2 — Gunplay and first-person feel `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M2.1 | New viewmodels for all five weapons with Sandy's two hands, modelled closer to 2007 fidelity (still procedural). Idle sway, walk bob, sprint lowering, raise/lower on switch, inspect on hold-F (stretch). | Screenshot each weapon idle and sprinting. |
| M2.2 | Aim-down-sights on right-click for brush, nailgun, sprayer, roller (iron-sight/hip-sight poses), FOV narrow, reduced spread. Balance unchanged (§2.2). | ADS screenshots; spread numbers logged. |
| M2.3 | Muzzle flash sprites + light, tracers for nail gun and sprayer, paint arcs for brush and roller, ejection particles, impact sparks/dust/paint by surface. | Screenshot mid-burst per weapon. |
| M2.4 | Recoil patterns and camera kick per weapon; hit marker sound + "X" HUD; directional damage indicators. | Manual feel review via user; parameters logged. |
| M2.5 | Reload / pump presentation for the paint economy (see §5-C for the decision). Paint remains the single resource. | Paint economy over a floor matches classic within 5%. |
| M2.6 | Quick melee on V with the table leg once owned; sprint tackle removed (keep simple). | Bot fight uses melee when dry; classic damage numbers. |

**Gate:** user review with a weapons reel.

### M3 — HUD and front-end `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M3.1 | Replace the workbench status bar with the mid-2000s HUD from §2.1: compass, objective marker + distance, paint/weapon bottom-right, table counter, staff counter, notifications feed, hit marker, low-HP treatment, floor intro card. Fades when idle. | Screenshot at spawn, in combat, at objective complete, at low HP. |
| M3.2 | Minimap becomes a compass-strip plus a full-screen tactical map on Tab (blueprint style preserved). | Screenshot both. |
| M3.3 | Main menu over a live 3D scene with camera drift; vertical list; sound and video options (post FX, FOV, sensitivity, mouse invert). High score and case-file card retained. | Screenshot; keyboard + pointer parity; reduced-motion respected. |
| M3.4 | Mission select: Cartel HQ elevation with six floors, each with subtitle, table count, threat level, palette swatch; locked/unlocked visual. | Screenshot. |
| M3.5 | Story crawl becomes a typewriter briefing with the same text, plus a "satellite" plan of the HQ. Skippable. | Text diff against §1.3 story is empty. |
| M3.6 | Loading/briefing screen per floor (name, subtitle, objective, tips). Transition card, game over, pause, and victory restyled in the same language. | Screenshots of all seven. |
| M3.7 | Legacy boot: memory screen + title card with CRT curvature/scanlines, skippable, plays before the modern menu. | Screenshot; PNGs unmodified (hash check). |

**Gate:** user review of the full front-end flow.

### M4 — Enemies and AI presentation `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M4.1 | New procedural character builder: proportional rig, hands, faces, rank-specific outfits (blue guard, gray manager + glasses, black executive + hat, boss cape + scissors emblem), visible weapon per rank. | Screenshot line-up of four. |
| M4.2 | Animation layers: idle, walk, run, aim, fire, flinch, stagger, collapse death with settle; startled hop retained. | Video-frame strip in docs. |
| M4.3 | AI additions on top of classic behavior: cover-peek at tall props, suppress-and-advance, callouts as text barks ("She's on three!"). Detection/attack/lead numbers unchanged. | Bot fight survives comparable to classic; numbers diff empty. |
| M4.4 | Head Designer: menacing model, phase-2 visual escalation (lighting shift, music layer), supply drop animation for the four fixed spawns. | Boss fight bot-certified winnable on retry difficulty. |
| M4.5 | Enemy paint hits: colored decals on their suits, paint dripping on death. | Screenshot. |

**Gate:** user review with enemy reel.

### M5 — Environment art per floor `TODO`

One sub-goal per floor. Each keeps its ASCII map and zone recipes, and upgrades the 19 prop builders plus adds floor-specific set dressing (signage, ceiling variation, ambient particles, screens, machinery motion).

| ID | Floor | Signature upgrades | Verify |
|:--|:--|:--|:--|
| M5.1 | Lobby | Reception signage, marble reflections, glass front, planters, security turnstiles, elevator lobby | Screenshot + walkthrough |
| M5.2 | Office | Cubicle detail (monitors with screensavers, chairs), fluorescent grid, conference glass, copier room | Screenshot + walkthrough |
| M5.3 | Archives | Dust motes, low key lighting, cage vaults, rolling shelves, reading lamps | Screenshot + walkthrough |
| M5.4 | Showroom | Display vignettes with price tags, flat-pack racking, checkout lanes, spotlights | Screenshot + walkthrough |
| M5.5 | Factory | Moving conveyors, sparks, steam, hazard striping, paint vats, lumber stacks | Screenshot + walkthrough |
| M5.6 | Penthouse | Trophy gallery, rain on glass, city lights, arena cover blocks as designer furniture | Screenshot + boss walkthrough |
| M5.7 | All 19 props rebuilt at modern fidelity with damage states (intact / damaged / destroyed debris). | Prop sheet screenshot. |

**Gate:** user review with six-floor sheet.

### M6 — Audio `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M6.1 | Extend the synth engine with new instrument families: strings, brass, choir, piano, distorted guitar, taiko, orchestral hits, risers. | `audioDebug()` lists them; short demo render logged. |
| M6.2 | Re-orchestrate all nine songs preserving melody, harmony, BPM, and form. | Note-data diff shows same pitches/timing per track; listening review by user. |
| M6.3 | Layer all 32 SFX; add reverb sends per floor material; add ambience beds per floor. | SFX list unchanged; screenshot of debug meter. |
| M6.4 | Dynamic mix: ducking under combat, swells on objectives, boss phase-2 layer. | Log of mix state transitions during a bot fight. |

**Gate:** user listening review.

### M7 — Polish, certification, release of the preview `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| M7.1 | Full autopilot campaign clear, Floors 1–6, boss defeated, in the modern build. | Harness log attached. |
| M7.2 | Performance pass against §3.2-4 on all floors. | Numbers table in PROGRESS. |
| M7.3 | Comparison sheet `modern/docs/comparison.md`: every screen and floor, classic vs modern. | File exists, all images present. |
| M7.4 | Preservation audit: walk §1.3 line by line and tick each item with evidence. | Audit appended to PROGRESS. |
| M7.5 | README "Preview build" section with screenshots; CHANGELOG entry; `design.md` gets a "Modern preview" chapter. | Rendered docs reviewed. |

**Gate:** final user review before any merge or release.

---

## 5. Open decisions (need a human answer)

| ID | Decision | Default if unanswered | Why it matters |
|:--|:--|:--|:--|
| 5-A | Fork location: `modern/` subfolder on a `modern-preview` branch (proposed) vs a separate repo vs a long-lived branch replacing nothing. | Subfolder + branch | Subfolder keeps both builds runnable side by side and lets the loop enforce the frozen-classic guard with one diff command. |
| 5-B | Health model: keep Fritos pickups as the *only* healing (classic), or add mid-2000s regen. | Keep Fritos-only, add the red-edge/heartbeat presentation without regen | Regen changes floor pacing and makes Fritos pointless. |
| 5-C | Paint as ammo: keep the single 99-cap pool with no reload (classic), or add a magazine/reservoir with a reload animation that does not change total paint. | Cosmetic "top-up" animation on weapon switch only, no magazines | Magazines change time-to-kill during reload windows. |
| 5-D | Enemy weapon fiction: paint pistols vs office weapons (staplers, tape guns) that fire paint. | Office weapons that fire paint | Affects models, muzzle flashes, and jokes. |
| 5-E | Legacy boot screens in the modern build: always, once per session, or only from a menu "Legacy" option. | Once per session, skippable | Heritage vs friction. |
| 5-F | Crouch / lean: add as stretch (mid-2000s standard) or omit to keep maps balanced. | Omit in this loop; note for later | Crouch changes shot-over-furniture rules. |
| 5-G | Review cadence: pause at every milestone gate (proposed) or run M0–M2 unattended. | Pause at every gate | Front-loads alignment on the look before content passes. |

---

## 6. Goal prompt (paste into chat to start the loop)

> You are assigned the **Sandy's Table Quest: MODERN** goal loop defined in `docs/modern/GOAL_LOOP.md`. Read that document fully before doing anything; §3 is the set of rules you operate under and §4 is the ordered list of goals. Your job is to build a new **preview build** of the game in `modern/` on the `modern-preview` branch that turns the current 1990s-style shooter into a mid-2000s Call of Duty–era shooter, while keeping it the exact same game: same six floors and ASCII maps, same weapons and balance numbers, same enemies and AI rules, same story text, same nine songs re-orchestrated, same original artwork reused. The preservation inventory in §1.3 is a test you must pass, not a suggestion. The classic build in `index.html`, `src/`, `dist/index.html`, and `tools/` is frozen; the only files you may change outside `modern/` and `docs/modern/` are `README.md`, `package.json`, and `CHANGELOG.md`.
>
> Work the loop in §3.3: pick the next goal, implement it, verify it with the build, the level validator, the headless smoke run, and a screenshot, log it in `modern/PROGRESS.md`, and commit with the goal ID in the message. Start with M0 (fork and baseline) and stop for review at every milestone gate with before/after screenshots. If you reach an open decision in §5 that the user has not answered, apply the listed default, mark the goal `BLOCKED(§5-x)` in the log, and continue with the next goal that does not depend on it. Never edit the classic files, never fetch external assets, keep the single-file build under 40 MB, keep the `TQ` harness working, and keep every screen, floor, weapon, enemy, pickup, sound, and control listed in §1.3 present and behaving as the classic does.
