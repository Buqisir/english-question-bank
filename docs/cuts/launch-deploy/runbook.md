# launch-deploy — first-provision runbook

Ordered, one-time manual steps to bring `eqbank.cc` up on a fresh server.
Everything after first provision is `scripts/deploy.sh` (redeploy) and, once
Slices 3/4 land, the R2 backup cron + local pull-run-push scripts (see
pointer at the bottom).

Placeholders: `<SERVER_IP>` (never write the real IP into this file or any
tracked file). Never write real secrets (API keys, R2 credentials, SSH keys)
into this file or any git-tracked file — they live in `.env` / `rclone.conf`
(gitignored) on the server only.

## 1. Create the non-root deploy user

```
sudo adduser eqb
sudo usermod -aG sudo eqb   # only if it needs to run `systemctl restart eqb` itself;
                            # otherwise grant a scoped sudoers rule for that one command
```

The service (`deploy/eqb.service`) runs as `User=eqb`; the repo lives under
`/opt/eqb/english-question-bank`, owned by `eqb`.

## 2. Install Node 24

Via nodesource or nvm (either is fine; nodesource is simpler for a systemd
unit that shells out to `/usr/bin/node`):

```
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # expect v24.x
```

**Verify `node:sqlite` works before relying on it** (FG-1):

```
node -e "require('node:sqlite'); console.log('node:sqlite OK')"
```

If this throws (module not enabled by default on the provisioned Node 24
build), add `--experimental-sqlite` to `ExecStart` in
`deploy/eqb.service` before installing the unit — see the comment already in
that file.

## 3. Install build tooling for argon2 (FG-2)

`server/package-lock.json` includes the native module `argon2`. Either the
target Node 24 linux-x64 has a prebuilt binary available, or it needs to
compile from source:

```
sudo apt-get install -y build-essential python3
```

Run this before `npm ci` in step 7 regardless — cheap insurance if the
prebuilt binary lookup fails.

## 4. Install Caddy

```
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 5. Clone the repo

```
sudo mkdir -p /opt/eqb
sudo chown eqb:eqb /opt/eqb
sudo -u eqb git clone <repo-url> /opt/eqb/english-question-bank
```

## 6. First-time data seed (gitignored, not in the clone)

The clone does NOT include the two SQLite databases or paper-asset source
versions (they're gitignored: `data/*`, `app/public/paper-assets/*/versions/`).
Only `app/public/paper-assets/<bundle>/latest/**` (parsed JSON) ships in git.

- Push the owner's local, curated `question-bank.sqlite` up to
  `/opt/eqb/english-question-bank/data/question-bank.sqlite` on the server
  (scp/rsync to a temp path, then move into place — never write directly
  onto a path the running service might read mid-transfer; on first
  provision the service isn't running yet, so this specific concern doesn't
  apply, but form the habit here since Slice 4's `pull-run-push` enforces it
  for every subsequent update).
- Push `app/public/paper-assets/*/versions/` up (source DOCX / safety
  copies) if you want them available on the server; not required for the
  app to run, only `latest/**` (already in git) is read at runtime.
- **Do NOT create or push `user-data.sqlite`.** The server self-creates it
  on first boot via `ensureUserDatabaseShape()` (FG-4) — pushing a local copy
  would risk clobbering that server-native, empty table set with unrelated
  local user/session state.

## 7. Install dependencies and build

```
cd /opt/eqb/english-question-bank
corepack enable
pnpm -C app install --frozen-lockfile
npm --prefix server ci
pnpm -C app build
```

## 8. Create `.env`

```
sudo -u eqb tee /opt/eqb/english-question-bank/.env >/dev/null <<'EOF'
DEEPSEEK_API_KEY=<real-key-here>
EOF
sudo chmod 600 /opt/eqb/english-question-bank/.env
```

Never commit this file or paste the real key into any tracked file, chat
log, or this runbook.

## 9. Create the owner account

```
cd /opt/eqb/english-question-bank
node scripts/create-user.mjs --username <owner-username> --role owner
```

(Run before or after starting the service — `create-user.mjs` operates
directly on `user-data.sqlite`, creating it via the same
`ensureUserDatabaseShape()` path if it doesn't exist yet.)

## 10. Install the systemd unit and Caddy config

```
sudo cp /opt/eqb/english-question-bank/deploy/eqb.service /etc/systemd/system/eqb.service
sudo cp /opt/eqb/english-question-bank/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
```

## 11. DNS (FG-3) — must be done before Caddy can issue certs

Create A records, pointing at the server's public IP (`<SERVER_IP>`):

```
eqbank.cc.      A   <SERVER_IP>
www.eqbank.cc.  A   <SERVER_IP>
```

Wait for propagation before the next step, or Caddy's ACME challenge will
fail (it will retry automatically, but avoid the churn).

## 12. Start services

```
sudo systemctl enable --now eqb
sudo systemctl status eqb   # confirm active, check for node:sqlite errors
sudo systemctl reload caddy
```

Verify:

```
curl -s https://eqbank.cc/api/health
```

## Redeploys

After first provision, use `scripts/deploy.sh` (pull → install → build →
restart → health smoke) for every subsequent code update. It's idempotent
and safe to re-run.

## Backup + import (Slices 3 / 4 — not yet landed in this cut)

- Daily backup to R2 lands as `scripts/backup-to-r2.sh` (Slice 3) — a cron
  entry (e.g. `30 3 * * *` in server local time, aligned to Beijing time)
  will be documented here once that script lands.
- Importing new real exam papers into the live database (pull the server's
  `question-bank.sqlite`, run the local import pipeline, push the updated
  library back with the stop→temp+mv→start swap recipe) lands as
  `scripts/pull-run-push.mjs` (Slice 4). Until then, do not manually scp a
  database onto the running server's live path.
