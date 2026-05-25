# Claude Lite PA Prompt — I0-D Seven Choices PaperSurface Experience

Cut: I0-D 七选五 PaperSurface experience
Review type: PA-lite
Output: `docs/cuts/I0-seven-choices-surface/claude-lite-pa.md`

## Assignment

Act as PA only. Do not edit files. Do not implement. Do not propose broad
redesign.

Use `docs/cuts/_templates/external-review-report.md` as the report structure.

Review whether the I0-D product / architecture plan is ready for a small DEV
slice.

## Target

- Target repo root: `/private/tmp/eqb-i0c-plus`
- Target branch: `codex/h5-a-post-merge-audit`
- Target report path:
  `/private/tmp/eqb-i0c-plus/docs/cuts/I0-seven-choices-surface/claude-lite-pa.md`

Before writing, confirm:

- `pwd`
- `git rev-parse --show-toplevel`
- current branch
- target report absolute path

If repo root or branch does not match, stop with:

```text
ESCALATION: BRANCH CONFLICT
```

## Must Read

- `docs/cuts/I0-seven-choices-surface/agent-entrypoint.md`
- `docs/cuts/I0-seven-choices-surface/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`
- `app/public/paper-assets/paper-2024-jslk-english/paper-asset.json`

## Review Focus

- Is the left article + right A-G option-pool model coherent for 七选五讲题?
- Is the blank-chain toggle model clear enough for DEV?
- Are `mechanismSignals`, `topicClues`, and `contextEvidence` consumed with the
  right responsibilities?
- Can the first DEV slice reuse PaperSurface without touching shared renderer
  files?
- Should the first DEV slice include search / concierge entry, or stay as a
  direct PaperSurface route only?
- Identify Must Fix items before DEV and any Open PO Decisions.

## Output Requirements

Write the report to:

```text
docs/cuts/I0-seven-choices-surface/claude-lite-pa.md
```

Use `docs/cuts/_templates/external-review-report.md` sections.

In the Verdict section, use one of:

- READY FOR DEV
- APPROVE WITH MUST FIX
- DEV NOT READY

Include these counts clearly:

- Must Fix count
- Should Watch count
- Open PO Decisions count

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict
- Must Fix count
- Should Watch count
- Open PO Decisions count

If blocked, use one `ESCALATION:` line instead.
