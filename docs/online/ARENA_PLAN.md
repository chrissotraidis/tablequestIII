# Table Quest Arena: eight-player prototype plan

Status: **proposed design; multiplayer is not implemented or deployed.** Updated 2026-09-09. This plan supersedes the exploratory four-to-six-player and ten-player room suggestions in the earlier research. The prototype has one room and a hard limit of eight occupied/reserved player slots. It does not promise a delivery date or measured Zo capacity.

## Product decision

Build a separate first-person, five-minute free-for-all mode using Table Quest's existing modern art, tools, audio and environments. Players choose a name and staff appearance, enter a lobby, ready up, play, respawn, chat and see the match leaderboard. Preserve the campaign, its high scores and saved settings, and the frozen legacy games.

Use all six modern floors as the eventual Arena map pool: The Lobby, The Office, The Archives, The Showroom, The Factory and The Penthouse. First prove the complete loop on an adapted Penthouse, then release each additional map only after its own collision, spawn and eight-player playtest gates pass. The old-generation games are not part of this map conversion.

The first usable prototype includes two weapons: paintbrush and table leg, plus respawning paint, food and a table-leg pickup. The remaining existing weapons join during the map-pool milestone after projectile, splash and third-person weapon tests. Every player sees a first-person view; other players see a complete character body. A third-person camera mode is unnecessary.

## Scope and ownership

| Included | Deferred |
| --- | --- |
| One eight-slot room; create/join link; lobby roster and readiness | Multiple rooms, queues, matchmaking or more than eight slots |
| Five-minute free-for-all, respawns, kills/deaths standings | Teams, rounds with elimination, persistent skill ratings |
| Three equally sized staff presets, six suit-color presets, display names | Custom models/uploads, a character editor or cosmetic economy |
| Room-only text chat, local mute, host mute/kick | Voice, direct messages, accounts or global chat |
| Pitch-aware projectile combat against one body hitbox | Headshots, crouch, ragdolls, physics objects, hitscan rewind |
| Adaptations of every modern floor, approved one at a time | A campaign rewrite or importing entire legacy game engines |
| Server-authoritative health, pickups, movement constraints and results | Claims that guest sessions or the browser prevent all cheating |

The room host chooses an enabled map, starts the ready countdown and can mute/kick guests. The server, never the host browser, runs the match and decides hits and scores. Closing the host's browser cannot stop everyone else's game.

## Screens and interaction flow

Keep the current dark/brass menu styling, typography, button treatment and visible keyboard focus. Add an Arena entry only when the mode has a working backend and has passed its release gates. Keep prototype status visible in the Arena entry/lobby until public acceptance.

```text
MAIN MENU
  Existing campaign entries
  ARENA — 8 PLAYERS
       |
       v
ARENA ENTRY                                  [Back]
  Name [....................]
  Appearance [Guard] [Manager] [Executive]
  Suit color [six swatches with text labels]
  Rotating full-body preview + equipped brush
  [Create room]     [Join current room  3/8]
  or Room link/code [.............] [Join]
  Keyboard and mouse required

LOBBY — PENTHOUSE                  Room 4K7D2Q   [Copy invite]
  [map preview + name]             PLAYERS 3/8
  Host: [Map selector]             Hostname   Guard      Ready
                                  Guest One  Manager    Ready
  You [Change appearance]          You        Executive  Not ready
                                  + five open/reserved slots
  [Ready / Not ready]              Host: [Start match]
  Room chat ...
  [Message.................................] [Send]
  [Leave room]

COUNTDOWN
  Same lobby, inputs locked except chat / cancel-ready / leave
  PENTHOUSE — MATCH STARTS IN 3

MATCH
  Top center: 04:37     Top right: Your kills 2 | Leader 4
  Existing first-person tools, health, paint and crosshair
  Top left: up to four short kill-feed entries
  Tab: eight-slot standings overlay (kills, deaths, ping)
  Enter: room chat input; Escape: close chat/menu

DEAD
  Painted by Guest One — Respawn in 3
  Standings/chat available; fixed death view; no spectator camera

RESULTS
  PENTHOUSE — ROUND COMPLETE
  Rank  Name           Kills  Deaths
    1   Guest One         8       4
    2   You               6       5
  [Ready for next match]   [Leave room]
  Room chat
```

Entry uses a real body preview from the same renderer/models as gameplay. Disabled buttons say why: room full, host only, waiting for readiness, loading map or disconnected. Only accepted maps are selectable; no decorative unusable map controls. Invite copies the configured public Arena URL with an opaque room code. The code locates this room; it is not an authentication secret.

Name: trim and normalize whitespace, 1–20 Unicode code points, no control/bidi formatting characters. Render as text everywhere. Empty input becomes a generated guest name. Duplicate names receive a visible short suffix for that room. Store preferences locally; they are not verified identity. Lock name/appearance during a round and apply edits in the next lobby. Color choice is cosmetic and never changes hitboxes, visibility rules or damage.

Opening chat releases pointer lock and sends neutral movement/fire. Enter submits; Escape closes; a visible “Click to resume” restores pointer lock through a user gesture. Tab shows standings only during active play; forms and menus keep normal Tab navigation. An Escape menu never pauses the server. Hidden tabs send neutral input when possible; the server clears stale input independently.

## Room state rules

| State/event | Exact proposed behavior |
| --- | --- |
| No room | Create reserves the first slot, assigns the creator host, selects Penthouse and returns an invite. A concurrent create returns “A room is already open” and Join. |
| Waiting lobby | Up to eight slots including reconnect reservations. Minimum two connected, map-loaded, ready players. All connected players must be ready before host can start. |
| Start | Server checks readiness/capacity/map revision, then runs a three-second countdown. Joining, unreadying, a disconnect or host cancel returns to waiting. The joining player starts unready. |
| Active | Server starts one monotonic 300-second deadline. Joining does not reset it. No campaign enemies, table objectives, floor transitions or campaign score collection. |
| Mid-round join | If a slot is free, join at zero kills/deaths, load the map, then press “Join match.” Spawn after a three-second entry countdown. In the last ten seconds, remain on standings until the next lobby. A pending load occupies its slot for at most 30 seconds. |
| Death | One death event, one credited killer at most. Wait three seconds, then automatically respawn if connected and the round is still active. |
| Finish | At the deadline, stop accepting gameplay actions and freeze standings. Hits after that cutoff do not count. Clear projectiles; show results for at least ten seconds before next-match readiness/start is available. |
| Next match | Return to lobby with same room and preferences; everyone unready, scores reset only on the next match start. Host can select any accepted map. |
| Host leaves | Transfer host controls immediately to the oldest connected guest. A reconnecting old host does not reclaim them. If no connected guest remains, keep reservations until expiry, then dispose the room. |
| Server restarts | In-memory room and reconnect tokens are lost. Show “The Arena restarted. Return to the lobby.” Do not pretend the interrupted match completed or submit a result. |

If active player count drops below two, the existing clock keeps running and the HUD says “Waiting for another player.” New guests can fill free slots. Do not restart a five-minute match repeatedly when someone leaves. If all participants leave and reservations expire, discard the incomplete match. Initial results are session-only; there is no persistent Arena ranking and no write to campaign high scores.

### Disconnect and reconnect

Use an unpredictable, server-created reconnect token, held in this tab's session storage and sent in the WSS handshake message, never a URL. Reserve a disconnected slot for 15 seconds. Reconnecting with that token restores the same slot, scores, health/death state and latest full snapshot. Rotate the token on successful reconnect and allow one live connection per slot.

Clear held inputs after 250 ms without a fresh input command. Detect dead connections using heartbeats as well as socket close. During the reservation, an alive player's body remains stationary and vulnerable; if killed, it stays dead until reconnect. Explicit Leave immediately invalidates the reconnect token, but retains an alive body and its occupied slot for the same 15-second vulnerable grace. Release that slot when the body dies or the grace expires; an already dead player releases it immediately. This lingering body counts toward the hard eight-slot limit and cannot be replaced by a ninth player. If an alive body is removed at the grace deadline, count a forfeit death and credit its most recent enemy attacker only when damage occurred within the previous ten seconds. Do not double-count an already dead player. This prevents disconnecting from being an instant invulnerability escape.

Client retries at approximately 0.5, 1, 2 and 4 seconds while the grace window remains, then offers Return/Join again. Loading and deliberate menu time are not network failure, but inactivity longer than 60 seconds releases the slot after a visible warning; the same death/forfeit rules apply. No hidden-tab pause advantage.

## Match rules and tuning defaults

These are editable Arena constants, not changes to campaign balance.

| Rule | Initial value |
| --- | --- |
| Player body | Common capsule, radius 0.26, total standing height 0.90 units; same for every preset |
| Camera/movement | Reuse eye height 0.70, walk 3.7, sprint 5.6, acceleration 14 as starting values; one flat movement plane |
| Health | 100; no regeneration |
| Spawn kit | Paintbrush and 30 paint; pickup weapons lost on death |
| Death respawn | 3 seconds |
| Spawn protection | Up to 2 seconds; ends immediately on firing/melee; visible tint; no damage dealt while protected |
| Paint pickup | +14, cap 99; returns 10 seconds after collection |
| Food pickup | +25 health, cap 100; returns after 20 seconds |
| Weapon pickup | Grant weapon and select it; returns after 25 seconds |
| Duplicate weapon | +14 paint if below cap; otherwise do not consume pickup |
| Pickup reach | 0.8 units, with unobstructed short line of sight; prevent collection through walls |
| Paint/food placement | At least four paint and four food locations per accepted map; normally eight distributed weapon/pickup routes rather than a single rich corner |
| Projectile life | Maximum 2 seconds; server-owned spread; swept segment collision |
| Initial weapons | Brush: campaign starting damage/cooldown/cost (16 / 0.25 s / 1). Leg: 50 / 0.5 s / 0, short melee arc |
| Later tools | Nail gun, sprayer and roller use campaign constants as the initial tuning reference; test separately before enabling |

Remove jumping from the first prototype's Arena bindings and help text; keep campaign jumping intact. Pitch changes projectile direction, so looking up/down matches the shot. Use a single body capsule without headshot multipliers. Adapt world collision to actual Arena walls and prop heights; do not derive a hitbox from each cosmetic mesh.

Start with no player-to-player blocking: bodies cannot trap others in corridors. Weapons can hit other bodies. Melee tests reach, arc and wall/prop obstruction. Later roller splash must check obstruction, affect its owner, and produce one death credit per victim; its direct and splash components are one resolved attack. These decisions require focused tests before that weapon enters the pool.

Every opponent kill is +1 kill; each death is +1 death. Self-damage deaths count only as a death. Highest kills wins; fewer deaths breaks a kill tie. If both remain equal, declare a joint rank/win; alphabetical name/slot ordering stabilizes display but never decides the winner. No sudden death beyond five minutes, assists, money/table scores or survival bonuses. Record a death atomically so simultaneous projectiles cannot award duplicate kills. Resolve collision events in server tick/order; document trade-kills as allowed when both accepted shots are already in flight.

Spawn from at least 12 authored candidate points per map. Exclude blocked locations and positions within four units of an alive player when another option exists, prefer positions outside immediate enemy sight, then choose among the safest few. If all are exposed, use the safest valid point with the same bounded protection. Spawn points and pickups are map data, not inferred from the campaign's one `S` marker. Verify candidates after furniture placement.

## Adapt every existing floor

References point into the current [level definitions](../../src/levels.js); coordinates below describe authored map bands/zones, not already validated spawn coordinates. Record actual Arena override cells and spawn positions during each conversion. Keep each floor's visual identity, wall/floor materials, dressing and recognizable layout; targeted extra connections are preferable to remaking the map.

| Map and source | Retain | Required Arena adaptation and acceptance focus |
| --- | --- | --- |
| The Penthouse, `src/levels.js:288–340` | Marble/gold identity, four central cover blocks, executive garden corners | First map. Remove boss, gold/table objectives and enemies. Permanently open the existing antechamber door and add two side passages through that dividing wall so the gallery is not a one-door refuge. Distribute starts between gallery and main floor behind cover, avoiding direct spawn-to-spawn aim lines. Separate health and leg locations. Test eight players circulating without one room becoming a safe camping pocket. |
| The Lobby, `src/levels.js:15–61` | Reception booths, staff lounge/breakroom, security band | Open doors; retain booth cover. Add a second opening to each enclosed booth/side room used for pickups, and a central crossing through the long office-divider band if necessary for three useful circulation routes. Convert elevator/gate cells into ordinary bounded floor, never a level exit. Verify furniture leaves clear paths around reception and no spawn sees the complete width of the entry. |
| The Office, `src/levels.js:65–115` | Cubicle field, upper meeting/manager rooms, lower break/supply room | Open doors and add a rear exit to each upper room instead of one-entry weapon camps. Keep left/right routes around the lower room and add one north-facing connection to it. Thin only cubicle props that leave single-file traps. Place brush ammo and health across both office halves; do not make the original supply room the only upgraded-weapon location. |
| The Archives, `src/levels.js:119–175` | Vaults, shelf aisles, reading rooms, basement palette | Preserve shelf identity but break the longest stacks with cross-aisles. Open vault doors and add a second exit to occupied vault pockets. Add a central opening in long horizontal separator bands so players need not travel to the far ends each time. Raise minimum player readability without replacing the atmosphere. Test dead ends, dark suit contrast and full collision reachability after the existing ragged rows are padded. |
| The Showroom, `src/levels.js:179–230` | Display pods, flat-pack warehouse, vignette gallery, checkout | Give each used display pod a second opening. Open doors in the warehouse/checkout separators and add a center circulation opening where the current two end routes create bottlenecks. Give the middle vertical warehouse divide another crossing. Retain flat-pack cover but clear two usable lanes through it. Avoid long unobstructed checkout spawn sightlines. |
| The Factory, `src/levels.js:234–284` | Receiving/shipping docks, machinery, paint stock, lumber | Current horizontal bands mainly connect through two edge doors: open those and add a central passage to each major band. Use machinery/lumber as static cover while clearing edge and central lanes. Redistribute the very dense campaign ammo/food into the common Arena pickup budget. Spread upgraded tools rather than retaining one central sprayer monopoly. Verify map travel/encounter frequency with four and eight participants. |

Common conversion: clone modern level data into Arena overrides, remove campaign entities, permanently open doors, remove locked gate semantics, disable breakable furniture, and freeze deterministic prop placement in a versioned collision manifest. Wall openings in the override must appear identically in rendered geometry and the manifest. Keep harmless dressing/audio local. No runtime campaign map mutation.

The map selector eventually contains all six names. It shows only accepted maps as joinable during staged development. Host selects one map per match; no voting or automatic rotation is required. Each map must meet the same eight-player cap and validation bar; “all maps planned” does not mean “all maps playable.”

## Networking implementation decision

Use **Node.js plus `ws` on the server, native browser WebSocket on the client, and explicit small JSON messages**. Pin a current compatible `ws` release when implementation starts. The single room has no need for a framework-level matchmaker or distributed state service. This is one bounded room implementation, not a generic networking engine. `ws` documents integration with an HTTP server, heartbeat handling and payload controls; the browser uses its built-in client. [Implementation sources](ARENA_RESEARCH.md#primary-source-review)

One separately registered Zo HTTP service serves the Arena page/build and `/arena/ws` from the same origin. The campaign continues through its own existing service. Both may read a versioned release artifact, but Arena state/process crashes cannot terminate the campaign process. Add a normal cross-link between them when live. Do not force a new reverse proxy into the first deployment simply to share an origin. Configure allowed origins and exact public URLs at deployment.

### Shared simulation boundary

Proposed new modules, names illustrative until implementation:

```text
shared/arena/rules.js       Arena constants, item and weapon rules
shared/arena/maps.js        Converted level data + fixed collision manifests
shared/arena/movement.js    Pure fixed-step movement/collision for prediction
shared/arena/protocol.js    Message validation, limits and protocol version
server/arena-server.mjs     HTTP/WSS, guest slots, room lifecycle, authoritative loop
src/arena/client.js         Connection, predicted local state, interpolation
src/arena/scene.js          Render maps, remote bodies/tools, local viewmodel/FX
src/arena/ui.js             Entry, lobby, HUD, chat, results and error states
```

Keep room/combat logic together initially; split files only when their responsibilities justify it. Shared modules use plain numeric data and have no DOM, storage, audio, Three scene, renderer or mesh dependency. Import campaign data/constants read-only where safe. Reuse scene/assets through small adapters; do not rewrite the working campaign `Game` or run it in a headless browser on Zo.

Server state contains all players, velocities, health/ammo, active tools, cooldowns, projectile IDs/owners, pickup timers, spawn protection, readiness, deadlines and results. It owns random spread and spawn choice. Rendering contains character poses, camera feel, particles, splats and sound; these never decide damage or score.

### Protocol outline

Every message has a versioned type; room/match IDs prevent stale messages from the previous match taking effect. Input sequence numbers are monotonic per connection. State includes `lastProcessedSeq` per player for reconciliation. Handshake validates protocol version and the map/collision hash; mismatch shows Reload and never starts a mixed-version match.

| Direction/type | Core payload | Authority/limits |
| --- | --- | --- |
| Client `hello` | protocolVersion, buildId, roomCode, optional reconnectToken, name, presetId, colorId | Allowlisted cosmetic IDs; token is not logged |
| Client `create` / `join` | desired action, roomCode | Only one room; max eight total reserved/occupied slots |
| Client `loaded` / `ready` | mapHash, ready boolean | Server must verify map revision before readiness |
| Client `selectMap` / `start` | mapId, expected room revision | Host only, waiting state only, accepted maps only |
| Client `input` | matchId, seq, moveX/moveY, yaw/pitch, sprint, fire, melee, weaponId | No client position, hit, health or score fields; finite values; normalized movement; server cooldown/ammo checks |
| Client `chat` / `moderate` | text, or target slot/action | Plain text; permission/rate checks; no arbitrary HTML |
| Server `welcome` / `room` | slotId, token, roster, host, map/hash, state, countdown/round times | Full initial authoritative state; reconnect restores existing slot |
| Server `snapshot` | tick, serverTime, matchId, player numeric state/acks, pickups, active projectiles | Fifteen times per second; complete bounded state makes recovery simple |
| Server `events` | eventId, fire/impact/death/respawn/pickup/chat events | Deduplicated event IDs; visuals can be skipped without corrupting authoritative state |
| Server `result` / `error` | frozen standings or stable reason code and visitor copy | Full room, expired token, mismatch, restart and unavailable are explicit |

Fixed 30 Hz server movement/combat, 30 input commands/second and 15 snapshots/second are initial constants. JSON is easier to inspect at eight players; measure encoded size before adding a binary codec. Round numeric snapshot values to agreed precision and replay quantized inputs identically in prediction.

Client predicts only its own movement, then applies authoritative position/velocity and replays unacknowledged commands. Send/consume one bounded input per player per simulation step; extra packets cannot buy extra movement or faster firing. Maintain a bounded sequence queue with up to 250 ms of commands, discard excess/stale commands with a resync, and never trust client-provided delta time. Clear action edges after consumption. Reconcile at snapshot rate; interpolate remote players about 100 ms behind current server time. Cap extrapolation at 100 ms, then hold position and show connection trouble. Local firing animation can be immediate, but confirmed damage/hit markers follow the server.

At 18 units/second, a nail travels 0.6 units each 30 Hz tick. Use swept projectile segments against Arena walls/prop volumes/body capsules, choose the first collision, and bound spawn offsets so shots cannot originate across a wall. Initial projectile combat uses present authoritative state, not client-reported historical hits. Test venue RTT before deciding whether a later bounded lag-compensation feature is warranted.

## Capacity and service limits

| Limit | Proposed initial value |
| --- | --- |
| Rooms / player slots | 1 / 8, including reconnect/loading reservations |
| Pending pre-join sockets | At most 16, each handshake expires after 5 seconds |
| Active projectiles | At most 24 per player, 192 room total, life at most 2 seconds |
| Inbound payload | 2 KiB per message; gameplay input schema also capped at 256 bytes |
| Input rate | 30 Hz expected; token bucket 60/second with burst 30; simulation still consumes at most its fixed-step budget |
| Lobby/control rate | 5/second per guest with burst 10; separate from input budget |
| Chat | 160 code points, burst 3 then 1 message/second; last 50 messages in memory |
| Snapshot | 32 KiB maximum; enforce entity/field caps before serialization |
| Per-socket send queue | Stop enqueueing replaceable snapshots above 64 KiB; disconnect if over 256 KiB or stalled for 2 seconds |
| Reconnect/input history | 15-second slot grace / at most 250 ms pending input |
| Persistent match storage | None in prototype; bounded aggregate technical logs only |

Disable WebSocket message compression initially. Never resend all cosmetic splats or body meshes. Snapshot queue coalescing can replace only data not yet handed to the socket; bytes already queued require waiting or disconnecting. Heartbeats must distinguish a live but slow client from a broken connection. Use per-session/socket limits; eight conference guests may share one NAT address, so do not assign the eight-slot budget per IP or trust arbitrary forwarded headers.

For an eight-player room, 64 bytes per player state × 8 players × 8 recipients × 15 snapshots/sec = **61,440 bytes/sec, about 0.49 Mbps**, before projectile state/events/transport. If JSON costs 160 bytes per player record, this becomes **153,600 bytes/sec, about 1.23 Mbps**. These are illustrative inputs, not packet captures. Reserve roughly 5 Mbps for the prototype test envelope and measure real outbound traffic while everyone fires; cold asset downloads are additional and can dominate.

Start with a proposed Arena process memory ceiling of 512 MiB and at most one CPU core of time, if Zo exposes enforceable resource controls. Confirm actual plan, available memory/CPU, region, service count, restarts and competing workloads first. These ceilings contain damage; they are not proof the game fits or that the host cannot be affected. A separate process does not isolate bandwidth or shared disk. If quotas are unavailable, use the application caps, monitor RSS/event-loop delay, stop admissions under sustained load, and keep Arena private until mixed-workload tests pass. Do not claim cgroup isolation unless it is verified on this Zo.

## Milestones and acceptance gates

Each milestone records exact build/map hash, environment, participant/bot count, test duration and evidence. A build passing is not a multiplayer playtest.

| Milestone | Deliverable | Required evidence before progressing |
| --- | --- | --- |
| A0 — transport/host proof | Separate registered Zo service and tiny WSS test, no public Arena entry | Anonymous HTTPS/WSS works from two external networks; 30-minute socket with heartbeats; controlled service restart; actual RTT/jitter and resource baseline recorded; campaign remains available. |
| A1 — two-player core | Penthouse conversion, remote staff bodies, shared movement, brush/leg combat and respawn | Two real browser clients move/aim/fire; same wall/prop collision; no through-wall pickups or shots; server rejects spoofed moves/health/kills; duplicate hits never double-score; campaign regression checks pass. |
| A2 — complete eight-slot loop | Name/appearance, lobby/host/ready/countdown, five-minute match, pickups, standings/chat/results | Eight real clients complete at least two rounds. Ninth player gets Room full. Mid-round join, grace reconnect, host departure, shared tie, AFK, typing, Tab/Escape, pointer-lock loss and interrupted-server states replay correctly. |
| A3 — VPS acceptance | Fixed eight-player private prototype on actual Zo under mixed load | 60-minute eight-client moving/shooting soak; p95 simulation work under 10 ms in the 33.3 ms budget; p99 under 20 ms; no accumulating catch-up or send queues. RSS returns to a stable range after round resets and stays below the agreed ceiling. Concurrent campaign cold downloads and score traffic remain healthy; existing Zo service latency stays within agreed baseline tolerance (initial target less than 20% p95 regression). |
| A4 — all-floor pool | All six adaptations and remaining weapons | Each map passes reachability/spawn/pickup/collision checks and two five-minute eight-player rounds. Each added weapon passes fire rate/ammo/obstruction/splash/self-damage and remote appearance tests. Recheck frame time with seven visible opponents and heavy effects on a representative laptop. |
| A5 — optional public opening | Enable Arena entry for the verified endpoint | Human playtest at expected venue/network; restart/full/error copy verified; host moderation works; campaign and its leaderboard still pass. Publish eight-player scope and measured limits only. |

Network tests must include 50, 100 and 200 ms RTT, jitter, 1–3% loss, a stalled receiver and abrupt disconnect. Real network shaping should include TCP retransmission effects; merely delaying JavaScript callbacks is not equivalent. At the intended venue target, at least four human players should confirm movement and hit feedback feel usable; high latency is allowed to fail this gate. Socket bots prove server load, not browser frame rate or competitive fairness. Node provides event-loop delay instrumentation for the server measurements. [Node performance APIs](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)

Stop deployment progression if the Zo proxy drops active connections, actual venue RTT is unsuitable, resource ceilings cannot be respected, or campaign/personal services regress. Keep the single-player conference release independent. This planning pass does not add Arena runtime code, create a live room or establish a measured capacity result.
