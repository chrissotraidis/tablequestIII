# Online preparation goal loop

Started 2026-09-09. The current continuation implements and locally validates the first Arena beta slice inside the main game shell; public Zo deployment, WSS behavior and sustained capacity remain explicit live gates.

## Stable baseline

- Source and shipped build: `2ebc6c753182192c9eb2940debe961ae465111e4`.
- Local recovery tag: `codex/stable-before-zo-2026-09-09`.
- Working branch: `codex/zo-prep-and-arena-plan`; `main` remains at the baseline.
- Original `dist/index.html` SHA-256: `376a3487836222f961d2ea21f1e2b37b28ba4fdd46cefe85051f204dcc4e309f`.
- Classic and packaged older generations remain frozen. Rebuild only modern; never copy local player data into a release.
- Initial research: [September 9 research](../zo-hosting-and-arena-research.md).

## Goals and gates

| Goal | Scope | Acceptance |
| --- | --- | --- |
| G1 | Preserve the stable release | Recovery tag resolves to baseline; campaign rules/maps/assets and legacy files unchanged; classic integrity passes |
| G2 | Creator links | Exact X/GitHub profile links, top-right main menu, matching presentation, keyboard/mouse activation, no game start on link activation, narrow/desktop inspection |
| G3 | Campaign VPS readiness | Shared-network request budgets, persistence errors, checkpoint recovery, live scoreboard refresh, bounded telemetry, focused isolated regressions |
| G4 | Deployment handoff | One-service Zo recipe, persistent paths, clean deployment artifact, backup/rollback, explicit remaining live gates |
| G5 | Eight-player Arena beta | Office-only room, eight slots, all five respawning weapon pickups, server authority, five-minute FFA, respawns, results/rematch, colored staff presets, local socket and browser acceptance |
| G6 | Final verification | Build, Arena server/client regressions, eight-browser evidence, campaign telemetry/scoreboard, classic, levels, and dirty-tree review; Zo live capacity remains separate |
| G7 | Zo live acceptance | Deploy only with an authenticated Zo endpoint; verify public WSS, two complete rounds, ninth-player rejection, restart/reconnect, latency, RSS/event-loop/tick budgets |

For each loop: inspect evidence, make the smallest relevant change, run its acceptance checks, record failures and corrective work, then update the verdict. A passing local test does not establish Zo capacity or physical speaker/gameplay acceptance.

## Loop 1 — scope and baseline

Baseline inspected and recovery tag created before source changes. Verified creator URLs from the contact section of [sotraidis.com](https://www.sotraidis.com/): X `https://x.com/ChrisSotraidis`, GitHub `https://github.com/chrissotraidis`. The main menu was inspected in a browser in the first research round. Existing server and client reviewed again for this pass.

At the start of this loop, G2/G3 implementation, G4 deployment instructions and G5 research/planning ran alongside one another.

## Loop 2 — integrated parity and polish pass (2026-09-12)

The existing main-menu route now owns Arena at menu item 03; Arena is not a separate mock. The Office-only beta lobby was compacted around the actual flow: choose look and paint color → Join Office Lobby → Ready Up or Ready + Fill With Bots → countdown → five-minute free-for-all. The fixed `OFFICE8` implementation code is retained for the protocol but hidden from the player-facing form.

Gameplay parity fixes in this pass reuse the production Office world, staff models, viewmodel poses, pickup builders and audio. Each spawn/respawn grants paintbrush plus table-leg melee; server-authoritative cover can be damaged/destroyed; roller splash resolves on player, wall and floor impact; food/paint/weapon supplies have bounded respawn timers; snapshot metadata drives visible 3D pickups and destroyed furniture; and Arena music changes once per match instead of restarting on every room update. The client preserves the authored Office scene across rematches so lighting/material state does not flash or disappear.

Evidence completed locally: `npm run build`, `npm run build:arena`, eight concurrent WebSocket clients, one human plus seven bots through results/rematch, two-browser smoke, and an integrated root-menu click-through with fresh lobby, countdown, active Office, table-leg switch, pause standings, leave-room and return-to-main-menu screenshots. The active Office was visually replayed after a full-white transition regression was found and fixed. This is not eight-human browser acceptance and does not establish VPS/Zo capacity.

## Final local verdict

G1–G6 pass for implementation and local-validation scope, with the evidence boundary above. The first Arena beta is implemented and locally runnable; the built campaign, packaged runtime, regression results and Arena plan are recorded in [PROGRESS.md](PROGRESS.md) and the Arena evidence directory. G7 remains open because this workspace has no inspected Zo service, public endpoint or deployment credentials; no live Zo or public eight-player claim is implied.


## Loop 3 — Arena refinement, September 12 (local refinement complete)

The user rejected the previous local beta as a poor gameplay experience. The earlier G1–G6 verdict describes technical beta coverage, not acceptance of the UX or gameplay. This refinement loop supersedes that quality verdict.

This goal audited the supplied screenshots and original game, fixed the concrete gaps, replayed the actual application, ran server simulations, and recorded limitations. Findings, changes, and verification are tracked in [ARENA_REFINEMENT.md](ARENA_REFINEMENT.md). Do not equate the short original smoke tests with playable-quality acceptance.

Loop 3 delivered shared menus, an animated backdrop, explicit ready/countdown flow, authored prop collision, synchronized doors, campaign HUD and effects, corrected pickup equip state, death/respawn feedback, and navigation-based bots. Geometry, interaction fixtures, eight-client lifecycle, bot rematch, a 60-second combat simulation, browser traversal, a full bot round, menu returns, builds and classic integrity were verified. Human difficulty/input/audio acceptance and public networking remain outside this local completion claim.

## Loop 4 — Second playtest refinement, September 12 (local refinement complete)

The latest user playtest identified remaining preview, readiness, chat, settings, standings, paint placement and latency issues. [ARENA_REFINEMENT_2.md](ARENA_REFINEMENT_2.md) records the audit, implementation and evidence.

This pass adds real staff/color previews, explicit roster-to-countdown flow, visible chat, persistent settings, labeled standings/results, live supply guidance, locally predicted movement and firing feedback, short-click latching, surface-fitted paint and campaign combat feedback. Browser navigation, compact layouts, settings persistence, geometry/interactions/presentation tests, eight sockets and bot lifecycle passed. A 205 ms round-trip browser relay produced 0.5 ms local feedback trigger versus 210.8 ms server confirmation. This is application timing evidence, not physical input-to-photon latency. Human feel/audio/difficulty and public networking remain separate acceptance gates.

## Loop 5 — Performance, wayfinding and repeated-play refinement

The user requested continued iteration until Arena was substantially better. Three measured subloops removed idle rendering work, added an actual supply map and clearer results, and fixed paint identity plus staff resource cleanup. [ARENA_REFINEMENT_3.md](ARENA_REFINEMENT_3.md) records the changes and evidence.

Local verdict: complete for this refinement objective. Lobby non-idle CPU samples fell from 19.78% to 4.62%; the active bot sample retained 9.3 ms p95 frame intervals. Leaving eight staff released 115 registered geometries. Builds, gameplay/presentation/resource tests, eight sockets, bot results/rematch, classic integrity and all six levels passed. Browser playback caught and corrected a clipped map and an ineffective material-only paint tint before completion. Public networking and subjective human acceptance remain separate.

## Loop 6 — Reconnect results and weapon clarity

A further iteration found that results disappeared on reload and slot reuse could misattribute a prior participant's placement. Final standings now survive reconnect, with public participant identities separate from reconnect credentials. Weapon selection updates the complete rack/ammo presentation immediately and supplies empty-paint guidance. [ARENA_REFINEMENT_4.md](ARENA_REFINEMENT_4.md) records passing builds, expanded identity/reconnect regression, full Arena checks and browser recovery/rematch/selection evidence. Local iteration complete; public networking and subjective acceptance remain separate.

## Loop 7 — Inspectable models and meaningful choices

The continuing goal remains active. [ARENA_REFINEMENT_5.md](ARENA_REFINEMENT_5.md) records real weapon inspection, rotatable/animated staff previews, saved appearance and crosshair/motion preferences, one/three/fill bot setup, and a stationary-preview rendering optimization. Browser review corrected below-fold weapon information and crowded lobby actions. Both builds, expanded bot/server regressions, paint isolation and the existing gameplay/classic checks pass. Continue with interaction density, pre-match options and observed combat feel rather than treating this as final human acceptance.

## Loop 8 — Settings before play

Added direct lobby settings using the same form as the match menu, with native modal focus, Done/Escape handling and a fixed close control on short screens. Browser verification carried a pre-match crosshair choice into the live match settings and confirmed only one form instance. [ARENA_REFINEMENT_6.md](ARENA_REFINEMENT_6.md) records evidence. Goal remains active for further interaction/gameplay refinement.

## Loop 9 — Empty rooms reset cleanly

Observed bot-only rounds persisting after everyone left. The server now clears a vacant room while preserving live humans and reconnect reservations. Real socket tests cover immediate leave, reconnect, another human continuing and grace expiration; the embedded browser returned to an empty lobby after adding/leaving bots. [ARENA_REFINEMENT_7.md](ARENA_REFINEMENT_7.md) records the change. Goal remains active.

## Loop 10 — Combat feedback and respawn readability

Added a brief incoming-damage bearing, confirmed elimination message and stable respawn progress display. A controlled socket scene was played through incoming hits, death, respawn and a return-fire elimination. Screenshots and passing full refinement checks are recorded in [ARENA_REFINEMENT_8.md](ARENA_REFINEMENT_8.md). Continue auditing natural gameplay and bot challenge; the overall goal remains active.

## Loop 11 — Bots choose affordable weapons and resupply

Three measured simulations and controlled fixtures exposed and repaired unaffordable weapon selection and overlooked owned-station refills. The first revision's weak resupply result drove a second correction rather than a completion claim. [ARENA_REFINEMENT_9.md](ARENA_REFINEMENT_9.md) records all samples and bounded conclusions. Normal preview uses the updated server; goal remains active.

## Loop 12 — Keyboard focus and stable standings

Focused the match menu on entry, constrained keyboard navigation to its controls, retained unchanged score rows, and prevented reconnect-screen wheel switching. Embedded-browser checks verified focus wrapping, native slider adjustment, Escape resume and eight accessible standings rows. [ARENA_REFINEMENT_10.md](ARENA_REFINEMENT_10.md) records evidence. Goal remains active.

## Loop 13 — Saved audio volume

Added real output volume and a test-sound control to the shared settings form. Browser checks verified graph gain at 25%, saved preferences, mute/zero feedback and restored defaults. Builds, audio regression tests and the frozen-classic check pass. [ARENA_REFINEMENT_11.md](ARENA_REFINEMENT_11.md) records the evidence and listening limitation. Goal remains active.

## Loop 14 — Weapon inspection clarity

Separated authoritative weapon stats into labeled columns, exposed roller splash damage and station acquisition guidance, and added Reset view. Embedded-browser checks covered ranged/melee details and reset behavior. [ARENA_REFINEMENT_12.md](ARENA_REFINEMENT_12.md) records the scope. Goal remains active.

## Loop 15 — Full five-minute round and flow replay

Completed a full-round simulation plus embedded join/countdown/menu/leave checks. Sustained combat and server timing passed, while longer sampling exposed remaining empty-paint time for two bots. [ARENA_REFINEMENT_13.md](ARENA_REFINEMENT_13.md) records results and the next resupply investigation. Goal remains active.

## Loop 16 — Prioritize useful resupply

A failing controlled fixture showed empty bots choosing optional health over ammunition. Corrected supply priority while preserving critical healing and verified real collections. Full refinement checks and a fresh simulation pass. [ARENA_REFINEMENT_14.md](ARENA_REFINEMENT_14.md) records evidence and limits. Goal remains active.

## Loop 17 — Idle snapshot work

Removed snapshot serialization when no open player socket can receive it. A failing-then-passing fixture covers idle rooms, joining and disconnect reservations; reconnect cleanup checks remain green. [ARENA_REFINEMENT_15.md](ARENA_REFINEMENT_15.md) records the bounded performance result. Goal remains active.

## Loop 18 — Stable supply guide

Added semantic supply headings and preserved rows across timer updates. Browser accessibility snapshots confirm stable labels and changing availability; rendered menu and leave flow checked. [ARENA_REFINEMENT_16.md](ARENA_REFINEMENT_16.md) records evidence. Goal remains active.

## Loop 19 — Measure the full server update

Corrected tick timing to include serialization and socket enqueueing, and collected event-loop delay over a meaningful interval. Controlled timing fixture and eight-socket checks pass. New simulation evidence and corrections to older measurement scope appear in [ARENA_REFINEMENT_17.md](ARENA_REFINEMENT_17.md). Goal remains active.

## Loop 20 — Measured visual traversal

Added a test-mode-only readout and inspected real traversal stages with eight staff, wall paint, destruction debris and respawns. Two short rendering samples showed 9.2 ms frame p95. [ARENA_REFINEMENT_18.md](ARENA_REFINEMENT_18.md) records scope and remaining visual checks. Goal remains active.

## Loop 21 — Manual weapon verification

Added an optional weapon-review fixture and manually fired all five tools in the browser, verifying paint costs, equipped HUD state and distinct held models. [ARENA_REFINEMENT_19.md](ARENA_REFINEMENT_19.md) records observations and limits. Goal remains active.

## Loop 22 — Preview staff with every tool

Added a character-only held-tool selector using the existing multiplayer attachment lifecycle. Browser checks covered multiple staff, roller attachment and mode separation; builds and resource checks pass. [ARENA_REFINEMENT_20.md](ARENA_REFINEMENT_20.md) records verification. Goal remains active.

## Loop 23 — Repeated preview lifecycle checks

Expanded resource verification to 150 held-tool replacements across all three staff types. Disposal, unchanged-selection reuse and staff preservation pass. [ARENA_REFINEMENT_21.md](ARENA_REFINEMENT_21.md) records scope. Goal remains active.

## Loop 24 — Reduce covered-scene rendering

Applied menu cadence while the match menu/reconnect screen covers play, preserving online simulation. Browser samples verified 34.4 ms menu frames and 9.2 ms resumed frames, plus changing standings and clean leave. [ARENA_REFINEMENT_22.md](ARENA_REFINEMENT_22.md) records limits. Goal remains active.

## Loop — Internet play and VPS packaging (September 26)

An audit with a jitter relay showed Arena worked only on localhost: prediction drift, snapshot-snapping remote staff, no heartbeat or auto-reconnect, and a deploy recipe that omitted the Arena server's files. [ARENA_REFINEMENT_23.md](ARENA_REFINEMENT_23.md) records the fixes and measurements; [VPS_DEPLOY.md](VPS_DEPLOY.md) is the deployment path. Live VPS acceptance remains open until a host is provided.
