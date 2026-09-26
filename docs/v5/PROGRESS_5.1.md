# Table Quest 5.1 progress

5.1 is a polish release built from Chris's 5.0 playtest notes. Branch `codex/v5.1-polish` from `main` at `8f90c90` (5.0).

## Notes and what changed

| Note | Change | Evidence |
|:--|:--|:--|
| Sandy's portrait should look more realistic | Five painted expressions generated from the box-art likeness (`src/assets/portrait/`, `SOURCE.md`); `src/portrait.js` crossfades them with live motion | HUD, pause and Arena screenshots in `shots/final-5.1` |
| Artifacts float around the Fritos | Texture alpha thresholded on load, no mipmaps, `alphaTest` 0.5 (`src/models.js getFritosTexture`) | Close-up checks of the Penthouse Fritos. The Penthouse spotlight cone next to it is intended dressing. |
| Hands look bad | Leather work gloves on smoothed hands (`src/handrig.js`) | Hand crops for all five tools |
| Options needs a Back button | `#opt-back` | Browser click test: Back returns to the main menu |
| Menu is glitchy and slow | Backdrop at 30 fps, pixel ratio ≤1, AO/bloom/SMAA off while in menus; hover sound only on change | Measured about 0.2 ms per frame behind the menu. Full quality is restored on play. |
| Intro text hard to read | Larger, brighter, shadowed captions (CSS only) | Intro screenshots |
| Better weapons and lighting | Explicit studio envMap on tool materials (metal 0.95, gloss 0.6, satin 0.35, matte 0.15), warm rim light, per-floor light matching | Hand/tool crop sheet |
| Bottom HUD is dated | Larger type and portrait, damage trail, low pulse, clickable slots, lining numerals; Arena mirrors it | Bench crops; click test switches tools |

## Verification

- `npm run gate`: PASS, including the 8-browser Arena smoke test and the frozen-classic check.
- Collision signatures on all six floors are identical to the 4.1 runtime: bbd9de57, e5dd0df8, 473211ec, 9bcb4916, 6b1ee195, 8af52568.
- Fixed shots (`docs/v5/shots/final-5.1`): 14 shots, 0 errors, worst p95 16.8 ms at 60 Hz, matching 5.0.
- Browser walkthrough: Options (Back), Floor Select (plays Floor 3), Scoreboard, How to Play, Versions, pause and resume. No console or page errors.

## Not verified by automation

How the game feels by hand, audio mix, and a human boss win. The autopilot cannot beat the boss on 4.1, 5.0 or 5.1; this is a limit of the bot.
