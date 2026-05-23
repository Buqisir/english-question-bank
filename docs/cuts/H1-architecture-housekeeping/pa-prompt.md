# H1 Small PA Prompt

Read this repo file first:

```text
docs/cuts/H1-architecture-housekeeping/agent-entrypoint.md
```

Then review:

```text
docs/cuts/H1-architecture-housekeeping/pm-spec.md
docs/cuts/H1-architecture-housekeeping/decisions.md
```

Mode: small PA, not implementation and not Big CR.

Context:

- H1 is an architecture housekeeping cut after C8.
- The goal is to extract server surfaces from `server/api.mjs` into owned
  modules while preserving behavior.
- H1 must not change product behavior, API response shape, status codes, DB
  schema, UI, PaperSurface, reading-analysis, or print-renderer behavior.
- PM has locked a four-PR plan:
  - H1-A router skeleton
  - H1-B Draft Paper + My Space server surface
  - H1-C C7 Paper Import server surface
  - H1-D exports / search availability seams
- Router approach is A+ minimal registry: `defineRoute`, `runRoutes`,
  `readJsonRouteBody`; no middleware stack, no nested route groups, no backend
  framework.

Review questions:

1. Is the H1 scope coherent, or too broad for one architecture goal?
2. Is the four-PR split safe and ordered correctly?
3. Is the A+ minimal route registry appropriate, or still too much abstraction?
4. Are the allowed / forbidden scopes tight enough?
5. Are verify and smoke gates sufficient for a behavior-preserving refactor?
6. Which hidden behavior-drift risks should DEV watch before writing code?

Write your report to:

```text
docs/cuts/H1-architecture-housekeeping/pa-review-opus.md
```

Report format:

- Verdict: `READY FOR DEV`, `READY WITH MUST FIX`, or `NOT READY`
- Must Fix Before DEV
- Should Watch
- Recommended PR split adjustments, if any
- Allowed / Forbidden scope corrections, if any
- Open PO Decisions count

Do not implement code.

After writing the report, reply only with:

- Report path
- Verdict
- Must Fix count
- Open PO Decisions count
