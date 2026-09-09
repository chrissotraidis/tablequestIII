# Level 2 audio output incident — 2026-09-09

## Finding

The reported music/SFX cutout is a device-output underrun, invisible to the old note-scheduler counter. The affected candidate was Brave, paused in Level 2 (Office); the other local game was paused in Level 1. Neither existing game was reloaded or reset during inspection. Their original build was `8cb516336189`.

A read-only inspection of Brave's existing AudioContext showed **41,109 playback underruns / 219.234297 seconds of fallback frames**, despite `state: running`, zero scheduler underruns and nonzero music/output analyser values. The other browser also reported playback underruns. These counters describe audio frames the playback path failed to deliver, typically replaced by silence; a nonzero analyser does not establish that speakers are producing sound. See the [Web Audio playback-statistics specification](https://webaudio.github.io/web-audio-api/#AudioPlaybackStats) and [output-timestamp API](https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp).

The preexisting JSONL had session/floor/performance records but no audio warnings for the affected session. Performance-driven audio samples stopped when the game paused. Raw session evidence was preserved privately in `/tmp/tablequest-audio-20260909`, not committed.

## Reproduction and change

Two fresh Level 2 tabs reproduced the failure with zero scheduler underruns: the first audio clock stalled near 20 seconds while playback underruns continued increasing. Switching from interactive to balanced buffering did not fix it and increased reported latency, so the production latency hint remains unchanged.

Forcing garbage collection every ten seconds kept both test contexts clear of playback underruns in a 40-second comparison. A separate single-context probe also stayed clear while collecting garbage. Finished synth sources were stopped, but their per-note filters, gains, panners, modulation and effect connections were left for browser collection. This implicated delayed graph cleanup rather than missing notes in the Office song.

The fix explicitly disconnects each note, drum hit and SFX's owned nodes once **all** its sources have ended. Shared music/SFX/reverb buses remain connected, and partial construction failures release their nodes. Counters expose the current owned voice/node count. No forced garbage collection, extra playback latency, map change or automatic floor restart is shipped. The same two-context comparison then ran 40 seconds with **zero** playback underruns, without forced collection. This supports the cleanup fix; it is not a physical-speaker acceptance claim or proof against every system/device failure.

## Diagnostics delivered

- Device playback underrun duration/count/total duration and latency, where the browser supports `AudioContext.playbackStats`. Missing/restricted APIs produce `null`, not a misleading zero.
- Output timestamps, context generation, live voice/node counts, scheduler health and separate music/SFX/output meters.
- Audio heartbeat every 15 seconds, including paused sessions. Three consecutive foreground stalled-clock samples produce `audio.output-stalled`; device underruns produce bounded `audio.playback-underrun` warnings. Background throttling and context replacement reset comparisons.
- **Pause → Download Error Logs** captures an `audio.user-report` snapshot and exports the bounded local timeline, build ID, session ID and upload status. **Recover Audio** records the before/after state and preserves the floor, score and mute preference. `audio.context-rebuilt` / `audio.recovery-check` replace the premature `audio.recovered` claim.
- Pending audio resume requests have an eight-second diagnostic deadline, so an unresolved promise does not permanently prevent another resume attempt.
- Telemetry uploads have an eight-second abort deadline, retain failed batches for retry, keep stable sequence IDs, and report failures/dropped queue entries. Warnings/errors trigger a send attempt immediately. Runtime errors/rejections include bounded stack traces and an unambiguous `gameState` alongside audio context state.

Existing session starts, active play time, floor changes, performance, run/checkpoint/submission events and server request logs remain available. Data is pseudonymous technical telemetry; no microphone recording or gameplay video is captured. A static-only file cannot persist server logs.

## Validation and remaining acceptance

Build `fa08c054dee7`: the 180-sample two-tab run delivered about 200 seconds of playback per tab, with 0.144 / 0.1333 seconds of underruns, zero scheduler errors and peak owned-node counts of 523 / 482. No sustained cutout was observed. See `evidence/audio-2026-09-09.json` for the completed validation summary. Reproduction probes and screenshots are local ignored artifacts under `artifacts/audio-2026-09-09/`.

Tests cover device-counter detection independent of scheduler health, stalled output timestamps, missing/restricted APIs, background/context-change exclusions, all-source disposal, preservation of shared buses, failed voice cleanup, timed-out upload retries, bounded queues, downloaded incident reports, pause keyboard navigation, floor-preserving audio recovery and hosted telemetry persistence. A longer two-tab Level 2 soak includes firing, with device counters retained independently of test pass/fail. Floor 3 regression checks cover a complete music loop, interruption and injected scheduler failure. Offline synthesis checks rendered all 44 instruments, all eight song previews and all 35 SFX cues without silent instruments/SFX or runtime errors. The classic build remains frozen.

The original user session has not been audibly revalidated after the fix. The user should open the new build, replay Level 2, and use Download Error Logs before Recover Audio if the issue recurs. Existing tabs continue to run their old loaded JavaScript until refreshed; refreshing resets that live run, so it is not done automatically.

## Operating the logs

```sh
npm run report:telemetry -- data/telemetry.jsonl --date 2026-09-09 --timezone Asia/Tokyo
npm run report:telemetry -- data/telemetry.jsonl --session SESSION_ID --json
npm run test:audio-health
npm run test:audio-incident -- http://127.0.0.1:4178/ /tmp/tablequest-audio-validation
```

Run the browser test against an isolated server/data directory, as in this investigation, to keep synthetic incidents out of player data. Retrieve Zo's private JSONL over SSH using the deployment guide; archive the active log and rotated `.1` file when preserving an incident. Do not publish raw player logs or fold local player data into the deployment archive.

Updated runtime archive: `artifacts/audio-2026-09-09/tablequest-runtime.tgz` (SHA-256 `bc0a598e4ca99521a1f4a08e4c250850635b0fd39f4999c8cdca035e0db6335e`). It contains only `dist/` and `server/`; validated HTML matches the local server. The earlier pre-audio archive remains available for rollback.
