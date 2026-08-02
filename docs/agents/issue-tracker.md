# Tracked planning files

Use tracked Markdown only when a fresh task must consume the work:

```text
docs/cuts/<feature>/
  spec.md
  tickets/
```

A useful ticket states its status, blockers, bounded work, acceptance criteria,
allowed/forbidden surfaces when needed, verification, and result. It does not
need a machine-readable route or a governance approval artifact.

Wayfinder maps are low-resolution decision indexes. They are not phase state,
dispatch authority, tickets, or manifests. Phase receipts and ticket-set digest
approval are not part of the current workflow.

Optional research, decisions, QA evidence, and handoff notes belong under the
same cut only when future work genuinely needs them. `.scratch/` is gitignored
same-task scratch and must not become cross-task authority.
