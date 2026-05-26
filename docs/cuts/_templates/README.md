# Cut Artifact Naming

These rules apply to new cuts. Do not rename historical cut artifacts just to
match this convention.

## Default Directory

Medium and large cuts may use:

```text
docs/cuts/<cut-id>/
```

Small cuts should usually not create a cut directory. Use chat, a PR
description, or the code diff unless the work needs durable handoff.

## Standard Files

Use the smallest file set that preserves the work:

```text
docs/cuts/<cut-id>/
  plan.md       # DEV execution contract; required before medium/large DEV
                # (historical cuts may use the legacy name `goal.md`)
  decisions.md  # accepted product / architecture decisions, when decisions exist
  pa.md         # formal PA report; required for large PA, optional otherwise
  cr.md         # formal CR / Big CR report; required for large/high-risk CR
  cut-note.md   # large-cut closeout record
  handoff.md    # only when work crosses agent/session/day boundaries
```

Optional prompt archive files:

```text
  pa-prompt.md  # only when a one-off PA prompt must be preserved
  cr-prompt.md  # only when a one-off CR / Big CR prompt must be preserved
```

If external AI input material is substantial and worth preserving, prefer
including it inside `pa-prompt.md`, `cr-prompt.md`, or `plan.md` rather than
creating another generic context file. Avoid vague names such as `context.md`.

The names `goal` and `loop` are reserved for run-mode commands and must not be
used as document names in new cuts.

## Review Naming

- Do not encode `lite` / `big` in filenames by default.
- Formal PA reports use `pa.md` whether the review was light or deep.
- Formal CR / Big CR reports use `cr.md`.
- CR-lite findings for routine small / medium PRs may live in the PR
description or final Codex summary instead of `cr.md`.
- PA-lite findings may be compressed into `plan.md` / `decisions.md` instead of
creating `pa.md`, unless the review itself is an important handoff artifact.

## Commit Rules

- Commit `plan.md` before starting medium / large DEV.
- Commit `pa.md` / `cr.md` when they are formal external review records.
- Commit `cut-note.md` before closing a large cut.
- Do not commit prompt files merely because they existed in chat; commit them
only when future agents need to rerun, audit, or resume from them.

## RM Artifact Gate

Before RM merge, required artifacts must exist and be non-empty. Missing
required artifacts stop the merge with `ESCALATION: CONTEXT
INSUFFICIENT`.

Medium cuts:

- `plan.md`
- `pa.md`, or PA-lite recorded in `plan.md` / `decisions.md` when PA was
  used
- `cr.md`, or PR-description / final-summary CR record when Big CR was
  triggered

Large cuts additionally require:

- `cut-note.md`

## External Agent Rule

Default external-agent behavior is chat-first while the team is still deciding.
Codex writes the final accepted rule or artifact into the repo.

External agents may write directly to repo only when the prompt gives:

- target repo root
- target branch / PR
- target absolute output path
- required worktree check
- exact allowed output file

If any of those are missing, the external agent should return advice in chat
instead of writing files.

## Hard Rules

1. Small cuts do not create `docs/cuts/<cut-id>/` by default.
2. Medium / large cuts must commit `plan.md` before DEV starts.
3. Formal PA reports are named `pa.md`.
4. Formal CR / Big CR reports are named `cr.md`.
5. Routine CR-lite can stay in the PR description or Codex final summary.
6. Prompt archive files are optional and named `pa-prompt.md` or `cr-prompt.md`.
7. External AI input should be folded into a prompt or goal file unless it is a
   durable standalone artifact.
8. Claude / external agents discuss in chat until Codex or the owner asks them
   to write a specific repo path.
9. RM merge stops when required medium / large artifacts are missing or empty.
10. Large cuts need `cut-note.md` before closeout.
11. Keep the file set minimal; do not fill templates just to satisfy ceremony.
