# Arena refinement — visible traversal diagnostics

September 12, 2026. Continuing the active refinement goal.

The existing `?test&arenaTour` mode now has a compact visible readout of route stage, recent frame-interval p95, world draw calls and staff count. Normal play has no readout. The existing hidden structured audit remains available. This makes visual traversal samples identifiable without inferring progress or frame timing from images.

Ran the authored traversal through normal movement, pickups and door interaction with seven bots. Screenshots showed furnished/destructible corridors, wall-anchored paint, multiple deaths/respawns, progression from the roller stage to door crossing and an E-close-door prompt. Recent frame p95 was 9.2 ms at both sampled stages, with eight staff and 32 then 20 world draw calls. These are short rolling windows at the local browser viewport, not a full-match percentile, GPU-only measurement or proof of every prop/weapon animation. The non-firing traversal died repeatedly; this is not a human difficulty rating.

Both builds and whitespace checks pass. Left the test room and closed the temporary test tab. The normal preview remains available. Further visual checks should cover the remaining route and manual weapon firing; goal remains active.
