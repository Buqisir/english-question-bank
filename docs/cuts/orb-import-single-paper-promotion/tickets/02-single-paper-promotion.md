# 02 — Approved revision to one atomic production paper

Status: done
Spec: `../spec.md`
Blocked by: none

## Deliver

- Persist publishing/published/failed audit receipts beside the existing
  shipping guard.
- Add a ship-token-only server promotion route and exact CLI command.
- Rebuild the confirmed request from immutable Review bytes and call the shared
  universal publisher against the server-owned DB/assets.
- Recover committed-but-unreceipted publication idempotently; roll back
  uncommitted DB/files; reject stale approval and concurrent Review mutation.
- Expose read-only promotion status in Import Review without adding a button.

## Gate

Synthetic exact-bundle publication, auth isolation, nonvisibility, one-paper DB
delta, five sidecars/media, stale/concurrent guard, forced rollback, committed
recovery, duplicate no-op, and four-surface consistency all pass.

Verified with:

- `node scripts/verify-universal-nck1-publish.mjs`
- `node scripts/verify-auth-gate.mjs`
- `node scripts/verify-launch-deploy.mjs`
