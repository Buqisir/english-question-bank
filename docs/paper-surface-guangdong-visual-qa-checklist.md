# Paper Surface: 广东一模 Visual QA Checklist

> Sidecar planning input for #21.
> This document defines the visual fidelity targets for the PaperSurface prototype against the 广东一模 (Guangdong First Mock) PDF reference.
> **No CSS changes, no runtime changes** — this is a QA specification only.

---

## 1. A4 Page Proportions

| Property | Target Value | Notes |
|----------|--------------|-------|
| Paper width | **794px** | Matches A4 at 96dpi |
| Padding (all sides) | **56px** | Consistent inner margin |
| Visual feel | Paper sheet | White surface, clear boundary |

---

## 2. Font Stack

| Priority | Font | Usage |
|----------|------|-------|
| 1 | Times New Roman | English body text, stems, options |
| 2 | SimSun / Songti SC | CJK fallback (instructions, headers) |

---

## 3. Typography

| Element | Value |
|---------|-------|
| Body font size | **14.5px** |
| Passage line-height | **1.85** |
| Question line-height | **1.7** |
| Paragraph indent | **2em** |

---

## 4. Reading Section Layout

| Element | Specification |
|---------|---------------|
| Section separators | A / B / C / D clearly delineated |
| Numbering | Continuous across sections (no per-section reset) |
| Stem layout | Full-width, flush left after number |
| Options (short) | **2-column** grid with **2em** gap |
| Options (long/wrapping) | Falls back to single-column vertical list |

---

## 5. Hard Requirements (must pass QA)

These are non-negotiable for the paper-like feel:

| Rule | Rationale |
|------|-----------|
| No `border-radius` inside paper area | Real exam papers have sharp geometry |
| No card-like UI elements | No elevated cards, no shadows within sheet |
| No gradients | Flat ink-on-paper aesthetic |
| No visible evidence anchor background | Anchors must be invisible until interaction |

---

## 6. Allowed Divergences from PDF

These intentional deviations are acceptable and do not constitute QA failures:

| Divergence | Reason |
|------------|--------|
| Continuous scroll (no real pagination) | Interactive preview, not print output |
| Subtle sheet shadow **outside** paper boundary | Helps distinguish paper from app chrome |
| Sans-serif **outside** paper sheet | App chrome uses system sans-serif |
| OS font rendering differences | Subpixel/hinting varies by platform |

---

## 7. QA Matrix

| Scenario | Check Items | Pass Criteria |
|----------|-------------|---------------|
| **Desktop viewport** (≥1200px) | Paper centered, 794px width, correct padding | Visual match to PDF reference |
| **Narrow viewport** (<1200px) | Paper scales or scrolls gracefully | No horizontal overflow, no broken layout |
| **Print/PDF reference** | Side-by-side comparison with 广东一模 PDF | Density, spacing, font feel comparable |
| **Line-height / spacing** | Passage and question areas | Matches values in section 3 |
| **Numbering** | Questions numbered continuously | No gaps, no resets at section boundaries |
| **Option wrapping** | Short options in 2-col; long options in list | Threshold: option text exceeds ~40 chars |
| **No card-like UI** | Inspect all elements inside paper | Zero border-radius, zero box-shadow, zero gradient |

---

## 8. Out of Scope

This checklist explicitly does **NOT** cover:

| Item | Reason |
|------|--------|
| CSS implementation changes | This is QA spec, not implementation |
| Print-renderer changes | Vivliostyle / @page work is separate |
| Automation (visual regression tests) | Future work after baseline is established |
| Real pagination (@page breaks) | PaperSurface uses continuous scroll for now |

---

## 9. How to Use This Checklist

1. Open PaperSurface prototype in browser.
2. Open 广东一模 PDF reference side-by-side.
3. Walk through QA matrix (section 7) row by row.
4. For each row, mark **PASS** / **FAIL** / **N/A**.
5. Log failures as issues referencing this doc and #21.
