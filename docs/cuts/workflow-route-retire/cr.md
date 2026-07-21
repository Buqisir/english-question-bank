# workflow-route-retire · CR

Cut: `workflow-route-retire`
PR: none (branch review)
Reviewer: fresh Sol / high CR
Date: 2026-07-21

## Changed Scope

- Round 1 reviewed `github/main`
  `1e8e11ed65d4942df02aa7b495722c10ef507a5c0` through branch HEAD
  `087c8a5c6fa82ad2bd0be916c0dd6488405010ad`: 25 files limited to
  collaboration rules, agent compatibility profiles, cut templates, the
  artifact verifier/index, this cut's records, and deletion of
  `.claude/workflows/cut-pipeline.js`.
- Round 2 reviewed the 13-file fix delta
  `160fed5fd3c5286b4e1ec7052bf0425868faf42c...bd91c21b4ea343efe52eb844c38db73698c12b6a`
  and the full 26-file current diff from the same `github/main` baseline through
  HEAD `bd91c21b4ea343efe52eb844c38db73698c12b6a`.
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

## Round 2 Disposition

- **MF-1 CLOSED.** Both steering files now defer PA routing to `AGENTS.md` and
  state that Large or irreversible work requires fresh PA, with only the
  Dispatch-map PA-lite downgrade cases allowed.
- **MF-2 CLOSED.** Historical compatibility now correctly maps records naming
  小川 to 阿澈 wearing the matching hat.
- **MF-3 CLOSED.** `pa-persona.md` removes the same-context waiver and states
  that fresh PM/PA separation has no prose exception.
- **MF-4 CLOSED.** Current non-`AGENTS.md` rule, persona, compatibility-profile,
  and template surfaces point to the authoritative tier table rather than
  copying exact Sol/Terra + effort values. Dispatch explicitly includes role
  upgrade exceptions through that pointer; Claude frontmatter remains valid.
- **MF-5 CLOSED.** `cut-note.md` now contains every protocol-required field:
  shipped/pending status, deliberate exclusions, wrong assumptions,
  verify/browser-QA disposition, follow-up/watch, dates, review rounds, and
  Must-Fix count.
- **Additional focus CLOSED.** Big CR now writes and updates canonical
  `docs/cuts/<CUT>/cr.md`, preserving prior findings and blind spots. No new
  Must Fix was found. **Open Must Fix: 0.**

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

### Round 2 Delta Evidence

- Fetched `github/main`; baseline remained
  `1e8e11ed65d4942df02aa7b495722c10ef507a5c0`; branch and DEV fix HEAD matched
  the assignment; worktree was clean before Round 2 review.
- Targeted current-surface scan: zero exact `Sol|Terra` tier/effort copies
  outside `AGENTS.md` in `.claude/agents`, `docs/agents`, `docs/steering`, and
  `docs/cuts/_templates`; no positive standard-cut `cut-pipeline` route; no
  mandatory entrypoint rule; no Medium/Large CR-lite route.
- Big CR template requires canonical `docs/cuts/<CUT_DIR>/cr.md` in its header,
  output path, and absolute-path check; arbitrary `OUTPUT_FILE` is absent.
- Ruby YAML parse: all four `.claude/agents/*.md` `model` values are scalar
  strings in `opus|sonnet` (4/4 pass).
- `node --check scripts/verify-cut-artifacts.mjs` exit 0.
- Current cut artifact gate: PASS 3 / FAIL 0. Independent fixture remained
  missing `cr.md` exit 1, whitespace-empty exit 1, non-empty exit 0.
- `git diff --check 160fed5...bd91c21` and
  `git diff --check github/main...HEAD` both exited 0.
- Delta and full current diff contain no forbidden `app/`, `server/`,
  `schemas/`, `data/`, `.github/workflows/`, `docs/STATUS.md`, or
  applied-writing scope.

## Failure / Attack Angle

- A future reversible Large cut can follow steering, skip the fresh PA required
  by `AGENTS.md`, then compound the loss of independence by using the PA
  persona's same-context exception. An irreversible cut can additionally be
  dispatched at `high` rather than `xhigh`. All three paths look compliant in
  isolation, so green verification would not expose the process regression.
- **Round 2:** that attack path is closed: steering defers to the Dispatch map,
  the same-context waiver is gone, and model/effort dispatch reads the complete
  authoritative tier table. The remaining misuse case is SW-1: treating
  artifact presence as approval despite the report verdict.

## Residual Risk

- Runtime/product risk is negligible because the diff is docs/process-only.
  The five Round 1 blockers are closed. PM closeout should refresh the Cut Note's
  round/disposition counters and plan DP-5 after this Round 2 approval; that is
  closeout bookkeeping, not an open implementation Must Fix.

## Recommendation

- **APPROVE** — Round 2 closes all 5 Round 1 Must Fix findings; open Must Fix: 0.
