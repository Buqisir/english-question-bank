# DEV Completion Report Template

Use this template for Codex DEV and any explicit external-agent
implementation report.

Goal: make reports short enough for the PO to read and precise enough for Codex to CR without digging through chat logs.

Do not paste raw verify output. Summarize script names and pass/fail counts.

## Required Shape

The entire completion report must be one fenced `text` block and nothing else.

Recommended maximum: 60 lines.

```text
Completion Report
PR URL:
Branch:
Commit:
Baseline:

Changed Files:
- path
- path

Verify:
- script/name: N passed, 0 failed
- build/typecheck: passed
- git diff --check: clean

Browser QA:
- Required: yes/no
- If yes: viewport(s), flow tested, result
- If no: reason

Forbidden Scopes:
- app/src/shared-ui/papersurface/**: untouched
- shared/papersurface/**: untouched
- package / lockfiles: untouched

Known Risks / Expected False Positives:
- none

PO QA:
- Required: yes/no
- Checklist/link:
```

## Hard Rules

- Include PR URL, branch, commit, and baseline.
- List exact changed files.
- Use verify summaries only. No raw command logs.
- If a check was not run, say why.
- If browser QA is required, say what was clicked and what passed.
- If browser QA is not applicable, say why.
- Confirm forbidden scopes explicitly.
- Include known risks or expected false positives.
- Link the relevant PO QA checklist when the cut touches a visual surface.
- Do not include implementation diary, tool-by-tool narration, or long tables unless the user explicitly asks.

## Bad Report Smells

- The report is longer than the diff.
- The report contains full terminal output.
- The report says "all good" without changed files and verify counts.
- The report buries the PR URL below analysis prose.
- The report claims browser QA from static verify only.
- The report asks the PO to infer whether a scope was forbidden.
