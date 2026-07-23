# Real-packet prototype review evidence

Status: **machine precheck PASS; owner visual verdict pending**

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

## Prototype precheck

`prototype-pilot-review.html` keeps Variant A, uses Times New Roman for the
model answer, Xiaolai for Chinese annotation ink, and Shantell Sans only for
English inside annotations / transfer examples.

| Packet | Review | Highlight |
| --- | ---: | ---: |
| 2022 invitation | 5/5 | 4/4 |
| 2024 sharing | 5/5 | 4/4 |

Screenshots:

- `2022-0.png` — 2022 review
- `2022-1.png` — 2022 highlight
- `2024-0.png` — 2024 review
- `2024-1.png` — 2024 highlight

These counts only prove that all required annotations were placed inside the
fixed canvas. They do not approve the teaching copy, visual balance, or
classroom usability. MF-1 closes only after the owner personally inspects all
four states and explicitly says “过关”.
