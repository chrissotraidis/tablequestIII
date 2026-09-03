# Sandy's Table Quest: MODERN — Polish Round 2 goal loop

*Companion to [`GOAL_LOOP.md`](GOAL_LOOP.md). Round 1 (M0–M7) produced the preview build on `modern-preview`. This round is the user's review feedback on that build, turned into goals. The rules in `GOAL_LOOP.md` §3 (fork in `modern/`, frozen classic, budgets, no external assets, verification recipe) and the preservation inventory in §1.3 still apply unchanged.*

## 1. The review (what the user said, 2026-09-03)

1. **Controls need polish.** The look and movement feel is not there yet.
2. **Weapons need major polish.** The five tools are under-detailed and their firing feedback is generic.
3. **Hands and arms are bad.** They must be modernized and made much better.
4. **Bring back the original wooden workbench main-menu cover.** The v2 menu art (`menu_workbench_bg.png`, box art, paintbrush cursor) was loved; the live-Lobby menu replaced it. Keep the other front-end additions (Options, floor-select elevation, loading card).
5. **Bring back the movie-style story scroll** that played after New Game, and modernize it. The typewriter briefing replaced it; the crawl's motion and staging were the charm.
6. **Bring back the bottom workbench status panel** with Sandy's face in the middle, reacting to the environment (hit, low health, and so on, like older FPS games), modernized. The corner HUD retired it.
7. In short: bring back some of the charm, and give handling, weapons, and arms another major round.

## 2. Principles for this round

- **Charm first, then fidelity.** Where round 1 replaced a classic element, this round restores the element and modernizes it in place, rather than replacing it again.
- **Same game.** No change to any number in `config.js`, to maps, AI, economy, or story text. Handling polish changes how input becomes motion and how motion is presented, not speeds, damage, or ranges. Every goal lists what it must leave identical.
- **Everything procedural.** No external assets; the seven original PNGs are the only images.
- **Verified the same way.** `check:classic`, `validate:levels:modern`, `build:modern`, `smoke:modern`, screenshots, the campaign bot for the gate.

## 3. Goals

Status tags: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED(§5-x)`. Log every goal in `modern/PROGRESS.md` under a "Round 2" heading, commit with the goal ID.

### R1 — Front-end charm returns `TODO`

| ID | Goal | Verify | Preserve |
|:--|:--|:--|:--|
| R1.1 | **Workbench main menu returns.** The classic v2 menu (wood cover `menu_workbench_bg.png`, tilted box art, Impact title, numbered items, animated paintbrush cursor, high-score plate, case file, footer) is the menu again, with the five modern items (New Game, Level Select, Options, Instructions, Sound). Modernized: pointer parallax on the bench, drifting sawdust motes, a slow warm light sweep, film grain and vignette from the post stack's palette, hover and select sounds. The live Lobby stays loaded behind for Level Select's preview and the Options panel, but the cover is the menu. | Screenshot of the menu; smoke walks boot → title → menu → each sub-screen | Menu items and their actions; high score key; the original PNGs unmodified |
| R1.2 | **Cinematic story crawl returns, modernized.** The six-beat scrolling crawl (workbench backdrop drift, floating brush, beat focus, vertical progress rail, "PRESS ENTER TO SKIP") plays after New Game again. Modernized: letterbox bars, film grain, kinetic word reveal per beat, a paint-splat wipe between beats, the satellite floor plan as a small inset that scans the floor named in each beat, the intro score, and a final smash-cut into the Floor 1 loading card. | Screenshot mid-crawl; story text equality vs classic (character count); skip works | Story text verbatim; crawl length ≈ 56 s; skippable |
| R1.3 | **Flow check.** Boot → title → workbench menu → crawl → loading card → Floor 1, and pause → quit → menu, with the correct song at each step. | Smoke updated and green | All ten classic states |

### R2 — Workbench status bar returns `TODO`

| ID | Goal | Verify | Preserve |
|:--|:--|:--|:--|
| R2.1 | **The bench panel is the HUD again.** Bottom bar: brass plaques (Floor, Score), health and paint troughs with values, Sandy's portrait framed in the centre, the pegboard weapon rack with pixel tool icons, the objective counters (tables with icons, staff). Modernized: higher-fidelity CSS wood and brass (grain, bevels, screws), tabular numerals, responsive scaling, trough fills that flash on change, the rack lighting the active slot. The modern top elements stay (compass tape, objective line, kill feed, hit markers, damage direction, objective marker, floor card, barks); the modern bottom-left and bottom-right clusters go. | Screenshot at 1280×800 and 960×600; HUD ids the game writes to still exist | All classic HUD ids and values |
| R2.2 | **Sandy's face reacts.** 64×64 pixel portrait drawn at 3× with states: idle (blink, glance, breathing), **hit** (flinch toward the damage direction, eyes shut, paint splat on the cheek in the paint's colour), **low health** (pale, sweat drops, grimace), **critical** (bruised, bloodshot, hair mussed), **dead** (X eyes), **pickup/table** (grin 0.8 s), **aiming** (squint), **sprinting** (huffing cheeks), **boss rage** (worried brows), **firing** (teeth grit on heavy weapons), and an **environment tint** from the floor's lighting rig (cold blue in the Archives, orange in the Factory, rain-lit in the Penthouse). | `TQ.faceSheet()` renders every state to a contact sheet; screenshot | Face is presentation only |
| R2.3 | **Rack icons and readouts.** Pixel icons for the five tools in the rack, a paint-bucket icon by the paint trough, a pulsing low-paint and low-health state, and the "ALREADY FULL" hint styled on the bench. | Screenshot | Same values |

### R3 — Hands and arms `TODO`

| ID | Goal | Verify | Preserve |
|:--|:--|:--|:--|
| R3.1 | **New arm and hand model.** Capsule-based forearms with an elbow bend and an upper-arm stub anchored off-screen, wrists that flex, three-segment fingers with knuckles and nails, a padded fingerless work glove with strap and stitching, rolled sleeves with folds, the watch; vertex-colour shading (darker creases, warmer knuckles) baked in; roughness varied between skin, glove, and cloth. Left and right are mirrored builds of one rig. | Sheet: each weapon from the play camera (hip, ADS, firing) | Draw calls per viewmodel ≤ 12 |
| R3.2 | **Grips per weapon.** Index finger on every trigger, thumb wrapped, off-hand support poses that make sense (cupping the nailer nose, under the roller tube, holding the paint can, choking up on the leg), consistent scale across weapons, ADS poses that bring the sights to the eye. | Sheet | Muzzle positions still line up with projectile origins |
| R3.3 | **Hand animation.** Trigger pull on fire, brush wrist flick, two-handed leg swing with follow-through, roller off-hand pump after each shot, sprayer hose sway, idle finger fidgets, sprint pose (weapon lowered, off hand relaxed), inspect turn, swap with a re-grip, top-up hand motion on paint pickup. | Harness poses (`TQ.pose(name)`) screenshotted | No timing change to cooldowns |

### R4 — Weapons, major polish `TODO`

| ID | Goal | Verify | Preserve |
|:--|:--|:--|:--|
| R4.1 | **Rebuilt tools.** Paintbrush (lacquered handle with brand lettering, crimped ferrule, individual bristle tufts with a paint drip); table leg (turned profile with baked wood grain, bent nails, tape wrap, scuffs); nail gun (framing-nailer silhouette: magazine with visible nail strip, rubber overmould grip, depth dial, exhaust cap, brand decal, air fitting and coiled hose); roller launcher (tube with clamps, pressure tank with gauge and hose, shoulder strap, the loaded roller nap); sprayer (spray gun with hopper tank, pressure gauge, trigger guard, nozzle, hose to a hip tank). Procedural canvas textures (grain, brushed metal, decals) instead of flat colours. | Weapon sheet | Weapon numbers in `config.js` |
| R4.2 | **Firing feedback per tool.** Distinct recoil signatures; brush flicks paint globs off the bristles; nailer piston snap with a nail ejected and a puff; roller launcher tube kick, tank hiss, camera punch, roller spinning out; sprayer continuous mist cone with hose sway; leg swing streak and impact shake. Muzzle flash sprites per tool. | Screenshots mid-fire | Projectile spawn, damage, spread, cooldown unchanged |
| R4.3 | **Crosshair and readouts.** Per-weapon crosshair: dynamic spread that widens moving/firing and tightens on ADS, dot on ADS, bracket for melee, hidden while sprinting; wall clip avoidance (the tool pulls in when a wall is close). | Screenshots | No aim change |

### R5 — Controls polish `TODO`

| ID | Goal | Verify | Preserve |
|:--|:--|:--|:--|
| R5.1 | **Look.** Raw mouse deltas with a light, frame-rate-independent smoothing (default lower than round 1), no acceleration, ADS sensitivity scale, invert kept; `[` `]` still adjust sensitivity. Options: sensitivity, ADS multiplier, ADS hold/toggle, smoothing amount. | Harness measures rotation per unit of mouse delta at two frame rates | PLAYER constants |
| R5.2 | **Move.** Cleaner acceleration and stop, landing dip, sprint lean, strafe bank tuned, bob amplitude option (off/low/full), sprint hold/toggle option. | Harness path: same distance per second as classic (speed unchanged) | Speeds, jump, gravity |
| R5.3 | **Bindings.** Secondary keys (R re-grip/inspect, C toggle ADS, Alt sprint toggle), controller not in scope; Instructions screen updated. | Instructions screenshot | Every classic binding |

### R6 — Playtest and gate `TODO`

| ID | Goal | Verify |
|:--|:--|:--|
| R6.1 | Full verification: `check:classic`, validator, build, smoke, collision signatures, autopilot campaign clear, config/levels diff identical. | Logs |
| R6.2 | Sheets: menu, crawl, bench HUD at two sizes, face states, hands/weapons (hip, ADS, fire) for all five tools. | Files in `modern/docs/R*` |
| R6.3 | PROGRESS round-2 entries, gate summary, rebuilt `dist/modern/index.html`, README/CHANGELOG lines. | Committed |

**Gate:** user review (hardware feel of controls, weapons, arms; look of the menu, crawl, bench).

## 4. Decisions carried

§5-G of round 1 (run unattended, log gate summaries) still applies. New defaults, override by saying so:

- **R-A** The bench bar is opaque wood ~110 px tall at 1280×800 and scales with the viewport; it does not fade with the idle HUD.
- **R-B** The crawl is the New Game path; Level Select still goes straight to the loading card.
- **R-C** ADS defaults to hold; sprint defaults to hold.

## 5. Goal prompt

> You are assigned **Polish Round 2** of Sandy's Table Quest: MODERN, defined in `docs/modern/GOAL_LOOP_2.md`; the rules and preservation inventory of `docs/modern/GOAL_LOOP.md` still apply. Work the goals in order R1 → R6 with the same loop as round 1: pick the next goal, implement it in `modern/`, verify (`npm run check:classic`, `validate:levels:modern`, `build:modern`, `smoke:modern`, screenshots), log it under a "Round 2" heading in `modern/PROGRESS.md`, commit with the goal ID. Run unattended (§5-G): log gate summaries, do not pause. The classic files stay frozen; the only files you may change outside `modern/` and `docs/modern/` are `README.md`, `package.json`, and `CHANGELOG.md`; no external assets; the build stays under 40 MB; `config.js` and `levels.js` stay identical to classic.
>
> The round is done when every R goal is `DONE`, the autopilot campaign clears all six floors in the new build, the sheets in R6.2 exist, and the preview is rebuilt and committed. Then playtest: report what was verified, what the screenshots show, and what still needs the user's hands on hardware.
