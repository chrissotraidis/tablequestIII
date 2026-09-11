# VPS scoreboard live reference

Prepared 11 September 2026. **This is the file to open when the scoreboard goes onto a VPS.** It is not a deployed service, not a public URL, and not a capacity result. Local tests already passed; the remaining gates are on the actual host.

Zo-specific placement and service registration stay in [ZO_DEPLOYMENT.md](ZO_DEPLOYMENT.md). This page is the persistence and ranking checklist that applies to any VPS, including Zo.

## What must be running

One Node process that serves `dist/` and same-origin `/api/*`:

```sh
node server/scoreboard-server.mjs
```

`dist/` and `server/` must be siblings. Runtime install needs no `node_modules` and no Vite. Do **not** use `npm run dev` or `npm run preview` on the VPS: preview serves the built game without the scoreboard API.

Keep exactly one writer. The JSON queue is process-local. Two overlapping processes on the same files can lose scores.

## Environment

Copy these into the supervisor or reverse-proxy service. The server does not load `.env` files by itself.

```sh
HOST=127.0.0.1
PORT=4176
TQ_DATA_FILE=/srv/tablequest-data/leaderboard.json
TQ_TELEMETRY_FILE=/srv/tablequest-data/telemetry.jsonl
TQ_TELEMETRY_MAX_BYTES=16777216
TQ_TELEMETRY_IP_SALT=
```

Those paths are examples. Confirm the actual disk. Data must live **outside** `dist/` and outside replaceable release directories. Leave `TQ_TELEMETRY_IP_SALT` empty unless there is a specific operational need; generate any salt on the server and do not commit it.

`HOST=127.0.0.1` is correct behind a reverse proxy. Use `0.0.0.0` only if Node itself is the public listener. Put public traffic on HTTPS. The browser client talks to `/api/scores`, `/api/runs` and `/api/telemetry` on the **same origin** as the page.

## Do not copy local data

Do not upload this checkout's `data/` folder, development scores, telemetry, browser saves, `.env` files, or `.git`. A new public board starts empty. Use a separate data directory for acceptance tests so synthetic names never become the public ranking.

## Worries

These are the failure modes that still matter after local tests.

| Risk | What goes wrong | What to do |
| --- | --- | --- |
| Bind address | Default `HOST=127.0.0.1` is unreachable if nothing proxies to it. | Proxy to localhost, or change bind only after checking the listener. |
| Split origin | HTML on a static host / CDN and API on another origin. | Serve `/` and `/api/*` from this one process, or proxy both on the public origin. Static-only hosting cannot collect global rankings. |
| Data inside the release | Updating `dist/` or unpacking a new runtime archive wipes scores. | Point `TQ_DATA_FILE` and `TQ_TELEMETRY_FILE` at a persistent volume. Backup that directory before every update. |
| Two writers | Second Node process, leftover Vite, or two releases writing the same JSON. | Stop the previous writer before starting the next. |
| Health vs frontend | `/api/health` can be 200 while `GET /` is missing. | Health checks storage write access, not `dist/index.html`. Fetch `/` separately. |
| Cold New Game | `POST /api/runs` is not retried. If it fails while the VPS is waking, that campaign cannot be submitted. | Keep the process up. If ranking is missing after New Game, start another New Game once health is 200. |
| Ambiguous submit | Browser times out after the server already saved. Retry can return "A valid unsubmitted New Game run is required". | The on-screen copy says to check the scoreboard first. Do that before retrying. |
| Shared proxy peer | Limits key on `socket.remoteAddress`, never unverified forwarded IPs. Many guests may share one peer. | Current budgets are 600 reads, 600 telemetry, 180 starts, 600 checkpoints, 180 submits per minute. Record 429s on the public URL; do not blindly trust `X-Forwarded-For`. |
| Corrupt board | Damaged `leaderboard.json` returns 503 and is left untouched. | Restore from the dated backup. Do not hand-edit a live file to "fix" it. |
| Casual ranking | Tokens block Floor Select and duplicate submits. They do not prove honest play. | Present it as a community board, not adjudication. |
| Telemetry rotation | 16 MiB active file plus one `.1` backup; rotation replaces the older backup. | Archive both files privately if older diagnostics are needed. |

Floor Select and retry-after-defeat are practice. Pause "Restart Floor" during a living New Game does not by itself end ranking; death does.

## Live gates

Run these on the **actual public URL**, not on this laptop. Local evidence from 11 September 2026: `npm run test:scoreboard`, `npm run test:leaderboard-client`, `npm run test:telemetry`, and an isolated packaged-server restart that kept a completed New Game row. That is not VPS acceptance.

1. From the host: `/api/health` returns 200 with `ok`, `persistence` and `telemetry` true. A missing score file is valid on first start.
2. From the host: `GET /` (or `HEAD /`) is 200 and is the built game. Confirm `/data/leaderboard.json` and `/server/scoreboard-server.mjs` are 404.
3. On a new public data file, `/api/scores` is empty.
4. From another network and an anonymous browser: HTTPS, main menu, Scoreboard, both social links, assets, controls. No host login once the service is public.
5. Against a **temporary** acceptance data directory: sign a New Game defeat and a completed campaign. A second browser sees progress first, then score. COMPLETE outranks reaching Floor 6. Floor Select stays off the board.
6. Restart only the game process. The accepted rows are still there. Deploy a second release directory, point it at the same acceptance data paths, restart, and check the board again.
7. Switch the stopped service to clean public data paths if acceptance scores were used. Recheck health, anonymous access, and an empty board. Do not erase a live board to get emptiness.

Generate a QR or public claim only after the final URL has passed those checks. API simulations and this repository's tests do not replace a real New Game through the hosted page.

## Update and recovery

Stop the one writer. Copy the persistent data directory to a dated private backup. Point the same service at the new release directory, keep the data environment, restart, then repeat health, `GET /`, and a public smoke. Keep the previous code release until the new one passes.

To roll back code, start the previous verified release with the current data. Restoring a data backup discards scores submitted afterward; preserve the current files first.

Stdout request logs are separate from `telemetry.jsonl`. Bound or archive them on the host. Pull private telemetry over SSH with the README VPS commands; there is no public download endpoint.

## Related

- Server: [`server/scoreboard-server.mjs`](../../server/scoreboard-server.mjs)
- Client: [`src/leaderboard.js`](../../src/leaderboard.js)
- Isolated tests: `npm run test:scoreboard`, `npm run test:leaderboard-client`
- Zo recipe: [ZO_DEPLOYMENT.md](ZO_DEPLOYMENT.md), [`deploy/zo.env.example`](../../deploy/zo.env.example)
- README VPS telemetry pull: [Daily play reports and incident logs on a VPS](../../README.md#daily-play-reports-and-incident-logs-on-a-vps)
