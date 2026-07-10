**Comparison Target**

- Source visual truth: `design/main-menu-workbench-reference.png`
- Implementation screenshot: `design/menu-implementation-final.png`
- Full-view comparison evidence: `design/qa-comparison-final.png`
- Focused comparison evidence: `design/qa-focus-final.png`
- Viewport: 1536 × 1024
- State: Main menu, New Game selected, Sound On, zero high score

**Findings**

- No actionable P0, P1, or P2 issues remain.
- [P3] The production case-file panel is horizontal instead of the mock's hanging vertical tag.
  Location: main-menu metadata row.
  Evidence: the focused comparison shows the mock's tag at the far right, while the implementation keeps the selection explanation beside the score plate.
  Impact: minor visual deviation; the production treatment is easier to read and collapses cleanly at narrow widths.
  Follow-up: revisit a vertical tag only if a later wide-screen art pass adds enough protected right-side space.
- [P3] Wooden slats use a cleaner, flatter construction than the mock's heavier beveled hardware.
  Location: main-menu action list.
  Evidence: the focused comparison shows additional screw heads and deep beveling in the target.
  Impact: slightly less physical detail, but stronger legibility and smaller CSS/runtime cost.
  Follow-up: add a real shared hardware texture asset in a future material-detail pass; do not approximate it with CSS circles.

**Required Fidelity Surfaces**

- Fonts and typography: passed. The display hierarchy, condensed action labels, italic Sandy's signature, subtitle tracking, and small workshop labels are coherent and legible. The implementation uses available local font stacks to preserve the single-file/offline build.
- Spacing and layout rhythm: passed. Box art, title, four action slats, metadata, and footer preserve the mock's left/right balance. No viewport overflow was detected at 1536×1024, 1032×698, or 390×844.
- Colors and visual tokens: passed. Walnut, oxblood shadow, aged brass, warm lamp amber, cream type, and cobalt selection map directly to the selected visual.
- Image quality and asset fidelity: passed. The official box art remains unaltered; the workshop scene and transparent paintbrush are real raster assets with correct subject, crop, and palette. No placeholder or CSS-drawn replacement assets are used.
- Copy and content: passed. All four original actions remain, with clearer `How to Play` and live `Sound: ON/OFF` language. Context-card copy supports each action without adding new product scope.
- Accessibility and behavior: passed. Semantic buttons, selected state, focus treatment, keyboard navigation, pointer click-through, reduced-motion support, and 44px+ targets are present.

**Comparison History**

1. Pass 1 evidence: `design/menu-implementation-pass1.png` and `design/qa-comparison-pass1.png`.
   Earlier findings: title treatment was too flat compared with the rust/red beveled target; the selected paintbrush read too small; box-art caption collided with blueprint annotation at compact height.
   Fixes made: added warm rust/brass title edging and depth; enlarged the real paintbrush selector; removed the redundant box-art caption; normalized the high-score format.
2. Final evidence: `design/menu-implementation-final.png`, `design/qa-comparison-final.png`, and `design/qa-focus-final.png`.
   Post-fix result: title and selector now match the target's emphasis, the compact collision is gone, primary actions remain readable, and no actionable P0/P1/P2 mismatch remains.

**Primary Interactions Tested**

- W/S and arrow-key selection
- Dynamic context-card updates
- Sound toggle and live ON/OFF label
- Instructions open and Escape return
- Floor Select open, six floors rendered, and Escape return
- Pointer click selection
- Focus movement and visible selected state
- Browser console errors: none

**Implementation Checklist**

- [x] Approved workbench direction implemented
- [x] Legacy menu archived
- [x] Official box art preserved
- [x] Real background and paintbrush assets installed
- [x] Keyboard, pointer, sound, Instructions, and Floor Select paths verified
- [x] Wide, compact, and narrow layouts checked
- [x] Production single-file build completed

**Follow-up Polish**

- Consider a dedicated real raster hardware strip if future screens need the same screw-and-brass detail.
- Extend the physical-screen system to Floor Select and Instructions using the directions in `design.md`.

final result: passed
