# C8 PA Prompt

Send this prompt to the external PA instead of pasting the whole plan
into chat.

```text
/PA REVIEW
Project: english-question-bank / PaperSurface / question bank
Cut: C8 — Draft Paper Composer / 草稿卷组卷与个人空间 V1
Mode: PA only. Do NOT implement. Do NOT edit files. Do NOT write code.

Exception to "Do NOT edit files":
You MUST write your final PA report to this exact repo path:

docs/cuts/C8-draft-paper-composer/pa-review-opus.md

Only create or replace that one markdown file. Do not edit any product,
runtime, schema, test, or other documentation file. The report file is
the handoff artifact so the owner does not need to copy/paste your
review back to Codex.

First read:
- AGENTS.md
- .kiro/steering/README.md
- .kiro/steering/cut-workflow-protocol.md
- .kiro/steering/product-scope-discipline.md
- docs/agents/pa-persona.md
- docs/cuts/C8-draft-paper-composer/pm-spec.md
- docs/cuts/C8-draft-paper-composer/decisions.md

Role boundary:
You are the external PA. Codex/GPT handles PM, DEV, RM, local QA,
small CR, and merge/sync. Your job is to be the strongest architecture
and product reviewer: challenge assumptions, find Must Fix issues,
scope leaks, data-model risks, print/PDF risks, state risks, UI rework
risks, storage risks, verify gaps, and browser QA gaps.

Important context:
- C7 already built the whole-paper import workbench.
- C8 should not redo import, PaperSurface analysis, AI generation, or
  question-type parsing.
- C8's teacher task is composition and export: search -> add group ->
  draft paper -> preview -> reorder/page-break -> PDF/print -> My Space.
- Group is the minimum unit. Paper is the maximum unit.
- Student paper hides answers, analysis, and source labels.
- The A4 preview must stay close to the exported/printed PDF.

Required output sections:
Verdict
Product Principle
Exact UX / Architecture Model
Must Fix Before DEV
Should Watch
Allowed Files
Forbidden Files
Static Verify Requirements
Browser QA Matrix
DEV Readiness
Open PO Decisions

Review focus:
- Is C8 too large for one DEV goal / one PR?
- Should PDF export and My Space split from draft-paper composition?
- Does the draft-paper data model protect group-level composition?
- Does the UI model avoid a mini Word processor?
- Does the print-ready gate avoid fake addability?
- Does PDF generation have a realistic, verifiable path?
- Does My Space store stable artifacts without confusing them with live
  drafts?
- Are allowed / forbidden files correct?
- Are verify scripts and browser QA strong enough to prove the visible
  teacher workflow?

If more than 3 PO decisions remain, verdict must be DEV NOT READY.

After writing the file, reply with only:
- the report path
- your verdict
- the number of Must Fix items
- the number of Open PO Decisions
```
