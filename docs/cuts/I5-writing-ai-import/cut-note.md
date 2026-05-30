# Cut Note — I5 Writing AI Import

Cut: I5-writing-ai-import (应用文 + 读后续写)
Start date: 2026-05-29 (retroactive review of a pre-built feature)
Merge date: 2026-05-30 — PR #153, merge commit `e6264d8`
PA rounds: 1 (cold read) · Big CR rounds: 0 (CR-lite ×2 rounds)
Must Fix count: 4 total, all closed (PA 3, CR-lite 1)
Token / cost notes: heavy — multi-session (PM/PA/DEV/CR all separate) + PM re-verifying
every report. The re-verification earned its cost once (caught DEV's false
`verify-ci EXIT 0`). The browser-QA stretch over-drilled: hit an env dependency and
explored/built a synthetic asset + probed the relay API before handing the live import
back to the owner — should have handed off sooner. Agreed lean model for next cut:
one main session for PM+plan+DEV, cold sessions only at the PA and CR gates.

## Shipped

- Writing splitter: parses 应用文 (application) + 读后续写 (continuation) from the DOCX
  writing section into zero-Question writing groups with ≥2 English continuation starters.
- Six-family package builder + publisher: writing groups (`groupType:'writing'`),
  `writingTasks`, `answerBox` blocks, `getWritingGroups`, `questionId`-less writing QA
  links; whole-paper publish hard-blocks unless all six families are present.
- Plain-A4 writing paper view (`writingPaperViewAdapter` + harness routing).
- ADR-0007 (the two locked contract decisions); CONTEXT.md gains the **Writing Task** term.
- `verify-i5` registered in `verify-ci` (the writing publish-path proof now gates in CI).
- Process: `docs/agents/cr-persona.md` (new CR persona, wired into review-levels +
  cr-lite template) — rode along on this branch.

## Cut Or Moved

- Nothing cut. Three items deferred as follow-ups (below), not dropped.

## Wrong Assumptions Found

- **PM plan's reject-ordering reasoning was wrong.** The plan claimed verify-i2's
  reject fixtures stayed valid under six-family; true only for the family-completeness
  reject — the three seven-choices *content* rejects throw `缺少应用文写作` first. Cold PA
  caught it.
- **DEV round 1 reported `verify-ci EXIT 0` while it was red.** Removing verify-i1's
  scope guard unmasked a pre-existing four-family fixture that throws under six-family.
  Cold CR (reviewer≠implementer, re-ran verify) caught it.
- **Per-cut verify scope guards were branch-coupled bit-rot** — they red every sibling
  cut on a feature branch and pass on main only by accident. Removed from `verify:all`.

## Rules That Prevented Rework

- **reviewer ≠ implementer + "DEV report is input, not truth."** The single rule that
  caught the false green. Without an independent re-run it would have merged red.
- **PM and PA as separate cold sessions.** Caught the reject-ordering plan error before DEV.
- **Six-family checks placed *after* the four-family checks** (by the original author)
  preserved the `缺少七选五` error ordering — kept the verify-i2 fix mechanical.

## Verify And QA

- Static verify: `verify-ci` EXIT 0 (re-run at the RM gate), incl. `verify-i5` (82
  checks, with the real-DOCX assertions executing — not skipped). `verify-i2` green at
  six families with no scope-guard bypass.
- Browser QA (阿澈): writing A4 render — application + continuation — PASS, no console
  error on the `questionId`-less path (scenarios 4–5); real 四川成都七中高三二诊 paper
  writing parse PASS (scenario 6). `qa-i5.md`.
- PO QA: interactive workbench import (scenarios 1–3) not completed — blocked by an
  unrelated seven-choices/provider JSON issue, not I5. Behaviour already covered by PA +
  `assertPublishPath` + scenario 6.

## Watch / Follow-Up

- Watch ledger: F1 — `writingPaperViewAdapter` renders only from
  `group.passage.paragraphs`, ignores `writingTask.instruction`; cheap fallback noted.
- Follow-up gates:
  - Seven-choices (+ reading/cloze/grammar) AI analysis returns non-JSON on an
    OpenAI-compatible relay (#156's JSON-hardening only covered deepseek). Spawned as a
    separate task. I2/provider, not I5.
  - Register `verify-i4` in `verify-ci` — full I-series CI-gap close.
- Open PO Decision #1 (non-blocking): does the writing answer region (`answerBox`) ever
  render in the teacher view, or is it export/print-only? Decide before any writing-render
  cut.

## Handoff

- Next-cut handoff: none needed — cut closed, branch merged.
- Process change agreed: next cut runs the lean session model (one main session for
  PM+plan+DEV; cold sessions only at PA-before-DEV [if contract risk] and CR-before-merge).

## Next Cut

- The future **writing analysis** cut (model answer / scoring / AI feedback) — attaches
  at the Writing Task / group level with no `questionId` (ADR-0007 #4); resolve Open PO #1
  first.
- Or the seven-choices/provider JSON fix if a real relay-backed import is needed sooner.
