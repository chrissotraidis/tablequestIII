# Classic vs Modern — comparison sheet (GOAL_LOOP M7.3)

Every screen and floor of the classic build beside the modern preview, captured by the same headless smoke path (`npm run smoke:classic` / `npm run smoke:modern`) at 1280×800 with software rendering. Same maps, same numbers, same text; only the presentation differs. The right column names the goal that produced the change.

| Screen / floor | Classic | Modern | What changed |
|:--|:--|:--|:--|
| **Boot: memory screen** | ![classic Boot: memory screen](smoke/classic/01-boot-memory.png) | ![modern Boot: memory screen](smoke/modern/01-boot-memory.png) | Original `memory_screen.png` on a CRT tube (M3.7) |
| **Boot: title card** | ![classic Boot: title card](smoke/classic/02-boot-title.png) | ![modern Boot: title card](smoke/modern/02-boot-title.png) | Original `title_screen.png`, tube glow, auto-advance |
| **Main menu** | ![classic Main menu](smoke/classic/03-menu.png) | ![modern Main menu](smoke/modern/03-menu.png) | Menu over the live, lit Lobby with a slow dolly (M3.5) |
| **Floor select** | ![classic Floor select](smoke/classic/04-floor-select.png) | ![modern Floor select](smoke/modern/04-floor-select.png) | Building elevation with per-floor facts and best-floor memory (M3.6) |
| **How to play** | ![classic How to play](smoke/classic/05-instructions.png) | ![modern How to play](smoke/modern/05-instructions.png) | Restyled card, same controls list |
| **Story crawl** | ![classic Story crawl](smoke/classic/06-story.png) | ![modern Story crawl](smoke/modern/06-story.png) | Typewriter mission briefing, 852/852 characters identical (M3.5) |
| **Floor 1 spawn** | ![classic Floor 1 spawn](smoke/classic/07-floor1-spawn.png) | ![modern Floor 1 spawn](smoke/modern/07-floor1-spawn.png) | StandardMaterial world, shadows, trim, modern HUD (M1, M3) |
| **Floor 1 walking** | ![classic Floor 1 walking](smoke/classic/08-floor1-walk.png) | ![modern Floor 1 walking](smoke/modern/08-floor1-walk.png) | Two-handed viewmodel, ADS, recoil (M2) |
| **Tactical map** | ![classic Tactical map](smoke/classic/09-floor1-minimap.png) | ![modern Tactical map](smoke/modern/09-floor1-minimap.png) | Full-screen tactical map replaces the corner minimap (M3.2) |
| **Pause** | ![classic Pause](smoke/classic/10-pause.png) | ![modern Pause](smoke/modern/10-pause.png) | Pause panel with the portrait, same four actions |
| **Floor 1 — The Lobby** | ![classic Floor 1 — The Lobby](smoke/classic/floor-1.png) | ![modern Floor 1 — The Lobby](smoke/modern/floor-1.png) | Marble atrium, storefront glass, reception dressing (M1.5, M5.1) |
| **Floor 2 — The Office** | ![classic Floor 2 — The Office](smoke/classic/floor-2.png) | ![modern Floor 2 — The Office](smoke/modern/floor-2.png) | Fluorescent grid, glass rooms, cubicle plates (M1.2, M5.2) |
| **Floor 3 — The Archives** | ![classic Floor 3 — The Archives](smoke/classic/floor-3.png) | ![modern Floor 3 — The Archives](smoke/modern/floor-3.png) | Low key light, hanging bulbs, dust (M1.2, M5.3) |
| **Floor 4 — The Showroom** | ![classic Floor 4 — The Showroom](smoke/classic/floor-4.png) | ![modern Floor 4 — The Showroom](smoke/modern/floor-4.png) | Track lighting, display pods, racking (M1.5, M5.4) |
| **Floor 5 — The Factory** | ![classic Floor 5 — The Factory](smoke/classic/floor-5.png) | ![modern Floor 5 — The Factory](smoke/modern/floor-5.png) | Clerestory, overhead conveyor, sparks and steam (M5.5) |
| **Floor 6 — The Penthouse** | ![classic Floor 6 — The Penthouse](smoke/classic/floor-6.png) | ![modern Floor 6 — The Penthouse](smoke/modern/floor-6.png) | Rain, city lights, trophy gallery, veneered arena (M1.5, M5.6) |

## Modern-only views

Views that have no classic counterpart because the feature did not exist:

| View | Image | Goal |
|:--|:--|:--|
| Loading card with satellite plan | ![loading](smoke/modern/07a-loading-card.png) | M3.6 |
| Prop library, intact / damaged / wreck | ![props](M5.7/prop-sheet-1.jpg) | M5.7 |
| Lobby reception dressing | ![lobby](M5.1/lobby-reception.jpg) | M5.1 |
| Office conference glass | ![office](M5.2/office-conference.jpg) | M5.2 |
| Showroom racking | ![showroom](M5.4/showroom-racking.jpg) | M5.4 |
| Factory line with overhead conveyor | ![factory](M5.5/factory-line.jpg) | M5.5 |
| Penthouse arena | ![penthouse](M5.6/penthouse-arena.jpg) | M5.6 |
| Audio debug meter | ![meter](M6.3/factory-audio-meter.jpg) | M6.3 |

Song previews of the re-orchestrated score are in [`M6/`](M6/) (`song-*.wav`).
