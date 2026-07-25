# A–D whole-set layout selector — prototype verdict

This is the durable answer from a throwaway logic prototype. The shell in
`selector-prototype.mjs` is not production code.

## Question answered

Can one renderer-only pure selector reproduce the NEEA gold-reference
four-column, two-by-two, and one-column A–D layouts, preserve cloze tab
alignment, and give Screen/Print, PDF, and DOCX one deterministic placement
plan without putting layout into canonical semantics?

**Verdict: yes**, with fixed physical tab stops, shaped glyph advances, and
whole-set fallback. Character count, word count, CSS auto-placement, and
per-renderer re-selection are rejected.

## Evidence

The committed NEEA references remain the visual authority:

- `docs/product/exam-paper-format-reference/images/page-04-reading-a-b.jpeg`:
  q21 is four columns, q22 is one column, and q23 is two-by-two in row-major
  order.
- `docs/product/exam-paper-format-reference/images/page-09-cloze.jpeg`: all 15
  cloze rows share four A/B/C/D tab positions.

At the existing 10.5pt Times New Roman token, current-browser Canvas shaping
produced these diagnostic advances. Only measurements are retained here; no
reference option text is copied.

| gold case | A/B/C/D advance in pt | selected |
| --- | --- | --- |
| page 4 q21 | 62.84 / 72.91 / 68.26 / 53.06 | `four_columns` |
| page 4 q22 | 136.01 / 137.96 / 193.45 / 218.81 | `one_column` |
| page 4 q23 | 103.81 / 110.81 / 100.03 / 123.65 | `two_by_two` |
| page 9 cloze, per-label maxima over 15 rows | 62.40 / 55.99 / 60.07 / 77.58 | `four_columns` |

The prior reproducible census measured all 1035 current question-owned A–D
sets and supplied the corpus boundary, but its `680 / 328 / 27` result used
variable summed widths as an explicit selector seed. Re-running the same
1035 sets against the fixed tabs and safety margin decided below yields:

| corpus | `four_columns` | `two_by_two` | `one_column` |
| --- | ---: | ---: | ---: |
| all 1035 sets | 641 | 330 | 64 |
| cloze 570 sets | 565 | 5 | 0 |
| reading 465 sets | 76 | 325 | 64 |
| `paper-2026-i` cloze 15 sets | 15 | 0 | 0 |

The more conservative distribution is intended: a set that only fits by
letting column starts drift is not four-column/tab-aligned. The corpus still
contains no real unbreakable full-width overflow; that branch is explicitly a
synthetic fail-closed fixture.

## Deep module interface and ownership

The renderer-typography module is assembled once from the validated manifest
closure and owns one public interface:

```ts
type RendererTypographyModule = {
  layoutAbcdOptionSet(
  optionSet: {
    owner: "question"
    options: [
      { label: "A", content: CanonicalInlineNode[] },
      { label: "B", content: CanonicalInlineNode[] },
      { label: "C", content: CanonicalInlineNode[] },
      { label: "D", content: CanonicalInlineNode[] },
    ]
  },
  ): SelectedLayoutPlan | NotApplicable | NeedsReview
}
```

Canonical content contains no mode, width, track, or renderer hint. The
selector accepts only one question-owned, exactly ordered A/B/C/D set. A group
bank A–G and listening A–C return `not_applicable`; callers may not truncate or
coerce them into this interface.

Shaping, label punctuation, fixed-point rounding, tab capacities, safety
margin, densest-first fallback, and wrapping feasibility are implementation
details hidden behind this interface. The prototype's injected
`measureOption` callback exists only as a throwaway fixture seam; production
renderers must never receive it. Tests use the same public interface with a
validated fixture typography closure rather than testing past the interface.

`SelectedLayoutPlan` is ephemeral renderer presentation data. It contains the
mode plus explicit row, column, and start-twip placement for all four labels.
Every renderer consumes that same plan; no renderer may measure or select
again.

## Physical rules and densest-first selector

Use integer twips as the shared physical unit because DOCX uses them natively
and Screen/PDF can project them exactly as points (`20 twips = 1pt`).

| rule | twips | points |
| --- | ---: | ---: |
| A4 width | 11906 | 595.30 |
| each 24mm horizontal margin | 1361 | 68.05 |
| option-block indent | 420 | 21.00 |
| resulting option row | 8764 | 438.20 |
| minimum inter-column gutter | 420 | 21.00 |
| per-track safety margin | 20 | 1.00 |
| four-column pitch / starts | 2080 / 0,2080,4160,6240 | 104 / 0,104,208,312 |
| two-column second tab / starts | 4020 / 0,4020 | 201 / 0,201 |
| one-column hanging indent | 420 | 21.00 |

Try modes in this order:

1. `four_columns`: one row, explicit A/B/C/D positions. Each option must have
   no hard break and fit its assigned track on one line after the 21pt gutter
   and 1pt safety margin.
2. `two_by_two`: two rows, explicitly A/B then C/D. The same no-hard-break and
   whole-option fit rule applies.
3. `one_column`: four rows. Labels stay at x=0; all first and continuation
   text starts at the 21pt hanging indent.

If one dense candidate fails, the complete four-option set moves to the next
mode. There is no per-option wrapping in dense modes, no CSS auto-flow, and no
hybrid late row.

## Measurement contract

The current Canvas run is corpus evidence, not the production authority.
Production measurement must use one pinned shaping implementation and the
exact versioned font stack named by the renderer typography artifact:

- shape label, English period, one space, and canonical inline content;
- use exact canonical Unicode and declared inline emphasis; do not normalize
  text merely to make it fit;
- include a digest for every font metrics artifact and the shaping
  implementation/rule version;
- resolve declared script fallbacks before selection; missing glyphs,
  undeclared fallback, unsupported nodes, or metric-digest mismatch fail
  closed;
- round every shaped advance outward to a whole twip before comparison;
- retain the additional 20-twip (1pt) fit safety margin.

This makes mode selection independent of browser, PDF, or Word line-breaking
differences. If an export host lacks the pinned font closure, it must block
that export rather than silently substitute a font or choose another mode.

## Explicit breaks and overlong one-column content

Any canonical hard break disqualifies both dense modes for the whole set.
`one_column` preserves hard breaks and wraps only at shaping-engine legal line
break opportunities, with every continuation line aligned to the 21pt text
start.

If the total inline advance exceeds one-column width but every unbreakable
segment fits, select `one_column` and use hanging-indent wrapping. If even one
unbreakable segment exceeds the one-column text width, or an inline node
cannot be measured, return `needs_review:
one_column_contains_unrenderable_unbreakable_content`. Never clip, shrink the
font, break inside an indivisible token, or write a layout hint into canonical
content.

## Renderer projections and parity gate

- **Screen/Print:** explicit CSS grid rows/columns in `pt`; every option gets a
  declared row/column. Dense items use `white-space: nowrap`; `grid-auto-flow`
  is forbidden.
- **PDF:** consume the same plan and place each option at `startTwip / 20`
  points. PDF generation does not re-measure for mode selection.
- **DOCX:** use the plan's native twip tab stops. Four-column is one paragraph
  `A<TAB>B<TAB>C<TAB>D`; two-by-two is two such paragraphs in row-major order;
  one-column is four hanging-indent paragraphs.

A future public-seam conformance gate must use the same canonical fixtures and
typography closure and prove:

1. exact selected-mode equality on all three surfaces;
2. exact row/label order and start-twip logical signatures;
3. rendered x positions within 1pt of the plan;
4. zero wrap in dense modes and, for the 15-row gold-like cloze case, each
   A/B/C/D column has x-spread at most 0.5pt;
5. actual PDF and DOCX-rendered output, not HTML-only snapshots;
6. gold page 4 q21/q22/q23 parity, gold page 9 cloze parity, current-corpus
   boundary fixtures, a hard-break fixture, a wrappable overflow fixture, and
   the synthetic unbreakable fail-closed fixture.

## Run the throwaway shell

From `app/`:

```bash
pnpm run prototype:abcd-options
```

Press `1`–`8` to inspect the gold, break, overflow, and out-of-scope cases.
For a non-interactive full dump:

```bash
pnpm run prototype:abcd-options -- --all
```

The shell prints the complete selector result and all three projection
descriptors after every choice. Delete it when the production typography
module absorbs this decision.
