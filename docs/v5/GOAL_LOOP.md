# Table Quest 5.0 — modernization goal loop

Written 26 September 2026. **This is the plan to agree before starting; no 5.0 work has been done.** When it is approved, the loop runs on the `codex/v5-modernization` branch and stops at every milestone gate for your review.

## 1. Starting point

- **Stable reference:** `v4.1-modern` (merge commit `d8dbafa` on `main`), with GitHub release *Table Quest 4.1 — Arena online* and a hash-verified server package. Any milestone can be compared against it or rolled back to it.
- **What 4.1 is:** the modern campaign (six floors, five tools, the Cartel, the boss), the eight-player Office Arena, one Node server for the game, Arena and scoreboard, and every older generation playable from the Versions menu.
- **How it looks now:** procedural canvas textures (walls 512 px, floors 1024 px) with derived normal and roughness maps, one shadowing key light per floor plus fixture spots, bloom and a color grade in the campaign only (Arena has none), block-style staff, and detailed floating weapons.
- **Known feel gaps:**
  - Walking into another Arena player still produces a small correction.
  - Hits are resolved against where players are now, not where the shooter saw them, so fast strafers are harder to hit at high latency.
  - The campaign has never had a frame-pacing or hitch audit.
  - Arena has only had synthetic testing, never real players.

## 2. What 5.0 must be

**The same game, looking and feeling a generation newer, in single player and multiplayer.**

- **Unchanged (tested, not assumed):**
  - every map layout and collision
  - weapon, enemy and pickup balance numbers
  - enemy AI rules
  - story text, songs and screens
  - the five tools and the Cartel roster
  - Arena rules
  - the `docs/modern/GOAL_LOOP.md` §1.3 preservation inventory
  - campaign collision hashes and `validate:levels` counts
- **Drastically better:**
  - textures and materials on floors, walls and ceilings
  - lighting and shadows
  - weapons and first-person presentation
  - paint, impact, destruction and particle effects
  - characters' materials and animation
  - menus and HUD polish
- **Smoother:**
  - less jitter and less felt lag online
  - no hitches or stutters in the campaign
  - steady frame pacing on everyday hardware
- **Both modes share one look:** Arena uses the same renderer, materials, post-processing and effects as the campaign.

## 3. Rules of the loop

1. **Branch and commits:** work on `codex/v5-modernization`. Commit each iteration with its goal ID (for example `V2.3 floor materials`). Push the branch. Never merge to `main` without your approval.
2. **Frozen pieces:** `classic/`, `dist/classic` and the bundled generations stay byte-identical (`npm run check:classic`). Balance values in `src/config.js` and `shared/arena/rules.js`, and the maps in `src/levels.js`, change only if a §6 decision says so.
3. **Every iteration runs the gate:**
   - both builds
   - all Arena, scoreboard, leaderboard and audio suites
   - `validate:levels`, the classic check and the eight-browser smoke test
   - the netcode probes (§4, V0)
   - the fixed camera shots for the affected surfaces
4. **Visual changes need proof:** a before/after pair from the same fixed camera positions, at 1440×900 and 1280×800, is required. A change that looks no better in the pair does not count as done.
5. **Performance budgets:**

   | Preset | Target |
   |:--|:--|
   | High | 60 fps at 1440p on this M3 Max |
   | Low | 60 fps at 1080p on a 2020-era integrated GPU (headless SwiftShader is the proxy) |

   Also: under 400 draw calls, no per-frame allocations in the hot loop, and shaders warmed before play. A regression above 15% on any fixed shot fails the gate.
6. **Size:** the single-file campaign build stays playable from `file://` with no network, and grows by at most 15 MB compressed over 4.1 (now 8.2 MB). No CDNs or runtime downloads. Bundled textures must come with license records.
7. **Log:** each pass adds an entry to `docs/v5/PROGRESS.md` with what was wrong, what changed, the evidence (screenshot pairs and numbers), and what remains.
8. **Stop points:** stop at each milestone gate with before/after screenshots and the measurements, and wait for your verdict. Also stop at any §6 decision you haven't answered. In that case, apply its default, mark the goal `BLOCKED(§6-x)`, and continue with independent goals.

## 4. Milestones

| ID | Milestone |
|:--|:--|
| **V0** | Baseline and measurement |
| **V1** | Stability, jitter and lag |
| **V2** | Renderer and lighting |
| **V3** | Floors, walls and ceilings |
| **V4** | Weapons and first person |
| **V5** | Effects |
| **V6** | Characters |
| **V7** | Menus and HUD |
| **V8** | Certification and 5.0 release |

### V0 — Baseline and measurement

- Move the browser probes from the 4.1 work into the repo as `npm run test:netfeel`:
  - drawn walking-speed variance
  - correction percentiles
  - remote freezes and jumps
  - reconnect time
- Add a campaign pacing probe: frame-time p50/p95/p99 and hitches above 50 ms per floor, plus floor-load time.
- Fix about 20 camera shots across the six floors and Arena, and a perf table for each.
- Capture everything on `v4.1-modern` as the baseline.

**Done when** the baseline numbers and shot sheet are committed, and the probes fail when they regress.

### V1 — Stability, jitter and lag

- Predict player-vs-player separation, which removes the remaining walk-into-player correction.
- Lag-compensated hits: the server resolves each hit against where targets were at the shooter's view time, bounded to 200 ms.
- Show your own projectiles instantly from the predicted muzzle.
- Smoother bot motion.
- Snapshot delta encoding: only changed fields are sent.
- Campaign fixes:
  - shader pre-warm
  - removing GC and texture-upload hitches on floor load
  - fixing any frame-pacing faults the probe finds
- A 30-minute Arena soak with eight clients and bots, plus a campaign run.

**Done when:**
- Through a 150 ms jittered relay, a strafing target is hit within 10% as often as on localhost.
- Zero correction at p99 while walking, including walking into other players.
- No campaign frame above 50 ms after load.
- The soak shows no memory growth and no errors.

### V2 — Renderer and lighting

- Quality presets (Low, Medium, High, Ultra) with automatic detection and a manual override.
- Anti-aliasing (SMAA, or FXAA on Low).
- Ambient occlusion: SSAO on High and Ultra, baked AO on the others.
- Tuned shadow cascades, and per-floor environment reflections from the real room rather than a generic one.
- Physically based fixture lights and light bleeding from windows.
- Arena gets the same post-processing and grade.

**Done when** both modes pass the fixed-shot pair review and the budgets on every preset.

### V3 — Floors, walls and ceilings

- Rebuild every surface family (brick, wood panel, stone, metal, office panel, concrete, marble, carpet, wood floor, stone floor, factory floor, ceilings) at twice the resolution with real height, AO and roughness detail.
- Carpet tile seams, polished marble and wood with reflections, ceiling tiles with recessed troffers, vents and sprinklers.
- Baseboards, crown and trim.
- Decals: scuffs, stains, signage, cable runs.
- Each floor keeps its identity: same palette, mood and recognizable surfaces.

**Done when** every floor, and Arena, passes the fixed-shot pair review and stays within budget.

### V4 — Weapons and first person

- All five tools rebuilt with higher-detail materials (worn metal, varnished wood, rubber, wet paint).
- Equip, idle, sprint, fire and melee animations with weight.
- Better muzzle and paint emission effects, and paint level shown on the tool.
- The same detail in other players' hands and on weapon stations.

**Done when** a studio sheet and in-play crops for each tool pass review, and firing timing and balance are unchanged.

### V5 — Effects

- An instanced particle system for paint spray, splatter, drips, sparks, wood splinters and dust.
- Paint that stays and builds up on surfaces (bounded).
- Destruction debris that settles.
- Hit and death feedback.
- Projectile trails and glow, and light from impacts.
- Weather and exterior scenes through the windows.

**Done when** effects sheets pass review, the effect budget is enforced (particles and decals capped per preset), and there are no per-frame allocations.

### V6 — Characters

- Staff and boss keep their block silhouette and rank colors.
- Better cloth and skin materials, face detail, and smoother animation blending (walk, run, fire, flinch, death).
- Arena paint colors read clearly at distance.

**Done when** a character sheet and in-play shots pass review, and hitboxes and AI are unchanged.

### V7 — Menus and HUD

- One polished style across the main menu, loading cards, pause, campaign HUD, Arena lobby, match menu and results.
- Readable at every size, with complete mouse and keyboard control.

**Done when** a screen-by-screen sheet at three widths passes review.

### V8 — Certification and 5.0 release

- The autopilot clears all six floors and the boss.
- A full Arena round with the netfeel probes.
- All budgets met on every preset.
- A before/after comparison sheet for every floor and screen.
- README, CHANGELOG and version 5.0.0.
- 4.1 is added to the Versions menu as a playable generation.
- Merge to `main`, tag `v5.0-modern` and publish a release, only after your approval.

**Done when** every item passes and you give your verdict.

## 5. Definition of done

- V0–V8 are all done, and each gate was approved by you.
- Preservation and balance checks are unchanged against 4.1.
- The netcode and pacing numbers are at or better than the V1 targets.
- Every preset meets its budget.
- Real people have played a full Arena round on two networks. That is your playtest; the loop can prepare it but cannot perform it.

## 6. Decisions to confirm before starting

| ID | Decision | Default if unanswered |
|:--|:--|:--|
| 6-A | **Where 5.0 lives:** replace the main game, with 4.1 archived in Versions, or ship 5.0 as a separate preview beside 4.1 until it is accepted. | Build on the branch; the release replaces the main game and archives 4.1 in Versions |
| 6-B | **Texture sources:** procedural only (current approach, no licenses to track), or allow bundled CC0 photo-based materials (for example from ambientCG or Poly Haven), which give a much bigger jump in realism but add file size. | Procedural first; CC0 only for surfaces that still fail review, with licenses recorded |
| 6-C | **Character style:** keep the block staff and refine their materials and animation, or move to smoother, more detailed characters. | Keep the block style |
| 6-D | **Hands:** keep floating tools, or bring the parked hands back as part of the weapon pass. | Keep floating tools |
| 6-E | **Target hardware:** is this Mac the High reference, and is there a lower-end machine or phone we must support? | M3 Max for High; a SwiftShader 1080p proxy for Low; no phone target |
| 6-F | **Review cadence:** stop at every milestone gate, or run V0–V1 without stopping, since they are measured rather than judged by taste. | Run V0–V1 without stopping; stop from V2 on |
| 6-G | **Arena maps:** stay Office-only in 5.0, or add another campaign floor as an Arena map. | Office only |

## 7. Goal prompt (to start the loop after approval)

> Run the Table Quest 5.0 modernization loop defined in `docs/v5/GOAL_LOOP.md`, starting from `v4.1-modern` on the branch `codex/v5-modernization`. Keep it the same game: maps, collision, balance, AI, story, songs and Arena rules unchanged, and the preservation inventory passing. Make the visuals and effects drastically better, and make play smoother in single player and multiplayer. Work the milestones V0–V8 in order. Every iteration runs the §3 gate, logs to `docs/v5/PROGRESS.md` with before/after fixed shots and measurements, and commits with its goal ID. Stop at each milestone gate for review, apply §6 defaults where unanswered, and never merge to `main` without approval.

