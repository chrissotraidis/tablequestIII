# Arena refinement — settings before play

September 12, 2026. Continuing the active refinement goal.

Players can now open Settings directly from the Arena lobby before joining or starting a round. A native modal uses the existing settings form, retaining one set of controls, IDs, values and event handlers. Done and Escape return to the lobby. A server transition into countdown/play closes it, and the selected match-menu section is restored when the form returns there.

Browser verification covered opening before joining, choosing a dot crosshair, Escape returning to Arena, joining with one bot, starting a round, and finding the same selected value in match settings. Exactly one settings form remained in the DOM. Default crosshair was restored. Desktop, 390×700 and 390×500 layouts were inspected; the short-screen revision keeps Done visible while settings scroll. Both production builds and whitespace checks pass.

Evidence: `docs/evidence/arena-refinement-6/prematch-settings.png` and `compact-settings.png`. This pass changes menu access and layout; it makes no new combat or network performance claim. The broader goal remains active.
