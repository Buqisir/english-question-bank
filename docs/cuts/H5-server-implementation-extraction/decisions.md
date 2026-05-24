# H5 Decisions — Server Implementation Extraction

Last synced: 2026-05-24

## Decision Summary

H5 is approved only as **H5-A Export implementation extraction**.

H5 is not an umbrella refactor and must not continue into H5-B/H5-C unless a
future product cut names a concrete trigger. The purpose of H5-A is to prove a
small, behaviour-preserving extraction pattern before the next AI-parse rewrite,
not to chase `server/api.mjs` line count.

## Resolved PO Decisions

1. H5-A is justified as a pilot.
   - Trigger: upcoming AI-parse work will add more save/fetch/provider helpers.
   - Pilot value: export is small, stable, byte-testable, and creates the pattern
     for moving implementation into owner modules without changing runtime
     behaviour.

2. Extracted export code lives in a separate module.
   - Chosen path: `server/exports/exportImplementation.mjs`.
   - Reason: the route module stays dispatch-only, and byte-equality tests can
     import the implementation module directly.

## Open Items From External Review

Open items from external review: 0.

Claude PA-lite Must Fix items are accepted into
`goal-h5-a-export-implementation.md`:

- H5-A is pilot-only, not a broad H5 umbrella.
- byte-identical fixtures must be captured before implementation moves.
- `server/print-renderer.mjs` and route/router shape stay frozen.

## Future H5 Discipline

H5-A success does not authorize more server extraction. Any future H5 slice
must name its own product trigger, PA/PM rationale, and rollback boundary.
