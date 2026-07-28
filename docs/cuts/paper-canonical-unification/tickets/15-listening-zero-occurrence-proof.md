# 15 — Listening zero-occurrence proof

Status: done
Blocked by: 14 — Listening inactive canonical closure
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/16-atomic-canonical-import-admission.md`
Terminal: no

## What to build

Prove on actual whole-paper artifacts that complete inactive listening slots
create zero current-surface occurrences without weakening Plan completeness.

## Acceptance criteria

- [ ] PaperSurface plain/lecture states contain zero listening occurrences.
- [ ] Student/teacher Print HTML and actual PDF contain zero listening
      occurrences.
- [ ] Student/teacher DOCX, inspected OOXML, and converted PDF contain zero
      listening occurrences.
- [ ] Plan completeness, slot identities, source closure, Publication
      integrity, and loader selection remain true.
- [ ] No invented listening UI owner QA is requested.
- [ ] Focused actual-artifact checks, ordinary Standards + Spec self-check,
      build/full verify required by risk, and `git diff --check` pass.

## Result

Commit: this commit
Verify: `node scripts/verify-paper-canonical-listening-inactive-closure.mjs`;
`node scripts/verify-paper-canonical-listening-zero-occurrence.mjs`;
`node scripts/verify-paper-canonical-listening-zero-occurrence.mjs --actual-artifacts`;
`pnpm -C app run build`;
`pnpm -C app run verify:all` (`109 PASS / 1 declared SKIP / 0 FAIL`);
`git diff --check`
Notes: Preserved the complete 11-slot Plan, both closed 5+15 inactive
listening source slots, one integrity-closed Publication digest, and all nine
active whole-paper Groups while proving zero listening identifiers, chrome,
or hash-bound source phrases in PaperSurface plain/lecture, Student/Teacher
Print HTML and actual PDF, and Student/Teacher packaged DOCX OOXML and
converted PDF. Visual raster inspection covered all 4/7 Print PDF pages and
all 4/6 DOCX pages. No listening UI or owner QA was requested.
