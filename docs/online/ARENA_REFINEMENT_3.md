# Arena iteration: performance and wayfinding

September 12, 2026. Continues the user-requested audit, improve, and test loop from [pass 2](ARENA_REFINEMENT_2.md).

## Loop A: measure and remove wasted rendering

The unjoined lobby rendered at display cadence, redrew the hidden HUD portrait, and submitted an empty viewmodel pass. It now animates at 30 Hz, skips rendering while hidden, omits the empty weapon pass, and draws the visible face at the campaign cadence of approximately 15 Hz. Active gameplay remains at display cadence.

Same-browser CPU profiles measured non-idle samples falling from **19.78% to 4.62%**, a **76.6% relative reduction** in this lobby workload. Captures lasted 44.87 and 58.37 seconds and are normalized by duration. This is sampled main-thread activity, not GPU utilization or a general FPS benchmark. The optimized lobby recorded zero hidden face draws and zero viewmodel passes. An active seven-bot sample retained **9.3 ms p95 frame intervals**; it is a limited local observation, not hardware-wide acceptance.

[Profile comparison](../evidence/arena-refinement-3/lobby-profile-comparison.json), [before profile](../evidence/arena-refinement-3/lobby-before.cpuprofile), [after profile](../evidence/arena-refinement-3/lobby-after.cpuprofile), [active sample](../evidence/arena-refinement-3/active-bots.json).

## Loop B: orient players and clarify outcomes

The Field guide now includes the actual Office floor plan: your position and facing, five numbered weapons, paint and health stations, door states, remaining furniture and dimmed respawning pickups. It never reveals opponents. The textual availability/location guide remains below it. The first visual check caught a map taller than the available panel; it was reduced so the entire plan and legend fit while Resume and exit controls remain visible.

Results now put final standings before chat, announce the winner and your placement, retain bot/self labels, and keep rematch readiness reversible when waiting for other humans. Unowned weapon selection gives its location and directions to the map. Weapon changes begin local animation immediately; low health and insufficient paint use existing HUD warnings.

## Loop C: keep identity and resources consistent

The first color check exposed that materials alone could not recolor the held brush: paint colors are baked into geometry. Arena now recolors only the authored paint vertices and its own emissive materials, with a matching paint gauge. Skin, wood, metal, campaign models and shared material caches are preserved.

Departing or replaced staff previously detached without disposing owned geometry/materials. Disposal now runs on slot removal, identity replacement and full room cleanup. A focused eight-cycle resource test verifies every owned resource releases exactly once while another staff member remains independent. The actual browser dropped from 253 registered geometries / 8 bodies to 138 geometries / 0 bodies after leaving; textures remained 47. These are renderer resource counts, not VRAM bytes. [Cleanup evidence](../evidence/arena-refinement-3/resource-cleanup.json).

## Validation

Modern and standalone builds; authored geometry and pickup navigation; all five weapons and sub-tick clicks; doors and respawn protection; paint projection; delayed-input convergence; eight socket lifecycle; solo plus seven bots through results/rematch; classic integrity; six campaign levels; and diff whitespace checks passed. Browser inspection covered animated lobby, active bots, map, results/rematch and paint rendering. The red held brush and matching gauge were visually verified; the final inspected browser run had no logged warnings or errors. [Supply map](../evidence/arena-refinement-3/supply-map.png), [results](../evidence/arena-refinement-3/results.png), and [red paint](../evidence/arena-refinement-3/red-paint-gameplay.png). Screenshots and diagnostic output are in [the evidence directory](../evidence/arena-refinement-3/).

No public deployment or Internet capacity claim. Human difficulty, mouse feel and speaker-level audio acceptance remain separate. Existing unrelated working-tree changes are preserved.
