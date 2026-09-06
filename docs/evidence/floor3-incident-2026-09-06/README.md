# Floor 3 incident investigation — 2026-09-06

The user reported an audio cutout during actual Floor 3 play and floating paint impacts.
The original audio cutout remains **unconfirmed**, not closed by the automated tests below.

## Original run evidence

Preserved 121 server-side events privately in `/tmp/tablequest-floor3-incident/session.jsonl`.
No runtime errors, audio context changes away from running, or scheduler underruns were logged in this run.
Two read-only live inspections found the Archives song playing, an advancing sequencer, mute off,
and nonzero master output (−10.4 dB and −14.1 dB peaks). Floor 3 performance samples near the report
were approximately 120 FPS with p99 of 9.2–9.3 ms. This does not establish sound reaching speakers,
or rule out a transient failure before inspection. The old logs lack separate music/effects levels
and device-output evidence, so the specific cause cannot be assigned from them.

## Changes

- Wall paint is placed at the wall entry plane, fixing the previous-frame position gap.
- Enemy paint is clipped to actual mesh triangles and parented to the struck mesh; it follows limb transforms.
- Floor number/name is explicit in the persistent objective header and pause menu.
- Audio resumes after post-start browser interruption, logs resume failures, and keeps scheduling after a voice exception.
- Separate music/effects/output meters and scheduler/context timing appear in telemetry; sustained music silence is flagged.
- Pause → Recover Audio captures health, recreates sound, preserves mute and the current floor.
- Offline audio rendering restores the live graph even when scheduling throws.
- Anonymous browser IDs, build IDs, event sequences, active play time, daily reports, incident timelines,
  automated-run exclusion, bounded payloads/retries, and an SSH pull command support VPS investigation.

## Validation

- `npm run test:incidents`: 10 checks passed, including paint bounds/moving rig, three projectile speeds,
  forced audio suspension, one injected synth failure, in-place audio recovery, and pause keyboard wrapping.
- Extended run: 180 real-time samples across 4.5 Archives music loops, including combat and repeated pause/resume.
  Every sample retained nonzero music, a running context, and zero scheduler errors/underruns before the deliberate fault.
- Existing `test:sanity`: all 18 input/state/assets/resource-lifetime checks passed.
- Six-floor browser smoke: no failures or runtime errors; sampled averages 16.7 ms on all floors.
- `test:scoreboard`: telemetry fields survive backend validation and persistence; ranking/concurrency checks pass.
- `test:telemetry`: date/timezone grouping, session/browser distinction, deduplication, bot exclusion,
  single-session timeline, partial JSONL handling, successful copy and failed-copy preservation all pass.
- Live client → local server: HTTP 202, browser ID, build, automation marker, sequence, active time,
  Floor 3 audio recovery snapshot; visitor ID survives reload.
- Build, frozen classic check and diff whitespace check passed. Inspected paint and pause screenshots.

The 180-second run exercised the final audio/game logic; subsequent source changes were formatting and HUD styling.
Final packaged HTML SHA-256: `376a3487836222f961d2ea21f1e2b37b28ba4fdd46cefe85051f204dcc4e309f`.

Only local changes were made. VPS deployment and speaker-level acceptance remain untested.
Frozen legacy generations do not emit this MODERN gameplay telemetry.
