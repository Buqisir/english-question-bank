# C7 PA Prompt

Send this short prompt to the external PA instead of pasting the whole
plan into chat.

```text
/PA REVIEW
Project: english-question-bank / PaperSurface
Cut: C7 — Whole Paper Import Workbench / 整卷导入工作台
Mode: PA only. Do NOT implement. Do NOT edit files. Do NOT write code.

First read:
- AGENTS.md
- .kiro/steering/README.md
- .kiro/steering/cut-workflow-protocol.md
- .kiro/steering/product-scope-discipline.md
- docs/agents/pa-persona.md
- docs/cuts/C7-whole-paper-import-workbench/pm-spec.md
- docs/cuts/C7-whole-paper-import-workbench/decisions.md
- docs/adr/0004-c7-paper-import-atomicity.md
- docs/adr/0005-c7-versioned-file-protocol.md

Role boundary:
You are the external PA. Codex/GPT handles PM, DEV, RM, local QA,
small CR, and merge/sync. Your job is to be the strongest architecture
and product reviewer: challenge assumptions, find Must Fix issues,
scope leaks, data-model risks, validation gaps, QA gaps, storage risks,
and future-cloud migration traps.

Do not review C6b. Do not discuss activeOptionLabel, radio accordion, or
option evidence UI unless you find a direct C7 regression in search or
PaperSurface entry behavior.

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

If more than 3 PO decisions remain, verdict must be DEV NOT READY.
```
