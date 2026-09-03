# Modern preview — design chapter

*Companion to the root `design.md` (classic presentation). The classic files are frozen; this chapter lives under `docs/modern/` and covers the preview build in `modern/`.*

## Intent

Sandy's Table Quest MODERN is the same game re-presented as a mid-2000s shooter. "Same game" is literal: the six ASCII maps, zone recipes, prop registry, weapon numbers, enemy stats and AI rules, pickup economy, story text, nine pieces of music, and the original 199X artwork are all reused unchanged and proven so at every milestone gate (collision-signature hashes, config diffs, PNG checksums, story-text equality, paint-economy runs, boss certification). What changes is presentation: light, material, geometry detail, animation, HUD, front-end, audio voicing, and post-processing.

## Visual language

- **Light describes the floor.** Each floor has a lighting rig (`modern/src/lighting.js`): a shadow-casting key, restrained fills, merged fixture and panel emitters, an exposure and a colour grade. Lobby is warm marble under a skylight; Office is a cold fluorescent grid; Archives is low-key with hanging bulbs; Showroom is retail track light; Factory is a steel plant under clerestory glass; Penthouse is rain, city glow, and trophy spots. The boss's rage shifts the Penthouse grade hot and red.
- **Materials read at arm's length.** Surfaces are still procedural canvases, rastered at 2× or 4× with derived normal and roughness maps, on `MeshStandardMaterial` under a room environment. Walls tile vertically with a trim line, doors have frames, ceilings have variation, windows and exteriors exist where a floor's fiction implies them.
- **Geometry is baked, not budgeted by hand.** Props, dressing, pickups, and character limbs are flattened into vertex-coloured merged meshes (`modern/src/bake.js`); props batch per level. The frame budget is under 400 draw calls and 60 fps on hardware.
- **Characters keep their silhouettes.** Guards, managers, executives, and the Head Designer are the classic blocky figures with hands, weapons, faces, and rank details, animated by layered locomotion, aim, fire, flinch, stagger, cover-peek, and death poses driven by the classic AI's decisions.
- **Weapon handling is tactile.** Two-handed viewmodels, aim-down-sights, a recoil spring, muzzle flash, tracers, decals, and debris, all on the classic damage, cooldown, and paint numbers.

## HUD and front-end

The wooden workbench status bar becomes a corner HUD: compass, objective line and marker, kill feed and hit markers, health and paint, a weapon rack, a full-screen tactical map. Boot keeps the original memory and title screens on a CRT tube; the menu sits over the live, lit Lobby; floor select is a building elevation with per-floor facts; the story crawl is a typewriter briefing with a satellite plan; a loading card precedes each floor. Every classic control and screen remains.

## Audio

The classic Web Audio synth engine is extended, not replaced. New instrument families (strings, brass, choir, piano, distorted guitar, taiko and orchestral percussion, hits, risers) re-voice each classic track at schedule time, so the note data of all nine pieces is untouched. Effects keep their names and roles but are layered; reverb and footsteps follow each floor's material; six ambience beds run under the score; a dynamic mix ducks under combat, muffles at low health, swells on objectives, and adds a phase-2 layer with a stinger under the boss. Everything is synthesized; there are no audio assets.

## Working method

The build was produced by a goal loop (`docs/modern/GOAL_LOOP.md`) with a progress log (`modern/PROGRESS.md`): one goal at a time, verified by the frozen-classic guard, the level validator, a headless smoke, and screenshots, then logged and committed under the goal's ID. Open decisions carry defaults and are marked `BLOCKED(§5-x)` until answered.
