# Table Quest Arena feasibility brief

> Scope note — this brief captured the earlier Penthouse-first feasibility pass. The current implementation target supersedes that map choice: use the adapted Office, eight concurrent players, all five existing weapons as respawning pickups, five-minute free-for-all rounds, colored staff presets, standings and rematch. Zo deployment, public WSS and sustained eight-browser capacity remain live gates.

Reviewed 2026-09-11. This is a research and implementation decision artifact. It does not claim that multiplayer is implemented, deployed, or capacity-tested.

## Decision

Proceed with a private browser beta, but reduce the first build to a two-player, one-room, one-map slice. Keep the server architecture capable of the existing eight-slot target so the work is not thrown away, but do not advertise eight players until the actual eight-client gates pass.

The first beta should be:

- one adapted Penthouse arena;
- one room with a hard eight-slot ceiling, initially tested with two players;
- five-minute free-for-all rounds, three-second respawn, kills/deaths standings and rematch;
- one staff body preset, display names and cosmetic suit color;
- paintbrush combat only, with respawning paint and food;
- private invite/link access, no accounts, no persistent ranking and no global chat;
- Node.js + `ws` on one supervised VPS/Zo service, native browser WebSocket, small JSON messages;
- the campaign and scoreboard kept in their existing process/data boundary.

This is a go for implementation work and a no-go for public multiplayer claims or a VPS capacity claim today.

## What exists in the repository

The repository already has a proposed eight-player plan, but no Arena runtime:

| Evidence | Consequence |
| --- | --- |
| Six modern floors are defined in `src/levels.js` | Reuse the visual identity, but do not treat campaign layouts as balanced Arena maps. |
| Procedural guard/manager/executive bodies exist in `src/characters.js` | A first remote-player body can reuse existing meshes; custom 3D asset production is not a beta blocker. |
| Animation, weapons, pickups and effects exist in `src/enemyanim.js` and `src/models.js` | Presentation adapters can reuse the visual language, but remote tools and player-controlled aim still need work. |
| Movement, collision, combat, HUD, audio and browser input are coupled inside `src/game.js` and `src/world.js` | Do not run the campaign `Game` class on the server. Extract a small numeric Arena simulation. |
| `server/scoreboard-server.mjs` is an HTTP/JSON scoreboard service | It proves a useful deployment pattern, not a multiplayer transport or room server. |
| `package.json` has no WebSocket dependency and no Arena client/server modules | Networking, rooms, authority, prediction, reconciliation, reconnect and abuse limits are new implementation. |
| Current campaign tests pass | This is a healthy baseline only; it says nothing about Arena behavior. |

The working tree had pre-existing edits in `dist/index.html` and `src/config.js`. They were preserved. The research pass added only this report.

## The beta experience

The simplest useful product flow is:

```text
Arena entry → choose name → create/join private room → lobby
      → both players ready → 3-second countdown
      → five-minute Penthouse fight → respawn / standings
      → frozen results → rematch or leave
```

The lobby needs only a room code/link, roster, ready state, map name, connection status and a leave button. A live-game browser can be added after the first loop works; for the private beta, showing the current room and its occupancy is sufficient. Chat should remain deferred until room lifecycle and combat are stable.

The match should display a timer, health, paint, local kills/deaths, a short kill feed and a standings overlay. The server owns the timer, damage, pickup collection, respawn, score and match deadline. The browser owns camera feel, animation, particles, audio and presentation smoothing.

## Recommended technical shape

### Server and transport

Use one supervised Node process with an HTTP page/build endpoint and `/arena/ws` on the same public origin. Use native browser WebSocket on the client and `ws` on the server. At this size, explicit JSON is easier to inspect and debug than a binary codec or a networking framework. `ws` exposes payload limits, fragment limits, heartbeat events and compression controls; its documentation warns that per-message compression adds CPU and memory overhead, so compression should be disabled initially ([`ws` README](https://github.com/websockets/ws/blob/master/README.md), [`ws` API](https://github.com/websockets/ws/blob/master/doc/ws.md)).

The server should run a monotonic 30 Hz fixed simulation and broadcast bounded snapshots at 15 Hz. Clients send at most one bounded input command per simulation step. The client predicts only its own movement, acknowledges authoritative state by input sequence, replays a bounded unacknowledged queue and interpolates remote bodies about 100 ms behind server time. A framework can be considered later, but a room library does not remove the need to define the simulation contract.

The browser WebSocket API has no automatic receive backpressure. `bufferedAmount` reports queued outgoing bytes, not whether the browser is consuming incoming state ([MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), [MDN `bufferedAmount`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)). Therefore cap both generated messages and per-socket queues, coalesce replaceable snapshots, and disconnect stalled clients on a bounded rule.

### Proposed module boundary

```text
shared/arena/rules.js       constants, weapons, pickup and match rules
shared/arena/maps.js        Penthouse Arena override + collision manifest
shared/arena/movement.js    pure fixed-step movement/collision
shared/arena/protocol.js    validation, limits and protocol version
server/arena-server.mjs     room lifecycle, WSS and authoritative loop
src/arena/client.js         connection, prediction and interpolation
src/arena/scene.js          map, remote bodies, tools and local FX
src/arena/ui.js             entry, lobby, HUD, standings and results
```

These shared modules must contain plain numeric data only: no DOM, Three.js scene, renderer, audio, storage or browser input. Do not rewrite the working campaign or put a headless browser on the VPS.

### Input and state contract

Client input may contain only `matchId`, monotonic `seq`, normalized movement, yaw/pitch and bounded action edges such as fire or melee. It must not contain client position, health, damage, score or claimed hit results. The server validates finite values, protocol version, room state, rate and freshness.

Before coding, explicitly define:

1. Whether movement is held for up to 250 ms without a fresh command and how held fire differs from one-shot actions.
2. Duplicate, gap, stale and implausibly large sequence handling, including the acknowledgement/reset point after rejected commands.
3. A monotonic accumulator with bounded catch-up; a long server stall must resynchronize or interrupt rather than replay unlimited ticks.
4. Exact deadline ordering: the round cutoff is checked before late inputs, projectiles or damage can change results.
5. Integer tick scheduling for cooldowns. A 0.25 second brush cooldown is 7.5 ticks at 30 Hz and needs an explicit rounding rule.

The initial server state should include player transform/velocity, health, paint, weapon, cooldowns, input acknowledgement, projectile IDs/owners, pickup timers, spawn protection, room state, match deadline and frozen results. A complete bounded snapshot is preferable to clever delta recovery for the first room.

## Arena map and 3D asset decision

Penthouse remains the correct first map because it has a central fight floor and visible cover. It is not Arena-ready merely because it renders: the existing gallery/antechamber doorway can create a refuge, and the campaign map has one start marker rather than authored multiplayer spawn points.

Create a versioned Arena manifest after conversion, not by mutating the campaign map at runtime. It must contain:

- frozen wall and furniture collision volumes;
- at least 12 authored candidate spawn points;
- four or more paint locations and four or more food locations;
- valid routes for a common radius-0.26 player capsule;
- map revision/hash shared by server and clients;
- no campaign enemies, objectives, locked exits or destructible furniture.

The manifest must be the source for both server collision and rendered Arena geometry. Existing campaign validation does not prove capsule clearance after Arena conversion.

Existing staff models are enough for the first beta. Start with one preset and a separate world-space tool attachment for remote players. The current first-person viewmodels are camera-attached, and existing enemy animation targets AI state rather than networked yaw/pitch. A custom set of new 3D characters can improve the later public presentation, but it should not block the first two-player acceptance loop. No generated or game-derived asset should be published without checking its rights and source boundary.

## VPS feasibility

A VPS does not need one game process or GPU per player. The visitors render the map, meshes, particles and audio; the VPS runs numeric room state and distributes small messages. That makes one small room technically plausible, but it is an architectural inference, not a capacity result.

Zo's official service guide lists custom Linux backends, public HTTP services, configured `PORT` values and WebSocket servers. It also says registered services are restarted after Zo restarts ([Zo Services](https://www.zo.computer/guide/services)). The guide does not establish this account's CPU contention, memory ceiling, proxy timeout, public WSS behavior, endpoint location, network quality or enforceable isolation.

Use one separately registered Arena service and keep campaign/scoreboard traffic independent. Do not start a second writer against campaign data, do not use Redis or a distributed matchmaker for the first room, and do not claim that separate processes prevent whole-host restarts or resource contention.

Measure Node event-loop delay and utilization, simulation tick duration, RSS, encoded snapshot size, outbound bytes, send-queue depth, admission failures and campaign request latency. Node exposes event-loop delay histograms through `perf_hooks` ([Node performance APIs](https://nodejs.org/api/perf_hooks.html)). A healthy average CPU percentage is not enough.

## Limits for the first implementation

| Limit | Initial value |
| --- | ---: |
| Rooms / reserved slots | 1 / 8 |
| Initial beta participants | 2 |
| Pending handshakes | 16, five-second expiry |
| Simulation / snapshots | 30 Hz / 15 Hz |
| Input | 30 Hz expected, 60/sec token bucket, 2 KiB message cap |
| Chat | deferred; if enabled later, 160 code points and 1/sec after burst |
| Active projectiles | 24/player, 192 room total, two-second life |
| Snapshot | 32 KiB hard ceiling, but measure normal and worst-case encoded sizes |
| Send queue | replaceable snapshots stop above 64 KiB; disconnect above 256 KiB or bounded stall |
| Reconnect | defer automatic recovery in the first beta or use a 15-second tokenized reservation |

The 32 KiB snapshot value is a safety ceiling, not a performance expectation. At eight recipients and 15 snapshots/second, an actual 32 KiB snapshot would be about 31.5 Mbps before framing, TLS, events or assets. If eight-player snapshots do not fit comfortably in the measured network budget, reduce redundant fields and projectile state before reaching for binary encoding.

## Acceptance gates

### Local gates before a live service

1. Server and browser use the same manifest hash; all spawn/pickup locations are reachable with the Arena capsule.
2. Identical command replay at 30/60/144 render FPS produces the same fixed-step numeric result within the chosen tolerance.
3. Spoofed position/health/score, invalid numbers, duplicates and bursts cannot create movement, shots or score.
4. Swept shots stop at the first wall/prop/body collision; muzzle offsets cannot bypass cover; floor/ceiling intersections terminate projectiles.
5. Simultaneous lethal hits produce one death and at most one kill; contested pickups grant once and respawn at the server deadline.
6. Countdown, five-minute cutoff, three-second respawn and rematch are deterministic within one server tick.
7. Hidden tab/menu input clears within 250 ms and does not pause the match.
8. A server restart produces an explicit interrupted-match state, never a completed result.
9. Two foreground browsers complete two rounds with correct remote facing, occluded tools, death/respawn pose and no duplicate fire feedback.

### Live/VPS gates before saying “eight-player”

- WSS remains connected longer than one complete match, including heartbeat and idle lobby time.
- Eight real clients complete two rounds; a ninth admission fails, including reserved slots.
- A slow or frozen browser is bounded and removed without harming the other seven.
- Malformed traffic, repeated joins, 17 pending handshakes and shared-NAT clients remain within limits.
- 50/100/200 ms RTT, jitter and 1–3% loss do not break authority or recovery; human playability is assessed separately from packet success.
- Simulation p95 is below 10 ms and p99 below 20 ms in the agreed soak; queues, RSS and event-loop delay stay bounded.
- A 60-minute mixed-load soak does not regress campaign page/API latency by more than the agreed initial 20% budget.
- Zo service restart reports interruption honestly and the campaign/scoreboard remain healthy.

## Build sequence after alignment

1. Add the shared rules, protocol and Penthouse manifest without touching campaign behavior.
2. Add a Node Arena server with a deterministic two-player room, local WebSocket test clients and metrics.
3. Add browser entry/lobby/match/results UI using the existing dark/brass system.
4. Add the remote staff body/tool adapter and local movement prediction/interpolation.
5. Run the local security/lifecycle/collision tests, then two-browser playtests.
6. Deploy the exact reviewed artifact to a separate supervised service and perform the public-endpoint rehearsal.
7. Only then expand to table-leg combat, chat, extra body presets and eight-client testing.

This sequence can start today. It does not support a truthful “public eight-player Arena is live” claim until the live gates above pass.

## Sources

1. Repository: `docs/online/ARENA_RESEARCH.md`, `docs/online/ARENA_PLAN.md`, `src/levels.js`, `src/game.js`, `src/world.js`, `src/characters.js`, `src/enemyanim.js`, `src/models.js`, `server/scoreboard-server.mjs`, `package.json`.
2. [`ws` README](https://github.com/websockets/ws/blob/master/README.md), WebSocket transport, heartbeat and compression behavior.
3. [`ws` API reference](https://github.com/websockets/ws/blob/master/doc/ws.md), payload and fragment limits.
4. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) and [`bufferedAmount`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount), browser buffering/backpressure boundary.
5. [Colyseus client prediction and reconciliation](https://docs.colyseus.io/netcode/client-prediction), fixed-step prediction model used as a reference, not a selected dependency.
6. [Node.js performance APIs](https://nodejs.org/api/perf_hooks.html), event-loop delay instrumentation.
7. [Zo Services](https://www.zo.computer/guide/services), supported service modes, ports, WebSockets and restart behavior.
