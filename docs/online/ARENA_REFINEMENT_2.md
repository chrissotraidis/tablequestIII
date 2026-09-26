# Arena refinement — second playtest pass

September 12, 2026. Local implementation and verification complete. This continues the first [refinement](ARENA_REFINEMENT.md); it does not claim public deployment or final human gameplay acceptance.

## Audit and changes

The user's latest screenshots showed a large text-heavy lobby without an appearance preview, an ambiguous readiness sequence, and a match menu mixing loadout, settings and unlabeled score abbreviations. Their playtest also reported hovering paint and delayed combat feedback.

| Finding | Implemented change |
| --- | --- |
| Staff and paint choices have no useful preview | Actual Guard, Manager and Executive game models in a live preview, matching paint color and a named swatch. Compact form over the animated Office. |
| Ready before adding bots creates an unclear next step | Solo lobby prioritizes adding opponents. Changing the bot roster clears the host's readiness. An explicit Start 8-second countdown action follows; multiplayer identifies who is still unready. |
| Chat is easy to miss | Visible joined-room chat, human count, empty-state prompt and input beside the roster. |
| Pause navigation and standings are unclear | Separate Standings, Settings and Field guide sections; labeled Rank, Staff, Eliminations and Deaths columns. Final results use the same table layout. Resume and both exit destinations remain visible while content scrolls. |
| Settings are missing | Working sensitivity, field of view, invert aim, world shadows, and shared sound/music controls. Control/display settings persist locally. Connection round-trip time is visible. Tab opens standings; Tab inside the menu retains normal focus navigation. |
| Weapons and regeneration are unclear | All five weapon stations have locations and live availability/countdowns. Six paint and six health stations show counts and their 10/20-second respawn periods. Weapon regeneration is 25 seconds. E-door and death/respawn guidance are explicit. |
| Local movement and firing wait for networking | Shared collision-based local movement prediction with authoritative reconciliation, immediate local firing feedback, immediate input transitions and projectile velocity extrapolation. The server still owns damage, paint, pickups and collision outcomes. Short clicks are latched across server ticks. |
| Paint floats or remains after furniture disappears | Permanent paint is projected onto actual static wall/floor/ceiling faces and fitted at edges. Prop, door and player hits use transient particles instead. Impact packets identify the target and remove the projectile immediately. |
| Combat feels disconnected from the campaign | Original paint colors and sound effects, campaign destruction burst/splinter quantities and timing, prompt furniture disappearance, and local weapon recoil/muzzle feedback. |

## Verification

Both modern and standalone Arena production builds passed. `test:arena:refinement` passed authored geometry (156 props), navigation from all 12 spawns to every pickup, door interactions, all five weapons, sub-tick firing, death/loadout/protection, paint projection and edge fitting, delayed movement prediction and convergence. Eight-socket lifecycle and solo-plus-seven-bot chat/combat/results/rematch tests passed. Classic integrity, all six campaign level validations and diff whitespace checks passed during this pass.

Actual browser checks covered all staff preview presets, paint selection, joined roster/chat, explicit countdown, settings changes and persistence after reload, menu controls, pickup traversal, a full bot round, standalone and embedded main-menu returns, and 1280×720 plus 800×600 match-menu layouts. A separate 60-second local round was used for final results layout verification. No browser gameplay acceptance is inferred from a build alone.

### Latency evidence

A local WebSocket relay added 100 ms in each direction. In the actual browser, a normal canvas click triggered local firing feedback in **0.5 ms**, with server confirmation **210.8 ms** later and measured round trip **205 ms**. The recent frame interval p95 was **9.2 ms** in that captured bot session. These are application timing samples, not physical display/audio latency or a general performance guarantee. The network delay itself is unchanged; prediction removes the local wait.

The controlled presentation test separately measured first-frame predicted movement against 166 ms until snapshot-only movement, then verified convergence to the server after stopping and collision with walls. The captured browser latency sample was stationary and is not evidence of movement convergence by itself.

Evidence: [timing JSON](../evidence/arena-refinement-2/latency-browser.json), [integrated Manager/red preview](../evidence/arena-refinement-2/06-integrated-lobby.png), [joined lobby and chat](../evidence/arena-refinement-2/02-joined-chat.png), [live standings](../evidence/arena-refinement-2/07-standings.png), [field guide](../evidence/arena-refinement-2/04-field-guide.png), [delayed connection settings](../evidence/arena-refinement-2/05-latency-settings.png).

## Remaining acceptance boundaries

Human mouse feel, physical speaker/audio balance, and difficulty still need playtesting. Reusing campaign effects is not a claim of perceptual identity in every scene. Local simulated latency does not establish Internet/WSS capacity or multi-human fairness. No public deployment was performed. Existing unrelated working-tree changes and frozen classic files were preserved.
