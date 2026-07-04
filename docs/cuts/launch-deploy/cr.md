# CR — launch-deploy Slice 3 + Slice 4 (cold read)

Reviewer ≠ implementer. Fresh context. Diff read cold, verify re-run, adversarial
probes executed against the actual code.

## Verdict

**APPROVE WITH MUST FIX** — the data-loss safety gates (MF-1 atomic swap + MF-2
user-data never-touch) **hold and are independently proven** on the push path.
The single Must Fix is a *proof gap*, not a code defect: the `pull` path — a full
swap surface of its own — ships with **zero committed behavioral assertion**,
though the plan's Slice-4 验收 explicitly called for a `pull→push` round-trip. I
ran `pull` by hand and it behaves correctly, so this blocks on adding the
assertion, not on changing transport code.

## Changed Scope (verified from the diff, not the report)

`git diff main...HEAD` = exactly:
- `scripts/backup-to-r2.sh` (new, Slice 3)
- `scripts/pull-run-push.mjs` (new, Slice 4)
- `scripts/verify-launch-deploy.mjs` (VA5 + VA6 added)
- `docs/cuts/launch-deploy/runbook.md`, `scripts/README.md`, `.gitignore`

No file under `server/**`, `app/**`, or `deploy/**` is touched (grep confirmed
NONE). Forbidden scope respected. `.gitignore` adds `rclone.conf` / `rclone*.conf`.
No hardcoded secrets, keys, or IPs in either script (grep clean).

Verify is registered in `scripts/verify-ci.mjs:83` (runs in the real RM gate,
not hand-only). Re-run locally: **42 passed, 0 failed.**

## Data-loss safety gates — do they hold?

**MF-1 (atomic swap + 禁原位写) — HOLDS on push.**
`scripts/pull-run-push.mjs:245-283`: stop → offline `cp` backup → transfer to
`.incoming.<stamp>` in the **same dir** as the final → same-filesystem `mv` →
start. VA5.3 asserts the remote db **inode changes** (proves rename-replace, not
in-place write) and VA5.4 asserts no `*.incoming.*` leftover. The live path is
never written directly. Confirmed by inode assertion in a re-run
(before 81532835 → after 81532848).

**MF-2 (user-data never touched) — HOLDS.**
Guard is a basename regex `/user-data/i` (`:77`) applied via `basenameOf` which
strips trailing slashes. I probed it adversarially:
- `user-data.sqlite`, `-journal` sidecar, `USER-DATA.sqlite`, `User-Data.sqlite`,
  `user-data/` (dir) → all BLOCKED.
- Transport only ever builds two compile-time constants
  (`data/question-bank.sqlite`, `app/public/paper-assets`) — neither can contain
  `user-data`, and both push and pull transfer *exactly the list they
  manifest-check*, so the guard is honest defense-in-depth (real abort behavior
  is exercised through the `check-manifest` seam, VA5).
- VA5.1 proves fake-remote `user-data.sqlite` is byte+mtime+sha256 invariant
  across a real push. I independently ran `pull` and confirmed remote user-data
  sha unchanged and zero user-data files reach local.

`shellQuote` (`:215`) is correct POSIX single-quote escaping — I round-tripped
`;`, `$(...)`, backticks, embedded quotes through `sh`; all neutralized. Every
interpolated remote path is quoted.

Every `fail()` site is immediately followed by `process.exit(1)` (grep-confirmed
all 8 call sites) — no fail-open continuation. `sqlite3`/`ssh` ENOENT →
`status:null` → treated as failure → exits. Fails safe.

`backup-to-r2.sh`: `.backup` (not `cp`) for live dbs, integrity_check gate aborts
on corrupt snapshot (`:104-107`), `rclone copy` never `sync` (VA6 asserts, grep
confirms), prune is count-guarded (`:170` `TOTAL_PREFIXES > RETENTION_COUNT`,
purges only the oldest N), the only `rm -rf` targets a self-created mktemp dir
guarded by `CLEANUP_SNAPSHOT_DIR`. Never touches `data/**` originals.

## Findings

### Must Fix

**MF-A — the `pull` path has no committed behavioral assertion.**
`scripts/verify-launch-deploy.mjs:216-311` drives **only `push`**. The plan's
Slice-4 验收 (plan.md:172-174) specifies a `pull→push` **round-trip**; the
implemented VA5 covers push-only. `pull` contains its own independent swap
surface: remote `.backup` invocation (`:304`), a local temp→`data/` `mv`
(`:324`), local old-db backup (`:317-321`), remote snapshot cleanup (`:335`), and
its own user-data avoidance — **none of it is exercised by any assertion that
runs in the RM gate.** A future regression to the pull path would ship green.
*Why it matters:* this is the data-loss surface; the never-touch and swap-lands
guarantees on pull are currently proven only by my manual run, not by a durable
gate. *Fix:* add a fake-remote `pull` round-trip to VA5 asserting (a) remote
`user-data.sqlite` byte+mtime+sha invariant, (b) local `question-bank.sqlite`
ends with the remote content, (c) a local `.bak.<stamp>` was created, (d) the
remote `.snapshot.<stamp>` is cleaned up. (I verified all four hold by hand — the
code is correct; only the proof is missing.)

### Should Watch (non-blocking)

- **SW-A — pull's local swap is a cross-filesystem `mv`, not guaranteed atomic.**
  `pull` lands the snapshot in `mkdtempSync(tmpdir())` then `mv`s it into the repo
  `data/`. On this Mac tmpdir and `data/` share a volume (df-confirmed), so `mv`
  is atomic here; on Linux `/tmp` is frequently a separate `tmpfs`/partition,
  where `mv` degrades to copy+unlink (non-atomic). *Why it's only Watch:* the
  target is the **owner's local laptop** db, the import pipeline requires the API
  stopped, and the old db is backed up first (recoverable). Contrast the push
  path which correctly stages `.incoming` in the **same dir** as the final. If
  paranoia is warranted later, stage pull's incoming file inside `data/` too.

- **SW-B — pull does not integrity_check the pulled snapshot before it replaces
  the local db.** Push checks integrity before pushing; pull does not check the
  `.backup` output before `mv` into place. Plan does not mandate it for pull, and
  the local old db is backed up first, so it's recoverable. Cheap to add.

- **SW-C — prune sorts all bucket-root dir prefixes lexically and purges the
  oldest N.** Safe because `%Y%m%dT%H%M%SZ` sorts chronologically and the bucket
  is dedicated; but any non-dated prefix ever landing at root could be purged.
  Backlog note only.

- **SW-D — `snapshot_db`'s "skipping" echo is misleading under `set -e`.**
  A missing source db `return 1`s and `set -e` aborts the whole run (correct
  behavior for a required db) — the log says "skipping" but it actually aborts.
  Cosmetic.

## Self-Review Blind Spots

- I could not exercise **real ssh mode** (no server — procurement gate). The ssh
  branch of `runRemote`/`transferToRemote` is proven only structurally; `rsync`
  scp-target string construction (`:191`, `:207`) is unverified against a live
  sshd. FG-4 (first-push user-data provenance) also remains a runbook-only guard.
- The inner sqlite3 `.backup '<abs>'` quoting (`:304`) is safe for all
  constant/timestamp inputs but would break if `EQB_REMOTE_REPO` ever contained a
  single quote — an operator-config edge I judged out of scope.
- I did not stress the `local:` rsync path with pathological asset trees; VA5
  uses a trivial one-file bundle.

## Failure / Attack Angle

The realistic failure is **not** a user-data leak (that gate is tight and proven)
— it's a **silent pull regression**: because no assertion drives `pull`, a future
edit that, say, points pull's local `mv` at the wrong path, or drops the remote
snapshot cleanup, or (worst) removes the `.backup` and cp's the live remote db,
would pass CI green. The push path is fenced by five assertions; the pull path is
fenced by zero. MF-A closes exactly this hole.

## Residual Risk

Low after MF-A. Real go-live still gated on FG-1..FG-4 (Node 24 sqlite flag,
argon2 build deps, DNS, first-push user-data provenance) — all runbook-tracked,
none this cut's merge concern.

## Recommendation

**APPROVE WITH MUST FIX** — merge after MF-A (add the `pull` fake-remote
round-trip to VA5). The transport code is correct and in scope; the gap is
durable proof of the pull half of the data-loss surface.
