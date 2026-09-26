# Arena refinement — combat readability

September 12, 2026. Continuing the active refinement goal.

Incoming damage now briefly indicates its bearing relative to the player's current view. The cue uses the last known attacker position for 900 ms; it is not a persistent opponent tracker. Invalid, absent or coincident positions produce no cue. Confirmed eliminations show a short message below the reticle.

The death panel now keeps stable DOM elements, names the attacker, counts down whole seconds and fills a respawn progress bar using the shared respawn duration. It no longer replaces its markup on every snapshot. The existing starter loadout and protection remain authoritative server behavior.

A disposable local scene (`node tools/preview_arena_combat.mjs`, port 4201) exercised real socket fire, three incoming brush hits, death, respawn and a return-fire elimination. Browser review captured [incoming damage](../evidence/arena-refinement-8/damage-direction.png), [respawn progress](../evidence/arena-refinement-8/respawn-progress.png), and [elimination confirmation](../evidence/arena-refinement-8/elimination.png). No browser errors/warnings were observed. The fixture was stopped after review.

Both builds and the complete Arena refinement suite pass. New bearing tests cover front/right/left/back, a rotated view, and invalid/absent sources. This is controlled presentation verification; it does not establish natural-match bot difficulty or human audio acceptance. The broader goal remains active.
