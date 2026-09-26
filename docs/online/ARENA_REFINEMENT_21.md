# Arena refinement — repeated preview resource validation

September 12, 2026. Continuing the active refinement goal.

Expanded the existing model-resource test to exercise the new held-tool selector's lifecycle: 50 sequential replacements on each of three staff models (150 total). Every replaced geometry/material receives exactly one disposal event, old attachments leave the rig, unchanged selections reuse their attachment, staff resources remain intact during switches, and final body disposal releases them.

The test passes along with the existing eight-body lifecycle checks and whitespace validation. No production correction was needed. This verifies resource ownership/disposal behavior, not a browser GPU memory plateau or long-session device performance. The test is already part of the refinement suite through `test_arena_resources.mjs`. Goal remains active.
