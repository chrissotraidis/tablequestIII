# Arena refinement — model inspection and useful options

September 12, 2026. Implemented and locally verified; broader refinement goal remains active.

## Improvements

- Staff preview now supports drag and arrow-key rotation, rotation buttons, zoom, a walking pose and optional turntable. Guard, Manager and Executive retain their original campaign models and selected suit colors.
- A Weapons tab shows all five actual detailed campaign viewmodels. Each has a pixel-art selector, authoritative damage/paint/cooldown values and a short description of its purpose. Inspecting a tool never grants it in the match.
- Model framing and menu placement were revised after browser review found details falling below the fold. Weapon information sits beside the model on desktop; joined-lobby start and chat controls retain priority.
- Cross, dot and ring crosshairs and a weapon bob/breathing toggle are saved alongside existing settings. Bob suppression retains firing recoil and weapon transitions.
- Name, staff and paint selections survive reload. An accepted welcome synchronizes the preview with server identity.
- Hosts can add one bot, three bots, or fill remaining slots. Counts are validated and bounded by room capacity. Adding opponents still clears prior host readiness and never starts the round. Opponent controls are grouped separately from start/leave actions.
- Shared paint recoloring preserves authored wood/metal/skin and isolates shared campaign materials. Weapon models are created only on first inspection. Stationary previews redraw only when their visible state changes. The preview and world-space brushes also use their owner's paint color instead of a hard-coded blue tip.

## Evidence and checks

Browser inspection covered all five tools, all three staff variants, paint changes, walking, turntable, drag/buttons, zoom, desktop and 800/390-pixel layouts. Ring crosshair and bob settings survived reload; default settings and the test appearance were restored. Profile selection also survived reload. One/three/fill bot actions, capacity hiding, remove bots and leave were replayed.

The idle preview performed **zero draws during 2,659 world frames**, with its model resources unchanged. This is a scoped rendering reduction, not a whole-game FPS claim. A live eight-staff sample reported **12.1 ms p95 frame intervals** and no authored prop mismatches; it is local browser evidence, not a WAN or physical-display benchmark. No console warnings/errors were observed in the inspected run.

Both builds pass. Arena server tests (eight sockets, reconnect/results identities), extended bot tests (one/three/fill, invalid counts, movement/fire/results/rematch), geometry/navigation/interactions/presentation/resources checks, and the new paint-tint isolation test pass. Frozen classic and all six level validations pass. No public deployment or human gameplay acceptance is claimed.

Evidence: [weapon inspector](../evidence/arena-refinement-5/weapon-inspector.png), [walking Executive](../evidence/arena-refinement-5/executive-walking.png), [compact inspector](../evidence/arena-refinement-5/compact-inspector.png), [ring crosshair](../evidence/arena-refinement-5/ring-crosshair.png), [opponent setup](../evidence/arena-refinement-5/opponent-options.png), [idle draw counters](../evidence/arena-refinement-5/idle-preview.json).

## Continue auditing

Settings access before entering a round, compact-screen menu density, combat/audio feel and bot challenge remain candidates for further refinement. Preserve the established campaign art, explicit ready/countdown behavior and result identity checks while iterating. The current pass did not change bot combat difficulty or claim Internet latency improvements.
