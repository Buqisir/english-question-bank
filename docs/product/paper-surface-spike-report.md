# Paper Surface Spike -- Technical Report

Date: 2026-05-20
Status: spike / technical evaluation
Scope: Unified paper surface for Paper Intelligence interactive view, Assembly Basket preview, and PDF export

## Executive Summary

This spike evaluates whether a single DOM/CSS paper surface can serve the Paper Intelligence interactive teaching view, the Assembly Basket draft preview, and the Vivliostyle-powered PDF export path. The codebase already has strong foundations in both directions: `server/print-renderer.mjs` generates semantic HTML with CSS Paged Media rules for Vivliostyle, and `PaperIntelligencePreview.tsx` renders a DOM-based two-column layout with evidence overlays. The question is whether these two surfaces can converge into a shared paper DOM structure that switches behavior through CSS mode toggling rather than maintaining two separate rendering pipelines.

Our finding: the DOM/CSS approach is the correct path. A shared paper surface is technically viable and should be built incrementally, with acceptable risk.

---

## Approach Comparison: DOM/CSS vs PDF/Canvas

### Current state of the codebase

The project already commits to DOM/CSS for both rendering paths:

1. **Print path** (`server/print-renderer.mjs`): Generates a complete HTML document with semantic markup (section, passage, question-group, stem, options) styled by an inline `<style>` block using CSS `@page` rules. This HTML is fed to Vivliostyle CLI 9.x which renders it as paged PDF. The renderer does not use canvas, PDF libraries, or any proprietary binary format.

2. **Interactive path** (`app/src/features/paper-intelligence/PaperIntelligencePreview.tsx`): Renders passage body, questions, and analysis in React DOM elements with `data-pi-*` attributes. The left panel (`.pi-main`) presents a paper-like reading flow: passage header, passage body, question cards in order. The right panel (`.pi-side`) shows option-integrated analysis.

### Why DOM/CSS is the right choice

| Factor | DOM/CSS | PDF/Canvas |
|--------|---------|------------|
| Existing infrastructure | Both paths already produce semantic HTML | Would require rewriting print-renderer to use pdf-lib or similar |
| Evidence line overlay | SVG overlay uses `getBoundingClientRect` on DOM elements -- works naturally | Canvas/PDF rendering would require custom coordinate mapping |
| Accessibility | Native DOM semantics, aria attributes, keyboard navigation | Canvas is an accessibility black hole without extra ARIA layers |
| Interactive features | Click handlers, scroll, hover all work natively | Requires synthetic event layers on top of canvas |
| Style toggling | CSS media queries / class toggling switches between interactive and print modes | Requires separate render passes |
| New dependencies | Zero -- HTML/CSS/SVG only | Would need pdf-lib, pdfjs, or similar (violates no-new-deps constraint) |
| Teacher interaction model | The product principle states "teaching comes first" with click-question-see-analysis loop; this requires live DOM | Canvas breaks this interaction loop |

### Conclusion

The DOM/CSS approach is not just preferred -- it is the only viable approach given the existing architecture, the no-new-dependencies constraint, and the product's interactive teaching model.

---

## Vivliostyle / CSS Paged Media Evaluation

### Current integration

The print pipeline lives in `server/print-renderer.mjs` and uses the following CSS Paged Media rules:

```css
@page {
  size: A4;
  margin: 20mm 18mm 20mm 18mm;
}

.page-break {
  break-before: page;
}
```

The HTML uses a font hierarchy of 18pt (title) / 12pt (section headers) / 10.5pt (body) with Times New Roman + SimSun, matching standard Chinese exam paper conventions.

### Visual QA validation

The report at `reports/print-visual-qa-guangdong-2026.md` documents a successful end-to-end test of this pipeline against a real Guangdong 2026 exam paper. Key findings:

- Page size: PASS (A4, 595.276 x 841.89 pts)
- Font hierarchy: PASS (18pt/12pt/10.5pt)
- Margins: PASS (20mm standard)
- Content completeness: PASS (42 questions across 6 groups)
- Overall verdict: PASS with 2 minor WATCH items

This confirms that CSS Paged Media via Vivliostyle already produces exam-quality output from semantic HTML.

### Can the same DOM serve both modes?

Yes, with CSS mode toggling:

1. **Shared semantic structure**: Both paths need the same content hierarchy: paper header, passage body, question stems, options. The `print-renderer.mjs` already uses `.question-group > .passage + .question*` structure. The interactive PI view uses `.pi-passage > .pi-passage-body + .pi-question-list > .pi-question-card*`. These can be unified into a single DOM tree with dual-purpose class names.

2. **Mode-specific CSS**: The `@page` rules only activate in print/Vivliostyle context. Interactive layout (two-column grid, sticky panel, scroll containers) only activates via a class or media query. Example pattern:

   ```css
   /* Interactive mode (default) */
   .paper-surface { display: grid; grid-template-columns: 1fr 360px; }
   .paper-surface .analysis-panel { display: block; }

   /* Print mode */
   @media print, .paper-surface--print {
     .paper-surface { display: block; }
     .paper-surface .analysis-panel { display: none; }
     @page { size: A4; margin: 20mm 18mm; }
   }
   ```

3. **Vivliostyle compatibility**: Vivliostyle CLI operates on static HTML files. The server-side export path can render the shared React component to static HTML (via `renderToString` or a lightweight template), apply the print class, and pipe to Vivliostyle. No architectural conflict.

---

## Evidence Line Compatibility Analysis

### How the evidence line works today

The evidence line (`app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLine.tsx`) draws a dashed SVG Bezier curve connecting a right-panel source element to a left-panel passage highlight. The mechanism:

1. **Source lookup** (`findEvidenceSource` in `paperIntelligenceEvidenceLineGeometry.ts`): Queries `[data-pi-evidence-id="<id>"]` inside the right panel element ref.

2. **Target lookup** (`findFirstDomOccurrence`): Queries `mark[data-pi-evidence-id="<id>"]` inside the left scroller element ref. Uses first-DOM-occurrence policy for multi-occurrence quotes.

3. **Geometry computation** (`computeOverlayGeometry`): Takes three `DOMRect` values (container, source, target), computes a cubic Bezier in container-local coordinates.

4. **SVG rendering**: The `<svg class="pi-line-overlay">` is positioned absolutely inside `.pi-shell` (which has `position: relative`). The SVG is `pointer-events: none` at z-index 5.

5. **Reactivity**: The hook recomputes on scroll (both panels), resize, and `ResizeObserver` changes. Uses `requestAnimationFrame` coalescing.

### What a shared paper surface must preserve

For the evidence line to keep working on a unified paper surface:

| Requirement | Current implementation | Shared surface contract |
|-------------|----------------------|------------------------|
| `data-pi-evidence-id` attributes on passage `<mark>` elements | Set by `PassageBody` component | Must remain on highlighted spans in the shared surface |
| `data-pi-evidence-id` attributes on right-panel source elements | Set by Analysis Panel option blocks | Must remain on analysis anchors |
| `.pi-shell` as `position: relative` container | Set in `paperIntelligence.css` | The shared surface wrapper must be `position: relative` |
| Left scroller ref (`.pi-main`) | Passed as `leftScrollerRef` to the hook | The shared surface left panel must be ref-able and scrollable |
| Right panel ref (`.pi-side`) | Passed as `rightPanelRef` to the hook | The analysis panel must be ref-able |
| `getBoundingClientRect` returning valid viewport-relative rects | Requires elements to be rendered and visible | Elements must not be `display: none` or `visibility: hidden` during interactive mode |

### Print mode handling

In print mode, the evidence line overlay should simply not render:

- The `PaperIntelligenceEvidenceLine` component already renders `<svg data-empty="true">` (hidden via `display: none`) when `activeQuestionId` is null or geometry cannot be resolved.
- The CSS already hides the overlay at `max-width: 900px` breakpoint. A print class can similarly hide it:

  ```css
  .paper-surface--print .pi-line-overlay { display: none; }
  ```

- No `pointer-events` concerns in print context since there is no user interaction.

### Key constraint summary

The shared surface must:
- Keep `data-pi-*` attributes on passage highlights and analysis anchors
- Maintain `position: relative` on the shell container
- Preserve the two-panel DOM structure with ref-able scroll containers in interactive mode
- Hide the SVG overlay in print mode (CSS only, no conditional rendering needed)

---

## Risk List

### (a) Two-column interactive vs single-column print layout mismatch

**Severity**: Medium
**Detail**: The interactive view uses a two-column CSS Grid (`.pi-shell { grid-template-columns: 1fr 360px }`). The print/export path needs a single-column flow for A4 output. The analysis panel should not appear in the printed paper.
**Mitigation**: CSS-only mode switch. The shared surface applies `display: block` and hides `.pi-side` in print mode. The existing `@media (max-width: 900px)` rule already demonstrates this pattern -- it collapses to single column and makes `.pi-side` static.

### (b) @page CSS only applies in print context, not on-screen preview

**Severity**: Low
**Detail**: CSS `@page { size: A4; margin: 20mm }` rules are only activated by the print media type or by tools like Vivliostyle that simulate paged rendering. An on-screen "print preview" panel cannot use `@page` to show accurate pagination.
**Mitigation**: For on-screen print preview, use a fixed-size container (210mm x 297mm with CSS `aspect-ratio` and `overflow: hidden`) with scaled content. Actual page breaks are only authoritative when rendered through Vivliostyle. Accept that on-screen preview is approximate.

### (c) Evidence highlights require pointer-events which print does not have

**Severity**: Low
**Detail**: Evidence `<mark>` elements and option-block buttons in the interactive view respond to clicks. In print mode, these elements still exist in the DOM but pointer events are irrelevant.
**Mitigation**: No code change needed. CSS can remove `cursor: pointer` in print mode but the elements themselves are inert in a PDF. The highlight styling (background tint, border-bottom) can be kept or removed in print mode via CSS.

### (d) Page break logic differs between interactive scroll and paged output

**Severity**: Medium
**Detail**: Interactive mode uses continuous scroll with `overflow-y: auto`. Print mode needs explicit `break-before: page` or automatic fragmentation. The current `print-renderer.mjs` uses explicit section breaks. A shared surface would need to decide: keep the breaks in the shared DOM and hide them interactively, or inject them only at export time.
**Mitigation**: Use a class-based approach: `.page-break { break-before: page }` elements are present in the DOM but styled as `display: none` in interactive mode. They become active only in print mode. Alternatively, the export serializer injects breaks between sections when generating the Vivliostyle HTML.

### (e) Vivliostyle CLI is server-side only

**Severity**: Low
**Detail**: Vivliostyle CLI runs in Node.js (`server/node_modules/.bin/vivliostyle`). It cannot run in the browser. The shared surface renders in the browser for interactive mode but must be serialized and sent to the server for PDF generation.
**Mitigation**: This is an architectural boundary, not a blocker. The React component tree for the paper surface can be rendered to static HTML via `renderToString` or a dedicated server-side template. The server already owns the print pipeline. The shared surface ensures the HTML structure is identical in both contexts.

### (f) Performance of large papers in DOM rendering

**Severity**: Low
**Detail**: A full exam paper can have 40+ questions and 6+ passages. Rendering all of this in a single DOM tree with evidence highlights and scroll observers could have performance implications.
**Mitigation**: The current PI preview already renders this volume without issues. The existing `requestAnimationFrame` coalescing and scroll-listener design handles updates efficiently. If needed, virtualization can be added later, but current evidence shows no performance concern.

---

## Recommended Cut Plan

### Phase 1: CSS-only paper surface prototype (this spike)

**Scope**: Create an isolated prototype component that renders exam paper content (passage + questions) in a single DOM structure with two CSS modes (interactive and print-like). Demonstrate that the same DOM can display either layout by toggling a single class.

**Deliverables**:
- `app/src/features/paper-surface/PaperSurface.tsx` -- minimal prototype component
- CSS with interactive (two-column, scroll) and print (single-column, paged dimensions) modes
- Verify script proving the component renders valid structure

**Does not include**: Evidence line integration, real data loading, Vivliostyle rendering.

### Phase 2: Integration with Paper Intelligence data model

**Scope**: Wire the shared paper surface to the existing `paperIntelligencePreviewModel.ts` data layer. Add `data-pi-*` attributes, connect the evidence line, and prove the interactive teaching loop works identically to the current dedicated PI component.

**Deliverables**:
- Paper surface component accepts `PaperIntelligencePreviewView` as input
- Evidence line renders on the shared surface
- Assembly basket add-to-basket works from shared surface
- Verify script asserts DOM attribute contract

**Does not include**: Print export changes, server integration.

### Phase 3: Export path unification with print-renderer

**Scope**: Replace or wrap `server/print-renderer.mjs` to consume the same component/template structure as the interactive paper surface. The export path serializes the shared DOM, applies print CSS, and feeds it to Vivliostyle.

**Deliverables**:
- Server-side HTML generation uses the shared paper surface template
- Print CSS applies `@page` rules and hides interactive-only elements
- Visual QA re-validates against reference PDFs
- Single source of truth for exam paper DOM structure

**Does not include**: On-screen paginated preview (future Phase 4 candidate).

---

## Verdict

**Build.**

The codebase is already 80% of the way to a shared paper surface:

1. The print renderer already produces semantic HTML with CSS Paged Media rules -- not canvas, not PDF libraries, not a proprietary format. The DOM structure is the source of truth for print.

2. The Paper Intelligence interactive view already renders a paper-like DOM flow in the left panel with passage body, questions, and evidence highlights. The evidence line uses standard DOM APIs (`getBoundingClientRect`, `querySelector`) that work on any DOM structure preserving the `data-pi-*` contract.

3. The product principle ("interactive analysis and draft exam paper share the same paper surface") aligns with the technical reality: both paths produce the same semantic content, they just style it differently.

The risks are manageable:
- Layout mismatch between two-column interactive and single-column print is solved by CSS mode toggling (already demonstrated by the 900px breakpoint collapse).
- Evidence line compatibility requires only that `data-pi-*` attributes and `position: relative` on the shell are preserved.
- Vivliostyle being server-side is an existing architectural boundary, not a new constraint introduced by unification.

The recommended path is incremental: prototype the shared surface with CSS mode toggling (Phase 1), prove evidence line compatibility (Phase 2), then unify the export path (Phase 3). Each phase delivers independently verifiable value and can be shipped without blocking subsequent work.
