# Cut Note

Cut: I4-A grammar-fill AI import
Start date: 2026-05-26
Merge date: 2026-05-27
PA rounds: 1
Big CR rounds: 1
Must Fix count: 5 (all closed)
Token / cost notes: ~2 sessions

## Shipped

- DOCX splitter parses 语法填空 section (q56-q65, 10 blanks, prompt words)
- Answer-analysis DOCX extracts actual-word answers for q56-q65
- Package builder enforces four-family completeness (Reading A-D + 七选五 + 完形 + 语法填空)
- Publisher wires grammar-fill groups into QA links
- `grammarFillPaperViewAdapter.ts` renders plain paper view (passage + blanks + prompts, no analysis)
- UI shows grammar-fill status/preview and blocks publish on missing family
- I4 verifier (`verify-i4-grammar-fill-ai-import.mjs`) covers splitter, package builder, route, and real DOCX
- I1 verifiers updated to tolerate I4 cross-cut files in scope checks

## Cut Or Moved

- Grammar-fill AI analysis (explanation cards, evidence lines, highlights) — out of I4-A
- Writing task import — deferred to I5
- Search/list optimization — not in I4-A scope

## Wrong Assumptions Found

- `buildPaperImportAiPackageFiles` was called with reading-only fixture in I1 verifier; needed four-family fixture after I4 tightened the contract

## Rules That Prevented Rework

- Forbidden scope in plan prevented schema changes or grammar analysis additions
- Stable error codes (`grammar_fill_group_missing`, `grammar_fill_answer_missing`) kept blocking states observable
- I1 verifier `crossCutAllowed` pattern prevented scope check regressions when I4 files share directories with I1

## Verify And QA

- Static verify: `verify-i1-paper-import-*` (3 scripts, PASSED), `verify-i4-grammar-fill-ai-import.mjs` (PASSED), `verify-i3-cloze-ai-import.mjs` (PASSED)
- Browser QA: upload paper + answer-analysis DOCX, confirm four-family previews, publish, open grammar-fill QA link
- PO QA:合格

## Watch / Follow-Up

- Watch ledger: none
- Follow-up gates: I5 writing task import is the natural next cut

## Handoff

- Next-cut handoff: grammar-fill is now a required family for standard objective paper publish; any future cut that touches `packageBuilder.mjs` must account for four-family contract

## Next Cut

- I5: writing task import (作文导入)
