# Arena refinement — correct performance measurement

September 12, 2026. Continuing the active refinement goal.

Server tick timing previously ended before snapshot serialization and socket enqueueing. It now includes those costs, while excluding the telemetry bookkeeping itself. Event-loop p99 now uses a one-second collection window instead of resetting every tick against a 20 ms monitor resolution. The monitor measures scheduling intervals, not network latency.

The idle fixture injects a controlled five-millisecond synchronous socket enqueue cost and verifies it appears in tick p95. Idle snapshot suppression and real joining still pass. The eight-socket server test also passes, as does whitespace validation.

A fresh one-minute seven-bot simulation recorded full-update tick p95 0.538 ms, 11 deaths, 35 pickups and zero protocol errors. Evidence: `docs/evidence/arena-refinement-17/full-tick-timing.json`. Event-loop p99 was 21.627 ms with a 20 ms monitor resolution. This is local server evidence; no browser FPS or WAN claim follows. Earlier reports 13 and 14 now explicitly identify their narrower timing scope. The empty preview server was restarted with corrected instrumentation. Goal remains active.
