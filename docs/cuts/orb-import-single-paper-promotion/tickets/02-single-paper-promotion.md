# 02 — Approved revision to one atomic production paper

Status: planned
Spec: `../spec.md`
Blocked by: none; may be implemented after ticket 01 in the same isolated branch

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
