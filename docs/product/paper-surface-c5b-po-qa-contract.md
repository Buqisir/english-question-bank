# PaperSurface C5b PO QA Contract

Status: accepted after PO QA.

Scope: `surface=paper` / Paper Intelligence / Structure Brace (`结构钩`) V0.

This document is the product QA contract for C5b. It exists because long PA/DEV reports are easy to skim past, but C5b has several visual decisions that must not be rediscovered or reversed casually.

## Locked Product Rules

- Structure Brace is an orientation marker, not an analytics panel.
- Structure Brace targets either the whole passage body (`篇章`) or one confirmed C5a paragraph (`P1`, `P2`, ...).
- Paragraph rows live inside the open passage structure detail panel. They must not appear on the collapsed main rail.
- The old bottom remote-control row is removed. Do not restore it.
- The brace is drawn inside the white `.ps-page` left padding.
- The brace must not move back to the gray matte.
- The brace must not overlap passage text.
- The brace is visible only at `>=1360px`.
- At `<=1359px`, paragraph rows still scroll the paper, but the brace is hidden.
- Do not make the tight-desktop brace visible by raising z-index.
- Evidence line and Structure Brace may coexist. Evidence line is proof; brace is orientation.
- PaperSurface remains dumb. C5b belongs in the Paper Intelligence harness layer.

## PO QA Checklist

Use the PaperSurface route:

```text
http://127.0.0.1:5174/?view=paper-intelligence&paperId=paper-2024-xkb1-reading&surface=paper
```

Pass means all checks below hold with no console errors and no incoherent overlap.

### 1360px And Wider

- Open passage `A`, `B`, `C`, or `D`.
- Structure rows are visible inside the expanded detail panel.
- Click `篇章`: paper scrolls to the passage body and the brace spans passage text only, not questions.
- Click `P1`: paper scrolls if needed and the brace aligns to paragraph `A-P1` / current passage paragraph.
- Click another `P` row: the same brace moves to that paragraph.
- Click the active row again: the row deactivates and the brace disappears.
- The brace sits in `.ps-page` left padding and does not cover text.
- The brace remains below evidence line / rail controls; no z-index trick is visible.

### 1200px To 1359px

- Open a passage and click `P1` / `P2` / last `P`.
- The structure row becomes active.
- The paper scrolls to the target paragraph.
- The brace is hidden.
- This is correct. Do not report hidden brace in this band as a bug unless the rail layout has changed.

### 1199px And Below

- The stacked left drawer still opens.
- Structure rows still work as scroll controls.
- The brace is hidden.
- No topbar insight fallback appears.

### Evidence Coexistence

- Select a question so the right analysis panel and evidence line appear.
- Open passage structure and click a paragraph row.
- Evidence line remains functional.
- Structure Brace may remain active. The two surfaces serve different teacher tasks and are allowed to coexist.

## Forbidden Regressions

- Showing `P1` / `P2` / `P3` / `P4` on the collapsed main rail.
- Restoring the bottom button strip under the outline content.
- Moving the brace to the gray matte.
- Showing the brace at `1280px` / tight desktop.
- Fixing tight desktop by raising the brace over the rail.
- Drawing a connector line from rail button to brace.
- Adding load bars, AI difficulty, vocabulary load, grammar load, or diagnostic colors to this surface.
- Editing `PaperSurface.tsx` or `PaperSurface.css` for C5b behavior.

## Reopen Conditions

Only reopen this contract if one of these is true:

- Teacher testing shows that hidden brace at `1200px-1359px` blocks a real classroom workflow.
- The left rail layout changes so it no longer covers `.ps-page` padding.
- C5b moves from V0 orientation marker to a broader paper annotation system.

If reopened, solve layout first. Do not start with z-index.
