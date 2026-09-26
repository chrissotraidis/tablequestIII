# Table Quest 5.2 progress

5.2 is built from Chris's 5.1 playtest notes, on branch `codex/v5.2-pass` from `main` at `dee9836` (5.1).

| Note | Cause found | Change |
|:--|:--|:--|
| Artifacting under Sandy's eyes | The blink drew two skin-coloured ellipses at fixed positions, which sat below the painted eyes | Fake lids removed; a painted blink frame is used instead |
| Portrait not fluid | Redrawn every 66 ms (15 fps); expression paintings had different head positions, so crossfades ghosted | Redrawn every frame (up to about 60 fps); blink, glance left/right, grin, hurt and low are pixel-aligned edits of the neutral painting (phase-correlation shift 0,0); slower ease out of reactions, gentle sway |
| Hands look bad | — | `SHOW_HANDS = false` in the campaign and Arena; the tools float, as in 4.1 |
| App getting slower | Ultra at 2x Retina took 8.4 ms a frame, over the 8.3 ms a 120 Hz display allows; AO re-drew the whole scene for normals | See performance below |
| (found) Zeros read as "o" | Georgia has only old-style figures, so `lining-nums` does nothing | Counters, plaques and gauges use Palatino (lining figures) |

## Performance

Measured with the uncapped headless browser at 1440x900 and 2x device scale on the M3 Max, Ultra, Floor 2 open plan (`/tmp/tq-audit/knobs.mjs`, `unc.mjs`).

| | 5.1 | 5.2 |
|:--|--:|--:|
| Frame time (median) | 8.4 ms | 6.3 ms |
| Uncapped fps, three scenes | 115–120 | 149–154 |
| Draw calls per frame | 614–670 | 312–326 |
| Floor 1 load | 453 ms | 355 ms |

Changes:

- GTAO reads the depth texture of the composer buffer the scene was drawn into, and reconstructs normals, instead of re-rendering every mesh.
- AO buffer capped at 0.8x the window; the denoiser uses 8 taps instead of 16.
- SMAA runs only below 1.75x pixel density.
- The world shadow map redraws every other frame above 100 fps (still 60 Hz), and every frame at 60 Hz.
- The camera-space tool shadow is off with the hands.

Side-by-side shots against 5.1 (`docs/v5/shots/final-5.1` and `final-5.2`) show the same contact shading.

Leak check: two laps of all six floors give identical geometry counts per floor, and texture counts level off.

## Verification

- `npm run gate`: PASS, including the 8-browser Arena smoke test and the frozen-classic check.
- Fixed shots: 14 shots, 0 errors, worst p95 16.8 ms at 60 Hz.
- Portrait strip (idle, hit, low) and tool crops checked: 0 skinned hand meshes, no console errors.

## Not verified by automation

Feel on a real 120 Hz display, audio, and a human boss win.
