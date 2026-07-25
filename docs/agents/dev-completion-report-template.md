# Ticket Completion Report Template

```text
Result: PASS | BLOCKED
Ticket: <path>
Commit: <hash>
Changed: <short file list>
Verify: <command: exit code; command: exit code>
Browser QA: required | passed | pending | not applicable
Risks: none | <short list>
```

Use verify summaries only. No raw command logs or implementation diary.

After the summary, return exactly one exit chosen from the ticket's `Terminal`
and `Next on PASS`. The detailed decision policy, skill-attachment rules, and
only complete new-task template live in `dispatch-protocols.md`.

- unfinished current-ticket work stays in `Next：留在当前任务`;
- a passed non-terminal ticket returns its declared successor handoff;
- provisioned user-visible work uses `owner-qa-handoff-template.md`;
- `DONE` is reserved for a fully closed initiative.

Do not restate the successor ticket. Link it and use the short canonical prompt
defined by `dispatch-protocols.md`.
