# CR — draft-numbering-style (fresh cold read, 2026-07-10)

Reviewer: fresh CR subagent, no DEV context. Diff range `git diff 765a8db..518d744`
(cumulative: b08f870 round-1 impl → d51eab2 txn quickfix → 518d744 round-2 B-form
redo). Reviewed final state; checked round-1 residue is cleaned.

**Recommendation: APPROVE WITH MUST FIX** (1 Must Fix, 4 Should Watch).
No correctness/scope defect blocks the merge; the one MF closes an automated-proof
gap on the export path that the plan explicitly required ("硬断言进 verify").

---

## Changed Scope (verified from diff, not report)

- `server/print-renderer.mjs`, `server/exports/docxRenderer.mjs` — B-form numbering
  (Chinese 大题头, whole-paper-continuous Arabic 小题号 no parens, in-text blank remap
  to whole-paper序), hard consistency assertion (count).
- `server/draft-paper/draftPaperStore.mjs` (+ 1 route in `draftPaperRoutes.mjs`) —
  ROLLBACK-after-COMMIT structural fix.
- 4 verify scripts + docs/qa. **No app/**, data/**, shared/** touched** (confirmed by
  `--name-only`). Forbidden list respected; server whitelist = 4 files.

## Verification Evidence (re-run myself)

- `verify-print-renderer` → 75/0. `verify-h5g-docx-renderer` → 110. 
  `verify-c8-draft-paper-render-model` → 34/0. `verify-user-scope` → 50/0. All green.
- Read the changed assertions: they would FAIL on regression — e.g. reverting the
  remap to `match[1]` breaks `print-blank-num">23` (would show 36) and the
  `!includes(36)` guard; reverting 大题头 to Arabic breaks `group-header">一、`.
  These are behavior checks, not string shape. Good.
- Round-1 residue clean: no live `(n)` paren format, no per-group reset code.
  All `(1)` occurrences are in comments documenting the retirement. `questionNumberStart`
  still has a real consumer (seeds `startNum` → whole-paper continuous), so plan's
  "参数语义检查" resolves to "keep, still meaningful" — correct.

## Findings

### Must Fix

**MF-1 — the hard consistency assertion's THROW path has no automated test.**
Every happy-path fixture was edited (`questions: []` → count-matched question stubs)
so the assertion never fires in verify. So if a future DEV changes `!==`, drops the
`throw`, or neuters `BLANK_BEARING_GROUP_TYPES`, all verify scripts still pass — on an
export path, this is exactly the "green bought by editing fixtures / unexercised guard"
class CR must block. plan.md required "文内空号与列表一致性断言（上述硬断言进 verify）";
the consistency HOLDING is verified, the guard REJECTING a mismatch is not.
Fix: add one negative case per renderer — a `cloze`/`grammar_cloze`/`seven_choices`
group whose blank count ≠ question count, asserting the render throws the
"does not match question count" error. Cheap (~10 lines each); it is the only CI
protection for the mechanism the plan calls the core safety net ("宁可导出红也不出对
不上的卷子"). Manual QA (qa-notes §Round 2, step against real 10-blank data) proves it
fires TODAY, but that does not protect against regression.

### Should Watch (non-blocking)

**SW-1 — `chineseNumeral` + `BLANK_BEARING_GROUP_TYPES` duplicated verbatim in both
renderers.** Acceptable now: both copies are pure, identical, and each is covered by its
own verify, so drift is caught. But shared/ precedent (blankPattern.mjs, figures/)
exists — if a third consumer appears or the numeral scheme changes, extract to
`shared/` rather than edit two files. Not this cut's work.

**SW-2 — order-of-appearance pairing is a data assumption, not enforced.** The assertion
checks only COUNT. If a passage's blank order differs from the question-list order,
in-text `N` and list `N` would mislabel while still passing the assertion. plan.md
accepts this ("顺序即真相"). Real data appears ordered; flagging as a known limit, not a
defect.

**SW-3 — transaction fix has no automated regression test.** The 6 store functions +
route change is proven only by manual QA (qa-notes: real mismatched groups surface the
real assertion error, `grep "cannot rollback"` → 0 hits). A route-level test that mutates
with a mismatched group and asserts the surfaced error is the real assertion message
(not "cannot rollback") would cover MF-1 AND this fix at once — worth folding into MF-1.

**SW-4 — mutation persists even when the response render throws.** Post-COMMIT render is
now outside the txn (correct — the mutation succeeded), so a mismatched group is added,
COMMIT stands, and the client gets the assertion error. Documented and intended
(qa-notes). Loud failure per plan. Noted so a future reader does not "fix" it back inside
the transaction.

## Self-Review Blind Spots

- I did not run `verify:all` end-to-end (ran the 4 diff-relevant scripts individually,
  all green; qa-notes claims 73/1skip/0). A Big CR should confirm the full suite on a
  clean machine.
- I did not exercise the live route against the real database — trusting qa-notes' manual
  reproduction for the transaction fix. If Big CR wants runtime proof, that is the first
  thing to re-run (see SW-3).
- DOCX byte-level output verified only via the `includes()` substring assertions in
  verify-h5g, not by opening the generated .docx. Padding/parens claims rest on those
  substring checks + the QA .docx artifacts in the cut folder.

## Failure / Attack Angle

The realistic failure: a later cut edits the numbering logic and, because no test drives
the assertion's throw, silently reships the round-1 "one paper, many (1)s" / misaligned
in-text-vs-list defect — verify stays green (MF-1). Second angle: someone "simplifies"
the store by moving the render call back inside the try to "reduce nesting", resurrecting
the ROLLBACK-after-COMMIT masking bug — no test guards it (SW-3). Both are closed by the
single negative test MF-1 asks for, extended to the route.

## Residual Risk

Low for the display change (owner-QA proven across 5 surfaces, artifacts in qa/). The
residual is durability, not current correctness: the guard and the txn fix are correct
today but unprotected in CI. MF-1 closes the highest-value slice.

## PA-lite Downgrade Re-check (process note, not a merge blocker)

plan.md justified skipping PA on a "reversible display change, no schema, call surface
already proven" premise. After three DEV passes that premise only partly holds: the cut
grew a hard-throwing assertion on the export path AND a transaction-control fix touching
6 store functions + a route (persistence/error-flow, not display). **Realized weight is
medium+, above the display-only PA-lite rationale.** The downgrade held up only because
this CR performed the persistence-path review a PA would have. Process note for the
orchestrator: when a "display-only" cut acquires a control-flow/persistence fix mid-flight,
re-evaluate the PA-lite call rather than carrying the original downgrade. Down不为例.
