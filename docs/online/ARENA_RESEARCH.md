# Arena research and implementation rationale

Reviewed 2026-09-09. Research only. The current decision is the [eight-player prototype plan](ARENA_PLAN.md); earlier exploratory 4–6 or 10-player suggestions are superseded. No multiplayer has been built or benchmarked. Technical sources were checked again for this planning round.

## Feasibility finding

An eight-player Table Quest Arena is a reasonable single-VPS prototype target. Rendering, textures, character meshes, audio and most visual effects run on visitors' computers. The server needs a small simulation and message distribution, not one GPU/game instance per player. This is an architectural inference from the repository and proposed protocol, not a performance measurement or guarantee about the user's personal Zo.

Ten to thirty people connecting is not inherently enough to crash a VPS. Work per connection, snapshot size/rate, projectile limits, asset downloads, the host's real allocation and its other workloads determine the effect. Thirty players in one room also have different map/readability and bandwidth costs from thirty across several rooms. The current plan deliberately fixes eight slots and one room; expansion needs a separate decision.

## Repository evidence

| Finding | Source pointer | What it means |
| --- | --- | --- |
| Six modern floors with distinct dressing/materials and campaign entities | `src/levels.js:12–344` | Reuse all six as separate Arena variants, without mutating campaign maps. |
| Modern staff bodies already exist | `src/characters.js:88–221` | Build presets from the guard/manager/executive rigs; remote bodies are not a from-scratch art project. |
| Limbs, aim, fire, flinch and death already animate | `src/enemyanim.js:1–28` | Adapt animation inputs to network state; retain the existing visual language. |
| Existing health, paint and weapon pickup models | `src/models.js:160–279` | Reuse meshes; server respawn/arbitration logic is new. |
| First-person weapons are camera-attached | `src/game.js:116–160`; `src/viewmodels.js` | Preserve local presentation; create separate small world-space tool attachments for opponents. Enemy tools are not the same as all player tools. |
| Simulation and presentation are tightly mixed | `src/game.js:4–32,50–82,359–377`; `src/world.js:72–99` | Extract numeric Arena movement/collision/state; do not run the browser `Game` class on Zo or rewrite the campaign. |
| Existing planar movement and circle/grid collisions | `src/game.js:401–425`; `src/world.js:815–845` | Useful reference for shared prediction movement, but not already a network-authoritative module. |
| Projectiles ignore look pitch | `src/game.js:508–521` | Current player shots move only in the floor plane with fixed initial height. Pitch-aware Arena shots are a real change confined to Arena. |
| Body hit checks ignore vertical separation | `src/game.js:888–898` | Use a common capsule for Arena; no claims that existing combat is Counter-Strike-equivalent. |
| Projectile collision checks next cell/position | `src/game.js:848–866` | Use swept segments at the proposed fixed timestep. At 18 units/sec, a 30 Hz step spans 0.6 units. |
| Pickups are consumed permanently for one player | `src/game.js:1299–1379` | Add item IDs, contested collection order and server respawn deadlines. |
| Doors, destructible furniture and seeded dressing affect collision | `src/world.js:397–413,422–538,889–923` | Freeze Arena furniture, open doors, and derive rendering and a common collision manifest from the same versioned map. |
| Hidden browser tabs pause campaign | `src/main.js:1188–1191` | Arena needs neutral input/AFK rules; individual clients cannot pause the server. |
| No multiplayer dependency or socket client | `package.json`; searches of `src/` and `server/` | Networking, rooms, prediction, reconciliation, authoritative damage and reconnection are new work. |

Line pointers describe the reviewed source and may shift with later edits. They are navigation evidence, not automated proof of the proposed feature.

## Primary-source review

**Transport choice: Node `ws` with the native browser WebSocket API.** For one capped room, explicit JSON messages keep dependencies and operations small. The library provides the socket transport, not game-state authority, prediction or reconnect semantics; those bounded responsibilities are specified in the plan. Its maintainer documentation covers native browser clients, HTTP upgrades and ping/pong detection. It also warns that compression adds CPU and memory overhead, supporting the proposal to leave compression disabled initially. [ws README](https://github.com/websockets/ws/blob/master/README.md)

**Set strict payload limits rather than accepting defaults.** The server library exposes `maxPayload`, message/fragment controls and send-buffer state. Implementation should pin the selected release and confirm its API, use small inbound limits, handle socket errors, and cap outbound snapshots/queues. [ws API reference](https://github.com/websockets/ws/blob/master/doc/ws.md)

**A slow receiver can accumulate messages.** The browser's standard WebSocket API has no automatic backpressure. `bufferedAmount` reports queued outgoing bytes; it is not an incoming queue control. The plan caps both server send queues and generated data and stops sending stale snapshots before they pile up. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), [MDN bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)

**Prediction requires a consistent simulation step.** Current Colyseus documentation describes fixed-step prediction and reconciliation with acknowledged inputs. That is useful technical reference even though the plan does not adopt that framework. We need the same bounded numeric movement rules on server and client, a fixed step, sequence acknowledgement and replay; a room library alone would not make the current browser game authoritative. [Client prediction and reconciliation](https://docs.colyseus.io/netcode/client-prediction)

**Measure server scheduling, not only CPU percentage.** Node's performance APIs expose event-loop delay and utilization instrumentation. Pair that with per-tick duration, RSS, outbound bytes, queue depth and process/host measurements; a healthy average CPU figure can hide delayed simulation ticks. [Node performance APIs](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)

**Zo supports the proposed class of service.** Its official guide lists custom Linux backends and WebSocket servers, public HTTP services, a `PORT` setting and registered entrypoints. It says registered services return after Zo restarts, including periodic platform restarts. These facts support a registered HTTP/WSS service and explicit interrupted-match behavior. They do not establish this account's capacity, proxy timeout, latency or enforceable resource quotas. [Zo Services](https://www.zo.computer/guide/services)

No WebRTC mesh, raw browser TCP, Redis, distributed matchmaker or game-engine replacement is needed for this prototype. Browser WebSocket over the registered HTTPS service is the concrete choice. Loss and retransmission can still make WSS feel delayed; the network acceptance test must decide suitability on the real endpoint.

## Payload sizing: assumptions, not benchmarks

For comparable player-state broadcasting, assume 64 encoded bytes per player, 15 snapshots/second and every recipient receiving the whole room. Aggregate bytes/sec = room count × players per room squared × 64 × 15. This excludes projectiles, events, framing, TLS and first-load downloads.

| Scenario | Player-state payload/sec, server outbound | Per client |
| --- | ---: | ---: |
| Planned one room × eight | 61,440 B/s; 0.49 Mbps | 7,680 B/s |
| Exploratory one room × ten | 96,000 B/s; 0.77 Mbps | 9,600 B/s |
| Exploratory three rooms × ten | 288,000 B/s; 2.30 Mbps | 9,600 B/s |
| Exploratory one room × thirty | 864,000 B/s; 6.91 Mbps | 28,800 B/s |

If JSON player records actually take 160 bytes, multiply those figures by 2.5. The planned eight-player room then spends about 1.23 Mbps on player-state payload alone. A 40-byte input payload at 30 Hz for eight clients adds 9,600 B/s inbound; actual JSON commands may be larger. These equations explain why splitting rooms helps bandwidth, not that a particular VPS can sustain the population. Capture real encoded sizes and overhead during the soak.

Projectile flight can be displayed locally from server-created state/events; do not stream particles, character meshes or every paint decal. The complete bounded snapshots proposed for eight players are intentionally simpler than elaborate interest management. If their measured size is too large, first reduce redundant fields/precision and send projectile deltas before considering a new transport.

## Map and character conclusions

All modern floors are reusable visual environments, but none currently has a validated set of Arena spawn points, equal resource distribution or eight-player circulation. Penthouse is the fastest first adaptation because it already has a central fight floor and cover. The other five need targeted extra doorways/cross-aisles and redistributed pickups. The plan contains one adaptation row for every floor, including Archives readability and Factory's repeated two-door band bottlenecks.

The character concern is smaller than the networking concern: modern staff already have full bodies and animation pivots. Use those as presets with one common capsule and equal visual scale. Do not use the larger boss body as a competitive preset. Work remains for player-controlled aim/strafe poses, equipped world-space tools, name presentation and performance with seven opponents visible. A working mesh in single-player is not evidence that these networked views already work.

## Zo-specific unknowns to resolve before public Arena

1. Actual account plan, CPU allocation/contended time, RAM headroom, hosted-service availability and concurrent personal workloads.
2. Public WSS upgrade, heartbeat behavior, active/idle connection duration and interruption/restart behavior on the chosen proxy URL.
3. Server location and RTT/jitter/loss from the conference venue and representative remote guests; proxy routing may affect these.
4. Whether enforceable per-process/container CPU and memory limits exist inside this Zo environment. A separate process is not a complete resource sandbox.
5. Transfer rate during simultaneous cold downloads; static delivery and Arena traffic share the machine/network even with different processes.
6. Representative browser GPU/frame-time behavior with the actual Arena scene, avatars, projectiles and effects.

The proposed eight-player service must pass those checks while campaign scores and existing Zo services remain healthy. An unavailable or unsuitable Arena host does not block releasing the existing campaign, its social links or scoreboard.
