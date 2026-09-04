# Round 4 goal loop — generations made accurate, a living face, hands and tools iterated until they hold up

*Companion to `GOAL_LOOP.md`, `GOAL_LOOP_2.md`, `GOAL_LOOP_3.md`. Same rules; §5-G unattended; the classic tree under `classic/` stays byte-identical.*

## 1. The review (2026-09-03)

1. **Generations are wrong in Options.** "Gen 1 went to the 2nd version; this is the third version." Finding: the first commit's build already labels itself *v2.0 3D Remaster* — both captured builds are generation 2. Generation 1 is the original 199X CPU raycaster (320×200, four levels, paintbrush and table leg, billboard sprites, four synth songs) that lives in its own repository (`ref/` is git-ignored and absent). Fix the list so it is true.
2. **Sandy's face needs fluid, realistic animation**, not state switches.
3. **Hands, arms, and weapon/hand animation are still very bad.** Take screenshots and iterate, weapon by weapon, until each is very good.
4. Assign a new loop and keep going; playtest at the end.

## 2. Goals

### H1 — Generations, accurate `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| H1.1 | Find the original game: try the user's GitHub repos (`tablequest`, `tablequestII`, …) anonymously. If a playable web build exists, capture it as generation 1; if it is not a web game or not reachable, generation 1 becomes an **info card** (what it was, why it cannot run here) rather than a wrong link. | Options shows the truth |
| H1.2 | Relabel: **GEN 1 · ORIGINAL 199X (raycaster)**, **GEN 2.0 · FIRST 3D REMASTER** (first commit build), **GEN 2.1 · 3D REMASTER (classic)**, **GEN 3 · MODERN (this)**; each entry shows a one-line description and its year/version; Enter launches or shows the card. README table corrected. | Screenshot, README |

### H2 — A living face `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| H2.1 | Parameterised face: every feature driven by continuous parameters (eye openness per eye, gaze x/y, brow height/angle per side, mouth open/width/corners, jaw, head yaw/pitch/roll, hair sway, blush, pallor) that **tween** toward targets with per-parameter response times; no hard switches. | Parameter trace over a hit shows smooth curves |
| H2.2 | Life: blinks with lid travel (~120 ms close, 180 ms open) at natural intervals with double blinks, gaze saccades between fixation points with micro-drift, breathing on the shoulders and nostrils, head micro-movement, hair follow-through on head motion, swallow/lip press idles. | 3-second strip of frames |
| H2.3 | Reactions as curves: hit (snap away, squeeze eyes, jaw clench, then 0.6 s recovery with overshoot), low health (tremor, sweat drip animation, pallor rises), grin (asymmetric onset), aim (squint + head tilt), sprint (rhythmic huff and bob), fire (brow knit pulse), rage worry; floor tint. | Frame strips per reaction |
| H2.4 | Realism pass on rendering: softer skin gradient with cheek and nose highlights, eye moisture highlight, lash line, subtle ambient occlusion under the beret and jaw, hair with layered strands and highlight sweep. | Side-by-side with the cover |

### H3 — Hands v4, iterated `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| H3.1 | Studio harness: `TQ.vmStudio(key, pose)` frames the viewmodel large against a neutral backdrop with studio lights for critique screenshots; poses hip / ads / fire / sprint / inspect. | Sheets |
| H3.2 | Anatomy: correct finger proportions (proximal > middle > distal), knuckle bulges, tapered pads, nail beds, thumb webbing, palm heel and thenar mound, wrist crease, tendons on the back of the hand; fingers wrap the actual handle radius with contact; index on trigger with the pad, not the tip. | ≥3 critique passes per hand pose |
| H3.3 | Skin: tone gradient (knuckles and fingertips warmer), pores, creases baked as vertex AO, subtle sheen. | Close-ups |

### H4 — Weapon and hand animation v4 `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| H4.1 | Kinematic recoil: the tool kicks back and up on a spring with overshoot, the arms follow with lag, the off hand re-settles; per-tool curves (brush flick with wrist rotation and follow-through; leg swing with wind-up, arc, and recovery; nailer snap; launcher heavy kick with a shoulder-check; sprayer buzz). | Frame strips |
| H4.2 | Idle life: breathing sway, finger fidgets, grip adjustments every few seconds, sprayer hose sway; weapon-specific idle (brush drip wobble). | Strips |
| H4.3 | Transitions: eased ADS in/out with settle, sprint lower with bounce, swap with the off hand re-gripping, inspect turn with the off hand releasing, top-up with a real hand motion to the can. | Strips |

### H5 — Tools detail v4 `TODO`
| ID | Goal | Verify |
|:--|:--|:--|
| H5.1 | Per tool, three critique passes from the studio: silhouette, proportion, detail density, material read; add what is missing (screws, seams, wear, decals, glass, hoses with sag). | Sheets before/after |
| H5.2 | Procedural normal-style detail via vertex AO and fine geometry (grip stipple, knurl, vents, crimps). | Close-ups |

### H6 — Playtest and gate `TODO`
Smoke, campaign, guard, collision, sheets, PROGRESS round-4 entries, gate summary, `main` fast-forwarded and tagged `v3.1-modern`; push owed to the user's credentials.

## 3. Method for the iterated goals
Each pass: capture with the studio harness → write three concrete faults → fix → recapture. Stop a goal only when a pass finds nothing worth fixing.
