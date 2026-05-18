/**
 * Paper Surface — neutral DOM anchor attribute names.
 *
 * Issue #21-B1.5 (Must Fix 1).
 *
 * This module is the locked, primitive-string contract for the PUBLIC
 * anchor protocol of the eventual `PaperSurface` module. It freezes
 * the attribute NAMES so that B3+ implementation cuts cannot quietly
 * drift them and so that downstream consumers (LinkOverlay, smoke
 * tests, future selection / annotation logic) all read from the same
 * source of truth.
 *
 * Naming policy (LOCKED in this PR):
 *
 *   - The PaperSurface public anchor protocol uses a NEUTRAL
 *     `data-paper-*` namespace.
 *   - The legacy `data-pi-*` namespace is the historical naming used
 *     by the Paper Intelligence host (PI host topbar / basket / insight
 *     popover) and by the current `PaperSurfacePrototype` (Issue #21-A
 *     spike). It is PI-host- / prototype-specific. It is NOT the
 *     PaperSurface public protocol.
 *   - The `data-ra-*` namespace is owned by the existing
 *     `reading-analysis` feature. It is reading-analysis-specific.
 *     It is NOT the PaperSurface public protocol either, and it is
 *     frozen at its current scope for the duration of #21-B (see
 *     ADR 0003 §10 — reading-analysis relation).
 *
 * Migration note (NOT executed in this PR):
 *
 *   - `PaperSurfacePrototype.tsx` continues to emit `data-pi-paper-*`
 *     / `data-pi-evidence-*` anchors today. This PR does NOT migrate
 *     it. When B3 lands the production `PaperSurface`, the prototype
 *     either retires or migrates to the neutral `data-paper-*`
 *     anchors below.
 *   - The PI host's own chrome anchors (e.g. `data-pi-back-to-
 *     workbench`, `data-pi-basket-toggle`, `data-pi-basket-popover`)
 *     remain in the PI namespace by design — they describe the PI
 *     host shell, not the paper surface.
 *
 * Rules for this module (do not weaken without an ADR superseding
 * 0003):
 *
 *   - Exports are PRIMITIVE STRING CONSTANTS only.
 *   - The exported object is `Object.freeze`d.
 *   - This module MUST NOT import React.
 *   - This module MUST NOT import anything from `app/`.
 *   - This module MUST NOT import anything from `server/`.
 *   - This module MUST NOT contain DOM helpers, query helpers, or
 *     any function. It is a constants-only module by contract.
 *   - This module is intentionally NOT yet imported by any runtime
 *     caller in `app/` or `server/`. It is a frozen protocol; B3
 *     (and later) will be the first runtime consumers.
 */

export const paperSurfaceAnchorAttrs = Object.freeze({
  /** Each passage / section root carries this attribute. Value is the
   *  paper section identifier (e.g. 'A', 'B', 'C', 'D', 'cloze'). */
  section: 'data-paper-section',

  /** Each paragraph root carries a stable id under its section. */
  paragraphId: 'data-paper-paragraph-id',

  /** Each sentence root carries a stable id under its paragraph. The
   *  sentence is the smallest "addressable" unit on the paper — every
   *  evidence / annotation eventually anchors at sentence granularity
   *  or finer (via TextMap), never lower than the sentence DOM root. */
  sentenceId: 'data-paper-sentence-id',

  /** Each question root in the question column carries a stable id. */
  questionId: 'data-paper-question-id',

  /** Each option button carries the option label (e.g. 'A', 'B', 'C',
   *  'D'). Combined with `questionId` to form the option key. */
  optionLabel: 'data-paper-option-label',

  /** An evidence anchor inside the passage column. Value is the
   *  evidence id. PaperSurface emits this as a NEUTRAL anchor (no
   *  highlight class) — paint comes from active state, not from the
   *  attribute itself. */
  evidenceId: 'data-paper-evidence-id',

  /** Companion to `evidenceId` — describes the role of the evidence
   *  span (e.g. 'support' | 'trap' | 'context'). NOT a layout class. */
  evidenceKind: 'data-paper-evidence-kind',

  /** A curated annotation anchor inside the passage column. Value is
   *  the annotation id. References position via TextMap; the
   *  annotation itself does NOT store an independent char offset. */
  annotationId: 'data-paper-annotation-id',

  /** Companion to `annotationId` — coarse classification (e.g.
   *  'lexical' | 'syntactic' | 'discourse'). Metadata only; not the
   *  primary axis of layout. */
  annotationKind: 'data-paper-annotation-kind',
})
