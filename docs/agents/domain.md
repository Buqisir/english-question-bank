# Domain Docs

This repo uses a single domain context.

## Before Exploring

Read these files before changing product structure, domain model, architecture, tests, or implementation:

- `CONTEXT.md`
- relevant ADRs in `docs/adr/`
- product docs in `docs/`

If a term in code, docs, or issues conflicts with `CONTEXT.md`, prefer `CONTEXT.md` and flag the conflict.

## File Structure

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── agents/
└── app/
```

## Vocabulary Rule

Use the glossary terms from `CONTEXT.md` in code, issue titles, test names, and architecture notes. Do not drift between "item", "question", "task", "material", and "paper" when the domain term is already defined.

## ADR Rule

If a proposed change contradicts an ADR, say so explicitly before making the change.
