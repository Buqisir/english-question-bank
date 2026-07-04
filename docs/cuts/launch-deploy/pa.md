# PA Review — launch-deploy (M1 上机部署)

## Verdict

**APPROVE WITH MUST FIX** — direction is correct and the recon is almost
entirely accurate, but Slice 4's data-loss surface (R1 atomic swap + R2
denylist) is left as open questions the plan must resolve into a locked,
implementable recipe before DEV. Three Must Fix, all in the data-critical
Slice 4 + one verify-gate gap.

## Product Principle

This is launch-track scaffolding, not a runtime feature. The teacher task is
unchanged; the "user" here is the owner/operator. The one product-visible
change is Slice 1 (prod same-origin addressing) — everything else is config,
scripts, and a data-transfer tool whose only job is to NEVER lose or overwrite
the two SQLite files. Judge on correctness-by-construction + local
verifiability, per the cut's own scope. Real go-live is explicitly out of
scope (no server, no credentials).

## Exact Architecture Model (verified)

- Browser → Caddy:443 → `reverse_proxy 127.0.0.1:8787` for
  `/api/*` `/paper-assets/*` `/user-space/*`; everything else static
  `app/dist` + SPA `try_files … /index.html`.
- Node stays `127.0.0.1:8787`, per-request open/close of a fresh
  `DatabaseSync` handle (NOT a long-lived handle — see R1).
- `question-bank.sqlite` ships as a whole file (gitignored); `user-data.sqlite`
  is server-only, self-healing via `ensureUserDatabaseShape()` at startup, and
  MUST never be touched by pull/push.
- SQLite journal mode is **`delete` (rollback journal), NOT WAL** — this
  corrects the plan's R1 framing (see Recon: journal mode REFUTED-as-stated).

## Must Fix Before DEV

### MF-1 — Slice 4 R1: lock the swap recipe; the plan's premise is wrong

The plan asks "stop/start vs pure atomic mv — 哪个够？" and worries about
`-wal`/`-shm` sidecars and "inode 换掉会怎样". Verified reality changes the
answer and it must be decided here, not by DEV:

- **No WAL.** `PRAGMA journal_mode` on the real DB returns `delete`. There is
  no persistent `-wal`/`-shm`. A transient `-journal` exists only mid-write and
  is deleted on commit. So "一并处理 WAL 旁文件" is a non-issue for the swap;
  do not build sidecar-copy logic around WAL.
- **Handles are per-request, not long-lived.** `openDatabase()` opens and
  `db.close()`s inside each handler (evidence: `server/api.mjs:649` open,
  `:836/:924/:1330/…` close). So no persistent fd pins the old inode; the next
  request's fresh open picks up a renamed file.
- **But stop/start is still required for correctness, not just safety.** The
  server builds in-memory indexes at startup (`teachingFacetIndex`,
  `paperSurfaceAnalysisAvailability`, `server/api.mjs:65-66`) and the
  import-pipeline README already mandates "先停 API 释放写锁 … 重启刷缓存"
  (`scripts/import-pipeline/README.md:31`). A pure `mv` leaves stale caches and
  stale content served. → **stop `eqb` → temp-file + same-filesystem `mv` →
  start `eqb`** is the locked recipe.
- **In-place write is the real corruption risk**, not `mv`. If push does
  `scp`/`rsync` directly onto the live `question-bank.sqlite` path while a read
  handler holds it open, a concurrent reader can see a torn file. The temp +
  same-disk `mv` primitive (already in the plan) avoids this; make it a hard
  requirement, and forbid any writer that lands bytes on the final path
  directly.

Required: plan.md must record the swap recipe as a locked Must Do (stop →
temp+same-disk mv → start), state "journal_mode=delete, no WAL sidecar
handling", and Forbid in-place writes to the live DB path. Verify VA (Slice 4)
must assert the script stops the service before swap and writes to a temp path.

### MF-2 — Slice 4 R2: denylist by filename-substring is insufficient; use explicit allowlist + manifest assertion

A substring denylist on `user-data.sqlite` is necessary but weak. `.gitignore`
shows sidecars are `*.sqlite-*` (`-journal`/`-wal`/`-shm`) — a directory-level
`rsync data/` or a glob would sweep `user-data.sqlite` AND its sidecars, and a
naive `user-data.sqlite` substring check can miss `user-data.sqlite-journal`
or a future rename. The safe contract:

- Transfer only **explicitly named** files (`question-bank.sqlite` by exact
  path) — never a `data/` directory glob, never `data/*.sqlite`.
- Build the transfer manifest first, then **assert the manifest contains zero
  paths matching `user-data`** (basename regex, not exact string) and abort
  otherwise.
- Same discipline on the pull side: pull names `question-bank.sqlite`
  explicitly; never pulls the whole remote `data/`.

Required: plan.md must record "allowlist-by-explicit-path, deny any
`user-data`-matching path in the manifest, abort on match" as a locked Must Do
for both pull and push, and the Forbidden list must ban directory-glob transfer
of `data/`. Verify VA5 must assert the abort path fires on a `user-data`-named
input (the plan's fake-remote round-trip already asserts byte/mtime invariance;
add the abort-trigger case).

### MF-3 — Verify gate: VA behavior assertions cannot prove Slice 3/4 safety as written

VA5 only checks `bash -n`/`node --check` + "含 user-data denylist 断言点"
(presence of a string), which does not prove the denylist actually aborts, nor
that the swap is atomic. Static presence ≠ behavior. Per the repo's
verify-behavior-over-presence discipline:

- Slice 4 verify must run the fake-remote round-trip and assert (a) fake-remote
  `user-data.sqlite` bytes+mtime unchanged across pull→push, and (b) feeding a
  `user-data`-named path makes the script exit non-zero. The plan describes
  this in Slice 4 验收 prose but VA5 does not encode it — promote it into the
  RM-gated `verify-launch-deploy.mjs`.
- Slice 3 verify must assert the `.backup` snapshot passes
  `PRAGMA integrity_check` (plan says so in prose; encode it as an assertion).

Required: plan.md VA5 must be rewritten to name behavioral assertions
(abort-on-user-data, byte-invariance, integrity_check), not string presence.

## Must Fix → Plan Disposition Checklist

| MF | Required plan.md disposition |
| --- | --- |
| MF-1 | Locked Must Do in Slice 4: swap recipe = stop `eqb` → temp + same-disk `mv` → start `eqb`; note "journal_mode=delete, no WAL sidecar logic"; Forbidden: in-place write to live `question-bank.sqlite` path. Replace R1 open-question text with this decision. |
| MF-2 | Locked Must Do in Slice 4 (pull+push): explicit-path allowlist; manifest asserted free of any `user-data`-matching basename; abort on match. Forbidden: directory-glob transfer of `data/`. Replace R2 open-question text with this decision. |
| MF-3 | Rewrite VA5 (and add Slice 3 VA) to behavioral assertions: abort-on-user-data exits non-zero; fake-remote user-data bytes+mtime invariant; `.backup` snapshot passes integrity_check. |

## Should Watch

- **SW-1 (R3, Slice 3):** `rclone sync` deletes remote extras; `copy` only
  adds. For an append-only timestamped-key backup, `copy` is safer (a local
  deletion/corruption can't propagate a delete to the only off-site replica).
  Non-blocking: plan already flags it; recommend `copy` + a separate retention
  prune, not `sync`. DEV picks under CR review.
- **SW-2 (R4, Slice 1):** collapsing `apiPath`/`apiPathNoIpv6` is
  behavior-equivalent in every real topology. `apiPathNoIpv6` is imported only
  by `paperImport.ts` + `paperImportAi.ts`; `apiPath` by the other 5 services.
  The `::1` difference only bites if someone browses `http://[::1]:5173`, a dev
  edge. Safe to fold. This also lands the H11-A PR1 deferred "两形态合并 =
  行为变更" — note it in the report as owner-acknowledged.
- **SW-3 (R5, Slice 2):** Caddy `handle` ordering — reverse_proxy blocks for
  the three API paths must precede the SPA `try_files` fallback, else
  `try_files` swallows `/api`. This is a well-known Caddy footgun; the local
  topology smoke (non-localhost hostname, deep-link refresh, `/api/health` via
  proxy) will catch it. Keep the smoke; not a spec hole.
- **SW-4 (argon2 native on Ubuntu 24.04):** `server/argon2@^0.44.0` installs via
  `node-gyp-build` (prebuilt binary if available, else compiles). On a fresh
  2C2G HK box, `npm ci` may fall to a source build needing `build-essential` +
  `python3`. The runbook must list those apt packages OR confirm a prebuild
  covers Node 24 / linux-x64-glibc. Non-blocking for this cut (no server yet)
  but the runbook must say it — see Follow-up Gate.
- **SW-5 (pnpm vs npm split):** app uses pnpm (`corepack`), server uses
  `npm ci` — correct and preserved. `.nvmrc` (Node 24) does not exist yet;
  Slice 2 adds it. No conflict.
- **SW-6 (health leaks dbPath):** `/api/health` is unauthenticated
  (`AUTH_PUBLIC_ROUTES`, `server/api.mjs:4247`) and returns `{ ok, dbPath }` —
  the absolute server path. Minor info leak once public behind Caddy. Not this
  cut's scope (Forbidden: server semantics), but worth a backlog note.

## Follow-up Gate (blocks real go-live, NOT this cut)

- **FG-1:** Confirm on the actual Node 24 LTS whether `node:sqlite` still needs
  `--experimental-sqlite`; if so, add it to `ExecStart`. Plan already defers
  this to "DEV 在目标 Node 版本上实测". Gate: go-live.
- **FG-2:** runbook must enumerate apt build deps for argon2 (`build-essential`,
  `python3`) or verify a Node-24 linux-x64 prebuild exists. Gate: first server
  provision.
- **FG-3:** DNS A record for `eqbank.cc` + `www` must exist before Caddy can
  issue certs; www↔apex redirect/cert behavior (R5 tail) verified on the real
  box. Gate: go-live. (Procurement dependency, already owner-owned.)
- **FG-4:** First-ever push must be preceded by confirming the remote
  `user-data.sqlite` was created by the server's own `ensureUserDatabaseShape()`
  startup (never shipped from local). Gate: first push.

## Allowed Files

- Slice 1: `app/src/services/httpClient.ts` (only).
- Slice 2: new `.nvmrc`, `deploy/eqb.service`, `deploy/Caddyfile`,
  `scripts/deploy.sh`, `docs/cuts/launch-deploy/runbook.md`.
- Slice 3: new `scripts/backup-to-r2.sh`.
- Slice 4: new `scripts/pull-run-push.mjs` (or `.sh`).
- Verify: new `scripts/verify-launch-deploy.mjs`; register in
  `scripts/README.md` + `scripts/verify-ci.mjs`.

## Forbidden Files

- Any `server/**` runtime semantics (binding/port/routes/DB logic).
- Other `app/src/services/*` files; `app/vite.config.ts` proxy.
- Destructive ops on `data/**` originals without dry-run + backup guard.
- In-place writes to the live `question-bank.sqlite` path (MF-1).
- Directory-glob transfer of `data/` (MF-2).
- Secrets in git / scripts / memory.

## Static Verify Requirements

- VA1 behavior: non-local hostname → `apiPath`/`apiPathNoIpv6` return relative.
- VA2 source: `app/src/services/**` free of `http://127.0.0.1:8787`.
- VA3 Caddyfile: three reverse_proxy → `127.0.0.1:8787` + file_server +
  `try_files … /index.html`, with reverse_proxy ordered before SPA fallback.
- VA4 eqb.service: `User=eqb`, `Restart=`, `--env-file`, ExecStart → api.mjs.
- VA5 (rewritten per MF-3): behavioral — abort-on-`user-data` exits non-zero;
  fake-remote `user-data` bytes+mtime invariant across pull→push; `.backup`
  snapshot passes `PRAGMA integrity_check`; scripts pass `bash -n`/`node --check`.

## Browser QA Matrix (Slice 1/2)

As plan's table — sound. Key case: serve `app/dist` under a **non-localhost
hostname**, confirm Network shows relative same-origin `/api/*`, no
`127.0.0.1:8787`, no mixed-content, and SPA deep-link refresh does not 404.

## DEV Readiness

Ready after MF-1/MF-2/MF-3 are compressed into plan.md. Slice 1 is
independently end-to-end verifiable and unblocks the topology smoke; Slices
3/4 are structurally independent. Node/argon2/pnpm story is correct. Decision
count below.

## Open PO Decisions

None blocking (0). All six roadmap decisions are locked upstream; MF items are
engineering-safety dispositions, not product choices. `rclone copy vs sync`
(SW-1) is a DEV+CR call, not PO.

## Recon Verification

| Plan fact | Result | Evidence |
| --- | --- | --- |
| `httpClient.ts:17-32` apiPath/apiPathNoIpv6 origin resolution | CONFIRMED | `httpClient.ts:14` `API_ORIGIN`, `:17-21` apiPath (::1-incl), `:26-32` apiPathNoIpv6 (no ::1) |
| `8787` appears only in httpClient (app/src) | CONFIRMED | grep app/src → only `httpClient.ts:14`; server has `api.mjs:64` (port default) — expected |
| `server/api.mjs:4433` `listen(port,'127.0.0.1')` | CONFIRMED | `api.mjs:4433 server.listen(port, '127.0.0.1', …)` |
| `:151` `/api/health` unauthenticated | CONFIRMED | route defined `api.mjs:151`; whitelisted in `AUTH_PUBLIC_ROUTES` `api.mjs:4247` |
| vite proxy `/api` `/paper-assets` `/user-space` | CONFIRMED | `vite.config.ts:26-30` |
| user-data tables auto-created via `ensureUserDatabaseShape()` at startup | CONFIRMED | `api.mjs:667-669` open→ensure; `:689` definition; single source per header note |
| paper-assets `latest/**` tracked, `versions/` gitignored | CONFIRMED | `git ls-files latest` = 249; versions = 0; `.gitignore:52` |
| `question-bank.sqlite` NOT in git (whole-file push) | CONFIRMED | `.gitignore:36 *.sqlite`; `git ls-files data/*.sqlite` empty |
| Node ≥22.5 (node:sqlite) + ≥20 (--env-file); local v25.9; Node 24 LTS choice | CONFIRMED (version reqs) / DEFERRED (24 flag) | `api.mjs` imports `node:sqlite`; `scripts/dev.sh:21` `--env-file-if-exists`; experimental-sqlite flag on Node 24 must be tested (FG-1) |
| app=pnpm, server=npm+native argon2 | CONFIRMED | `app/pnpm-lock.yaml`, `server/package-lock.json`, `server/package.json` `argon2@^0.44.0` via `node-gyp-build` |
| `.env` only `DEEPSEEK_API_KEY` | CONFIRMED | `.env` has single key |
| R1 premise: WAL `-wal`/`-shm` sidecars during swap | REFUTED (as stated) | `PRAGMA journal_mode` = `delete`; no WAL. Real concern is inode-replace + startup caches, resolved by stop/start + temp-mv (MF-1) |
| R1 premise: server holds a long-lived `node:sqlite` handle | REFUTED (partially) | handles are per-request open/close (`api.mjs:649` open, many `db.close()`); stop/start still required for cache freshness, not fd-pinning |
| R4: some call site relies on `::1` difference | REFUTED (no runtime dependency) | apiPathNoIpv6 imported only by paperImport/paperImportAi; ::1 matters only for `http://[::1]` dev browsing — fold is safe |

## Self-review note

Reviewed in a fresh un-anchored context; PM/PA separation held. No exception
to record.
