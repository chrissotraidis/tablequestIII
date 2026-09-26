# Arena refinement — September 12, 2026

Status: refinement implementation and local verification complete; ready for human playtesting. This is a continuation of the existing Arena, with the campaign and frozen classic preserved.

## Audit and acceptance criteria

1. **Entry and lobby — poor baseline.** Supplied screenshots 1–2 show duplicate join/start actions, an oversized form after joining, and a distant return button. Source also made the embedded 3D canvas invisible. Replace with a single join action, a compact joined roster, separate bot selection and ready state, a top-level Main menu link, and a moving Office backdrop. Both standalone and embedded routes must share the same implementation.
2. **Round start — insufficient baseline.** A combined button filled bots and readied the host. Three seconds of countdown gave no introduction. Adding bots must remain in the lobby; rules and controls must be visible before readying; an eight-second briefing must be cancellable without leaving the room.
3. **World collision and rendering — implementation mismatch.** Arena blocked complete furniture cells; the campaign uses each prop's radius. Arena also hid all doors and disabled shadows. Use the actual 156 authored prop footprints, heights, and durability values; preserve the campaign world builder and separate weapon render pass; restore synchronized, animated doors and bounded shadows. Check rendered props against the server manifest, not only a frozen list of cells.
4. **Weapons and feedback — poor baseline.** The original campaign has an illustrated workbench HUD and portrait. Arena replaced it with abbreviated text and overlapping controls, and the standalone HUD had no matching layout. Reuse the campaign icons, portrait and bench; name the equipped weapon and paint cost, distinguish owned tools, support mouse-wheel selection, show pickups, and use the campaign's muzzle flash, paint impact and debris effects.
5. **Pause, death and return — incomplete baseline.** Supplied screenshot 3 prioritizes a large scoreboard and explanatory paragraph. Put Resume first, show remaining time, health, paint, loadout and controls, and retain standings beneath. Death must identify the attacker, explain the respawn, lower the camera and restore the starting tools with brief actual protection. Choose a safer respawn location.
6. **Bots — weak baseline.** Random roaming and 1.58–2.42-second attack intervals were inappropriate for deathmatch. Bots must navigate around furniture, use doors, seek supplies, acquire targets with reaction time, strafe, choose tools, and generate sustained combat. Measure exploration and combat over a longer simulation.
7. **Lifecycle and regression gates.** Test cancellation, all weapons, doors, results/rematch, reconnect, return to main menu, narrow layout, renderer errors, frame pacing, and classic integrity. Keep untested physical input feel and Internet behavior distinct from local automation.

## Changes implemented

- `arena/interface.html` and `arena/interface.css` now own both entry points. Removed the duplicated embedded template. Campaign HUD assets and authored world geometry remain the visual reference.
- Bot selection and readying are independent. The start protocol no longer implicitly fills bots. Eight-second briefing includes cancellation. Joined lobby hides the now-locked identity form; results have a distinct layout.
- Generated prop metadata from the actual campaign placement routines. Movement uses circular footprints, sightlines account for low furniture, and projectiles intersect prop radius/height rather than invisible cell-sized slabs. Damaged and destroyed prop states synchronize across clients.
- Four sliding doors now carry authoritative open state and progress. Nearby players can use E; bots open doors on routes. Closing never traps a player already in the doorway.
- Campaign shadow key restored, with a 2048 map and adjusted normal bias. Pause offers a working shadow toggle. Weapon and world cameras remain on separate layers.
- Fixed the pickup race that let the next client input override an automatically equipped new weapon.
- Restored illustrated weapon rack and workbench gauges; active full weapon name, paint cost, ownership labels, pickup notices, click/wheel/number selection, live match information and illustrated portrait.
- Connected campaign muzzle flashes, paint splats, impact particles, explosions and wood splinters to authoritative combat events. Added death context, camera lowering, respawn notice, safe spawn selection and 1.5 seconds of actual protection.
- Replaced aimless bot patrol with bounded BFS routes and supply selection. Increased movement and attack cadence, retained reaction delays and aim error, and added observed-velocity lead and stronger strafing.

## Evidence so far

- User screenshots copied to `docs/evidence/arena-refinement/user-*.png`.
- Captured the standalone baseline, then compared the restored HUD with the actual campaign workbench in the browser.
- Verified the new lobby, eight-person roster without desktop scrolling, weapon switching, eight-second briefing, and a successful countdown cancellation through real UI controls.
- Browser diagnostics: actual World produced 156 props, matching all server manifest radii and heights; no mismatches; four rendered doors reported authoritative progress.
- Geometry regression: pot corners are traversable, pot centers remain solid, low furniture does not block eye-level sightlines, tall cover does, and closed/open doors change collision.
- Navigation regression: all 12 authored spawns have numeric, bounded routes to every pickup.
- Eight-socket server regression and one-human/seven-bot result/rematch regression pass.
- Classic frozen check and all six campaign level validations pass.
- First longer simulation failed: only 2 eliminations in 60 seconds exposed a waypoint string-concatenation bug. Fixed numeric conversion and added bounded waypoint assertions.
- Corrected 60-second simulation: **15 eliminations, 14 respawns, 29 pickups, 374 shots, 124 cover hits, 14 explosions, 2 door events**. Every bot explored **48–100 cells** and traveled **90–112 map units**. Server tick p95 was **0.51 ms**, with **0 protocol errors**. See `simulation.json`.
- A dedicated `?test&arenaTour` rehearsal completed the Office route, collected all five tools, and crossed restored doors. It uses normal movement and interaction messages, with no teleportation, inventory grants or bypass of authoritative collisions.

## Evidence limits and remaining checks

The simulation measures activity, not human-rated difficulty or fun. Internet latency, public service capacity and physical hardware input feel remain unverified. Current frame samples come from the local in-app browser and should not be generalized to other devices. No public deployment has been made by this refinement loop.

Completed browser checks: actual pickup traversal and equipped roller/nail gun, restored doors, countdown cancellation, pause/resume, compact 800×600 menu, results/rematch, embedded main-menu return and standalone return directly to `/#menu`. The latter originally replayed boot screens and was corrected during final QA. Runtime prop diagnostics reported 156/156 matching footprints/heights and no renderer errors. Local frame-interval p95 samples were approximately 9–11 ms during traversal and combat; this is not a cross-device performance guarantee.

A real seven-bot browser round showed the local player being eliminated, the attacker/weapon and three-second death card, and subsequent return with health 100 and brush + leg. A full round reached the eight-player results screen. The traversal client did not fire; this was a movement and presentation rehearsal, not a player skill benchmark. Its route is recomputed after respawn.

A separate controlled server-fixture test, using real WebSocket commands, verifies door opening/closing, refusal to close on occupants, damage from all five weapons, impact/explosion messages, death, starter loadout restoration, and immunity to damage during respawn protection. These fixtures are separate from the unmodified bot simulation and browser replay.

Final commands passed: `npm run build`, `npm run build:arena`, `npm run test:arena:refinement`, `npm run test:arena`, `npm run test:arena:bots`, `npm run check:classic`, `npm run validate:levels`. Both builds and the standalone return interaction were repeated after the final navigation correction.

Browser logs contained no errors. Existing Three.js Clock deprecation and one campaign audio-resume timeout warning were observed; audio output and physical mouse feel still need human checking. Arena now selects the actual supported PCF shadow mode rather than its deprecated alias.

The workspace already contained an unfinished Arena implementation and other dirty files. This pass preserved that work and the frozen classic; no commit or deployment was made.

## Review artifacts

- [Embedded menu](../evidence/arena-refinement/05-embedded-lobby.png)
- [Compact menu](../evidence/arena-refinement/06-compact-lobby.png)
- [Pause and loadout](../evidence/arena-refinement/07-pause.png)
- [Death presentation](../evidence/arena-refinement/09-death.png)
- [Full bot-round results](../evidence/arena-refinement/11-bot-results.png)
- [60-second simulation measurements](../evidence/arena-refinement/simulation.json)

These changes address the concrete reported defects. Whether the tuning now meets the desired difficulty and feel requires hands-on play; the local pass does not label the experience perfect.
