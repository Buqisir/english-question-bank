# NCK1 Profile v3 migration

`nck1-v3.json` replaces the v2 Writing shape in the current authority closure.
It preserves every non-Writing slot and both Writing family bindings.

The v3 Writing Profile owns:

- one `writing` part, `第四部分 写作（共两节，满分40分）`;
- one 15-point `writing.application` section,
  `第一节（满分15分）`;
- one 25-point `writing.continuation` section,
  `第二节（满分25分）`.

Canonical Plans still bind the same `writing.application` and
`writing.continuation` slots. The projector derives each occurrence's chrome
only from its Profile part and section; consumers must not reconstruct these
headings from family, score, legacy Paper Asset, or renderer-local text.

Manifest v7 retains v6 for existing Publications and makes v3 the only NCK1
Profile accepted for new compilation and publication.
