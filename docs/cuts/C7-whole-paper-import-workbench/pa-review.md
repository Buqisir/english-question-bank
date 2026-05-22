# C7 PA Review Summary

Source: external Opus PA review, corrected to C7 after one mistaken C6b
review.

## Verdict From PA

PA returned `DEV NOT READY`.

Reason: the original C7 brief touched upload UI, multipart parsing,
schemas, cross-file validation, versioned persistence, DB upsert, search
availability, browser smoke, and cloud notes. PA considered this an L4
core-data cut and asked for checkpointing and unresolved decisions.

## PM Compression

PM accepts the risk analysis but does not accept a mandatory 6-7 PR
split up front.

Locked PM approach:

- one C7 large goal / branch / PR is allowed
- implementation must be internally checkpointed with small commits
- if C7-1 or C7-2 exposes uncontrolled risk, stop and split PR
- C7 docs and ADRs are written before DEV

## Accepted PA Must Fix Themes

- publish atomicity must be explicit
- version/latest file protocol must be explicit
- schema + business validation must be layered
- paper-asset v1 must not be silently migrated
- existing Reading A-D entries must not disappear during signal-source
  changes
- upload transport must be selected before DEV
- cross-file validation must happen before file or DB writes

## Resolved PO Decisions

PA left five decisions. They are resolved as follows:

| Decision | Resolution |
|---|---|
| Publish atomicity | latest changes last; DB failure leaves old latest usable |
| `paper-asset` status | C7 writes `published` |
| Upload transport | `multipart/form-data` via `busboy` |
| Paper assets location | keep under `app/public/paper-assets/` for now |
| Schema validator | allow `ajv` dependency |

## PA Items Reframed As Should Watch

- Whether `versions/` should be committed or ignored is a DEV / repo
  policy watch item. C7 must avoid accidental giant fixture churn.
- Future cloud migration is documentation only in C7.
- Existing import-file / import-batch endpoints should not be merged
  into C7 unless needed for the import workbench.

## DEV Readiness After This Planning PR

C7 becomes ready for a Codex implementation goal after:

- `pm-spec.md` is merged
- ADR 0004 and ADR 0005 are merged
- the DEV prompt references these files rather than long chat context
