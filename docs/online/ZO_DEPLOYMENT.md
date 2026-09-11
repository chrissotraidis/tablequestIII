# Deploy Table Quest on Zo Computer

Prepared September 9, 2026. **This is a deployment recipe, not a deployed service or a capacity result.** For the live-host scoreboard traps and restart gates, open [VPS_SCOREBOARD.md](VPS_SCOREBOARD.md). The personal Zo account, available resources, service configuration and public URL have not been inspected. No Zo service has been created or changed.

## What runs where

The browser downloads the game and runs its rendering and gameplay locally. One Node process on Zo serves `dist/` and the same-origin `/api/*` leaderboard and telemetry endpoints. Attendees open a normal HTTPS page; they do not need to download a ZIP or run a local server. Offline HTML playback and the shared online leaderboard are separate capabilities.

Use a registered **HTTP Service** for the existing server. Zo supports custom Node servers, injects the selected local port as `PORT`, and supervises registered entrypoints. It also restarts the computer periodically for updates/snapshots, including on paid plans. A command left running in a terminal is insufficient. [Zo Services](https://www.zo.computer/guide/services)

Keep this deployment to one Node process. The JSON write queue coordinates requests inside that process only. Two workers or overlapping releases writing the same leaderboard can lose data. There is no need for Docker, nginx, Redis or a framework migration for this deployment.

## Before transferring anything

1. Confirm the actual Zo plan, free disk/memory, existing service slots and competing workloads. The current advertised Basic plan includes always-on compute, 4 cores, 32 GB RAM and five services; the Free Trial can sleep and expires. These advertised figures are not measurements of this account. [Zo pricing](https://www.zo.computer/pricing)
2. Check the Node version on the build machine and Zo with `node --version`. Use Node **22.12 or newer in a supported release line** for this recipe. The repository currently has no root `engines` declaration; its locked Vite 8.0.16 build dependency requires `^20.19.0 || >=22.12.0`. The production server itself imports only Node built-ins. Record the exact tested Node version with the release.
3. Run the repository's build and appropriate checks locally. In particular, run `npm ci`, `npm run build`, and `npm run test:scoreboard`; complete browser checks against that generated build. Do not publish a stale `dist/` from a previous pass.
4. Record the source revision and any intentional uncommitted changes. The pre-Zo recovery tag is `codex/stable-before-zo-2026-09-09`, pointing to `2ebc6c753182192c9eb2940debe961ae465111e4`. Preserve that tag and the existing checkout.

## Package the runtime

From the repository root after validation:

```sh
tar -czf /tmp/tablequest-runtime.tgz dist server
tar -tzf /tmp/tablequest-runtime.tgz
shasum -a 256 /tmp/tablequest-runtime.tgz
```

Review the archive listing. It should contain only the generated public files and the Node server source. Runtime installation needs no `node_modules`, Vite dev server, package manager or build step on Zo. The server expects `dist/` and `server/` to be siblings.

**Do not copy the local `data/` folder**, development scores, telemetry, browser saves, `.env` files, credentials, `.git`, or the entire personal workspace. The public leaderboard starts empty on Zo. This also keeps private development telemetry out of the conference deployment.

Transfer the reviewed archive using the account's authenticated file-transfer mechanism. No hostname or credentials are supplied here. On Zo, compare the received archive's SHA-256 with the recorded local value before unpacking it.

## Place code and persistent data on Zo

Use a unique release directory for every deployment. The following paths are proposed locations, not discovered account state. Run these in the Zo terminal after transferring the archive and confirming that the release path is unused:

```sh
mkdir -p /home/workspace/tablequest/releases
mkdir /home/workspace/tablequest/releases/conference-2026-09-09-1
tar -xzf /tmp/tablequest-runtime.tgz -C /home/workspace/tablequest/releases/conference-2026-09-09-1
mkdir -p /home/workspace/tablequest-data
chmod 700 /home/workspace/tablequest-data
```

Adjust the archive's input path to its actual uploaded location. If the data directory already contains files, inspect and preserve them; do not clear it automatically. For a genuinely new public deployment, leave `leaderboard.json` absent and let the server create it on the first ranked run. Use a separate data directory for acceptance tests so synthetic scores never become the conference leaderboard.

Scores and telemetry belong outside the release directory. Files in the Zo workspace persist, and Zo documents filesystem snapshots; neither is a substitute for testing this application's restart/recovery behavior and retaining a pre-deploy backup. [Zo security and storage](https://www.zo.computer/reference/information/security)

## Register the service

In Zo, use Sites → Services, or ask Zo to register the service with these settings:

| Setting | Value |
| --- | --- |
| Label | `tablequest` (check for an existing service before creating another) |
| Mode | `http` |
| Local port | `4176`, if unused and accepted by Zo |
| Entrypoint | `node server/scoreboard-server.mjs` |
| Working directory | `/home/workspace/tablequest/releases/conference-2026-09-09-1` |
| Visibility | Private while checking if available; public for attendee access |
| Environment | Values from [`deploy/zo.env.example`](../../deploy/zo.env.example), adjusted to the selected data directory |

Use the absolute Node binary path discovered with `command -v node` if Zo's service environment cannot resolve `node`. Provide a real entrypoint: without it, Zo manages only the tunnel. The service registration owns `PORT`; do not hard-code a different value in a wrapper. [Create service reference](https://www.zo.computer/reference/tools/register-user-service)

Start with `HOST=127.0.0.1`: Zo's service reference describes exposing a localhost port. Verify both the local listener and Zo's public proxy. If routing fails, inspect the registered port and tunnel diagnostics before changing the bind address. A different bind requirement on the actual account remains unverified.

The `.env.example` file is a reference for Zo's environment settings; the Node server does not automatically load it. No API key or Zo account token belongs in the browser build or public service configuration.

The server deliberately does not trust forwarded IP headers. Its fixed limits accommodate a shared proxy peer: per minute, 600 API reads, 600 telemetry batches, 180 run starts, 600 checkpoints, 180 score submissions, and 120 other API writes. Static assets do not consume these budgets. A 429 includes `Retry-After: 60`. These are coarse shared-peer budgets, not authenticated per-player quotas; verify them with the actual attendee traffic pattern. Requests have a 64 KiB body limit and a 10-second upload deadline.

## Verify the actual public endpoint

Use the **HTTP Proxy URL returned by Zo**, not a guessed hostname. Zo advertises automatic HTTPS and managed crash restarts. [Zo hosting](https://www.zo.computer/app/hosting)

Before sharing the link:

1. From Zo, check local `/api/health` and `/api/scores`. Health returns 200 with `ok`, `persistence` and `telemetry` true only after validating scoreboard state and checking storage write access; failure returns 503. A missing score file is valid on first start. Separately fetch `/` and issue `HEAD /` to verify the built game exists: health checks storage, not the frontend build. Confirm a genuinely new conference data file has an empty board.
2. From a separate network and an anonymous browser, open the exact public URL. Check HTTPS, the main menu, both social links, asset loading, game controls, and the leaderboard. Confirm that no Zo login is required once the service is public.
3. Against a temporary acceptance data directory, submit named results after both a defeat and a completed New Game. Confirm a second browser sees the floor/COMPLETE progress and score, with progress ranked first. Confirm Floor Select and retries after defeat remain practice. API simulations alone do not establish that the actual game completion flow works.
4. Test **30 concurrent clients through that final public endpoint**: cold asset loads, ranked-run creation, valid checkpoints, score submissions, scoreboard reads and normal telemetry. Include one shared conference-style IP and more than one external network. Record failures/429s, load time, API latency, process RSS/CPU and the effect on other Zo workloads. Local load tests do not prove Zo capacity, proxy behavior or conference Wi-Fi performance.
5. Restart only the registered game service. Check public recovery and the persisted scores. Deploy a second release directory, restart into it using the same acceptance data paths, and verify the board again. Avoid restarting the entire personal Zo merely to test the game without coordinating its other work.
6. Switch the stopped service to the clean conference data paths, restart it, and recheck anonymous access, readiness and an empty board. Do not replace or erase any existing production scores to achieve this.
7. Generate the QR code only after the final URL is settled. Scan it on an actual attendee-like device and network. Confirm that the game supports that device's controls; a QR code does not by itself establish phone playability.

The leaderboard validates ranked-run tokens and floor order but still receives scores from the browser. It is suitable for a casual demo leaderboard, not tamper-proof competitive adjudication.

## Operate, update and recover

- Keep score data, telemetry and backups outside `dist/`, outside public file sharing, and outside replaceable release folders.
- Before an update, stop the one registered writer and copy the persistent data directory into a dated private backup. Then point the same service at the new release directory, preserve its data environment, restart, and repeat readiness plus a public smoke check. Retain the previous code release until the new one passes.
- For routine code rollback, stop the service, select the previous verified release directory, and restart with the existing data. Do not roll back scores unless recovery requires it: restoring a backup discards scores submitted afterward. Preserve the current file separately before any data restore.
- The pre-Zo tag above is a **source recovery baseline**, not a prevalidated public deployment. Build it in an isolated checkout if needed; do not reset the working checkout or copy it over a live release. Its older server predates the Zo readiness/rate-limit changes, so repeat public validation before serving it.
- Check service stdout/stderr retention in Zo. Application telemetry rotation does not necessarily rotate supervisor logs. Inspect disk growth during the rehearsal; set an available bounded log policy or perform deliberate private archival. Do not assume unverified per-service CPU/memory limits exist.
- `TQ_TELEMETRY_MAX_BYTES=16777216` keeps an active telemetry file plus one `.1` backup, each normally no larger than 16 MiB. Rotation replaces the previous backup; archive privately before rotation if older diagnostics are needed. An oversized pre-existing log can exceed that bound until it has aged out of the backup slot. Fresh public data avoids importing that condition. This setting bounds file size, not retention in days.
- Avoid expensive builds or local model work on the shared Zo during the live demo. A separate process still shares the personal computer's resources. Observe usage before deciding that a larger plan or host is necessary.

## Optional custom domain and future Arena

A public Zo URL is enough for the conference. For a custom domain, Zo currently supports paid-plan subdomains with a CNAME to `cname.zocomputer.io`, managed TLS, and typically 1–15 minutes for verification. Use the DNS values shown by Zo and wait for Active status before making the QR. [Custom domains](https://www.zo.computer/guide/custom-domains)

Arena is a separate future deployment milestone. Zo lists WebSocket servers as supported, but no account-specific WebSocket timeout, measured latency, bandwidth allowance, guaranteed resource isolation or multiplayer capacity has been verified. Test `wss://` through the chosen public endpoint for longer than a full match, including idle heartbeat, disconnect/reconnect and restart handling, before claiming Arena support. See the [hosting and Arena research](../zo-hosting-and-arena-research.md).
