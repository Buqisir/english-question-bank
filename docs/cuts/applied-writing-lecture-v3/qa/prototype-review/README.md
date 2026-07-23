# Real-packet prototype review evidence

Status: **machine precheck PASS; owner visual verdict PASS**

## Live host measurement

Measured against the real local `PaperBrowsePage` with lecture open, using the
current runtime baseline and `paper-2024-i`:

| Browser viewport | Paper canvas | Writing / answer width | Lecture rail | Relationship |
| --- | ---: | ---: | ---: | --- |
| 1470 × 719 | 794 | 612 | 380 | side-by-side, no overlap |
| 1200 × 719 | 628 | 446 | 380 | side-by-side, no overlap |

The production host is `.paper-browse-content`, not the nested
`.pi-writing-page`. V3 therefore keys availability to the measured paper canvas
reaching its 794 px cap. A viewport number is reproduction evidence only:
this local Chrome instance first reached the 794 px canvas at 1366 px because
its document scrollbar consumed 8 px.

## Real-site injected owner review

The owner-review surface now runs inside the real local `PaperBrowsePage`.
`inject-live-site.playwright.mjs` performs a runtime-only browser injection:

- keeps the real navigation, 794 px paper canvas, 380 px lecture rail, scrolling,
  and responsive shell;
- temporarily hides only the current application answer box and inserts the
  selected Variant A 794 × 472 stage at its real 91 px paper offset;
- replaces only the visible lecture-rail children with the matching locked
  review card;
- writes no runtime source, payload, database, local storage, or server state;
- exposes `撤销注入`; refresh also restores the untouched real page.

The injection succeeded for both `paper-2022-i` and `paper-2024-i` at the real
`canvas 794 / answer offset 91` host. At a real 628 px canvas it stopped before
injection with the narrow-boundary message instead of scaling or covering the
paper.

Injected-site screenshots:

- `injected-2022-review.png`
- `injected-2022-highlight.png`
- `injected-2024-review.png`
- `injected-2024-highlight.png`

The live owner-review browser is intentionally left with two tabs, one real
paper per packet. Each starts on `① 审题要点`; the owner can click
`② 亮点句式` inside the paper.

Owner visual adjustment on 2026-07-23: the attempted 2024 lower-left `要点②`
placement (`2024-point2-lower-left.png`) proved the pocket was geometrically
free but humanly wrong: its 163 px leader crossed too much empty paper. The
accepted follow-up rule caps that preference at a 72 px connector, so this
packet returns to the nearer global-solver placement. Review-view micro leaders
now visibly enter the underline and always point toward the note, fixing the
two ambiguous left-margin ticks without moving any English source text.
`2024-short-directional-leaders.png` is the resulting owner-review state;
`2024-point2-lower-left.png` remains only the rejected comparison.

## Renderer precheck

`prototype-pilot-review.html` keeps Variant A, uses Times New Roman for the
model answer, Xiaolai for Chinese annotation ink, and Shantell Sans only for
English inside annotations / transfer examples. Its `embedded=1` mode supplies
only the paper-local stage; the real website supplies the host.

| Packet | Review | Highlight |
| --- | ---: | ---: |
| 2022 invitation | 5/5 | 4/4 |
| 2024 sharing | 5/5 | 4/4 |

Standalone renderer screenshots:

- `2022-0.png` — 2022 review
- `2022-1.png` — 2022 highlight
- `2024-0.png` — 2024 review
- `2024-1.png` — 2024 highlight

These counts and injected-site screenshots prove only that all required
annotations were placed inside the fixed stage hosted by the real canvas.
The owner separately supplied the teaching/visual/classroom judgment by
personally inspecting the final real-site prototype and explicitly saying
“过关” on 2026-07-23. The exact approved prototype head is
`4208c672373433b1b357228c55af1645f5ccbb7e`; MF-1 is closed.
