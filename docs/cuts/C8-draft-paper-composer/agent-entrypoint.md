# C8 Agent Entrypoint

Cut: C8 Draft Paper Composer / 草稿卷组卷与个人空间 V1
Stage: planning complete, pre-DEV / PRA follow-up
Owner: Codex daily PM / DEV / CR-lite / QA / RM; PO does final QA

## Current Objective

C8 builds the first teacher-operable draft-paper composition loop:
search structured question groups, add print-ready groups to the
current draft, preview a true A4-style student paper, reorder groups,
set group-level page breaks, export PDF / browser print, and optionally
save the finished PDF artifact to My Space.

## Required Reading

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `.kiro/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` for external PA / big CR
- `docs/cuts/C8-draft-paper-composer/pm-spec.md`
- `docs/cuts/C8-draft-paper-composer/decisions.md`
- `docs/cuts/C8-draft-paper-composer/pa-review-opus.md`
- `docs/adr/0006-draft-paper-as-distinct-entity.md`

## Source Of Truth

- Remote truth: GitHub `main`
- Planning PR: #92, merged
- Current accepted artifacts: PM spec, decisions ledger, Opus PA review

## Locked Product Boundaries

- Group is the minimum editable unit.
- Paper is the maximum output unit.
- C8 V1 exports student paper only.
- No answers, answer key, explanations, or teacher-analysis paper in C8.
- Editing controls stay outside the A4 white preview.
- Source metadata is retained for teacher-side editing, but not printed
  or shown inside the A4 preview.
- My Space stores finished artifacts, not live draft state.

## Must Preserve

- Search/API derives add-to-draft availability; cards only consume
  fields.
- Backend add-to-draft re-checks print readiness.
- Draft Paper is distinct from `paper_sets`.
- Legacy `assembly-basket-v1` gets a one-release read-only migration
  path, then is retired.
- Preview and PDF share one HTML source of truth via
  `server/print-renderer.mjs::buildPrintHtml`.

## Output Routing

Write any new PA, CR, PRA, or handoff artifact under:

```text
docs/cuts/C8-draft-paper-composer/
```

When asking an external agent to review C8, route it to this file
instead of pasting the full chat history.
