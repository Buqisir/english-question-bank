# Review Gate Levels

This repo uses first-principles, razor-cut review gates. Review strength follows risk, not anxiety.

First principles decide **why** a cut needs review. Razor discipline decides **where review stops**.

## Roles

- **PO**: product owner / final acceptance.
- **PA**: plan architect. Reviews roadmap, scope, architecture, and product boundary before implementation. Usually external / high-reasoning only for large cuts. External PA must follow `docs/agents/pa-persona.md`.
- **DEV**: implementation agent. Codex is the default DEV.
- **CR**: code reviewer. Codex performs routine CR-lite / CR; external big CR is occasional and reserved for high-risk cuts.
- **QA**: product / browser / visual acceptance. Codex does first QA; the owner does final PO QA.
- **RM**: release manager. Codex merges after approval and syncs `main`.

## Default Rule

- At the start of a cut, ask in order:
  1. **Irreversibility**: Does this affect future modules or contracts? If yes, use PA.
  2. **Visibility**: Can a teacher/user see it? If yes, use QA.
  3. **Runtime risk**: Does it enter runtime code? If yes, use CR.
  4. **Evidence fit**: Prefer static verify when it proves the risk. Do not run heavy gates that cannot observe the changed surface.
- Use **PA before DEV** for architecture, runtime modules, user-visible flows, data models, migrations, and export logic.
- Use **CR after DEV** for any PR that will be merged.
- Use **QA before RM** only when the change is user-visible or affects visual / interaction behavior.
- Docs-only and type-only cuts do not need browser QA.

## Levels

| Level | Change Type | Required Gates | QA? | Examples |
| --- | --- | --- | --- | --- |
| L0 | Pure record: inventory, checklist, sidecar doc that does not make product decisions | DEV completion + RM sanity check | No | sidecar inventory docs, QA checklist docs |
| L1 | Decision doc, ADR, types-only contract, verify-only planning cut | PA or CR, then RM | No | PaperSurface B1.5 ADR, B2 adapter plan |
| L2 | Isolated runtime module not mounted in product UI | PA + DEV + CR + static verify | No browser QA before merge | PaperSurface B3 module v1 |
| L3 | User-visible UI / route / interaction change | PA + DEV + CR + QA + RM | Yes | Paper Intelligence route integration, basket popover, insight interaction |
| L4 | High-risk core data, persistence, export, migration, or print/PDF path | PA + DEV + CR + QA + release checklist; consider second CR | Yes | print renderer, PDF export, Paper Set persistence, data migration |

## Stop Rules

Use these to prevent review from expanding forever.

### PA Stops When

- Scope is clear.
- Forbidden scope is clear.
- Verify / QA method is clear.
- The next cut answers exactly one core question.

### CR Stops When

- There are no Must Fix findings.
- Watch items do not block the current cut.
- Scope did not drift.
- Verify strength matches the risk.

### QA Stops When

- The main path works.
- No blocking user-visible experience issue remains.
- Polish items are recorded as follow-up, not absorbed into the current cut.

## Finding Semantics

- **Must Fix**: blocks the current PR.
- **Should Watch**: record and monitor; do not automatically turn it into a task.
- **Follow-up Gate**: must be resolved before a named future stage.
- **Nice-to-have**: do not schedule unless PO explicitly asks.

## Operating Notes

- Do not give every small cut an L3/L4 process. That burns time without improving quality.
- Do not downgrade tree-trunk work just because the diff looks small. Data contracts and runtime surface boundaries can be high risk even with few lines.
- One tree-trunk DEV at a time. Parallel agents may work on leaves: docs, inventories, QA checklists, examples, migration research, or static review prep.
- Night work should bias toward low-risk cleanup, docs, merge administration, and planning notes. Avoid major architecture decisions late at night.
- Default operating model: Codex owns daily PM / DEV / CR-lite / QA / RM. The owner does PO QA, not code review. External high-reasoning agents are used for large PA, direction checks, and occasional big CR only.
- Multi-agent handoff context is repo-first. PA / CR prompts and
  reports, DEV goal prompts, decisions, handoffs, QA contracts, and Cut
  Notes should be written to named repo paths. Chat messages route the
  agent to those files; chat history is not an authoritative review
  artifact.
- Default simplification:
  - L0 does not need formal CR unless it makes a decision.
  - L1 uses PA or CR, not both by default.
  - L2 uses PA + CR.
  - L3 adds QA.
  - L4 may add second CR / release checklist.
- External DEV prompts are exception-only. Use them only when the owner explicitly asks. In that exception, put prompt text in fenced code blocks and require the external agent to report PR URL, commit, exact changed files, verify, browser QA status, and forbidden scopes.
