# EQB 试卷 Canonical 大一统 — Wayfinder Map

Status: charted
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/01-audit-current-authorities.md`
Terminal: no

## Notes

- Objective: make every currently supported high-school English paper family pass through one source-traceable canonical backbone before Screen, Print/PDF, and DOCX consumption.
- Worktree: `/Users/huangxuewei/Projects/wt-paper-canonical-unification-20260725`
- Branch: `codex/paper-canonical-unification-20260725`
- Chart fixed point: `19ffc7744c656b526f55934c8c73e245acf7323f`
- Owner-confirmed scope:
  - keep Source Capture immutable;
  - record deterministic transformations and fail closed to `needs_review` when meaning or identity is ambiguous;
  - share one normalization envelope while giving each question family its own canonical variant;
  - separate reusable Paper Format Profiles from each paper's Canonical Paper Plan;
  - keep Analysis as a supplement rather than a constructor of paper semantics;
  - publish additive canonical sidecars instead of starting with `paper-asset-v2`;
  - make tables and figures first-class canonical content;
  - represent listening in the whole-paper plan as `raw/inactive` without activating a website Question Group in this effort;
  - hard-gate new imports first, then migrate all 33 current `latest` assets; historical `versions/vN` remain immutable in the first migration;
  - preserve distinct NCK1, Zhejiang legacy, and national legacy profiles rather than rewriting real historical formats into one exam shape.
- Accepted vertical order: standards/profile/plan foundation → seven choices → reading → application writing → continuation writing → listening raw/inactive → new-import rollout → all-`latest` migration and legacy retirement.
- Every resolution task reads `AGENTS.md`, `CONTEXT.md`, this map, and only its selected ticket plus the smallest authority/code surface it names.
- Use `$wayfinder` for map operations, `$domain-modeling` when language changes, and `$codebase-design` for module interface and seam decisions. Research and prototype tickets use their matching entry skills when available.
- Do not copy copyrighted passages, answers, student data, credentials, or source files into Wayfinder artifacts. Asset investigation records ids, hashes, shapes, counts, and minimal diagnostic excerpts only.
- Charting created questions and blocking edges only. No ticket below has been claimed or resolved.

## Decisions so far

<!-- Append one linked one-line gist only when a ticket closes. -->

## Fog

- Whether a future stable canonical package should eventually replace `paper-asset-v1` with `paper-asset-v2`; additive sidecars are the accepted first destination.
- On-demand canonical compilation for historical `versions/vN` after the first `latest`-only migration.
- The active listening domain model, audio timing contract, website consumption, and listening renderers.
- A backend normalization review console beyond durable reports and agent-operated correction; website import UI remains forbidden.
- Retirement or consolidation of source-format-specific splitters and `packageBuilder` branches after every supported profile has migrated.
- Production rollout, R2 synchronization, and production backfill mechanics after local migration and release gates are proven.
- New paper families, unsupported question types, or other subjects discovered outside the current 33-paper census.
- Exact implementation-ticket slicing beyond the accepted foundation-first order; it will be created only after the decision map is closed.
