# codex-matt-governance · formal CR

Date: 2026-07-22  
Role: fresh formal CR; no DEV history and no implementation performed  
Reviewer activation: `aef4c427603dc12e0434f6dd8981275f57d60379`  
Released predecessor-final HEAD: `8181f22abe128b306f66d9522787e5556685d125`

## Reviewed Contract and Diff

- DEV base: `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6`
- DEV implementation: `113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- Exact reviewed diff:
  `git diff 3889d67099c6211daa5cbbb79cb93bf49e4e5cc6..113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- Contract inputs: canonical `plan.md`, all PA findings and fresh recheck in
  `pa.md`, current collaboration rules, templates, and `verification.md`
- Changed scope: 13 documentation/current-rule paths; every path is inside the
  plan allowlist and no forbidden runtime, product, script, workflow, skill,
  plugin, tracker, production, or applied-writing-lecture surface changed

## Verdict

**NOT MERGEABLE — 5 unresolved Must Fix findings.**

The two-axis direction is intact, the exact model table is centralized, and
the implementation stayed inside scope. The current positive instructions do
not yet form one executable contract, and the required exact-head verification
is red. DP-6 is not closed.

## Findings

### Must Fix 1 — Direct-relay roles still resolve to parent-owned subagents and a deleted routing table

Plan HR-6, HR-9, HR-10, C-4, and AMF-2 require every PA/DEV/verification/CR/QA/RM
relay successor to be a new independently addressable task and require
`docs/agents/model-routing.md` to be the sole exact routing authority. The
implementation updates the new headline rules but leaves current positive
instructions that say the opposite:

- `docs/agents/review-levels.md:10,15` still defines PA and Medium/Large CR as
  fresh subagent contexts.
- `docs/agents/pa-persona.md:3-5,13-17` and
  `docs/agents/cr-persona.md:3-5,14-30,170` still prescribe subagents and point
  to the removed `AGENTS.md` tier table.
- `docs/steering/README.md:85-89` and
  `docs/cuts/_templates/README.md:63-70` retain the same current subagent route.
- `docs/agents/dispatch-protocols.md:33-35,52-53` also points dispatchers to the
  deleted tier table.

A future agent can therefore follow a current persona/protocol, create a
parent-owned subagent, and incorrectly count it as the required relay role.
Update all current positive role surfaces to the independently addressable task
contract and point exact model/thinking selection only to
`docs/agents/model-routing.md`; historical records may remain historical.

### Must Fix 2 — Verification ownership and one-way relay still have two incompatible authorities

Plan C-5 and HR-10 assign command execution/evidence binding to the fresh
verification task, allow RM to reuse unchanged exact-head evidence, and forbid
a surviving PM coordinator. Current rules still require the opposite:

- `AGENTS.md:81-88` says the main agent itself reruns narrow checks, `tsc`, and
  one full `verify:all` in the DEV worktree and says verification is never
  delegated.
- `docs/agents/dispatch-protocols.md:24-27,33-40,52-54` says PM dispatches
  stages, reads results, directly sends the next stage, and personally consumes
  verification evidence.
- `docs/agents/cr-persona.md:98-109` requires CR to rerun all cut verification,
  contradicting the plan's exact-head evidence reuse rule and CR-only attack
  checks.

This is not harmless layering: it can revive the long-lived PM loop, duplicate
the full suite, or make a fresh verification result non-authoritative. Establish
one boundary: verification runs and records the exact-head commands; CR attacks
the evidence without blindly duplicating it; fresh RM consumes it and reruns
only on the named invalidation triggers.

### Must Fix 3 — The reusable Auto-Next artifacts do not encode the ratified lifecycle

PA MF-7/AMF-2 and the plan's Artifact/Auto-Next contracts require the templates
to carry durable writeback, one-successor dispatch, QA pause/resume, and
machine-actionable recovery. The diff adds identity sentences but leaves the
templates partial:

- `docs/cuts/_templates/pa-prompt-template.md:101-113` and
  `big-cr-prompt-template.md:129-141` still end at a manual chat reply and do
  not require result commit -> one successor -> write-held release -> exit.
- `docs/cuts/_templates/agent-entrypoint.md:56-69` omits `blocked`, `claimed`,
  and `human-QA`, as well as returned task identity, prompt digest, released
  predecessor-final HEAD, activation/result commit, evidence pointer, and a
  unique next action. A fresh task cannot reconstruct the full dispatch state
  promised by the plan from this template.
- `docs/cuts/_templates/qa-checklist.md:24-30` does not contain the required
  literal resume instruction `QA 完成，继续` or a concrete failure-report
  format.
- `docs/steering/dev-completion-protocol.md:18-21` forbids an Auto-Next DEV from
  pushing/opening a PR, but `:25-61` immediately makes push/PR mandatory and
  says the listed exceptions are the only exceptions; Auto-Next is not listed.

Make the templates and DEV completion exception executable without relying on
an agent to infer which contradictory paragraph wins.

### Must Fix 4 — Required verification is red and the verification contract is incomplete

`verification.md:30-39` records both required commands as failures:

- `pnpm -C app exec tsc --noEmit` -> exit `1` (`tsc` not found)
- `pnpm -C app run verify:all` -> exit `1` / preflight `127`

The CR independently confirmed that this isolated worktree has no
`app/node_modules`. The plan requires green `tsc` and one exact-head full proof
before initial formal CR; ordinary environment/test failure stays in the
automatic repair/verification loop and cannot be waived by CR.

The artifact also records only scope/diff/model sweeps. It does not record the
plan-required timestamp and worktree status, full current-positive-instruction
scan, zero-Must-Fix routing check, cross-file authority map, or changed-link
resolution. The missing scans are material: Must Fix 1-3 are exactly the drift
those checks were meant to catch. Restore the worktree dependencies through the
repo's normal setup path, run every plan-named check with real exit codes, and
bind the new evidence to the corrected implementation head.

### Must Fix 5 — The live entrypoint contradicts its own active CR state

The current entrypoint has enough commit evidence to show that DEV,
verification, and CR were separately provisioned and released, but its durable
machine state is not internally current:

- `agent-entrypoint.md:279-307` leaves verification `active` and leaves its
  activation record as `this commit` even though CR is already active.
- `:313-345` simultaneously records the CR as active and sole writer.
- `:352-358` still says the next action is to release the old DEV successor and
  describes the PA as the predecessor.
- The top-level Current Stage/Must Read/Stage Contract still describes the
  already-completed DEV stage rather than the active CR/fix route.

This violates HR-2, HR-7, HR-10 and the artifact contract: a future task cannot
derive one current role or one unique next action from the repository. The fix
must close the prior verification stage with its exact activation/result/
closure records, refresh the current-stage contract, and keep exactly one
active writer/action.

## Standards

Hard violations found by the independent standards axis:

1. Auto-Next's no-push rule conflicts with the same file's mandatory PR flow.
2. PA/CR personas and review rules still prescribe subagents and the deleted
   `AGENTS.md` tier table.
3. The dispatch protocol states both one-way relay and PM stage supervision.
4. Verification ownership is split between fresh verification and the main
   agent/CR.

Judgment-call smells: duplicated relay law and shotgun surgery across current
rule files have already produced drift. Prefer a single normative home plus
narrow pointers during the fix.

## Spec

The independent spec axis found zero scope creep and three blocking classes:

1. AMF-2/current-positive authority cleanup is incomplete.
2. C-5/HR-10 verification and coordinator ownership is contradictory.
3. Exact-head verification is red and missing required evidence fields/checks.

Worst Standards issue: contradictory operational authorities can route the
same cut through mutually exclusive lifecycles. Worst Spec issue: the required
exact-head gate is not green.

## PA -> Plan Disposition Status

- Initial MF-1 through MF-7: the normative plan dispositions remain present.
- AMF-1: implemented sufficiently for safety; the finite candidate set is the
  configured primary only, so unavailable primary safely stops rather than
  substituting.
- AMF-2: **not implemented across current positive instructions** (Must Fix 1).
- AMF-3: the live commits demonstrate the intended release ordering, but the
  durable entrypoint completion state is incomplete/stale (Must Fix 5).
- AMF-4: the PA->DEV dispatch used the canonical zero-Must-Fix verdict and did
  not require a substantive PA plan edit; no defect found in this route.

## Verification Evidence

- `git merge-base 3889d67 113db39` -> exact base `3889d67...`
- `git diff --check 3889d67..113db39` -> PASS, exit `0`
- Changed-path allowlist -> PASS, 13/13 allowed; forbidden scope count `0`
- New Markdown link resolution -> PASS (`docs/agents/model-routing.md` exists)
- Sole exact model-ID authority sweep -> PASS outside historical case law/cut
  records
- Current-positive role/relay/verification scan -> FAIL; Must Fix 1-3
- `tsc` / `verify:all` exact-head proof -> FAIL as recorded above
- Browser/owner QA -> not required for this docs-only governance cut

## Failure / Attack Angle

A future Medium/Large cut can read `review-levels.md` or a persona, create a
parent-owned PA/CR subagent, read routing values from the nonexistent AGENTS
tier table, let a surviving PM rerun/consume verification, and still believe it
followed current rules. A DEV can also follow the `MUST` PR flow despite its
Auto-Next authorization forbidding push. These are executable governance
failures, not wording polish.

## Self-Review Blind Spots

- The CR did not install dependencies or rerun the already-failed full suite;
  the plan assigns that exact-head proof to fresh verification and forbids
  blind duplication. The absence of `app/node_modules` was independently
  confirmed.
- Coordination commits after `113db39f` were inspected only to verify the live
  relay/entrypoint evidence; they were not treated as part of the exact DEV
  implementation diff.

## Should Watch

1. `model-routing.md`'s candidate set `[configured primary]` is mechanically
   safe but provides no actual fallback. That is acceptable now; add a successor
   only through an explicit future authority change with recorded family/grade
   metadata.
2. Keep historical cut/case-law model examples out of current-positive sweeps;
   they are evidence, not a second runtime table.

## Recommendation

**NOT MERGEABLE.** Create exactly one fresh fix-DEV successor. Its bounded
scope is Must Fix 1-5 only: reconcile the allowed current-rule/template
surfaces and durable entrypoint state without touching product/runtime,
scripts/workflows, skills/plugins/trackers, production, main checkout changes,
or `wt-applied-writing-lecture`. Then run fresh verification against the new
exact head and a fresh no-DEV-history re-review. No browser or owner QA is
required for this cut.
