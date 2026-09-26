# Arena refinement — resupply priorities

September 12, 2026. Continuing the active refinement goal.

The full-round empty-paint findings led to a controlled reproduction: a bot with zero paint and 50 health chose a closer food pickup instead of an available paint refill. The updated fixture failed against the previous behavior. Patrol selection now prefers paint or weapon refills when empty, except below 30 health where healing takes priority. Other supplies remain fallbacks when the preferred kind is unavailable.

The fixture now verifies both priorities and actual pickup collection. All `test:arena:refinement` checks and whitespace checks pass. A fresh one-minute simulation recorded 13 deaths, 31 pickups, 384 fire events and zero protocol errors, with server tick p95 0.648 ms. All bots explored and fired. Two bots still had short empty-paint periods (50/850 and 53/849 alive samples); this random short sample is neither a full-round comparison nor proof of eliminating all resupply delay.

Evidence: `docs/evidence/arena-refinement-14/resupply-priority.json`. The preview server at port 4198 was restarted only after confirming an empty lobby; its browser was refreshed. No frontend rebuild was needed for this server-only correction. Goal remains active.

Measurement correction: the tick p95 recorded in this report covered simulation and door updates only. Snapshot serialization and socket enqueueing were excluded. Loop 19 corrects the timer; these older numbers should not be compared directly with the newer full-update timing.
