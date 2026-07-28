# 14 — Listening inactive canonical closure

Status: done
Blocked by: Ticket 13 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/15-listening-zero-occurrence-proof.md`
Terminal: no

## What to build

Compile, publish, reopen, and load the two required NCK1 listening inactive
source slots so the whole paper is complete without a listening Group.

## Acceptance criteria

- [ ] The slots close q1–5 and q6–20 questions, A–C options, official answers,
      ten transcript segments, supplied timing, and a closed audio inventory.
- [ ] Active Group refs are absent and `renderPolicy: suppress` is preserved.
- [ ] Missing or referenced-but-absent audio, incomplete evidence, unsupported
      shape, answer conflict, and ambiguous transcript joins fail closed.
- [ ] `paper-2026-i` compiles to two inactive slots, zero listening Groups, a
      complete Plan, and a valid Publication/load result.
- [ ] Active listening models, playback, Analysis, and website consumers remain
      out of scope.
- [ ] Focused checks, ordinary Standards + Spec self-check, build/full verify
      required by risk, and `git diff --check` pass.

## Result

Commit: this commit
Verify: `node scripts/verify-paper-canonical-listening-inactive-closure.mjs`;
`pnpm -C app run verify:all` (`108 PASS / 1 declared SKIP / 0 FAIL`);
`git diff --check`
Notes: Closed both inactive listening slots with field-level Source Map and
exact-replay Transformation Records. Missing audio/evidence, competing source
documents, source-role mismatches, and transcript, timing, Question, or join
reordering fail closed. Standards review and focused Spec re-review passed with
zero remaining Must Fixes.
