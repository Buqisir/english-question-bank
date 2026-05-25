# I0-E PA-lite Prompt

Send this prompt to Claude. It should write the report into this repo path.

```text
Project: english-question-bank / PaperSurface
Cut: I0-E — Seven Choices Analysis Entry
Mode: PA-lite only. Do NOT implement. Do NOT edit code.

Target repo root:
/Users/huangxuewei/Projects/english-question-bank

Target branch:
main

You MUST write your final report to exactly:
docs/cuts/I0-seven-choices-entry/pa.md

Before writing, confirm:
- pwd
- git rev-parse --show-toplevel
- git branch --show-current

If repo root or branch does not match the target above, stop and reply:
ESCALATION: BRANCH CONFLICT — wrong repo root or branch.

Read these files:
- AGENTS.md
- docs/agents/pa-persona.md
- docs/cuts/I0-seven-choices-entry/goal.md
- docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md
- docs/cuts/I0-seven-choices-surface/decisions.md

Context:
- 七选五 analysis already exists as reviewed JSON and a working PaperSurface demo.
- This cut is not about changing the JSON contract, prompt, or Surface UI.
- This cut productizes the entry: search/group card -> `七选五解析` -> PaperSurface with first blank open.
- Existing Reading A-D entries must not regress.

Review focus:
1. Is the cut scope correct for moving 七选五 from demo URL to real teacher entry?
2. Is the strict availability gate sufficient and not over-engineered?
3. Is reusing `paperSurfaceHref` / `hasPaperSurfaceAnalysis` / `paperSurfaceLabel` the right model?
4. Are Reading A-D regression risks covered?
5. Are forbidden files and QA gates tight enough?
6. Is anything missing before DEV starts?

Output sections:
- Verdict: READY FOR DEV / APPROVE WITH MUST FIX / NOT READY
- Product Principle
- Must Fix Before DEV
- Should Watch
- Allowed / Forbidden scope corrections
- Static Verify Requirements
- Browser QA Matrix
- Open PO Decisions

After writing the report, reply in chat with only:
- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict
- Must Fix count
- Open PO Decisions count
```

