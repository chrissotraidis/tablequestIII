# Hands and arms — parked, and how to bring them back

**Status (2026-09-04, round 14):** the first-person hands and arms are switched **off**. The weapons float
(Doom / Quake presentation), still with bob, sway, recoil, aim-down-sights, sprint lowering and swap animation.
Nothing was deleted: the models, the rig, the sleeve builder, the lab harness and the shot tools are all still in
the tree and load-tested by the build. This document is the map for reintroducing them.

## The switch

`src/handrig.js` — `export const SHOW_HANDS = false;`

Set it to `true` and rebuild. `src/game.js` then loads the two hand models, converts each tool's recorded grip
frames into a skinned hand plus a sleeve, and animates the finger joints every frame. Nothing else needs to change;
the tools still carry their grip specs (`userData.handSpecs`) whether or not hands are shown.

## What is stored where

| Piece | Path | Notes |
|:--|:--|:--|
| Hand models | `src/assets/hands/left.glb`, `right.glb`, `LICENSE.md` | WebXR input-profiles `generic-hand`, MIT (Amazon 2019). 1,360 vertices, 25 named joints each, no textures. Inlined into the single-file build as data URLs by `?url` imports **when the switch is on**; with it off the bundler drops them (the build shrinks ~300 KB), so they live only in the source tree until re-enabled. |
| Rig | `src/handrig.js` | `loadHandModels()`, `makeHand(spec)` (frame detection, chain re-parenting, placement, curls, sleeve), `gripCurls`, `applyPose` (per-frame trigger squeeze, relax, fidget, grip adjust, wrist flex). |
| Sleeves and materials | `src/hands.js` | `buildSleeve` (forearm loft with rolled cuff, knit cuff, watch), `skinMaterial`, `clothMaterial`, `loft`, `hose`. `buildArm` only records a grip spec on the tool. |
| Grip specs per tool | `src/viewmodels.js` | each builder calls `buildHand({ side, grip, radius, axis, out, mode, trigger, forearm, … })`; `finish()` re-expresses them in the baked root's space. |
| Hand lab | `TQ.handLab(o)` in `src/main.js`; shot script in the session scratchpad (`handlab.mjs`, trivially rewritable: it calls `TQ.handLab({...opts, view})` and screenshots) | One hand on a plain cylinder, views front/side/top/palm. Verify a grip here before touching a tool. |
| Crop tool | `tools/vm_crops.mjs` | full-resolution crops of the viewmodel region, hip/ads/fire/swap, waits on rendered frames. |
| Studio | `TQ.vmStudio(key, pose)` + `tools/studio_shots.mjs` | tool framed large on a grey backdrop: hip/ads/fire/sprint/inspect/side/top. |
| Evidence | `docs/evidence/O1`, `P1` | lab sheets, crops and studio shots from rounds 10–12 with verdicts in `PROGRESS.md`. |

## The grip convention (the part that took ten rounds to get right)

All in the tool's local space, −Z forward, +Y up:

- `axis` (A): the handle axis **pointing toward the thumb side** — up a pistol grip, forward along a fore-end.
- `out`: from the handle axis through the palm to the back of the hand. Pistol grips: outward and a little back
  (`s·(0.92, 0, 0.38)` for side `s`); support hands: down.
- Fingers at the knuckles: `Z = s · (A × out)`. Wrist joint = `grip + out·(r + 0.013) − Z·0.078` (support: mid-palm,
  `−0.052`). Measured on the model: knuckles 0.088 from the wrist, palm skin 0.019 below it, wrist ring 0.052 × 0.037.
- `forearm`: direction the forearm leaves the wrist (a bent wrist). Default drops from the wrist; it must head
  down, not straight off the hand, or it exits the frame sideways as a pipe.
- Hands are sized in real units whatever the tool group's scale (`parentScale`); sleeve radii scale with them.
- Shoulder anchors are camera-space `(±0.15, −0.46, 0.12)` converted per tool in `game.js`.

## Why they were parked

After rounds 10–12 the hands were structurally right (they wrapped the grips, sleeves dropped out of frame) but still
read as bizarre at a glance: a low-polygon hand mesh with sausage fingers, one flat skin tone, no thumb definition on
the melee holds, and forearms that are fat tubes at the lens. Those are asset-fidelity problems, not maths, and the
procedural route had hit its ceiling.

## What it would take to bring them back well

1. **A better hand asset.** A CC0/MIT rigged first-person arms model with a proper wrist and forearm (e.g. a
   Mixamo-style rig or an FPS arms pack), imported the same way as the WebXR hands. The rig only needs the same 25
   joint names (or a name map) and a wrist joint; `analyse()` detects the frame numerically.
2. **Baked poses instead of procedural curls.** Author one grip pose per tool in the lab (`TQ.handLab`) and store
   the joint quaternions; `applyPose` then blends animation channels on top of an authored rest.
3. **Skin and cloth textures painted, not generated.** Knuckle darkening, nails, palm creases; a sleeve with seams.
4. **Re-enable, then run** `tools/vm_crops.mjs` and `tools/studio_shots.mjs` and judge from the crops, tool by tool,
   writing the awkwardness verdict before changing anything.
