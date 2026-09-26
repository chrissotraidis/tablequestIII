# Arena refinement — stable supply guide

September 12, 2026. Continuing the active refinement goal.

Replaced repeatedly rebuilt supply divs with a semantic table, labeled columns and persistent rows. Only changed cell text is updated. Weapon names and locations remain stable while availability counts and respawn timers change.

Embedded-browser checks during a seven-bot match exposed all seven rows, including all five numbered weapons, paint and health. Successive accessibility snapshots retained the same row, weapon-name and location IDs while timer text changed. The rendered guide remained in the menu scroll area, with Resume and Leave accessible. The test room was left afterward. Both production builds and whitespace checks pass.

This is targeted UI/accessibility verification, not an exhaustive assistive-technology audit. Goal remains active.
