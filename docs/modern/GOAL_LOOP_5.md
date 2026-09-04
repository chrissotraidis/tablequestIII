# Round 5 goal loop — hands and weapons, a new technique

*Companion to rounds 1–4. Scope: only the first-person hands, arms, tools, and their animation. Everything else is frozen this round. §5-G unattended; classic tree byte-identical.*

## 1. Why a new technique
Rounds 3–4 built hands from lofted tubes. Five critique passes improved proportion and grip but the surface stays a bundle of tubes: no webbing, no knuckle folds, no unified silhouette, and every finger animation would be a separate part. A real hand needs one manifold surface.

## 2. Goals

### J1 — Subdivision hand mesh `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| J1.1 | A quad cage built in code: a palm block (back, palm, sides, wrist cap, knuckle face split into four columns), fingers as three chained extrusions per column with taper and bend, a thumb as three extrusions from the side of the palm with its metacarpal angle. One manifold surface per hand. | Wireframe screenshot from the studio |
| J1.2 | Loop subdivision (two levels) implemented on the triangulated cage: smooth webbing where fingers leave the palm, rounded knuckles, no seams. | Studio close-ups |
| J1.3 | Surface: per-vertex ambient occlusion from concavity (creases, webbing, between fingers), skin colour and roughness maps with UVs from the cage, warmer knuckles and fingertips, nails as flattened ellipsoids, a fingerless leather glove as a second material region covering the palm block and the proximal finger segments, tagged through subdivision. | Close-ups; material count |
| J1.4 | Per-weapon posing: the cage is built already posed (curl per segment from the handle radius and finger length, spread, thumb wrap, index on the trigger), so each tool gets its own baked hand pair; the forearm, sleeve, strap and watch remain lofted and attach at the wrist. | Studio sheet, ≥3 critique passes |

### J2 — Morph animation `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| J2.1 | Morph targets with identical topology: `trigger` (index squeezed), `relax` (all fingers open), `fidget` (ring and little finger curl), `thumbLift`. Driven each frame: trigger squeeze on fire with a spring, relax during sprint and swap, fidget on idle timers, thumb lift on the grip adjustment. | Frame strips |
| J2.2 | Wrist flex: the hand group rotates at the wrist relative to the forearm on recoil (spring) and aim. | Strips |

### J3 — Tools, third pass `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| J3.1 | Vertex ambient occlusion on every tool (same concavity method) so crevices read; per-tool critique pass for silhouette and detail: brush ferrule crimps and bristle tufting, nailer body seams and screws, launcher clamps and tank welds, spray gun cup threads and knob knurls, leg turning and tape wrap. | Before/after |

### J4 — Gate `TODO`
Smoke, campaign, guard, collision, sheets, PROGRESS round-5 entries, `main` fast-forwarded and tagged `v3.2-modern`; push owed.
