# Issue Tracker: Local Scratch Markdown

Issues and PRDs may be drafted as markdown files in `.scratch/`.
`.scratch/` is gitignored local scratch space, so it is not visible to
other agents and must not be treated as shared source of truth.

This project is currently local-first and not connected to GitHub Issues. When a skill says "publish to the issue tracker", create or update local markdown files.

For multi-agent cuts, shared truth lives in tracked repo files:

- cut context and prompts: `docs/cuts/<CUT>/`
- accepted decisions: `docs/cuts/<CUT>/decisions.md`
- review reports and handoffs: `docs/cuts/<CUT>/`
- PR review history: the GitHub PR after the branch is pushed

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues live at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments and conversation history append under a `## Comments` heading
- Before another agent depends on a decision, copy it from `.scratch/` into
  a tracked cut file, ADR, or PR description.

## Current Feature

The current feature folder is:

```text
.scratch/v0-foundation/
```

Use it for V0 planning, setup, and first implementation slices until a narrower feature slug is created.
