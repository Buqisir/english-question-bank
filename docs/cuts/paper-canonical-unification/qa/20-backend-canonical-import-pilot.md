# Ticket 20 backend canonical import pilot QA checklist

Use this checklist only from the exact implementation HEAD after its required
independent Standards + Spec review passes. Do not reuse artifacts from an
earlier commit and do not provision QA from the implementation task.

## Provision

From the saved worktree, run:

```sh
node scripts/verify-paper-canonical-import-pilot.mjs --actual-artifacts
```

The command replays the checked-in local source package through zero-write dry
run, atomic publish, exact reload, restart/retry, rollback, and supported
rendered consumption. It writes `HEAD.txt`, `evidence.json`, PaperSurface
plain/lecture HTML + PNG, Student/Teacher Print HTML, and direct Chromium
Student/Teacher PDF under:

```text
.scratch/paper-canonical-ticket-20-qa/<HEAD>/
```

The QA-provisioning task must verify `HEAD.txt` equals the independently
reviewed HEAD, open both Screen states and all four Print/PDF artifacts, and
smoke-check that each loads before returning the canonical owner-QA handoff.
The verifier's temporary SQLite and paper-assets roots are local-only and are
removed after the run.

## Owner checks

1. Plain PaperSurface shows the complete paper once in source order and no
   answer/lecture row; lecture PaperSurface keeps the same paper structure and
   exposes the selected official answer and teaching panel.
2. Student Print HTML and Student Chromium PDF contain no answers or
   explanations. Teacher Print HTML and Teacher Chromium PDF add answers
   without changing section order, question identity, wording, writing
   response regions, or canonical layout identity.
3. Screen and Print/PDF preserve Reading, Seven Choices, Cloze, Grammar Fill,
   Application Writing, and Continuation Writing semantics; Listening remains
   inactive and has zero current-surface occurrence.
4. `evidence.json` records dry-run zero mutation, v1 publish, idempotent v2
   recovery retry, rollback to the exact v1 digest, and only the `screen` and
   `print_pdf` consumers.
5. The QA directory contains no generated `.docx`, OOXML/XML, or
   DOCX-converted PDF. The source DOCX is preserved only inside the local
   immutable import version and is not an output artifact.

Record the reviewed HEAD and explicit owner verdict. Do not begin Ticket 21
without independent review PASS and owner acceptance.
