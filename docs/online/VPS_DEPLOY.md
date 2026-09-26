# Deploy Table Quest with Arena multiplayer on a VPS

One Node process serves everything: the built game, Arena's WebSocket at `/arena/ws`, and the campaign scoreboard/telemetry API. Caddy in front provides HTTPS, which browsers need for `wss://`. This guide fits any Linux VPS you can reach over SSH. For Zo, see [ZO_DEPLOYMENT.md](ZO_DEPLOYMENT.md); the package and entry point below are the same.

## 1. Build and package (on your machine)

```sh
npm ci
npm run build && npm run build:arena
npm run test:arena && npm run test:arena:refinement && npm run test:scoreboard
npm run package:vps
```

`package:vps` refuses to package a stale `dist/` and writes `artifacts/tablequest-runtime-<rev>.tgz` plus a `.sha256`. The archive contains `dist/`, `server/`, `shared/`, `src/levels.js`, `deploy/`, the `ws` package and a minimal `package.json`. It never contains `data/`, so local scores and telemetry stay local. A `-dirty` suffix means game or server sources had uncommitted changes.

## 2. Prepare the VPS (once)

Needs Node 22.12 or newer and Caddy.

```sh
sudo useradd --system --home /opt/tablequest --shell /usr/sbin/nologin tablequest
sudo mkdir -p /opt/tablequest/releases /var/lib/tablequest
sudo chown tablequest: /var/lib/tablequest && sudo chmod 700 /var/lib/tablequest
```

Point a DNS A/AAAA record at the VPS and open ports 80 and 443. Keep port 4180 closed to the internet: the service binds to 127.0.0.1 and only Caddy talks to it.

## 3. Install a release

```sh
scp artifacts/tablequest-runtime-<rev>.tgz* you@vps:/tmp/
ssh you@vps
cd /tmp && shasum -a 256 -c tablequest-runtime-<rev>.tgz.sha256
sudo tar -xzf tablequest-runtime-<rev>.tgz -C /opt/tablequest/releases
sudo ln -sfn /opt/tablequest/releases/tablequest-runtime-<rev> /opt/tablequest/current
```

First time only, install the service, then add the site to Caddy. If this VPS already serves other sites through Caddy, **append** the block from `deploy/Caddyfile` (with your domain) to the existing `/etc/caddy/Caddyfile`; do not replace it. If another container or proxy already owns ports 80/443, add a route to that proxy for the domain pointing at `127.0.0.1:4180` instead of installing a second Caddy.

```sh
sudo cp /opt/tablequest/current/deploy/tablequest.service /etc/systemd/system/
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F)       # if it exists
sudo sh -c 'cat /opt/tablequest/current/deploy/Caddyfile >> /etc/caddy/Caddyfile'   # then set your domain
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload && sudo systemctl enable --now tablequest
sudo systemctl reload caddy
```

For later releases, extract, move the `current` link, and run `sudo systemctl restart tablequest`. A restart ends any live Arena round, so deploy between matches. Rolling back is the same link move to the previous release. Scores in `/var/lib/tablequest` are untouched either way; back that folder up before updates.

### Optional password

To keep the game to people you invite, set a shared password. Everyone signs in once per browser (a 30-day cookie); pages, the scoreboard API and Arena connections are refused without it, and `/health` stays open for monitoring.

```sh
sudo sh -c 'umask 077; echo "TQ_ACCESS_PASSWORD=choose-something-long" > /etc/tablequest.env'
sudo systemctl restart tablequest
```

Remove the line (or the file) and restart to open the game again. Changing the password signs everyone out.

## 4. Check it

```sh
curl -s http://127.0.0.1:4180/health          # Arena: ok, protocol, metrics
curl -s http://127.0.0.1:4180/api/health      # scoreboard storage
curl -sI -H 'accept-encoding: gzip' https://your-domain/ | grep -i content-encoding
journalctl -u tablequest -f                    # service log
```

Then, from two different networks (for example home Wi-Fi and a phone hotspot), open `https://your-domain/`, choose **Arena**, join, ready up, and play a full round. The pause menu shows the measured round trip. `/health` reports `tickMsP95`, `eventLoopP99Ms`, snapshot bytes, and `skippedSnapshots`/`slowDrops` (clients too slow to keep up).

## How the multiplayer behaves on a real connection

- **Movement** is predicted on the client and applied by the server one input at a time at the same fixed step, so the two agree. Corrections only happen for real disagreements (bumping another player, a door closing).
- **Other players** are drawn a little in the past (about 80–150 ms, adapting to measured jitter) between two snapshots, so they move smoothly instead of stepping 15 times a second.
- **Dropped connections** are detected by a 10 s heartbeat, so a sleeping laptop releases its slot within about 20 s. The player's client reconnects automatically within the 15 s grace period and returns to the same slot and score. One player's drop does not cancel a countdown for everyone else.
- **Slow clients** skip snapshots instead of growing server memory, and are disconnected if they fall more than 1 MB behind.
- **Capacity:** one room, eight staff (humans plus bots). Measured locally with one client and seven bots: 0.7 ms server tick (p95), 3.8 KB snapshots at 15 Hz, about 0.5 Mbit/s down per player and 3.6 Mbit/s out for a full room. Measure again on the real host before relying on it.
