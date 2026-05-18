# PaperSurface Watch Ledger

This ledger records non-blocking watch items from PaperSurface cuts. Items here are not current merge blockers. Promote one into a real task only when it blocks a named future cut, appears in QA, or becomes part of an accessibility / architecture sweep.

## C3 Evidence Parity

Source: PR #48 CR, Issue #21-C3.

Status: C3 merged. No Must Fix remained.

### Right-Panel Button Content Model

The `surface=paper` harness renders the right-panel support evidence row and quoted distractor rows as buttons so a teacher can click a row and move the dotted evidence line.

Current risk:
- `SupportEvidenceRow` renders flow content such as `h4`, `blockquote`, and `p` inside a `button`.
- `DistractorRow` may render a `blockquote` inside a `button`.
- Browsers render and click this correctly today, but HTML audits and accessibility tooling can flag this content model.

Follow-up trigger:
- A teacher reports screen-reader / keyboard confusion.
- An accessibility audit is scheduled.
- The right Question Analysis panel gets refactored.

Preferred future fix:
- Replace block-content buttons with a valid row interaction pattern, such as a row wrapper using `role="button"` plus keyboard handling, or a smaller explicit button region inside a non-button row.

### Active Evidence Reseed Edge Case

The harness owns `activeEvidenceId` and reseeds it from `analysisView.supportEvidenceId` whenever `activeQuestionId` changes.

Current risk:
- If future code mutates `analysisView.supportEvidenceId` while the same question stays active, the reseed effect may overwrite a teacher-selected distractor evidence row.
- In current C3, report data is fetched once and `buildPreviewView` is pure, so this is not observable.

Follow-up trigger:
- `buildPreviewView` caching changes.
- live regeneration / re-analysis can update evidence ids while a question remains selected.
- right-panel evidence rows become editable.

Preferred future fix:
- Split "question changed" reseed from "analysis data changed" refresh, or preserve explicit teacher evidence selection until the active question changes.

### Highlight Without Connector On Malformed Data

C3 sets `activeEvidenceId` from the support evidence id. The left paper can highlight an evidence range when the PaperSurface data resolves it.

Current risk:
- If a malformed report has `supportEvidenceId` but no right-panel `answerEvidenceQuote`, the left highlight can exist while the dotted line has no right-side row to connect to.
- This is a data quality edge case, not a current product regression.

Follow-up trigger:
- QA finds support highlights without connectors in real paper-intelligence reports.
- reports begin accepting partial / human-edited evidence rows.

Preferred future fix:
- Gate seeded `activeEvidenceId` on both left evidence range and right source row availability, or add a dev-only warning for unresolved source/target pairs.

