<h1 align="center">Sandy's Table Quest</h1>

<p align="center">
  <img src="src/assets/tableboxart2.png" alt="Sandy's Table Quest box art — Sandy with her paintbrush, the Cartel behind her" width="460" />
</p>

<p align="center">
  <strong>A furniture-blasting first-person shooter about reclaiming six floors of stolen masterpieces from the armed Interior Design Cartel.</strong>
</p>

<p align="center">
  <a href="#play"><strong>Play</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="#four-generations-one-file"><strong>Four generations</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="#the-game"><strong>The game</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="#build-from-source"><strong>Build</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="#documentation"><strong>Documentation</strong></a>
</p>

<p align="center">
  <img alt="three.js" src="https://img.shields.io/badge/engine-three.js-111111?style=flat-square&logo=threedotjs&logoColor=white" />
  <img alt="Single HTML build" src="https://img.shields.io/badge/build-single_HTML-c9a227?style=flat-square" />
  <img alt="Version 4.0" src="https://img.shields.io/badge/version-4.0_MODERN-2f6fd8?style=flat-square" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2f855a?style=flat-square" />
</p>

> **They took the tables. She's taking them back.**

![The workbench main menu of Sandy's Table Quest](docs/readme/modern-menu.jpg)

**Sandy's Table Quest** started life as a 320×200 browser raycaster from Artisan Software. This repository holds every
generation the game has been through since, and ships all of them in **one self-contained HTML file**: the current
**MODERN** build (generation 3), the classic 3D remaster (2.1), the very first WebGL build (2.0), and the story of the
199X original (1). Pick **Versions** on the main menu and click between them.

The premise never changed. Sandy is an artisan furniture maker. The Cartel raided her workshop, seized her tables, and
left her alive. Tonight she walks into their headquarters with a paint-loaded brush and a professional objection to
particle board.

| At a glance | |
|:--|:--|
| **Mission** | Recover every table on a floor to unlock the elevator, then climb |
| **Campaign** | Six hand-built floors of Cartel HQ, ending in a two-phase boss fight with the Head Designer |
| **Arsenal** | Paintbrush, table leg, nail gun, roller launcher, paint sprayer |
| **Enemies** | Guards, Managers, Executives, and the Head Designer, with pack AI that flanks, leads shots and breaches doors |
| **Presentation** | Lit and shadowed rooms, post-processing, a carved-workbench HUD with Sandy's reacting portrait, nine procedural songs |
| **Delivery** | `dist/index.html`: one file, no installer, no server, no network |

## Play

1. [Download the repository as a ZIP](https://github.com/chrissotraidis/tablequestIII/archive/refs/heads/main.zip) and extract it.
2. Open **`dist/index.html`** in Chrome, Firefox, Safari or Edge.
3. Press a key through the memory screen and title card, pick **New Game**, and reclaim the tables.

Click the game once to capture the mouse. `Esc` pauses. Everything else is on the **How to Play** screen and in
[Controls](#controls) below.

## Four generations, one file

![The Versions screen listing every generation of the game](docs/readme/modern-versions.jpg)

The game has been rebuilt three times, each generation on top of the last, and they ship together so you can see how
far AI-built games have come. **Versions** on the main menu (or **Options → Generation**) lists them; the bundled ones
open inside the page in a player with a **BACK TO MODERN** bar, so you can hop between versions without leaving.

| Generation | What it is | Where it lives |
|:-:|:--|:--|
| **3 · MODERN** | This build. A mid-2000s shooter presentation of the same game: lit and shadowed rooms with trim, windows and set dressing; materials with normal and roughness maps; floating hard-surface weapons with aim-down-sights, recoil and swap animation; animated staff with callouts; a re-orchestrated score with ambience beds; post-processing; the workbench menu, the story crawl and the bench HUD restored from the classic. | Repository root → `dist/index.html` |
| **2.1 · 3D Remaster** | The classic. Fritos, five weapons, destructible furniture, zone-designed floors, the workbench presentation. Frozen byte-for-byte and guarded by `npm run check:classic`. | `classic/` (source), bundled as `generations/v2/index.html` |
| **2.0 · First 3D Remaster** | The first WebGL build and the first commit of this repository. Three weapons. | bundled as `generations/v1/index.html` |
| **1 · Original 199X** | The CPU raycaster: 320×200, four levels, a paintbrush and a table leg, billboard staff, four synth songs. Its boot screens, title card, box art and story are the images every later generation still ships unchanged. | its own repository; the Versions screen shows a card |

![Generation 2.1 booting inside the in-page player with its BACK TO MODERN bar](docs/readme/modern-player-gen21.jpg)

**What "the same game" means.** Across every generation since 2.1 the six ASCII maps, the weapon numbers (damage,
cooldown, paint cost), the enemy stats and behaviours, the pickups and scoring, the story text and the nine songs are
identical. The modern build's `config.js` and `levels.js` diff-match the classic's, and a per-floor collision hash of
walls, props and spawn is checked at every gate.

## The game

### Six floors of Cartel HQ

<table>
  <tr>
    <td width="50%"><img src="docs/readme/modern-lobby-brush.jpg" alt="The Lobby with the paintbrush" /></td>
    <td width="50%"><img src="docs/readme/modern-office-nailer.jpg" alt="The Office cubicle farm with the nail gun" /></td>
  </tr>
  <tr>
    <td align="center"><strong>1 · The Lobby</strong><br />Ground floor. Smile for the receptionist.</td>
    <td align="center"><strong>2 · The Office</strong><br />Cubicle farm. The guards are unionized.</td>
  </tr>
  <tr>
    <td><img src="docs/readme/modern-archives-leg.jpg" alt="The Archives stone vaults with the table leg" /></td>
    <td><img src="docs/readme/modern-showroom-launcher.jpg" alt="The Showroom with the roller launcher" /></td>
  </tr>
  <tr>
    <td align="center"><strong>3 · The Archives</strong><br />Where they bury the warranty claims.</td>
    <td align="center"><strong>4 · The Showroom</strong><br />Fast furniture as far as the eye can see.</td>
  </tr>
  <tr>
    <td><img src="docs/readme/modern-factory-sprayer.jpg" alt="The Factory assembly line with the paint sprayer" /></td>
    <td><img src="docs/readme/modern-penthouse.jpg" alt="The Penthouse, rain on the glass, the Head Designer somewhere ahead" /></td>
  </tr>
  <tr>
    <td align="center"><strong>5 · The Factory</strong><br />Where masterpieces become particle board.</td>
    <td align="center"><strong>6 · The Penthouse</strong><br />The Head Designer will see you now.</td>
  </tr>
</table>

| Floor | Tables | Staff | Music |
|:-:|:-:|:-:|:--|
| 1 · The Lobby | 2 | 6 | Beige Carpet Lounge |
| 2 · The Office | 3 | 9 | Cubicle Crusade |
| 3 · The Archives | 3 | 8 | Dust & Echoes |
| 4 · The Showroom | 4 | 11 | Particle Board Funk |
| 5 · The Factory | 4 | 15 | Assembly Line Fury |
| 6 · The Penthouse | boss | 1 | The Final Critique |

Plus *Workshop Dreams* on the menu and *The Artisan's Lament* under the story crawl: nine songs, all synthesized in
real time.

### Sandy's arsenal

<table>
  <tr>
    <td width="33%"><img src="docs/readme/modern-brush-studio.jpg" alt="The paintbrush, studio view" /></td>
    <td width="33%"><img src="docs/readme/modern-sprayer-studio.jpg" alt="The paint sprayer, studio view" /></td>
    <td width="33%"><img src="docs/readme/modern-launcher-studio.jpg" alt="The roller launcher, studio view" /></td>
  </tr>
</table>

| Slot | Weapon | Role | Found |
|:-:|:--|:--|:--|
| `1` | **Paintbrush** | Auto-fire, lit paint projectiles, unlimited courage, limited paint | start |
| `2` | **Table Leg** | Melee. No ammunition, no respect for personal space, wrecks furniture | Floor 2 |
| `3` | **Nail Gun** | Fast, tight spread, silver nails for stapling blazers shut | Floor 2 supply / Floor 3 |
| `4` | **Roller Launcher** | Slow lob with splash damage for giving whole rooms a coat | Floor 4 |
| `5` | **Paint Sprayer** | Full-auto, wide spread, for the late-game crowd | Floor 5 |

Weapons persist between floors. Select with `1`–`5`, cycle with `Q` or the wheel, aim down sights with the right
mouse button, quick-melee with `V`. Floor Select grants the arsenal a run would have found by then.

**Field supplies.** Tables are the objective (+500). Blue paint buckets restore 14 paint, Fritos restore 25 health
(sprite-for-sprite from the original), cash and gold bars are score, and about one destroyed cabinet in eight hides
money.

### The Cartel

| Enemy | Threat | Behaviour |
|:--|:--:|:--|
| **Guard** | Low | Blue suits, numerous, volume over aim |
| **Manager** | Medium | Gray suits and glasses, better movement, some shot leading |
| **Executive** | High | Black suits, fast, strong shot leading |
| **Head Designer** | Boss | Oxblood suit and cape. Phase two under half health: faster, paired volleys, supply drops in a cover-filled arena |

Staff alert nearby allies when they spot Sandy, orbit and strafe at range, open doors while chasing, and stagger their
shots so the result is pressure and crossfire rather than a firing squad.

### The bench

![The bench HUD at low health, Sandy's portrait bruised](docs/readme/modern-bench-hurt.jpg)

The carved-workbench status bar from the classic is the HUD: brass plaques for floor and score, the table tally,
health and paint, the pegboard arsenal, and **Sandy's portrait in the middle**, painted from the cover art. She glances
around, blinks, winces toward the side she was hit from, grins at pickups, squints while aiming, bruises as health
falls, and flinches when the Head Designer rages. Sixteen expressions in all.

### The story

![The story crawl at its payoff beat](docs/readme/modern-crawl.jpg)

In the year 199X, the Interior Design Cartel declared war on durability. They replaced craftsmanship with fast
furniture: flimsy, soulless, impossible to repair. St. Louis fell first. Then the world. But one artisan refused to
fold. When they raided her workshop, they made one fatal mistake. **They left her alive.**

The full crawl plays after New Game, verbatim from the original, over a satellite plan of the floor ahead.

## Controls

| Input | Action |
|:--|:--|
| `W` `A` `S` `D` | Move and strafe |
| Mouse | Look (click the game to capture the pointer) |
| `←` `→` | Turn without mouse capture |
| Left click / `Ctrl` | Fire; hold for automatic weapons |
| Right click / `C` | Aim down sights (hold or toggle, see Options) |
| `Space` | Jump |
| `Shift` / `Alt` | Sprint hold / sprint toggle |
| `E` | Open an adjacent door |
| `1`–`5`, `Q`, wheel | Select or cycle weapons |
| `V` | Quick melee with the table leg |
| `F` | Inspect the weapon |
| `Tab` | Tactical map |
| `[` `]` | Mouse sensitivity |
| `U` | Mute |
| `Esc` | Pause (losing focus also pauses) |

Options: generation, post-processing, field of view, mouse sensitivity, look smoothing, aim sensitivity, aim and
sprint hold/toggle, invert look, head bob, sound. Settings persist in the browser.

## Build from source

Node.js 20.19+ or 22.12+.

```bash
git clone https://github.com/chrissotraidis/tablequestIII.git
cd tablequestIII
npm ci
```

| Command | What it does |
|:--|:--|
| `npm run dev` | Modern build, dev server with hot reload on `http://localhost:5174` |
| `npm run build` | Modern single-file build → `dist/index.html` (the shipped game) |
| `npm run preview` | Serve the built file on `http://localhost:4174` |
| `npm run dev:classic` / `build:classic` | The frozen 2.1 generation from `classic/` → `dist/classic/index.html` |
| `npm run build:all` | Both |
| `npm run check:classic` | Verify the classic generation is byte-identical to its tag |
| `npm run validate:levels` | Map enclosure and reachability for all six floors |
| `npm run smoke` | Headless boot → menu → crawl → every floor, with screenshots; fails on console errors |

The build inlines the game code, the seven original artwork files and both bundled generations into one HTML
document (about 15 MB). Everything else the game shows, from wall textures to enemies to the soundtrack, is generated
by code at runtime.

## Documentation

The modern build was produced by fifteen goal-based loops, each with a written goal, a verdict-first log and
screenshot evidence. **Start at [`docs/modern/INDEX.md`](docs/modern/INDEX.md).**

| Document | |
|:--|:--|
| [`docs/modern/GOAL_LOOP.md`](docs/modern/GOAL_LOOP.md) | The contract: baseline review of the classic, the "forget nothing" preservation inventory, the mid-2000s target, the rules |
| [`docs/modern/PROGRESS.md`](docs/modern/PROGRESS.md) | The log of every pass, rounds 1–15, with what was wrong, what was done, and where the evidence is |
| [`docs/modern/GOAL_LOOP_2.md`](docs/modern/GOAL_LOOP_2.md) … [`GOAL_LOOP_11.md`](docs/modern/GOAL_LOOP_11.md) | The goal documents for each round |
| [`docs/modern/HANDS_REINTRODUCTION.md`](docs/modern/HANDS_REINTRODUCTION.md) | First-person hands and arms are parked behind a switch; this is where they are and how to bring them back |
| [`docs/modern/design.md`](docs/modern/design.md) | Design chapter for the modern presentation |
| [`docs/evidence/comparison.md`](docs/evidence/comparison.md) | Classic vs modern, every screen and floor side by side |
| [`classic/design.md`](classic/design.md), [`classic/design-qa.md`](classic/design-qa.md) | The classic generation's own design notes and menu QA |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |

## The classic generation

<p align="center">
  <img src="src/assets/title_screen.png" alt="Original Sandy's Table Quest title artwork" width="820" />
</p>

Generation 2.1 is still here, untouched, and still documented. Its source is under `classic/`, it builds with
`npm run build:classic`, and it is bundled into the main game as **Versions → 2.1**. These are its own captures:

<table>
  <tr>
    <td width="50%"><img src="docs/readme/showroom-combat.webp" alt="Classic 2.1: Sandy confronts the Cartel inside the Showroom" /></td>
    <td width="50%"><img src="docs/readme/factory.webp" alt="Classic 2.1: the Factory assembly line" /></td>
  </tr>
  <tr>
    <td><img src="docs/readme/archives.webp" alt="Classic 2.1: a recovered table inside the Archives" /></td>
    <td><img src="docs/readme/head-designer.webp" alt="Classic 2.1: the Head Designer awaits in the Penthouse" /></td>
  </tr>
</table>

| | Original 1 (199X) | Classic 2.1 | MODERN 3 |
|:--|:--|:--|:--|
| **Renderer** | 320×200 CPU raycaster | three.js, real geometry, fog, dynamic lights, ACES | Shadow maps, normal and roughness maps, trim and windows, post-processing (bloom, grain, vignette, per-floor grade) |
| **Campaign** | Four levels | Six floors, destructible props | The same six floors, set-dressed per zone |
| **Weapons** | Brush and leg | Five, with Sandy's arms | The same five as detailed floating hard-surface tools, aim-down-sights, recoil, swap |
| **Enemies** | Billboards | Twelve-box figures, pack AI | Proportional bodies, layered animation, callouts, the same AI |
| **HUD** | Status bar | The carved workbench | The workbench again, Sandy's portrait painted from the cover art, compass and objective marker above |
| **Front-end** | Title card | Workbench menu, story crawl | Workbench menu over a live 3D backdrop, cinematic crawl, operations board, loading cards, Versions |
| **Audio** | Four synth songs | Nine songs, ~32 SFX | The same nine songs re-orchestrated, ambience beds, dynamic mix |

## Under the hood

- **three.js** renderer with merged world geometry, per-floor lighting and grading, a separate 56° camera for the weapon layer, and an EffectComposer post stack
- **ASCII-authored levels** compiled at runtime into walls, doors, gates, props, zones and pickups (identical across generations 2.1 and 3)
- **Code-generated everything**: textures, props, enemies, weapons, the soundtrack (a Web Audio synth engine with a look-ahead sequencer) and the SFX. The original 199X artwork is the only hand-made runtime asset
- **Single-file Vite build**, plus a headless playtest harness (`TQ` in the console) and the tools under `tools/` that every gate runs: smoke, collision hashes, campaign autopilot, screenshot sheets

<details>
<summary><strong>Repository layout</strong></summary>

```text
tablequestIII/
|-- index.html, src/            MODERN (generation 3) — UI shell and engine
|-- dist/index.html             the shipped single-file game (all generations inside)
|-- public/generations/         v1 (2.0) and v2 (2.1) single-file builds, bundled beside the main build
|-- classic/                    generation 2.1 source, frozen byte-for-byte (npm run dev:classic)
|-- tools/                      smoke, collision hashes, campaign bot, screenshot sheets, validators
|-- docs/modern/                goal loops, progress log, design, hands reintroduction, INDEX.md
|-- docs/evidence/              the screenshots every verdict was written from
|-- docs/smoke/modern/          latest smoke run on the built file
`-- docs/readme/                README captures
```

</details>

## Credits

- **Original game, concept, story and artwork:** *Sandy's Table Quest* by Artisan Software, 199X
- **Engine:** [three.js](https://threejs.org/)
- **Music and sound:** generated in real time with the Web Audio API
- **Hand models (parked):** WebXR input-profiles `generic-hand`, MIT, see `src/assets/hands/LICENSE.md`
- **Inspiration:** *Wolfenstein 3D*, *DOOM*, *Call of Duty 2* and *4*, and the golden age of shooters

## License

Released under the [MIT License](LICENSE).

<p align="center">
  <strong>Fight the Cartel. Recover the tables. Defeat the Head Designer.</strong>
</p>
