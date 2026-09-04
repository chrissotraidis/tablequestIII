# Sandy's Table Quest: MODERN — Round 3 goal loop (portrait, hands and tools v3, generations, promotion)

*Companion to [`GOAL_LOOP.md`](GOAL_LOOP.md) and [`GOAL_LOOP_2.md`](GOAL_LOOP_2.md). Rules from round 1 §3 still apply (no external assets, budgets, verification recipe), with one change decided by the user in this round: the modern build is **promoted to the main version**, so the repository layout changes (G6) — carefully, with backups.*

## 1. The review (2026-09-03)

1. **Sandy's face needs more polish and must look like her.** The reference is the cover art on the menu (`tableboxart2.png`): red beret slouched to her right, shoulder-length wavy auburn hair with a fringe, round face, laugh lines, brown eyes, gritted-teeth determination, hoop earrings, cream shirt under a tan work vest, big flat paintbrush dripping blue.
2. **Hands and weapons need a major second pass.** Not realistic enough; they do not look good.
3. **The bottom bar fades while playing.** Stop it.
4. **Generations.** Options must let people pick between the generations of the game — this version, the version prior, and the earlier one — to showcase how far AI-built games have come.
5. **Promotion.** This version becomes the newest and the main version. Back up to GitHub first; be careful; do not ruin anything.

## 2. The generations (from git)

| Gen | What | Source of truth |
|:-:|:--|:--|
| 1 | *Sandy's Table Quest 3D* 1.0 — the first WebGL remaster | commit `3903b90` (`dist/index.html`) |
| 2 | 2.1 — Fritos, five weapons, destructible furniture, zone floors, workbench UI, presentation revamp | `main` at `e289763` (tagged `v2.1-classic-final`) |
| 3 | MODERN — rounds 1–3 | `modern-preview` |

## 3. Goals

Log under "Round 3" in `modern/PROGRESS.md`; commit with the goal ID; unattended (§5-G).

### G1 — Safety and the quick fix `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G1.1 | Push `modern-preview` and tags `v2.1-classic-final` (main) and `round2-gate` to GitHub before any restructuring. | `git ls-remote` shows them |
| G1.2 | The bench never fades: the idle fade applies to the modern overlays only. | Screenshot after 6 s idle: bench opaque |

### G2 — Sandy's portrait v3 `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G2.1 | A painted-style portrait (192×192 canvas, anti-aliased shapes and gradients, shown at bench size) built from the cover's features: beret, hair, fringe, face shape, laugh lines, eyes, brows, nose, mouth, earrings, shirt and vest. | Side-by-side sheet with the cover crop |
| G2.2 | Every round-2 state re-done on the new face (idle breathe/blink/glance, hit flinch with paint, mid/low/critical, dead, grin, aim squint, sprint huff, firing grit, boss worry, floor tint). | Face sheet |

### G3 — Hands v3 `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G3.1 | Lofted organic hands: palm, fingers, and thumb as smooth tubes along curved centre-lines with elliptical cross-sections and smooth normals (no stitched primitives), nails, knuckle creases as vertex-colour darkening; a fingerless leather work glove lofted over the palm; forearm and rolled sleeve lofted. | Close-up sheet |
| G3.2 | Skin and leather materials: procedural colour and roughness maps (mottling, pores, leather grain), warm subsurface tint; a viewmodel key/fill light in camera space so hands and tools are sculpted regardless of the floor's rig. | Sheet |
| G3.3 | Proportion and framing: hands sized to the tools, forearms receding, ADS poses that show the sights, nothing behind the bench. | All five tools hip/ADS/fire |

### G4 — Tools v3 `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G4.1 | Paintbrush as on the cover: wide flat brush, long wooden handle with a hang hole, chamfered flat ferrule with crimps, layered flat bristles loaded with blue paint, drips. | Sheet |
| G4.2 | Nail gun as a cordless framing nailer: rounded body, angled magazine with nail strip, battery under the grip, rubber grip, nose with contact tip, decals. | Sheet |
| G4.3 | Sprayer as a gravity-feed spray gun: cup on top, gun body, long trigger, air fitting and hose from the grip, fan cap. | Sheet |
| G4.4 | Roller launcher: lathe-turned tube with a stock and foregrip, tank, gauge, loaded roller; table leg: wood with a metal top bracket and hanger bolt. | Sheet |
| G4.5 | Textures: wood, brushed and cast metal, rubber, plastic with decals — colour + roughness maps; parts and firing feedback kept from round 2. | Sheet, mesh counts |

### G5 — Generations `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G5.1 | Capture gen 1 and gen 2 single-file builds from git into `modern/public/generations/v1/index.html` and `v2/index.html` (served in dev, copied into the build). | Files exist, open |
| G5.2 | Options row **Generation**: MODERN (3) / CLASSIC 3D (2) / ORIGINAL 3D (1); choosing one navigates to that build; a menu case-file line and a "GENERATIONS" card explain the showcase. | Screenshot; navigation works in dev and dist |
| G5.3 | README section "Three generations" with one shot each and how to switch. | Rendered |

### G6 — Promotion `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| G6.1 | Restructure on `modern-preview`: classic source (`index.html`, `src/`, `tools/`, `vite.config.js`) moves to `classic/`; modern source moves to the root; scripts, tools, docs, and paths follow; the classic files stay byte-identical under `classic/`. | Both builds green, smoke both, campaign |
| G6.2 | `dist/index.html` is the modern build; `dist/classic/index.html` the gen-2 build; generations inside as above. | Files |
| G6.3 | Merge to `main` (tags first: `v2.1-classic-final` already, `v3.0-modern` on the merge), push. Nothing is deleted from history. | `git log main`, remote |

### G7 — Playtest and gate `TODO`
Smoke, campaign, collision signatures, config/levels identical to `classic/`, sheets, PROGRESS entries, gate summary.

## 4. Decisions carried
§5-G unattended. R-A bench 110 px and opaque. New: **G-A** the generation switch is a page navigation (each generation stays a single file); **G-B** the repo root becomes the modern build, the classic keeps its own folder and scripts (`npm run dev:classic`).

## 5. Goal prompt
> Work `docs/modern/GOAL_LOOP_3.md` G1 → G7 in order with the round-1 loop (implement, verify, log under "Round 3" in `modern/PROGRESS.md`, commit with the goal ID), unattended. Push the backup first. The classic sources stay byte-identical wherever they live. Finish with a playtest and the gate summary.
