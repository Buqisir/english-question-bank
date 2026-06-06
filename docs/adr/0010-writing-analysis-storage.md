# Writing analysis is backfillable, file-stored display 解析 — not publish-gated, not a DB search dimension

Status: accepted (PM grill 2026-06-05, PO 黄学伟)

Context: I18 builds the **Writing Analysis** that ADR-0007 anticipated ("future writing
analysis attaches at the writing group / Writing Task level with no questionId"). It was
never built — no schema, no type, no storage, no front-end panel; a writing group's right
panel renders blank today. Deciding where it lives mattered because the project already has
two established homes for "解析-like" data, and writing analysis fits neither cleanly:

- **Base per-type 解析** (reading / cloze / grammar / seven-choices) — publish-gated, frozen,
  stored as files under `app/public/paper-assets/<id>/latest/analyses/*.json`. ADR-0008 calls
  these "grandfathered as a deliberate quality policy."
- **Derived teaching dimensions** (topic / verb axes / difficulty) — backfillable, converging on
  the DB generic-attribute store (ADR-0008 / 0009). That store exists **to power search**
  ("adding a search becomes an indexed query").

Decision: Writing Analysis lands in a **third quadrant** — stored as an **additive file** in the
paper-asset (`latest/analyses/writing-analysis-v1.json`), attached via
`PaperAnalysis.groups[groupId].writing`, but **NOT publish-gated**; it is backfilled post-import
like a derived dimension. Two reasons fix the two axes:

1. **File, not DB store — because it is display 讲评, not a search dimension.** Writing Analysis
   is read on the paper surface (the writing counterpart of per-Question Analysis). Nobody searches
   "find tasks whose model answer contains X." The ADR-0009 DB store is for *searchable* dimensions;
   putting display 讲评 there is a category error and would split "analysis" loading across two
   layers. So it lives where the other display 解析 live: paper-asset files.
2. **Backfillable, not import-gated — because its input is preserved.** The writing prompt/material
   is fully in the primary capture, so by ADR-0008's default a judgment over it is backfillable.
   Adding it must never block the 12 already-published papers, so it stays **out of the six-family
   completeness gate** (ADR-0007). A writing group publishes and renders fine with or without it.

Storage mechanics (no new protocol needed): the front-end already fetches per-family analysis
files **by name** (`analyses/<family>-analysis-v1.json`), and the verb-profile sidecar (#189,
`grammar-fill-verb-profile-v1.json`) already proves the pattern — an additive, git-tracked file in
`latest/analyses/`, backfilled post-publish with **no full re-publish and no versioned-file dance**.
Writing Analysis is one more such file, keyed by groupId under a `groups` slot holding
`{ writing: WritingAnalysis }`. The backfill driver mirrors `vp-driver.mjs`.

Consequences:
- **"Analysis" now spans two storage homes by KIND, and the dividing line is display-vs-search, not
  frozen-vs-derived.** Display 解析 (per-Question reading/cloze/grammar/seven **and** Writing
  Analysis) live as files in paper-assets; searchable dimensions (topic/verb/difficulty) live in the
  DB store. This is the rule for the next "where does this 解析-like thing go?" question.
- **Writing Analysis is the first file-stored 解析 that is NOT publish-gated.** Base 解析 are gated;
  writing is additive/optional. The panel shows it only when the file is present (consistent with
  the "show only when complete" spirit, applied per writing group).
- **Contract slot is additive**: `GroupAnalysis.writing?: WritingAnalysis`; existing reading
  GroupAnalysis (`overview` / `discourseStructure`) and all per-Question analysis are untouched.
- **Reversible at derived-data cost only**: if Writing Analysis ever became searchable, moving it
  into the DB store is a migration, but its input is preserved so it is re-derivable — consistent
  with ADR-0009's source_version / staleness philosophy. Storage *location* is the hard-to-reverse
  part this ADR pins.
- v1 composition (Model Answer + Highlight Expressions, application task only) is a separate product
  decision, recorded in CONTEXT.md and `docs/cuts/I18-writing-analysis/plan.md`, not here.
