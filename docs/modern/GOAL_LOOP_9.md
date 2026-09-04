# Round 10 goal loop — hands that hold, tools worth holding

## What was actually wrong (measured, not guessed)
Nine rounds tuned constants by eye on shots that were misleading. Two probes settled it:

1. **The grip frame was geometrically wrong.** `out` (handle → back of the hand) defaulted to `axis × X`, which can only
   point up or forward, so the back of every hand sat *in front of* the grip, and the finger direction sign was flipped.
   Fingers could never wrap a handle from that frame; every tool's hand looked "placed beside" the tool because it was.
2. **The offsets were guesses.** Measured on the model: knuckles are 0.088 from the wrist joint (code used 0.07), the
   palm skin is 0.019 below the joint, and the wrist ring is 0.052 × 0.037 — larger than the knit cuff (0.042 × 0.034),
   so the mesh's open wrist cut was visible in every side view.
3. **The in-game sheets were shot mid-animation.** Headless renders ~1 frame/s; the weapon swap takes 8 frames and
   aiming 2–3, so "hip" shots were lowered tools and "ads" shots were half-way. Framing was judged on garbage.

## Method
A **hand lab** (`TQ.handLab`) renders one skinned hand on a plain cylinder in camera space from front/side/top/palm.
Every grip constant is verified there first; tools are then built *around* that canonical grip. Shot tools wait on
rendered frames (`TQ.settle`) and force the swap idle.

## Goals
| ID | Goal | Verified by |
|:--|:--|:--|
| O1 | Hand lab; correct grip frame (`Z = s·(A × out)`, `out` outward and a little back for pistol grips, down for support); measured offsets; sleeve built from the wrist ring at load time | lab sheets: pistol grip and support grip from side/top read as a hand holding a bar |
| O2 | Every tool's hand specs re-expressed in the new convention (axis toward the thumb side) | studio side/top per tool |
| O3 | Shot tools wait on rendered frames | in-game hip/ads sheets show settled poses |
| O4 | Hip and ADS framing per tool: hands in the lower third at hip, sight line along the tool at ADS | in-game sheet |
| O5 | Tools as hard-surface objects built around the grip: nailer, sprayer, launcher, brush, leg | studio sheets |
| O6 | Look-judge-fix passes; smoke + collision; build; commit; `main`; `v3.4-modern` | gate evidence |
