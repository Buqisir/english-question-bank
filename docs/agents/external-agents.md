# External-agent rules (DORMANT / archived)

> **Status: out of use.** The project currently runs as **小川 only** (one
> Claude wearing all hats) with no external high-reasoning agent. These rules
> are archived here, out of `AGENTS.md`'s standing instruction budget, so they
> stop costing every session that will never use them.
>
> **Re-activate** (move the relevant parts back into `AGENTS.md`, or point
> `AGENTS.md` here) only if an external agent is reintroduced.
>
> Extracted verbatim from `AGENTS.md` during the 2026-06 role-model
> consolidation (阿澈 / external retired → 小川-only).

## When an external high-reasoning agent exists

- External high-reasoning agents are reserved for large-cut second PA,
  direction checks, and occasional Big CR. Do not route routine small or
  medium implementation work through external DEV agents unless the owner
  explicitly asks for that exception.
- When an external PA is explicitly used, it must read and follow
  `docs/agents/pa-persona.md` before reviewing a plan. Its job is to find
  direction, boundary, data-contract, and rework risks before DEV starts.

## External DEV prompts (exception only)

- Historical external-agent handoff rules are no longer the default workflow.
  Only use external DEV prompts when the owner explicitly asks. In that
  exception, put the entire prompt in a repo file or a fenced chat block, and
  follow the current bounded result guidance in `AGENTS.md`.
