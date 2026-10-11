# 01 — Restore the exact remote revision

Status: implemented locally; behavioral acceptance pending; not shipped
Spec: [paper-remote-handoff](../spec.md)

## Outcome

An operator can recover the revision that a feedback report actually names,
even when a newer Candidate exists. This is recovery, not approval, publication,
cleanup eligibility or permission to overwrite a newer edit.

## Scope

Extend existing `review.mjs hydrate <paperId>` with optional `--revision <id>`.
Keep the no-flag latest behavior. Reuse authenticated paper status and exact
revision file reads. Require the selected revision to belong to the requested
paper, be finalized Candidate, have a closed manifest/bundle and match downloaded
bytes and locally rebuilt projection. No missing-id fallback to latest.

Retain refusal to overwrite an existing workspace and temporary-directory
cleanup on failed downloads. Historical selection must not compare its files
against the latest revision's file inventory. Keep the latest inventory check
for latest selection. No server mutation or new privilege is necessary.

## Acceptance

- Default invocation still restores latest with the existing integrity checks.
- Exact historical selection restores that revision while latest differs.
- Missing flag value, unknown id, foreign paper, OCR-stage, uploading or
  unfinalized revision fails without leaving a paper directory.
- Missing/corrupt bytes and mismatched reconstructed identity fail closed.
- Existing local files are preserved.

Extend the existing CLI public-seam regression in
`scripts/verify-universal-nck1-publish.mjs`; do not build a parallel fake restore
implementation. This ticket alone does not authorize deleting the source copy.

## Local evidence

`review.mjs hydrate --revision` and the existing CLI regression now cover exact
historical selection alongside the unchanged default latest path. Regression
cases include unknown/missing IDs, ineligible historical records, corrupt bytes
and refusal to overwrite a restored workspace.

Syntax checks and diff whitespace inspection passed. The formal verifier has
not run, following the current pre-Ship cadence. No remote API, actual paper
restore, cleanup, approval or publication was performed by this implementation.
