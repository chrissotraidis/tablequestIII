# Online preparation goal loop

Started 2026-09-09. This pass implements campaign hosting preparation and social links, and plans Arena. Arena gameplay and public deployment are not part of this implementation pass.

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
| G5 | Eight-player Arena planning | One more primary-source research round; concrete lobby/appearance/deathmatch plan, all existing maps assessed, protocol and capacity gates; clearly proposed, not implemented |
| G6 | Final verification | Build, server/client regressions, telemetry, classic, levels, browser menu/gameplay regressions and evidence; changes reviewed and checkpointed separately from main |

For each loop: inspect evidence, make the smallest relevant change, run its acceptance checks, record failures and corrective work, then update the verdict. A passing local test does not establish Zo capacity or physical speaker/gameplay acceptance.

## Loop 1 — scope and baseline

Baseline inspected and recovery tag created before source changes. Verified creator URLs from the contact section of [sotraidis.com](https://www.sotraidis.com/): X `https://x.com/ChrisSotraidis`, GitHub `https://github.com/chrissotraidis`. The main menu was inspected in a browser in the first research round. Existing server and client reviewed again for this pass.

At the start of this loop, G2/G3 implementation, G4 deployment instructions and G5 research/planning ran alongside one another.

## Final local verdict

G1–G6 passed for this implementation/planning scope. The built campaign, packaged runtime, regression results and second-round Arena plan are recorded in [PROGRESS.md](PROGRESS.md). The work is checkpointed on the separate branch; the recovery tag and `main` retain the stable baseline. Actual Zo deployment/capacity checks and the future Arena implementation remain the explicit next milestones, not implied completions.
