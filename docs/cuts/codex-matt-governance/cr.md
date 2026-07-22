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

---

## Fix Re-review — 2026-07-22

Role: fresh formal re-review; no DEV history and no implementation performed

- Re-review activation: `aa672b46cb7169a35ac7c17feb6354a984ddd5f3`
- Released verification predecessor-final HEAD:
  `18d6da32969621c53e9b11da5cc3261422643be8`
- Reviewed fix result:
  `49a3da95f72122ebaae8b80541f3a17cfd9b59e4`
- Exact fix diff:
  `git diff 64fafef0c5c6bbb913bc4c721535950fc76250ba..49a3da95f72122ebaae8b80541f3a17cfd9b59e4`
- Evidence input: the append-only fix section in `verification.md`, including
  every recorded failure

### Verdict

**NOT MERGEABLE — 3 unresolved Must Fix findings.**

The bounded fix stayed inside the ratified documentation allowlist. The sole
exact model/thinking authority, template relay fields, QA resume literal,
`tsc`, and full `verify:all` proof are now green. However, the current positive
rules still expose mutually exclusive relay owners, the live entrypoint still
cannot yield one current stage/action, and the required governance verification
matrix remains incomplete and contains a false-negative scan result.

### Changed Scope

- Fix delta: 13 documentation/current-rule paths, all allowed by `plan.md`.
- Forbidden product/runtime, scripts/workflows, skills/plugins/trackers,
  production, main checkout, and `applied-writing-lecture` scopes: untouched.
- No application, schema, data-contract, or user-visible behavior changed.

### Findings

#### Must Fix R1 — Current positive rules still define two incompatible relay owners

The plan's HR-6/HR-10 and one-way topology require every PA/DEV/verification/
CR/QA/RM relay role to be a new independently addressable task, with no
surviving parent coordinator. The fix updates several pointers but leaves
current executable instructions that recreate the old topology:

- `AGENTS.md:21-23,44,67-70` assigns PM + RM and the RM artifact gate to the
  main-agent session, while the plan requires CR to hand to a fresh RM task and
  exit.
- `docs/agents/review-levels.md:16-17` assigns first QA and RM release execution
  to the orchestrator/main-agent session rather than the fresh direct successor.
- `docs/steering/cut-workflow-protocol.md:173-174,295-301` still calls PA/CR
  role contexts "review subagents"; `:334-337` simultaneously assigns browser
  QA to the main agent.
- `docs/steering/README.md:69-70` says subagent reports become truth only after
  the main agent verifies remote state, reviving an ancestor consumer after the
  direct role already owns that check.

These are current positive rules, not historical evidence or the permitted
negative statement that a parent-owned subagent cannot satisfy a relay role.
Reconcile them with the one-way, independently addressable task contract and
leave each role's remote/evidence checks with that active role.

#### Must Fix R2 — The live entrypoint remains stale and machine-ambiguous

Fresh verification correctly records this failure, and the released entrypoint
still demonstrates it:

- `agent-entrypoint.md:15-30,34-73` says the pre-fix CR is current and the
  ready-held fix DEV is next.
- `:224` regresses the already completed original DEV to `release-authorized`.
- `:447` leaves the fix-verification activation as `this commit` instead of its
  durable activation commit.
- `:498-504` asks for the already completed verification/fix-DEV release and
  contains concatenated predecessor text, even while `:460-486` records this
  re-review as the sole active writer.

This fails HR-2/HR-7/HR-10 and the artifact contract. The next fix must make the
top-level stage, every completed stage record relevant to the live frontier,
and `Next Action` agree on exactly one role and transition.

#### Must Fix R3 — Required governance verification is incomplete and one scan is factually wrong

The fix verification proves `tsc` and full `verify:all` green, but it does not
close the plan's governance evidence contract:

- `verification.md:92-95` claims every remaining `subagent` mention is negative,
  historical, or non-relay; the current positive examples in Must Fix R1
  directly disprove that result.
- The fix section does not record the plan-required zero-Must-Fix routing check
  or a cross-file authority map, and it does not account for the contradictory
  main-agent/role-owner statements above.
- The recorded live lifecycle smoke is red (`verification.md:98-103`) and
  therefore cannot close the Auto-Next behavioral gate.

After R1-R2 are corrected, fresh verification must rerun and record the full
plan-named current-positive, zero-Must-Fix, authority-map, link, scope, and live
lifecycle checks with real results bound to the new exact implementation head.

### Standards

Hard violations: R1 violates the repository's single-authority and one-way
relay laws; R2 violates the machine-actionable entrypoint lifecycle; R3 violates
the plan-named proof contract. Judgment-call smell: relay ownership remains
duplicated across constitutional, gate-level, steering, and persona surfaces,
and that duplication has already drifted.

### Spec

Missing/partial requirements: canonical CR Must Fix 1, 4, and 5 remain partial
through R1-R3. No scope creep or forbidden-surface change was found. Canonical
Must Fix 3's reusable template/QA requirements are sufficiently closed.

### Verification Evidence

- `git diff --check 64fafef..49a3da9` -> PASS, exit `0`.
- Fix changed-path allowlist -> PASS; 13/13 paths allowed.
- Exact-model authority -> PASS; concrete current route values remain confined
  to `docs/agents/model-routing.md`.
- `pnpm -C app exec tsc --noEmit` -> PASS in fresh verification.
- `pnpm -C app run verify:all` -> PASS 84 / SKIP 1 / FAIL 0 in fresh
  verification.
- Current-positive authority scan -> FAIL under the re-review attack check;
  see R1.
- Live lifecycle smoke -> FAIL as recorded by fresh verification; see R2.
- Browser/owner QA -> not required for this docs-only governance cut.

The recorded artifact-gate failure caused only by missing `cut-note.md` is not a
fix-DEV blocker: the canonical plan assigns RM to write `cut-note.md` and then
run the Large artifact gate. It remains a mandatory RM follow-up gate.

### Failure / Attack Angle

A future agent can read `AGENTS.md` or `review-levels.md`, keep a PM/root session
alive through RM, or treat a review subagent as the PA/CR relay. Another task can
read the live entrypoint and release an already completed predecessor instead
of acting on the current frontier. The existing scan would falsely certify both
failures as compliant.

### Self-Review Blind Spots

- This re-review did not duplicate the unchanged successful `tsc` or full-suite
  run; the fresh verifier bound both to the fix result and no product/runtime
  file changed afterward.
- Historical cut/case-law language was excluded from current-positive findings.
- No implementation, QA, RM, merge, push, or production action was performed.

### Should Watch / Follow-up Gate

1. RM must create non-empty `cut-note.md` before rerunning the Large artifact
   gate; the current absence is expected before RM, not permission to waive it.
2. Historical concrete model selections remain evidence only and must not become
   a second runtime routing table.

### Recommendation

**NOT MERGEABLE.** Create exactly one fresh fix-DEV successor scoped to R1-R3,
then repeat fresh exact-head verification and a fresh no-DEV-history re-review.
No browser or owner QA is required. Do not route to RM until the canonical CR
has zero Must Fix findings.

---

## Fix DEV 2 Re-review — 2026-07-22

Role: fresh formal re-review; no DEV history and no implementation performed

- Re-review activation: `bf6842c0952c927753c01943e37c3305f64839b0`
- Released verification predecessor-final HEAD:
  `c140afbf0acce3e88d560430c8299e5bbd59589a`
- Reviewed Fix DEV 2 result:
  `8cb228e9ce51f147eda2188c93b6fdeb9144d103`
- Exact fix diff:
  `git diff 076c1ff9ce46eb2933eee93ae7a782cfa945f2b1..8cb228e9ce51f147eda2188c93b6fdeb9144d103`
- Evidence input: `Fix DEV 2 exact-head verification` in `verification.md`,
  including every recorded failure

### Verdict

**NOT MERGEABLE — 3 unresolved Must Fix findings.**

Fix DEV 2 stayed inside the ratified documentation allowlist and corrected the
headline QA/RM ownership statements it touched. It did not remove all current
positive ancestor/PM+RM ownership, the fresh verifier recorded the live
lifecycle smoke red, and both required integration commands are red. The
verification matrix therefore cannot close R1-R3 or DP-6.

### Changed Scope

- Fix delta: five documentation/current-rule paths, all allowed by `plan.md`.
- Forbidden product/runtime, scripts/workflows, skills/plugins/trackers,
  production, main checkout, and `applied-writing-lecture` scopes: untouched.
- No application, schema, data-contract, or user-visible behavior changed.

### Findings

#### Must Fix R1 — Current positive rules still revive the ancestor PM/RM owner

The changed headline rules now assign QA and RM to fresh direct successors, but
other current executable instructions still say the opposite:

- `docs/agents/review-levels.md:29` says the orchestrator resumes after PA to
  compress the plan, rather than PA handing to a fresh PM plan-revision task;
  `:83-84` assigns sampled browser QA to the main agent; and `:107-112`
  explicitly says 阿澈 wears PM / UI-direction / RM.
- `docs/agents/pa-persona.md:13-17` and
  `docs/agents/cr-persona.md:26-29` still declare that 阿澈 wears the PM / RM
  hats. These are active personas, not historical records.
- `docs/steering/README.md:131-135` still routes the completion protocol as a
  DEV-subagent report surface without limiting that wording to role-internal
  assistance.

These statements conflict with HR-6/HR-10 and the fresh-direct-RM law now added
to `AGENTS.md`. They also falsify `verification.md:143-145`, whose relay scan
and authority map report PASS without accounting for these current surfaces.
R1 is not closed.

#### Must Fix R2 — The live lifecycle smoke remains red

The verifier bound its evidence to Fix DEV 2 and explicitly records at
`verification.md:147` that the top-level Current Stage, Must Read, Stage
Contract, and Next Action still named Fix DEV 2/provisioning while verification
was active. Inspection of released predecessor-final
`cfa316391de64b1dde0af20e05e5f681a2fd5f6e` confirms that mismatch: its
top-level stage still calls Fix DEV 2 the sole writer and its Next Action still
asks to provision/release the already-active verifier.

That is the exact HR-2/HR-7/HR-10 failure R2 required the fix to remove. Later
append-only dispatch blocks do not turn the failed transition into a green live
smoke. The next fix must make each released/activated frontier yield one current
role and one unique next action, then obtain fresh recorded lifecycle evidence.

#### Must Fix R3 — Required verification is red and contains false-positive passes

The fresh evidence records:

- `pnpm -C app exec tsc --noEmit` -> raw exit `254`, FAIL (`tsc` unavailable);
- `pnpm -C app run verify:all` -> raw exit `1`, FAIL (preflight typecheck exit
  `127`);
- live lifecycle -> FAIL; and
- relay ownership / authority-map -> PASS despite the R1 contradictions above.

The plan requires real green exact-head integration proof plus a truthful
current-positive scan, cross-file authority map, and live lifecycle smoke.
Missing dependencies explain the command failures but do not waive them;
ordinary environment failure stays in the repair/verification loop. R3 remains
open until the rules/lifecycle are corrected and a fresh verifier records the
full matrix and integration commands green against the new head.

### Standards

Hard violations: R1 preserves contradictory current authorities for relay
ownership; R2 leaves the executable routing artifact unable to name one live
frontier; R3 presents red and factually incomplete proof. Judgment-call smell:
the same PM/RM ownership fact remains duplicated across constitutional,
review-level, persona, and steering files and has drifted again.

### Spec

All three assigned requirements remain partial. There is no scope creep or
forbidden-surface change. The Fix DEV 2 edits are directionally correct, but
they do not satisfy canonical R1-R3 or the plan's verification contract.

### Verification / Attack Evidence

- Merge base `076c1ff..8cb228e` -> exact `076c1ff...`.
- `git diff --check 076c1ff..8cb228e` -> PASS, exit `0`.
- Changed-path allowlist -> PASS; five of five paths allowed.
- Exact model authority and changed-link resolution -> accepted from fresh
  evidence; no contrary attack finding.
- Current-positive relay/authority attack -> FAIL; see R1.
- Live lifecycle -> FAIL in fresh evidence; see R2.
- `tsc` / full `verify:all` -> FAIL in fresh evidence; see R3.
- Browser/owner QA -> not required for this docs-only governance cut.

A future task can still read an active persona or review-level rule, retain a
PM/RM ancestor through release, and believe it followed the repository. It can
also trust the green authority-map row even though the cited current positive
rules contradict it, or route from a stale top-level Next Action.

### Self-Review Blind Spots / Follow-up Gate

- This re-review did not install dependencies or duplicate the failed full
  suite; the plan assigns repair and new exact-head evidence to the next
  fix/verification loop.
- RM must still create non-empty `cut-note.md` and run the Large artifact gate
  after, and only after, canonical CR reaches zero Must Fix.

### Recommendation

**NOT MERGEABLE.** Create exactly one fresh fix-DEV successor bounded to
R1-R3. It must reconcile every current positive PM/RM/DEV-relay owner, repair
the live frontier fields without rewriting historical evidence, and restore
the normal worktree dependencies needed by fresh verification. Then run one
fresh exact-head verification and one fresh no-DEV-history re-review. Do not
route to RM yet; browser and owner QA remain not required.
