# Round 9 goal loop — make it actually look good

## What is wrong (from the shots, honestly)
1. **Plastic skin.** Saturated, glossy, reflecting the room environment; no shadow where fingers meet the grips, so hands look placed next to tools, not holding them.
2. **Tube sleeves.** Featureless cylinders; no folds, no fabric response to light.
3. **Toy tools.** Blob-lofted bodies and plain boxes with flat plastics; no crisp edges, no wear; proportions loose.
4. **Hip framing.** Tools mostly out of frame at hip, so the hands are rarely on screen during play.
5. **No contact shadows anywhere in the viewmodel pass.**

## Goals (each verified by looking, with the verdict written first)
| ID | Goal |
|:--|:--|
| N1 | Skin: desaturated warm mid-tone, matte (roughness ≥ 0.75), env reflection cut, normal map kept; a subtle darker tint at creases. |
| N2 | Contact shadows in the viewmodel pass: a shadow-casting directional light attached to the camera on layer 1 with a tight shadow frustum around the hands and tool; hands and tools cast and receive. |
| N3 | Sleeves as cloth: vertex displacement folds from low-frequency noise, a woven normal map, matte dark fabric; the cuff rolled. |
| N4 | Tools as hard-surface objects: bodies rebuilt from rounded boxes and cylinders with real chamfers (`RoundedBoxGeometry`), clean proportions from reference silhouettes, roughness/scratch maps on metals, fine grain on plastics, wear on edges. Nailer first, then spray gun, launcher, brush, leg. |
| N5 | Hip framing: tools raised so the hands sit in the lower third above the bench. |
| N6 | Look-judge-fix passes until nothing jumps out; smoke + collision; commit; `main`, `v3.4-modern`. |
