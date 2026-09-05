# Changelog

## 2026-09-04 — 4.0: MODERN is the game

Fifteen goal-based rounds later, the modern build is the main version, `main` carries it, and every generation ships inside it.

### Added

- **Versions.** A sixth main-menu entry lists every generation of the game (3 · Modern, 2.1 · 3D Remaster, 2.0 · First 3D Remaster, 1 · Original 199X). Bundled generations open **inside the page** in a player with a BACK TO MODERN bar, an open-in-new-tab link and a loading label, so you can click between versions without leaving. The Options row does the same.
- **Richer floating weapons.** A loaded sash brush (varnished handle with grain, crimped brass ferrule, striated bristles, a glossy paint load with sag and drips), dimpled overmould and labels on the nailer, paint runs down the spray gun's cup, paint from the launcher's bell, a torn plate with splinters and fraying tape on the leg.
- **Harness and tools.** `TQ.settle(n)` (wait rendered frames), `TQ.handLab`, `TQ.THREE`; `tools/vm_crops.mjs`, `tools/state_shots.mjs`, `tools/readme_shots.mjs`; shot tools wait on rendered frames and hide enemies.
- Documentation: `docs/modern/INDEX.md` (start here), `docs/modern/HANDS_REINTRODUCTION.md`, goal loops 9–11, the full pass log in `docs/modern/PROGRESS.md`.

### Changed

- **Hands and arms are parked.** After twelve rounds they were structurally right but still read as bizarre; the weapons now float Doom-style with their grips behind the bench (`SHOW_HANDS = false` in `src/handrig.js`). Everything needed to bring them back is kept and documented.
- Viewmodel lens widened to 56°, rest pose pushed back; every tool rebuilt as a hard-surface object (rounded boxes, seams, screws, decals, scuffed grain) with a measured grip frame.
- Loading card heading layout; the Gen 1 card is reachable again (it had never been registered as a screen).

### Verified

- The autopilot wins the whole campaign on the built file (six floors, `docs/evidence/R1/campaign.json`); every screen in the flow screenshotted; smoke green; collision hashes identical to the classic on all six floors; the classic generation byte-identical to `v2.1-classic-final`.

## 2026-09-03 — 3.0: MODERN becomes the main version

### Changed

- The modern build is now the main game: sources at the repository root, built to `dist/index.html`. The classic 2.1 generation moved byte-for-byte to `classic/` (`npm run dev:classic`, `dist/classic/index.html`), and generation 1 (the first 3D remaster, from the first commit) and generation 2 ship beside the main build under `generations/`, selectable under Options → Generation.
- Sandy's portrait redrawn as a painted portrait from the cover art; hands rebuilt as lofted organic meshes with skin and leather maps; the five tools rebuilt on real-world references; the bench no longer fades.

## 2026-09-03 — Modern preview build (fork, rounds 1–2)

### Changed (polish round 2)

- The classic workbench menu cover and the cinematic story crawl return to the modern preview, modernized (parallax, dust, grain, letterbox, kinetic beats, satellite inset).
- The workbench status bar returns as the HUD, with Sandy's portrait reacting to hits, health, pickups, aiming, sprinting, firing, and the boss's rage.
- New arms and hands, rebuilt tools with procedural textures, per-tool firing feedback, a dynamic crosshair, and a controls pass (look smoothing, aim sensitivity, hold/toggle aim and sprint, head-bob amount, new keys).

### Added

- `modern/`: a preview build that re-presents the same game in a mid-2000s shooter style. Same six floors, weapons, enemies, pickups, story, nine pieces of music, and original artwork; new lighting and shadows, materials with normal and roughness maps, trim, windows, and exteriors, a modern HUD and front-end, two-handed weapons with aim-down-sights and recoil, particles and decals, layered character animation with staff callouts, per-floor set dressing, a re-orchestrated score with ambience beds and a dynamic mix, and post-processing. Builds to `dist/modern/index.html` (`npm run build:modern`).
- `docs/modern/GOAL_LOOP.md` (the plan), `modern/PROGRESS.md` (the log), `modern/docs/comparison.md` (classic vs modern, every screen and floor), `docs/modern/design.md` (design chapter).
- Scripts: `dev:modern`, `build:modern`, `preview:modern`, `build:all`, `validate:levels:modern`, `check:classic`, `smoke:modern`, `smoke:classic`; `playwright-core` as a dev dependency for the headless harness.

### Unchanged

- The classic build (`index.html`, `src/`, `dist/index.html`, `tools/`) is frozen and byte-identical; `npm run check:classic` guards it.

## 2026-07-10 — Presentation overhaul

### Added

- A cinematic workbench main menu with responsive layouts, keyboard/pointer parity, dynamic action descriptions, and live sound status.
- Dedicated workbench and paintbrush assets for the menu presentation.
- A more cinematic version of the existing post–New Game story crawl, with six focused story beats, center-screen emphasis, atmospheric motion, and progress feedback.
- `design.md` covering the visual language, interaction principles, responsive behavior, and future screen directions.
- `design-qa.md` plus reference/comparison captures documenting the menu fidelity checks.
- An archived copy of the previous menu under `design/archive/` for quick restoration.

### Changed

- Replaced the incorrectly named startup artwork with corrected `memory_screen.png` and `title_screen.png` assets.
- Kept the startup order as memory screen → title screen → main menu.
- Removed redundant flashing boot prompts because the memory artwork already instructs the player to press a key.
- Preserved the full intro story and continuous upward crawl while improving typography, staging, pacing, and the final “They took the tables. She’s taking them back.” payoff.

### Validation

- Production single-file Vite build passes.
- Main-menu keyboard navigation, pointer actions, sound toggle, Instructions, and Floor Select paths were verified.
- Menu layouts were checked at wide desktop, compact desktop, and narrow viewport sizes.
