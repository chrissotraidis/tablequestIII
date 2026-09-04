# Round 11 goal loop — from "holds the tool" to "looks good"

Round 10 fixed the structure (grip frame, wrist, framing). What is left is what a viewer notices at a glance.
Every goal is judged on full-resolution crops of the viewmodel region (`tools/vm_crops.mjs`), not on the full frame.

## Faults seen in the round-10 final sheet
1. **Sleeves are dark rubber tubes.** No elbow, no taper, no cloth behaviour, and they enter the frame as thick pipes.
2. **Rear ends face the camera.** The nailer and launcher present a dark disc at the hip; real FPS poses cant the weapon inward so the top and flank read.
3. **Hands read as one colour.** Skin is a flat warm tone; no knuckle/nail definition; the pose is static (no finger spread on the support hand, thumb always the same).
4. **Tools lack surface detail at close range.** Flat plastics and metals; no wear, no roughness variation, no decals beyond the label.
5. **Brush and leg poses are serviceable, not good.** The brush points at the ceiling; the leg is a straight bat with the hands stacked oddly.
6. **Animation is unverified.** Fire, sprint and swap poses were not looked at this round.

## Goals
| ID | Goal | Verified by |
|:--|:--|:--|
| P1 | Crop tool: full-res crops of the viewmodel region for hip/ads/fire per tool | crops exist and are used for every verdict below |
| P2 | Sleeves: forearm shape (wrist taper, muscle belly, elbow), rolled cuff with a visible seam, cloth folds that follow the bend, matte weave | crop of any tool at hip |
| P3 | Weapon cant and framing: tools canted ~8° inward, seen from above-left so top + flank read; rear ends rounded and shortened | nailer/launcher hip crops |
| P4 | Hands: skin tone/roughness variation (knuckles darker, nails, palm lighter), support-hand finger spread, thumb pose per tool | sprayer/nailer crops |
| P5 | Tool surfaces: roughness/scratch maps on metals, grain on plastics, edge wear, more decals | studio side crops |
| P6 | Brush and leg poses redone (brush ready at chest height pointing forward-down; leg on the shoulder / at the ready) | crops |
| P7 | Animation check: fire, sprint, swap, inspect crops per tool; fix anything broken | crops |
| P8 | Gate: smoke + collision; build; PROGRESS; commit; `main`; `v3.5-modern` | gate evidence |
