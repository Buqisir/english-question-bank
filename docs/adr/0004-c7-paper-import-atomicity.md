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
10. atomically swap latest directory
11. write publish report / import run
```

If validation fails, C7 writes no publish files and performs no DB
upsert.

If versioned file writing fails, C7 does not start the DB transaction.

If DB upsert fails, C7 rolls back the DB transaction and leaves the
existing latest directory untouched.

The latest directory is the teacher-facing file view. It changes last.

## Consequences

- A failed publish cannot make teacher links point at half-published
  latest files.
- Version files may exist for failed attempts only if explicitly marked
  by a failed publish report; teacher routes must not use them.
- Browser smoke must include a failure case proving old latest remains
  usable after a simulated DB failure.

## Non-goals

- Full distributed transactions across future cloud object storage and
  cloud DB.
- Multi-user locking.
- Auth or permissions.
