# Changelog

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
