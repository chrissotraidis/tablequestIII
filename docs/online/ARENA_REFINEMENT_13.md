# Arena refinement — full-round validation

September 12, 2026. Continuing the active refinement goal.

Ran a normal five-minute authoritative round with seven bots and one idle socket observer. The simulation completed with 72 deaths and respawns, 130 pickups, 1,895 fire events and zero protocol errors. All bots explored 184–294 cells and fired 218–335 times. Server tick p95 was 0.421 ms. Raw evidence: `docs/evidence/arena-refinement-13/full-round.json`.

This longer sample exposes a remaining resupply weakness: Vale had 672 empty-paint samples out of 4,098 alive samples (16.4%), and Pax had 352/4,052 (8.7%). They continued to score and travel, but the earlier one-minute zero-empty result does not generalize to a full round. Next investigation should distinguish productive melee pursuit, station contention and failed resupply paths before adjusting behavior. Random matches do not establish a causal performance comparison or human difficulty acceptance.

Separately replayed the embedded browser flow: join empty Office, add seven bots, explicit eight-second countdown, open standings, inspect live supply timers, open settings and leave the running room. Leaving returned the lobby to zero players and zero bots. Screenshots inspected in the tool showed readable standings and guide at 841×900. The localhost connection indicator showed under 1 ms. This is local flow/server validation, not WAN or rendering-frame-time evidence.

The refinement goal remains active.

Measurement correction: the tick p95 recorded in this report covered simulation and door updates only. Snapshot serialization and socket enqueueing were excluded. Loop 19 corrects the timer; these older numbers should not be compared directly with the newer full-update timing.
