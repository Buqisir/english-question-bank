# 20 — Backend canonical import pilot on supported outputs

Status: done
Blocked by: 19 — Import recovery, retry, and rollback
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md`
Terminal: no

## What to build

Run one local backend source package through capture, compile, atomic publish,
exact reload, supported rendered consumption, retry, and rollback using the
executable authority and public admission seam.

## Acceptance criteria

- [x] The backend agent/runbook names the exact capture, compiler, publisher,
      loader, recovery, and evidence boundaries.
- [x] One local source package completes dry run, successful publish, exact
      reload, retry, and rollback without an operator-only bypass.
- [x] The published paper produces checkable PaperSurface plain/lecture,
      Student/Teacher Print HTML, and direct Chromium PDF artifacts.
- [x] No DOCX, OOXML, or DOCX-converted-PDF artifact is generated or required.
- [x] Student/Teacher semantics and answer visibility agree with the accepted
      canonical contracts on every supported output.
- [x] No website import or normalization-review UI, production write, R2
      action, or historical-version compilation is added.
- [x] From the exact independently reviewed HEAD, the task provisions and
      opens the required page and supported artifacts with the canonical QA
      checklist, then pauses for owner verdict.
- [x] Focused checks, ordinary Standards + Spec self-check, app/server checks,
      full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 18 with its semantic, atomicity, recovery, and backend
pilot goals intact and its generated-DOCX artifact expectations removed.

## Result

Commit: `684d45813270e509551b1b4c2e86755f741e2fa6`;
`c8cd11cf1221fda3dbbe77d7a462b843b7c6595d`
Verify: canonical backend pilot, deterministic request reproduction, canonical
admission, recovery, source document types, DOCX source input, inactive
Listening zero occurrence, normalization import gate, Print renderer 92/92,
app build, architecture housekeeping 83/83, focused canonical behavior checks,
ordinary Standards + Spec self-review, and `git diff --check` PASS;
`pnpm -C app run verify:all` 113 PASS / 1 declared SKIP / 0 FAIL.
Notes: A real local PDF source package now reaches the public compiler and
atomic publisher, reloads exact canonical Screen and Print/PDF consumers,
survives restart/retry, and rolls back to the validated earlier publication.
Actual Chromium PDF evidence binds every active group, the native source table,
writing response boxes, CropBox geometry, answer visibility, and zero inactive
Listening occurrence. The HEAD-bound QA command and checklist are ready, but
this implementation task did not provision owner QA; provisioning remains
gated on independent review PASS. No production, R2, historical-version,
website-import UI, generated DOCX/OOXML, independent-review, owner-QA, or
Ticket 21 action was taken.

Focused review-fix commit:
`98384045cef3248d163f3d873910ea725d9134a7`.
Focused verify: source-bound import-pilot fixes, deterministic request
reproduction, public canonical admission/recovery/pilot, Reading publication,
inactive Listening closure and zero occurrence, the four directly affected
rendered consumers, PaperBrowse 198/198, app typecheck/build, and
`git diff --check` PASS; `pnpm -C app run verify:all`
114 PASS / 1 declared SKIP / 0 FAIL.
Focused notes: the pilot request now carries an empty registered source
envelope plus reviewed immutable Reading, Writing, and complete inactive
Listening evidence. Registered compiler adapters alone derive semantic Groups,
official assertions, exact Source Spans, Transformation Records, inactive-slot
closure, and Profile order. Missing active or Listening answers and any
Listening question/option/transcript/timing/audio evidence fail closed.
PaperBrowse rejects rendered non-Listening Groups outside the ready
Consumption Plan and has no canonical-required Reading/Writing raw fallback;
flattened table markers are never promoted to native table authority. The
non-blocking repeated-switch smell was not refactored. No owner QA or Ticket 21
action was taken.

Legacy-selection focused fix commit:
`10520c3b11fdf706767c102229a818786846bf9d`.
Legacy-selection verify: the canonical import focused-fix public seam,
PaperBrowse 198/198, Seven Choices and Cloze/Grammar rendered-consumption
regressions, app `tsc -b`/build, `git diff --check`, and
`pnpm -C app run verify:all` 114 PASS / 1 declared SKIP / 0 FAIL.
Legacy-selection notes: checked-in Screen v12 still authorizes whole-family
legacy selection for Reading, Application Writing, and Continuation Writing.
PaperBrowse now renders those explicit `selection.mode=legacy` families while
canonical mode still rejects missing projection/raw fallback and the public
page boundary still rejects Plan-external Groups. The non-blocking duplicated
test helper and prior Repeated Switches smell were not refactored. No owner QA
or Ticket 21 action was taken.

Owner-QA provisioning repair commit:
`e8b2654017b57d51bfdb19d8eab2fce9d8fc7b4f`.
Provisioning repair verify: the registered HEAD-scoped QA artifact-server
regression, the official backend pilot and focused-fix verifiers, the real
`--actual-artifacts --qa-server` six-URL smoke with clean SIGINT shutdown, app
`tsc -b`/build, architecture housekeeping 83/83, and `git diff --check` PASS;
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL.
Provisioning repair notes: the official QA command now serves only the
generated Student/Teacher Print HTML and direct Chromium PDF bytes from the
exact `.scratch/paper-canonical-ticket-20-qa/<HEAD>/` directory, prints exact
HTTP URLs for all four artifacts in addition to plain/lecture Screen, declares
the correct HTML/PDF content types, and returns 404 for unknown or traversal
paths. It reloads the four URLs against the generated bytes before reporting
ready and remains alive for owner QA. Canonical semantics and artifact
generation are unchanged. The automated smoke was stopped after verification;
no owner-QA provisioning, owner verdict, Ticket 21, production/R2 action, or
generated-DOCX output was performed.
