# Changelog

## 2026-09-03 — Modern preview build (fork)

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
