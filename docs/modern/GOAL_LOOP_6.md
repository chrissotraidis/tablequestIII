# Round 6 goal loop — how the hands hold the tools

*Scope: first-person hands, arms, tool placement, and animation. The round-5 subdivision hand stays; this round fixes what the screenshots show: oversized hands, long bare forearms, clawed off hands, tools floating off the grips.*

## 1. What the screenshots show (2026-09-03)
1. Hands and forearms are too large in frame; forearms are long straight tubes that never leave the frame.
2. Off hands "cup" tools with splayed fingers — a claw, not support.
3. Right hands float near grips rather than closing on them; thumbs sit on the wrong side.
4. Tools sit too close to the eye; their rear ends fill the view.

## 2. Goals
| ID | Goal | Verify |
|:--|:--|:--|
| K1 | **Anchored arms with an elbow.** Shoulders fixed at the lower corners of the view; the elbow is solved by two-bone IK (upper 28 cm, forearm 26 cm) bending down and outward, so arms enter from the corners and leave quickly. | Studio + in-game sheets |
| K2 | **Hand size and closure.** Hands at 88 %; fingers together (spread 0.25); thumb over the fingers on grips; a **support** pose (palm up, fingers together, curled to the barrel radius, thumb out) for off hands under tools. | Sheets |
| K3 | **Tools on the grips.** Each tool's grip sits in the right hand; the off hand supports under the barrel / foregrip / cup base; tools scaled 90 % and pushed back so the muzzle end leads and the rear stays out of the eye. Viewmodel rendered at 90 % scale to cut wide-FOV distortion. | Sheets, 3 critique passes |
| K4 | **Usage animation.** Support hand tracks the tool during recoil with a lag; the right hand's wrist flexes with the kick; fidget/relax/trigger morphs kept. | Frame strips |
| K5 | Gate: smoke, campaign, guard, collision, sheets, PROGRESS, `main` fast-forwarded, `v3.3-modern`. | Logs |
