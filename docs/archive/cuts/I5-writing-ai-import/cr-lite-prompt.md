# CR-Lite Prompt — I5 Writing AI Import

> **ROUND 2 RE-REVIEW (current).** Round 1 (`fd52a78`) was already CR-lite'd
> ([cr-lite-i5.md](cr-lite-i5.md), APPROVE WITH MUST FIX, 1 item). DEV round 2
> (`96d2e64`) closed MF-1. **Review only the round-2 delta:** `git diff fd52a78..HEAD`
> over the **scripts** (ignore docs). Confirm four things, from the diff + your own
> re-run, not from the DEV report (round 1 falsely claimed `verify-ci EXIT 0`):
> 1. The `verify-i1-paper-import-analysis` fix adds writing groups to the fixture and
>    threads them into the build — a real six-family fixture, **not** a weakened/skipped
>    assertion or a loosened gate.
> 2. The dead-code removal in the two verify-i1 scripts deleted **only** dead
>    scope-guard helpers (`gitLines`/`changedFiles`/`assertAllowedScope`/unused
>    imports) — no live behavioural/contract assertion lost.
> 3. `verify-ci` genuinely **EXIT 0** on your own run, and `verify-i5` is in its
>    registry (so the writing publish-path proof actually gates).
> 4. No scope drift: the only non-script change is the `scripts/README.md` row that
>    `verify-architecture-housekeeping` requires for the new registry entry.
> Write a short addendum to `cr-lite-i5.md` (a `## Round 2 Re-Review` section) with
> Findings + Recommendation. PM has already independently confirmed verify-ci EXIT 0;
> your job is the independent reviewer-≠-implementer confirmation, not to trust that.
> The full prompt below is the round-1 context.

Cut: `I5-writing-ai-import` — review the DEV diff that closes the three PA Must
Fix items, so the writing-import feature can land on `main`.
Role: **CR-lite** (routine code review). Recommended session: **Sonnet, high
reasoning**. Run in a session that did **not** implement this code.
Branch: `codex/i5-writing-ai-import` · DEV commit under review: `fd52a78`.

## Read first — your role contract

`docs/agents/cr-persona.md`. The load-bearing rules:

- **reviewer ≠ implementer.** You are not the DEV session. Read the diff cold.
- **The DEV completion report is input, not truth.** Re-run verify yourself; read
  what each passing assertion actually asserts. Pass counts prove nothing until
  you have read them.

Why Sonnet not Opus: this diff is **verify-scripts only** (no production runtime
code changed), so it is routine CR-lite, not Big CR. Why high not medium: the
defects that matter here (fake green, a silently dropped assertion, scope drift)
reward adversarial step-through, not vibes.

## Baseline (verify independently, do not trust this prompt)

- `git fetch`; confirm `git rev-parse --show-toplevel` = repo root, branch =
  `codex/i5-writing-ai-import`, and that `fd52a78` is the DEV commit.
- The diff under review is `b78f593..HEAD` (DEV's commits on top of the PA/PM
  compression commit). Read it: `git diff b78f593..HEAD`.
- If branch/commit do not match, stop with `ESCALATION: BRANCH CONFLICT`.

## Must Read

- `docs/agents/cr-persona.md` (your contract)
- `docs/cuts/I5-writing-ai-import/plan.md` (the contract DEV was held to —
  §DEV tasks, §Forbidden scope, §Verification)
- `docs/cuts/I5-writing-ai-import/pa.md` (what PA already accepted/flagged; esp.
  §Sanity-check on reject-fixture ordering and §Q3 on the publish hole)
- the actual diff `git diff b78f593..HEAD` and every file it touches
- `scripts/verify-i2-seven-choices-ai-import.mjs`, `scripts/verify-i5-writing-ai-import.mjs`

## Independent verification (mandatory before any recommendation)

Re-run and record your own counts (names + pass/fail, no raw logs):

- `verify-i2` (must be green at six families, **no scope-guard bypass**),
  `verify-i3`, `verify-i4`, `verify-i5`, `verify-c7-paper-import-publish`,
  `verify:all` / `verify-ci`.
- Confirm `grep -r "github/main\.\.\.HEAD"` over the scripts `verify-ci` runs
  returns nothing.
- `git diff --check` clean.

## Named focus — answer each from the diff, not the DEV report

1. **scope-guard removal didn't drop a behavioural assertion.** DEV deleted
   `assertAllowedScope`/`assertForbiddenScope` (and dead helpers) from
   `verify-i1/i2/i3/i4/i5`. Confirm from the diff that **only** scope-guard code
   was removed and every behavioural/contract assertion remains. A check made
   green by deleting an assertion is a bypassed cause, not a fix.
2. **verify-i1 scope extension (DEV Note 1) — in-scope or drift?** The plan's
   task 2 named i2/i3/i4/i5; DEV also edited `verify-i1-paper-import-route.mjs`
   and `verify-i1-paper-import-analysis.mjs`. Judge: does the PA principle (no
   per-cut scope guards in `verify:all`) plus "needed for `verify-ci` EXIT 0"
   justify it, or is it scope drift the PM should rule on? State your call.
3. **task-3 publish test is not a fake green.** Read `assertPublishPath` in
   `verify-i5`. Confirm it genuinely (a) publishes a six-family package through
   `publishPaperImportPackage` to a real (in-memory) DB, (b) asserts the writing
   groups persist at `group_type='writing'` (count === 2), and (c) asserts the
   writing QA links carry **no** `questionId` param — and that each assertion
   would **fail** if the behavior regressed. A test that passes without exercising
   the publish path is the defect this task exists to prevent.
4. **coverage gap (DEV Note 3): the new protection may not run in CI.** The
   task-3 assertion lives in `verify-i5`, and the scope-guard removals touch
   i4/i5 — but `verify-i4`/`verify-i5` are **not** in the `verify-ci` registry
   (they pass only by manual invocation). So the writing publish-path protection
   is green by hand but ungated in CI. Decide: is registering i4/i5 in `verify-ci`
   in-scope for this cut (Must Fix), or a separate CI-gap follow-up (Should
   Watch / Follow-up Gate)? Either way, name it — a protection the gate never
   runs protects nothing.
5. **forbidden scope, confirmed from the diff** (not the report): `shared/
   papersurface/`, `app/src/shared-ui/papersurface/`, `schemas/paper-import/*`,
   `app/src/domain/paperAsset.ts` untouched; six-family enforcement
   (`packageBuilder.mjs:209-212`) not weakened; no sibling whitelist re-added.

## Escalation to Big CR

If you find that any item is not a test/script issue but a **real runtime /
data-contract / persistence / export defect** (e.g. the publish path itself is
wrong, not just untested), stop the lite review and recommend
`ESCALATE TO BIG CR` (阿澈 / Opus), naming what to inspect first.

## Output

Write the report to:

```text
docs/cuts/I5-writing-ai-import/cr-lite-i5.md
```

Use the `docs/cuts/_templates/cr-lite.md` sections (Changed Scope; Findings —
Must Fix / Should Watch; Self-Review Blind Spots; Verification Evidence; Failure /
Attack Angle; Residual Risk; Recommendation). `Self-Review Blind Spots` and
`Failure / Attack Angle` are mandatory and must be concrete.

Worktree check before writing:

- Target repo root: `/Users/huangxuewei/Projects/english-question-bank`
- Target branch: `codex/i5-writing-ai-import`
- Target absolute path:
  `/Users/huangxuewei/Projects/english-question-bank/docs/cuts/I5-writing-ai-import/cr-lite-i5.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and branch
  match. If not, stop with `ESCALATION: BRANCH CONFLICT`.
- After writing, confirm the absolute path and `git status --short` entry.

Do not edit code. CR records findings; DEV fixes them.

## Escalation signals

If you cannot review reliably, reply in chat with one line only — no partial
report:

- `ESCALATION: CONTEXT INSUFFICIENT — <what is missing>`
- `ESCALATION: BRANCH CONFLICT — <pwd / branch mismatch>`
- `ESCALATION: SPEC CONTRADICTS — <plan vs diff disagreement>`
- `ESCALATION: SCOPE UNCLEAR — <what plan does not answer>`

## Chat reply format

After writing the repo file, reply in chat with only:

- Report path + absolute path
- Git branch + git status entry for the report file
- Recommendation (`APPROVE` / `APPROVE WITH MUST FIX` / `NOT MERGEABLE` /
  `ESCALATE TO BIG CR`)
- Must Fix count
- One line: does verify-i2 pass at six families with no bypass? (yes/no)

If blocked, use one `ESCALATION:` line instead.
