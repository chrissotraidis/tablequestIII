# Arena refinement — clean empty-room lifecycle

September 12, 2026. Continuing the active refinement goal.

A playtest exposed orphaned bot matches after the last human left. Subsequent visits could show an occupied Office or join an old bot-only round. The server now resets a vacant room to a clean lobby, removing bots, old chat/results/projectiles and restoring supplies, doors and cover. A new match identity prevents clients from retaining the prior world state.

Temporary disconnects preserve the round and bots for the existing reconnect grace period. Another connected human or valid reservation prevents cleanup. Explicit final departure resets immediately; expiration of the final reservation resets afterward. The existing player-object identity guard prevents stale release callbacks from removing a replacement participant.

`tools/test_arena_vacancy.mjs` verifies real socket reconnect, continued play with another human, final-departure cleanup, restored supplies, a fresh host/lobby, and actual reservation expiration. The eight-client server regression passes. Browser join → add three bots → leave returned the embedded room browser to 0/8 players and 0 bots. Both builds and the bot lifecycle regression pass. The vacancy test is included in `test:arena:refinement`.

This fixes round lifecycle and repeat-entry clarity. It does not establish final combat difficulty or public-network acceptance. The broader refinement goal remains active.
