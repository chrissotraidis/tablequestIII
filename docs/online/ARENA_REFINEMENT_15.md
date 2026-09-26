# Arena refinement — avoid unused idle snapshots

September 12, 2026. Continuing the active refinement goal.

The empty preview server was still serializing snapshots without recipients. A controlled test reproduced 30 snapshots over 60 empty ticks. Snapshot construction now returns early when no player has an open socket; simulation ticks and disconnect reservations continue unchanged.

`tools/test_arena_idle.mjs` verifies empty-room counters stay flat, a real socket joining receives snapshots, and a disconnected reserved slot also skips snapshots without being removed. The test failed before the correction and passes afterward. It is included in `test:arena:refinement`. Vacancy/reconnect tests and whitespace checks also pass. The empty preview server was restarted with the correction.

This is a verified reduction in unused serialization, not a measured browser FPS or active-match latency gain. Goal remains active.
