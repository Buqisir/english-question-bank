# PA Prompt — I5 Writing AI Import

Cut: `I5-writing-ai-import` — writing import (应用文 application + 读后续写
continuation) for the AI paper importer.
Review type: PA (cold read). **Retroactive:** the feature is already built (prior
Opus 4.7 session, no original plan/PA). Review whether it can **land on `main`**,
not whether to start DEV.
Output: `docs/cuts/I5-writing-ai-import/pa.md`.

## Assignment

Act as PA only. Do not implement. Do not patch files. Cold-read the already-built
feature as an **unreviewed proposal**. Find direction, boundary, data-contract,
verification, and rework risks before it lands.

Verify your own baseline first — do not trust the PM's plan.md as truth:

- `git fetch`; confirm you are on `codex/i5-writing-ai-import`, synced to
  `github/main` (you should see merge `2fcca09` and PM grill commit `41dab1b`).
- Treat `plan.md` as input. It leaves three open questions **for you to answer
  independently**; its wording is not a settled conclusion.

Use `docs/agents/pa-persona.md` Required Output sections (Verdict, Product
Principle, Exact UX / Architecture Model, Must Fix Before Land, Should Watch,
Allowed Files, Forbidden Files, Static Verify Requirements, Browser QA Matrix,
Land Readiness, Open PO Decisions).

## Must Read

- `docs/cuts/I5-writing-ai-import/agent-entrypoint.md`
- `docs/cuts/I5-writing-ai-import/plan.md` (PM grill outcome + 3 open questions)
- `docs/adr/0007-writing-import-data-contract.md` (the two PO-locked decisions)
- `server/paper-import-ai/packageBuilder.mjs` (six-family enforcement `:184–215`;
  writing groups + `writingTasks` + `answerBox` `:530–639`)
- `app/src/features/paper-intelligence/writingPaperViewAdapter.ts` (A4 writing view)

## Background

Skim only if unfamiliar or not already loaded.

- `CONTEXT.md` (domain glossary — now carries **Writing Task**)
- `AGENTS.md` ("Collaboration Workflow"; large-cut flow applies)
- `docs/steering/cut-workflow-protocol.md`, `docs/steering/product-scope-discipline.md`
- `docs/agents/pa-persona.md`, `docs/agents/review-levels.md`
- `server/paper-import-ai/publisher.mjs` (`getWritingGroups`, writing QA links)
- `scripts/verify-i5-writing-ai-import.mjs` (the contract, 509 lines)

## Review Focus

The spine of the report — answer each independently:

1. **Adapter-layer boundary.** `writingPaperViewAdapter.ts` lands in the
   PaperSurface adapter layer, which I2 deliberately declared a forbidden contract
   surface (`verify-i2:115` forbids `*Adapter.ts`). Decide: is writing-import a
   legitimate extension of that layer, or does the writing view belong elsewhere?
   Verify the A4 plain-writing rendering is correct (prompt/material + answer box,
   part/section headings, page breaks). State the rule DEV should follow.

2. **Scope-guard CI design.** `verify-i2`/`verify-i3` carry per-cut branch-time
   scope guards (diff `github/main...HEAD`, assert only that cut's files changed).
   They red on any sibling cut's files and pass on `main` (empty diff). Decide the
   correct mechanism: should these guards run in `verify:all` CI at all, or be
   cut-time only / tolerant of sibling cuts? Your decision is what DEV task 2
   implements. (This is the standing "i4/i5 unconditional scope guards" follow-up.)

3. **Writing publish/export with no `questionId`.** Writing groups have zero
   Questions, so `getWritingGroups`, writing QA links, and the workbench's
   six-family publish blocking all operate without a `questionId`. Pressure-test
   correctness: does publish/export hold together, and is "writing QA links without
   `questionId`" sound (per ADR-0007), or does it leak a defect?

You may also raise risks `plan.md` does not cover — that is PA's value.

**Locked decisions (ADR-0007) — challenge allowed, override not.** Two decisions
are PO-locked: (1) writing = a zero-Question Question Group + Writing Task (not a
hollow Question); (2) six-family completeness is enforced because the importer
ingests only complete standard papers. You may challenge either if you find strong
evidence it is wrong — write "challenge + evidence + impact" as an **Open PO
Decision** and escalate. Do not silently rewrite code or specs around a locked
decision; if a spec/ADR genuinely contradicts the code, stop with
`ESCALATION: SPEC CONTRADICTS`.

Sanity-check (not a focus): `plan.md` DEV task 1 fixes `verify-i2`'s four-family
fixture to six families (template `verify-i4:219–229`). Confirm that fix is
sufficient and the reject-fixture ordering reasoning holds.

## Escalation Signals

If the report cannot be written reliably, reply in chat with one line only — do
not write a partial PA report:

- `ESCALATION: CONTEXT INSUFFICIENT — <what is missing>`
- `ESCALATION: BRANCH CONFLICT — <pwd / branch mismatch>`
- `ESCALATION: SPEC CONTRADICTS — <which two specs disagree>`
- `ESCALATION: SCOPE UNCLEAR — <what the plan does not answer>`

## Output

Write the full PA report to:

```text
docs/cuts/I5-writing-ai-import/pa.md
```

Worktree check before writing:

- Target repo root: `/Users/huangxuewei/Projects/english-question-bank`
- Target branch: `codex/i5-writing-ai-import`
- Target absolute report path:
  `/Users/huangxuewei/Projects/english-question-bank/docs/cuts/I5-writing-ai-import/pa.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and current
  branch match the target. If not, stop with `ESCALATION: BRANCH CONFLICT` instead
  of writing in a side worktree such as `.claude/worktrees/`.
- After writing, confirm the absolute report path and `git status --short` entry
  for the new file.

Use `docs/agents/pa-persona.md` Required Output sections.

If PA returns any Must Fix items, include a `Must Fix -> Plan Disposition
Checklist` with one entry per Must Fix, stating where the PM must reflect it in
`plan.md` (`Locked decisions`, `DEV tasks`, `Forbidden scope`, `Verification`, or
`PA Follow-Up Decisions`). Do not edit `plan.md` directly; PM applies follow-ups.

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict (one of: `APPROVE TO LAND`, `APPROVE WITH MUST FIX`, `NOT READY`,
  `REJECT / RESCOPE`)
- Must Fix count
- Open PO Decisions count

If blocked, use one `ESCALATION:` line instead.
