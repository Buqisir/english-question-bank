# Live-State Convergence Migration

This is the sole bootstrap entry for the one-time migration approved on
2026-07-22. It is temporary routing input for the migration DEV only; the
resulting `agent-entrypoint.md` becomes the sole live-state authority.

## Source and boundary

- Legacy source: `git show 9ec43198eba2f3381e52af9aec7c5481b5d8109b:docs/cuts/codex-matt-governance/agent-entrypoint.md`
- The source must be copied verbatim into `relay-history.md` under an
  `Imported legacy record` heading and marked non-authoritative.
- Do not use or copy any uncommitted verifier draft. It was an interrupted
  agent-only draft, not accepted history.
- Do not rewrite, correct, organize, or infer facts from imported history.

## Required output

1. Replace `agent-entrypoint.md` with a 40–80-line structured live state.
2. Add append-only, non-authoritative `relay-history.md` with the verbatim
   legacy source above.
3. Add or update a machine check that reads only structured live-state fields.
4. Record the migration result and move the new live state to `handoff-ready`
   for exactly one top-level fresh verification successor.

## Live-state fields

`Lifecycle state`, `Active role`, `Source branch`, `Current worktree`,
`Released input head`, `Current evidence`, `Direct successor authorization`,
and exactly one numbered `Next Action`.

Allowed states and compatibility:

| State | Active role | Successor | Next Action |
| --- | --- | --- | --- |
| `active` | exactly one | none | complete current role |
| `handoff-ready` | none | exactly one top-level role | create that successor |
| `human-QA` | `owner-QA` | none | wait for owner QA |
| `blocked` | none | none | one recovery action |
| `closed` | none | none | `STOP / cut complete` |

`released_input_head` must exist in this repository and be an ancestor of
current HEAD; it need not equal current HEAD. Detached HEAD is allowed.
Do not store activation/result/current commit hashes in live state.

## Scope

Allowed: this cut's `plan.md`, `agent-entrypoint.md`, `relay-history.md`,
`migration-entry.md`, `verification.md`, the minimal machine-check surface,
and the smallest necessary current-rule pointers.

Forbidden: product/runtime/server/schema/data changes, production, merge/push,
PA, subagents, and any historical rewrite beyond verbatim import.

## Next relay

After the migration result commit has `handoff-ready`, create exactly one
top-level fresh verification task with explicit `gpt-5.6-terra` / `medium`.
Do not wait for its result. If creation fails, record `blocked` with one
recovery action; do not fall back to a subagent.
