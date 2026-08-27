# 08 — Jining shared rendering, Owner QA handoff, and cut close

Status: implemented

## What to build

Resume the exact confirmed Jining Job and complete its Canonical compilation,
atomic local publication, committed reload, and shared Screen, Student Print,
Teacher Print, and PDF proof. Prepare an Owner QA state that reproduces the
source PDF's physical layout intent without asking the Owner to reconstruct
services, URLs, focus, or source comparisons. Close the shared implementation
gate with the one required full repository run and one independent
Standards/Spec review, then stop locally before QA acceptance or shipping.

## Allowed and forbidden scope

- Allowed: resuming the exact confirmed Jining Job, its local publication and
  consumer evidence, defects within the accepted shared Job contract, final
  verification, independent review findings, and exact Owner QA handoff.
- Forbidden: silent shared-contract expansion, Jining-only layout code,
  consumer-side recrop/stretch, automatic Owner acceptance, production
  publication, deploy, R2 mutation, shipping, or unrelated cleanup.
- A review finding may be fixed within this ticket only when it is required by
  the accepted spec. A genuinely novel shape stops for Owner direction rather
  than broadening scope.

## Acceptance criteria

- [x] Resume accepts only the exact Owner-confirmed candidate-package digest; changed source, candidate, geometry, ownership, or confirmation cannot reuse downstream state.
- [x] The existing Canonical compiler and publisher produce one complete local Jining publication and an exact committed reload with no coordinator-authored paper semantics.
- [x] Screen, Student Print, Teacher Print, and browser-generated PDF consume the same Canonical Paper, exact confirmed image bytes, and source-measured placement intent.
- [x] Reading A's structure, Questions 29 and 35, and the writing poster remain readable at normal paper size and follow the source PDF's arrangement without flattened labels, crop loss, distortion, or paper-specific offsets.
- [x] Student output contains no answer or Analysis leakage; Teacher output retains the admitted answer behavior without changing media or layout.
- [x] The Job returns durable `awaiting_qa` with exact local service, paperId, Screen URL and first state, Student/Teacher Print views, generated PDF, relevant comparison entry point, and one concise gate summary.
- [x] The prepared state is smoke-checked before handoff. No QA-accepted or shipped receipt is written without a later explicit Owner decision.
- [x] A final no-paper-code proof shows that Jining required no paper-specific shared source, CSS, authority, materializer, verifier, or alternate publication path.
- [x] Affected focused checks, the final full repository suite, one independent Standards/Spec review, and `git diff --check` pass; every `SKIP` or unrelated failure is reported literally rather than reclassified.
- [x] No production data, deployment, R2 object, remote runtime, or shipping state is changed.

## Result

Commit: This implementation commit; the exact HEAD is recorded in the completion handoff.

Verify: PASS — the exact Format 2 Job resume, shared A–D actual-artifact proof,
Cloze/Grammar Fill consumption, Print renderer, DB-to-asset consistency, figure rendering,
`git diff --check`, `pnpm -C app verify:paper` (`PASS 81 / SKIP 0 / FAIL 0`),
and the one final `pnpm -C app verify:all` (`PASS 149 / SKIP 1 / FAIL 0`).
The declared SKIP was `scripts/verify-i16a-teaching-dimension-search.mjs`, which
was not actually tested.

Notes: Job `format2-job:c3cfb46a594655955fba9` resumed only candidate
`sha256:5c89246a7d66e480eac211a853972f2650e88f13479e086edd1dcdb0f7edceb8`
under exact confirmation
`sha256:63b269084eb0400de22d9edbb2ea7c0c0022540b8c95248306e167014f7e29fb`,
published Canonical v50 digest
`sha256:44270578f6d15c12084a4a9cbc4d5cdb86b63a86c2a642c61ec0c25ed0c2f5e8`,
reloaded its current/latest/version refs exactly, and stopped durably at
`awaiting_qa` / `owner_qa_required`. Student HTML has zero answer and zero
Analysis nodes; Teacher HTML has 45 answer rows and 45 admitted Analysis rows.
Screen, Student Print, and Teacher Print each render the same ten media identities
in the same order; every declared digest matches the rendered bytes, including
Questions 29 and 35 and the writing poster. The nine-page A4 Student PDF preserves
exact `CO₂` text and embeds the v50-only 1,280-byte pinned font whose SHA-256 is
`faaac9b087cbda4aa1305372c7de9a0c2e2fb7ade17965a8a10688685b0558c1`;
legacy v49 continues to use its unchanged v1 metrics and font stack. Screen,
Student Print, Teacher Print, PDF, and the exact first state were smoke-checked
without writing QA acceptance or shipping receipts. Source/CSS/authority/
materializer/verifier diffs contain no Jining paperId branch. The direct legacy
`scripts/verify-paper-surface-tokens.mjs` result remains 149 PASS / 3 FAIL,
matching fixed point `4627ce42`: missing passage-indent injection expectation,
writing-root style expectation, and the obsolete prohibition on editing the
standards document. No production, deploy, R2, remote runtime, or shipping state
changed. Final independent review: Standards PASS / Spec PASS, with no Must Fix;
the original A–E findings are closed and no direct regression was found.
