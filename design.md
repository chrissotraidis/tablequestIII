# Sandy's Table Quest — Screen Design System

## Design promise

Every screen should feel like an object from Sandy's world, not a generic interface placed over it. The visual language combines solid craftsmanship, improvised paint weaponry, 1990s action-game drama, and the absurd bureaucracy of the Interior Design Cartel.

The main menu establishes that promise through a master workbench: the game box is a physical artifact, actions are mounted wooden slats, score is stamped into brass, and the selected action is marked with Sandy's paintbrush.

## Core principles

1. **Make the interface physical.** Prefer workshop labels, elevator controls, blueprints, evidence tags, carved plaques, and material samples over floating glass panels.
2. **One hero object per screen.** The menu uses the game box and workbench; Floor Select can use the Cartel tower; Instructions can use Sandy's field manual.
3. **Blue paint means agency.** Cobalt paint is the consistent focus, hover, selection, and progress color. Brass communicates records and durable status. Oxblood signals danger and Cartel control.
4. **Motion explains state.** Selected controls lift, settle, illuminate, or receive a paint mark. Motion should never compete with reading.
5. **Keep the joke dry.** Case-file labels and workshop annotations add personality in small doses. The primary action always remains obvious.

## Main menu anatomy

- **Workshop scene:** a raster background supplies the workbench, lighting, tools, sawdust, and blueprint. This keeps the visual rich without building decorative objects from UI elements.
- **Official box art:** remains a sharp, unaltered source asset and tilts subtly with pointer movement.
- **Title lockup:** large condensed title with a smaller italic Sandy's signature, followed by the remaster subtitle.
- **Action slats:** four large targets with numeric shop labels. The selected slat rises, turns cobalt, and receives a real paintbrush image.
- **Context card:** changes with selection to preview what the action does before confirmation.
- **Score plate:** brass treatment reserves status and achievement information for durable, high-value data.
- **Control footer:** persistent and terse; never competes with the menu.

## Interaction model

| Input/state | Response |
| --- | --- |
| Pointer enters an action | Selection follows the pointer and the context card updates. |
| Keyboard W/S or arrows | Selection moves through the same four-item model used by pointer input. |
| Focus | A visible blue outline appears in addition to the selected treatment. |
| Selected | Wooden slat lifts forward, cobalt paint activates, paintbrush gently floats. |
| Pointer moves over menu | The full composition shifts a few pixels for restrained depth. |
| Sound toggled | The visible label changes between `SOUND: ON` and `SOUND: OFF`. |
| Reduced motion requested | Parallax and looping brush animation stop. |

## Responsive behavior

- **Wide desktop:** box art and menu sit side by side with generous workbench space.
- **Compact desktop / short viewport:** box art narrows, row heights compress, and annotations drop away before primary controls do.
- **Narrow/mobile:** title and actions become the main column; box art becomes a small corner artifact; the secondary case file is hidden.
- Persistent actions must never fall below the viewport without a usable scroll path.

## Future screen directions

### Floor Select — Cartel operations board

Use a six-floor brass elevator indicator beside a blueprint/evidence board. Highlighting a floor should light its elevator number and reveal its subtitle, threat level, table count, and palette.

### Instructions — Sandy's field manual

Use a large open workshop manual with tabbed sections for movement, tools, objectives, and weapons. Keycaps remain functional labels, while diagrams should come from real game captures or generated raster art rather than CSS drawings.

### Pause — Tool tray

Keep pause compact: a shallow wooden tool tray over a blurred game view. Resume is the most prominent tool; destructive actions are visually separated.

### Results — Quality inspection card

Treat floor results as a stamped furniture inspection sheet. Performance bonuses can appear as approval stamps; high score remains brass.

## Accessibility and quality bar

- Maintain keyboard, pointer, and focus parity.
- Keep action targets at least 44px tall.
- Use semantic buttons and explicit selected states.
- Preserve legibility over the detailed background with solid control surfaces and strong contrast.
- Respect `prefers-reduced-motion`.
- Avoid flashing, rapid parallax, and constant high-amplitude motion.
- Test the main menu at desktop, short desktop, and narrow breakpoints.

## Legacy fallback

The pre-redesign menu is preserved in:

- `design/archive/index.menu-v1.html`
- `design/archive/main.menu-v1.js`

The original v1 menu CSS also remains directly above the v2 workbench rules in `index.html`. Restoring the archived markup and removing the `menu-workbench` class returns the earlier screen without reconstructing it from memory.

## Selected visual reference

`design/main-menu-workbench-reference.png` is the approved direction used for the implementation and design QA.
