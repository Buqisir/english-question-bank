# Recent-import compatibility — source-bound OCR Reading emphasis v61

The Owner requested one reusable release covering the known dependencies of
the six recent imports, rather than a code PR for each paper. This additive
authority makes their existing Candidates consumable by the deployed Review
pipeline without changing source, Candidate, summaries, metadata or frozen PDF
bytes. It extends raw-source v59; presentation v60 and all historical
manifests, adapters and schemas remain unchanged.

## Admission and rendering

- New raw materialization uses v61, adapter v19 and rich-content v3. The adapter
  registry retains earlier adapter versions and adds materialization adapter v4.
- OCR confirmation v2 may carry exact original UTF-16 ranges for bold and
  underline in Reading paragraphs and question stems. Original documents,
  page-pixel evidence and confirmation bytes are part of the Source Capture.
- Ranges must bind the exact confirmed source item and survive the validated
  editorial mapping. Stale evidence, ambiguous or unmatched locations, ranges
  outside the target, and marks on options, tables or writing fail closed.
- Screen and Print/PDF consume the same marked Canonical text nodes. Existing
  source-mark styling also applies to marked Reading stems; no paper-specific
  text matching, CSS or renderer branch is introduced.
- OCR confirmation v1 remains text-only and contributes no new evidence bytes.
  Stored v59 and v58 Candidates replay under their exact retained authority
  when their digest does not match the new default. No old approval is upgraded.

## Other bounded compatibility fixes

- CLI and server share the exact historical OCR correction binding check. Only
  a source question-number prefix moved into the number field, or one LF between
  two complete consecutive confirmed table items, may differ from the confirmed
  text. Source document/page and following-item identity remain mandatory;
  arbitrary whitespace, fuzzy matching and approval fabrication remain forbidden.
- Grammar metadata accepts present-progressive current-action routes and
  same-POS adjective negation. Existing answer authority and deterministic
  derived-field checks stay intact; prompts and UI labels use the same registry.
- Metadata requests supply their existing writing-task IDs. DOCX gap extraction
  does not consume the last digits of a preceding year. Writing notice labels
  tolerate source spaces before their colon without changing Canonical text.
- Shared table rendering preserves explicit source paragraph breaks. Student
  PDF option checks remeasure the existing gutter at the selected product font
  size and tolerate only sub-twip rounding; unsafe layouts fail closed or use
  the existing single-column fallback. Previously frozen PDFs are not replaced.
- PDF raster and OCR pixel inspection use private temporary image files instead
  of ImageMagick stdin spooling. Pixel recipes, dimensions and digests remain
  unchanged, and temporary files are removed on completion or error.

## Delivery boundary

The Owner authorized one compatibility PR, CI, protected merge and code-only
deployment, followed by submitting only `paper-mock-zj-2026-xinzhendi-2` for
Review. Other recent papers supply read-only compatibility checks, not upload
authorization. This change does not migrate databases, regenerate papers,
backfill published assets, approve a revision or publish a paper. Preserve the
current main branch's storage guards and remote-custody support; do not copy
older import worktrees wholesale. Local OCR receipts must be recreated through
the real production Agent proofreading flow, not copied into the Review DB.

## Verification

`scripts/verify-nck1-ocr-source-evidence.mjs` checks reproducible v61 artifacts,
source-bound passage/stem marks, unsupported ranges, the CLI-to-Review reload,
and retained v59 confirmation/admission. Existing candidate, publication, OCR
Review, grammar metadata, DOCX and student-PDF verifiers exercise the affected
public seams. Check the six retained paper workspaces without altering them;
distinguish missing per-paper products from software incompatibility. Final
acceptance also checks unchanged M169 digests, affected real Screen/Print/PDF
rendering, independent Standards/Spec review and the exact candidate's natural
Full/E2E Actions jobs. Do not claim production submission or offsite backup from
local checks.
