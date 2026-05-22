# ADR 0004: C7 Paper Import Publish Atomicity

Status: Accepted for C7 planning.

## Context

C7 publishes a reviewed whole-paper package into both static files and
the local DB/search index. If these two stores diverge, teachers may see
search cards that point to missing files, or PaperSurface may read a new
file version while the DB still describes the old version.

C7 is local-first and single-user, but it still needs a predictable
publish boundary.

## Decision

Publish uses a latest-last flow:

```text
1. classify upload package
2. run JSON Schema validation
3. run business validation
4. stop if blocking issues exist
5. compute next version vN
6. write versioned files
7. start DB transaction
8. upsert DB/search latest rows
9. commit DB transaction
10. swap latest directory after DB commit
11. write publish report / import run
```

If validation fails, C7 writes no publish files and performs no DB
upsert.

If versioned file writing fails, C7 deletes the partial `.tmp-vN-*`
directory and does not start the DB transaction.

If DB upsert fails, C7 rolls back the DB transaction and leaves the
existing latest directory untouched.

The latest directory is the teacher-facing file view. It changes last.
During the short local filesystem swap window, readers must fall back
to the highest available `versions/vN/` snapshot if `latest/` is
temporarily absent. This fallback is part of the C7 contract for
PaperSurface fetches and search availability derivation.

Canonical version numbers are consumed only by successful publishes.
If a publish fails after writing `versions/vN/` but before the latest
swap, C7 removes that version directory and records a failed
`paper_import_runs` attempt with its own run id. The next successful
publish may reuse the same `vN`; the audit trail lives in
`paper_import_runs`, while `paper_asset_versions` contains only
published versions.

## Consequences

- A failed publish cannot make teacher links point at half-published
  latest files.
- Failed attempts do not create canonical version directories or
  `paper_asset_versions` rows.
- Browser smoke must include a failure case proving old latest remains
  usable after a simulated DB failure.
- Startup and publish-time cleanup may remove stale `.latest-tmp-*`,
  `.latest-prev-*`, and `versions/.tmp-*` directories left by a crash.

## Non-goals

- Full distributed transactions across future cloud object storage and
  cloud DB.
- Multi-user locking.
- Auth or permissions.
