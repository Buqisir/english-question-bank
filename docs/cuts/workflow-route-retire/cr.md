# workflow-route-retire · CR

Cut: `workflow-route-retire`
PR: none (branch review)
Reviewer: fresh Sol / high CR
Date: 2026-07-21

## Changed Scope

- Reviewed `github/main` `1e8e11ed65d4942df02aa7b495722c10ef507a5c0`
  through branch HEAD `087c8a5c6fa82ad2bd0be916c0dd6488405010ad`: 25 files
  limited to collaboration rules, agent compatibility profiles, cut templates,
  the artifact verifier/index, this cut's records, and deletion of
  `.claude/workflows/cut-pipeline.js`.
- No diff under `app/`, `server/`, `schemas/`, `data/`, `.github/workflows/`,
  `docs/STATUS.md`, or the applied-writing worktree/scope.

## Findings

- Must Fix:
  - **MF-1 — Large-cut PA routing still has two contradictory current rules.**
    `AGENTS.md` lines 41-44 and the accepted plan's unique skeleton require a
    fresh PA for Large **or** irreversible work, while
    `docs/steering/README.md` lines 53-54 and
    `docs/steering/cut-workflow-protocol.md` lines 363-368 say PA is triggered
    by irreversibility, "not by tier." A reversible Large cut can therefore
    skip the PA required by the authoritative Dispatch map. Before merge,
    steering must defer to the `AGENTS.md` trigger (including its explicit
    PA-lite downgrade cases) instead of defining the conflicting route.
  - **MF-2 — The historical-role compatibility sentence is reversed.**
    `docs/steering/cut-workflow-protocol.md` lines 19-20 says historical cut
    records naming 阿澈 should be reinterpreted, but 阿澈 is now the current role;
    the retained historical records name 小川. This contradicts `AGENTS.md`
    lines 13-15 and the plan's "current role → 阿澈; do not mass-rename history"
    decision. Change the steering compatibility subject to 小川.
  - **MF-3 — PA freshness can still be waived by prose.**
    `docs/agents/pa-persona.md` lines 12-18 first requires PM/PA separation,
    then permits one context to cover both hats if the exception is recorded.
    That directly violates the accepted plan's unconditional requirement that
    PA, DEV, and CR remain separate fresh contexts and `AGENTS.md`'s
    "review gates never downgrade" invariant. Remove the exception; recording
    a self-review risk is not a substitute for a fresh PA.
  - **MF-4 — Current dispatch prose truncates the owner-approved effort
    exceptions.** `docs/agents/dispatch-protocols.md` lines 33-34 instructs
    every dispatch to pin PA=`Sol/high` and CR=`Sol/high`, omitting
    PA=`xhigh` for irreversible work and CR=`xhigh` for Big CR. The same
    incomplete Codex-PA description appears in `docs/agents/pa-persona.md`
    line 4 and `.claude/agents/pa-reviewer.md` lines 3 and 12-14. Before merge,
    current dispatch/persona prose must either point to the authoritative
    `AGENTS.md` tier table or state all exceptions. Claude frontmatter must
    remain the valid single-value `opus` / `sonnet` compatibility setting.
  - **MF-5 — The required Cut Note is not protocol-complete.** This Medium cut
    changes a recurring collaboration rule, so
    `docs/steering/cut-workflow-protocol.md` lines 231-242 requires a Cut Note
    with the listed minimum fields. `cut-note.md` currently omits what was cut
    or deliberately not done, wrong assumptions, browser-QA disposition,
    follow-up/watch items, dates, PA/Big-CR rounds, and Must-Fix count. Add
    explicit values (`None`, `N/A`, or `pending` where true) before closeout.
- Should Watch:
  - **SW-1 — Artifact presence is not CR approval.** The verifier correctly
    enforces only a non-empty `cr.md`; it will also pass when that report says
    `NOT MERGEABLE`. This matches the stated artifact contract, but RM must
    consume the recommendation and close every Must Fix rather than treat the
    artifact-gate PASS as a merge verdict.

## Self-Review Blind Spots

- Per assignment, CR did not repeat `pnpm -C app run verify:all` or `tsc`; the
  build/full-suite evidence below is PM-provided rather than independently
  rerun in this CR session.
- Historical case-law, STATUS, and historical cut references were intentionally
  treated as records, not current positive routing instructions.

## Verification Evidence

- Static verify:
  - fetched `github/main`; branch/HEAD/baseline matched the assignment and the
    worktree was clean before review;
  - Ruby parsed all four `.claude/agents/*.md` frontmatters: each `model` is a
    scalar string and one of `opus|sonnet` (4/4 pass);
  - artifact-gate fixture: missing `cr.md` exit 1; whitespace-empty `cr.md`
    exit 1; non-empty `cr.md` exit 0;
  - after this report landed,
    `node scripts/verify-cut-artifacts.mjs docs/cuts/workflow-route-retire medium`
    reported PASS 3 / FAIL 0 (artifact presence only; MF verdict still blocks);
  - `node --check scripts/verify-cut-artifacts.mjs` exit 0;
  - `git diff --check github/main...HEAD` exit 0;
  - targeted current-rule scans found no positive `cut-pipeline` route outside
    allowed history/current-retirement records, no Medium/Large CR-lite route,
    and no mandatory entrypoint rule; `scripts/import-pipeline` was kept out of
    the standard-cut-route judgment as required.
- Build: PM-reported `pnpm -C app exec tsc --noEmit` exit 0; not repeated by CR.
- Browser QA: not required (process/docs-only; no user-visible product change).
- Other: PM-reported full `verify:all` PASS 84 / SKIP 1 / FAIL 0; not repeated
  by CR. Skip is the documented absent off-repo I16a fixture.

## Failure / Attack Angle

- A future reversible Large cut can follow steering, skip the fresh PA required
  by `AGENTS.md`, then compound the loss of independence by using the PA
  persona's same-context exception. An irreversible cut can additionally be
  dispatched at `high` rather than `xhigh`. All three paths look compliant in
  isolation, so green verification would not expose the process regression.

## Residual Risk

- Runtime/product risk is negligible because the diff is docs/process-only.
  Merge risk remains blocking until the five current-rule contradictions and
  incomplete record above are corrected and cold-read again.

## Recommendation

- **NOT MERGEABLE** — 5 Must Fix findings remain open.
