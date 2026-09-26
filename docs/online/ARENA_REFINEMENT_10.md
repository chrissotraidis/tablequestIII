# Arena refinement — keyboard and stable standings

September 12, 2026. Continuing the active refinement goal.

The match menu now declares its dialog semantics, focuses Resume when opened and wraps Tab/Shift-Tab through visible enabled controls. Escape still resumes from an input. Wheel switching is ignored while the reconnect entry screen or settings dialog is open. Unchanged standings rows remain in place instead of being replaced every second.

Embedded-browser verification covered Escape and Tab opening the menu, initial Resume focus, Shift-Tab wrapping to the final exit link, Tab returning to Resume, keyboard sensitivity adjustment (1.00× → 1.05× → restored), and Escape returning to play. The updated accessibility tree exposed all eight standings rows. Evidence is in `docs/evidence/arena-refinement-10/standings-accessibility.txt` and `focused-menu.png`.

Both builds and whitespace checks pass. The test match was explicitly left and the room browser returned to 0/8 players and 0 bots. These are focused keyboard/accessibility checks, not an exhaustive assistive-technology certification. The broader refinement goal remains active.
