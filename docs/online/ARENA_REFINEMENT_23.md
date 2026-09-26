# Arena refinement 23 — multiplayer on real connections and VPS packaging

September 26, 2026. Audit and fix pass for playing Arena over the internet and hosting it on a VPS.

## What was wrong

Every existing test ran on localhost with zero delay, so these stayed hidden:

- **Own movement rubber-banded.** The client predicted every render frame while the server applied only the latest input once per 30 Hz tick; bunched packets overwrote inputs. Measured in a real browser: up to 27 cm correction on localhost, and a median of 11 cm (over half of samples above 10 cm) at 131 ms round trip with jitter.
- **Other staff stuttered.** Bodies snapped toward the newest 15 Hz snapshot with no buffer.
- **Dead connections held slots.** No heartbeat: a sleeping laptop stayed "connected, not ready" and blocked every countdown until TCP gave up.
- **Any blip dropped you to the lobby**, and any single disconnect cancelled the countdown for everyone.
- **The deploy recipe could not run Arena.** It shipped `dist server` and ran `scoreboard-server.mjs`; Arena also needs `shared/`, `src/levels.js` and `ws`.
- The 11.8 MB page was re-read and sent uncompressed with no revalidation; everyone defaulted to the same look, color and `GUEST` name; supplies sat on spawn points; spawns could face a wall.

## Changes

- Server queues every input and applies each at the fixed step the client predicted with (`takeTickInputs`); a backlog drains at two steps per tick, and click/key "taps" aim and fire without spending a movement step. The client predicts once per sent input and interpolates the camera between steps.
- Remote staff are drawn between two snapshots on an estimated server timeline, with a delay of one snapshot interval plus measured jitter (80–250 ms), eased in, and brief extrapolation instead of freezing on a late packet.
- 10 s WebSocket heartbeat; automatic reconnect with the saved token inside the 15 s grace period, returning straight to play; a disconnect keeps its ready state so one drop does not cancel the countdown; reloaded pages restart input sequences cleanly.
- Slow clients skip snapshots above 128 KB buffered and are dropped above 1 MB. Snapshots carry only live pickup state; positions come from the shared map.
- Server makes duplicate paint colors distinct and numbers duplicate names; eight floor supplies moved 2+ m off spawns (all reachable from every spawn); spawns face into the Office.
- All static files go through one handler: gzip once per file version, ETag revalidation (304), path checks. `/arena` redirects to `/arena/`.
- `npm run package:vps` builds a self-contained runtime archive with checksum and refuses a stale `dist/`. `deploy/tablequest.service` and `deploy/Caddyfile` plus [VPS_DEPLOY.md](VPS_DEPLOY.md) cover a plain VPS; Zo and scoreboard docs point at the same entry point.

## Evidence

- Browser probe (headless Chrome, auto-walk tour, one bot): localhost correction now 0 at every percentile (was up to 27 cm). Through a 40–100 ms each-way in-order jitter relay (115–174 ms round trip): median and p90 correction 0 (was 11/19 cm). The remaining maximum, 12.3 cm, is exactly one step while pushing into the bot; server player separation is not predicted, so that is a genuine physical disagreement and is smoothed on screen.
- Model test (`test_arena_presentation`): zero correction under jitter through the real server input path; remote staff frame error under 2 cm after warm-up (the old snap path froze and jumped 12–18 cm).
- `test_arena_connection`: half-open socket released by heartbeat, answering clients kept, countdown survives one disconnect, distinct colors/names, compressed pages.
- Full room (one client, seven bots): 0.7 ms server tick p95, 3.8 KB snapshots, about 0.5 Mbit/s per player and 3.6 Mbit/s out.
- Packaged runtime extracted to a clean folder served the game, Arena and scoreboard; main menu → Arena → two human browsers → live match passed through the jitter relay. Eight-browser smoke, all Arena/scoreboard/leaderboard/audio suites, classic frozen check, level validation and campaign sanity pass. The browser smoke's 8 s wait equalled the 8 s countdown (pre-existing); it now runs with a short countdown.

## Not verified

Public VPS deployment, real `wss://` through Caddy, two humans on different networks, and subjective feel. These need the actual host.
