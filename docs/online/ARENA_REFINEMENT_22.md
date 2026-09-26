# Arena refinement — covered match rendering

September 12, 2026. Continuing the active refinement goal.

Applied the existing 30 Hz menu-background cadence while the match menu or reconnect entry screen covers active play. Server simulation and network messages keep running. Active play retains display cadence. Test frame samples reset when crossing cadence modes, and the readout identifies menu/resume states.

Live browser verification with seven bots showed menu frame p95 34.4 ms and resumed active frame p95 9.2 ms. Standings continued changing during the menu interval, Resume returned to play, and Leave returned the room to zero players/bots. These verify rendering cadence and flow; they do not quantify CPU, GPU or battery savings. Both builds and whitespace checks pass. The normal preview remains available. Goal remains active.
