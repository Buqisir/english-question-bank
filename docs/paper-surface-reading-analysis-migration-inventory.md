# Paper Surface: Reading-Analysis Migration Inventory

> Sidecar planning input for #21.
> This document catalogues the reading-analysis feature surface area and maps it to the incoming PaperSurface architecture.
> **It does NOT decide** migration vs long-lived sibling — that decision belongs to B4a.

---

## 1. Files Inspected

### Top-level components

| File | Role |
|------|------|
| `ReadingAnalysisDemoRoute.tsx` | Route entry, lazy loader |
| `ReadingAnalysisView.tsx` | Layout shell (passage + questions + overlay) |
| `PassageCanvas.tsx` | Renders annotated passage HTML |
| `QuestionPanel.tsx` | Renders question stems + options |
| `LinkOverlay.tsx` | SVG/DOM connector lines between passage & questions |

### Route & types

| File | Role |
|------|------|
| `readingAnalysisRoute.ts` | Route definition / path constants |
| `readingAnalysisTypes.ts` | Shared TS interfaces for the feature |
| `readingAnalysisFixture.ts` | Dev-time fixture data |

### Evidence linking (`evidenceLinking/*`)

| File | Role |
|------|------|
| `evidenceLinking.ts` | Core logic: match passage anchors ↔ question anchors |
| `anchorKeys.ts` | Anchor key generation utilities |

### Annotation (`annotation/*`)

| File | Role |
|------|------|
| `annotationCoverage.ts` | Computes coverage stats over passage tokens |
| `annotationTypes.ts` | Annotation domain types |
| `index.ts` | Barrel export |

### View state (`viewState/*`)

| File | Role |
|------|------|
| View-state modules | URL-driven fetch phase, selection state, scroll sync |

### Selectors

| File | Role |
|------|------|
| `selectors/selectReadingAnalysis.ts` | Derived state selector |

### Sidecar

| File | Role |
|------|------|
| `sidecar/readingAnalysisSidecar.ts` | Sidecar data adapter |
| `sidecar/index.json` | Sidecar manifest |
| `sidecar/README.md` | Sidecar documentation |

### Concierge call sites

- `conciergeSearch.ts` — references reading-analysis anchors
- `useConciergeDesk.ts` — consumes sidecar output

### Relevant verify/smoke scripts

- `scripts/verify-*` — smoke checks that touch reading-analysis routes
- Any Playwright specs referencing `/reading-analysis`

---

## 2. `data-ra-*` Attribute Catalogue

These custom data attributes form the overlay protocol for reading-analysis:

| Attribute | Purpose |
|-----------|---------|
| `data-ra-sentence-id` | Unique sentence identifier in passage |
| `data-ra-quote-anchor` | Marks a quotation span as linkable anchor |
| `data-ra-anchor-id` | Generic anchor identifier |
| `data-ra-kind` | Anchor kind discriminator (sentence / quote / option) |
| `data-ra-link-source` | Identifies which question generates a link |
| `data-ra-option-anchor` | Marks an option element as link target |
| `data-ra-correct` | Boolean flag for correct answer |
| `data-ra-source-note` | Provenance note (e.g. which evidence supports) |
| `data-ra-blocked` | Whether interaction is blocked/disabled |
| `data-ra-entry` | Entry-point marker for group |
| `data-ra-group-id` | Groups related anchors |
| `data-ra-hit-scope` | Click-hit detection scope |

### Overlay protocol vs concierge historical attributes

The `data-ra-*` namespace serves **two distinct concerns**:

1. **Overlay protocol** — attributes consumed by `LinkOverlay` and `evidenceLinking` to draw connector lines and handle click interactions (`data-ra-sentence-id`, `data-ra-anchor-id`, `data-ra-link-source`, `data-ra-option-anchor`, `data-ra-hit-scope`).
2. **Concierge/historical metadata** — attributes that carry pedagogical or provenance info consumed downstream by concierge search (`data-ra-correct`, `data-ra-source-note`, `data-ra-kind`, `data-ra-blocked`).

PaperSurface should keep these concerns separated at the protocol level.

---

## 3. Mapping Table: reading-analysis → PaperSurface

| reading-analysis | PaperSurface target | Notes |
|------------------|---------------------|-------|
| `data-ra-sentence-id` | `data-paper-sentence-id` | 1:1 rename |
| `data-ra-quote-anchor` / `data-ra-anchor-id` | `data-paper-evidence-id` or `data-paper-annotation-id` | Merge quote + anchor into evidence concept |
| `data-ra-option-anchor` | `data-paper-option-label` | Option identity |
| sidecar JSON panel | Right panel single slot | Unified slot instead of per-feature sidecar |

---

## 4. Reusable Modules

These modules contain domain logic that can transfer to PaperSurface with minimal adaptation:

| Module | Reason |
|--------|--------|
| `quoteAnchors.ts` | Pure anchor resolution, no UI coupling |
| `evidenceLinking.ts` | Geometry-free link matching logic |
| `annotationCoverage.ts` | Coverage computation, framework-agnostic |

---

## 5. Non-reusable / Risky Areas

| Area | Risk |
|------|------|
| React glue (component tree, hooks, context) | Tightly coupled to current layout; PaperSurface may use different component boundaries |
| Local overlay state | Managed via local useState/useReducer; PaperSurface may use different state model |
| View-state URL/fetch phase | URL schema and fetch lifecycle are demo-specific |
| Sidecar JSON gaps | Current sidecar JSON lacks: `importance`, `teachingPriority`, `sourceOrder`, `range` fields that PaperSurface needs |

---

## 6. Open Decision

> **B4a must still decide: migration vs long-lived sibling.**

This inventory deliberately does **not** pick that decision. Both paths remain viable:

- **Migration**: reading-analysis is subsumed into PaperSurface; `data-ra-*` attributes are retired after rename.
- **Long-lived sibling**: reading-analysis continues as a standalone demo; PaperSurface evolves independently with a fresh attribute namespace.

The mapping table (section 3) and reusable modules (section 4) are inputs to that decision, not outcomes of it.
