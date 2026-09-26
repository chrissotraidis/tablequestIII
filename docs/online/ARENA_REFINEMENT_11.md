# Arena refinement — saved audio volume

September 12, 2026. Continuing the active refinement goal.

Added a saved 0–100% volume slider and pickup test-sound button to the shared lobby/match settings form. The existing post-limiter output gain controls volume without changing weapon sound synthesis or the internal mix. Offline audio renders retain their original output level. The modern campaign shares this volume preference.

Browser verification covered 25% output (actual Web Audio gain 0.235), persistence after reload, zero-volume feedback, muted feedback, and restoration to 100% with sound enabled. The embedded Arena settings also displayed the restored preference. Evidence: `docs/evidence/arena-refinement-11/volume-25.json` and `volume-settings.png`. This verifies controls and audio graph wiring, not a physical listening assessment.

Both production builds, audio health/voice/logger tests, frozen-classic check and whitespace checks pass. The broader refinement goal remains active.
