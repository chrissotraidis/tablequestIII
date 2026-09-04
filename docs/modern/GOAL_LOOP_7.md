# Round 7 goal loop — real hands: acquire, rig, iterate by looking

*The user's instruction: find what the project needs, get the tools, and iterate by actually looking at the result. Scope: first-person hands and how they hold the five tools. Permission granted to bring in external assets.*

## 1. Diagnosis (why six rounds of procedural hands failed)
Code-built hands (primitives, lofts, subdivided cages) always read as smooth blobs; a convincing hand is sculpted art with a skeleton. Rendering them through the wide world camera made it worse (fixed in K7). What is missing is a **real rigged hand model**.

## 2. Goals
| ID | Goal | Verify |
|:--|:--|:--|
| L1 | **Acquire.** A rigged, skinned hand model with a permissive license that can be bundled in the single-file build: the WebXR input-profiles `generic-hand` left/right (Apache-2.0, the models three.js loads for VR hand tracking). Record license and provenance in the repo. | Files in `src/assets/hands/`, license text beside them, sizes |
| L2 | **Load and inline.** Load with `GLTFLoader` at start-up (async; the game waits), the `.glb` imported as a data URL so the single-file build still has no external fetches. Skinned meshes on layer 1 for the viewmodel camera. | Build size, no network requests at runtime |
| L3 | **Rig to the tools.** Each hand is placed by its wrist joint into the tool's grip frame; finger joints posed per tool by rotating phalanges (grip wrap by handle radius, index on trigger, support poses for off hands, thumb over). The sleeve loft attaches at the wrist joint. Hand materials: the model's skin with a tuned tint, or the leather glove map if UVs allow. | Studio + in-game sheets |
| L4 | **Animate the skeleton.** Trigger squeeze, relax, fidget, grip adjust, and the recoil wrist flex by rotating joints each frame (replaces the morph targets). | Frame strips |
| L5 | **Look, judge, loop.** For every tool, capture hip / ADS / fire / inspect, and write the honest verdict before fixing; repeat until a pass finds nothing that looks wrong at a glance. Minimum three passes. | Verdicts in PROGRESS with the sheets |
| L6 | Gate: smoke, campaign, guard, collision, sheets, `main` fast-forwarded, `v3.3-modern`. | Logs |
