# Applied-writing lecture v3 · Locked pilot content

Status: **owner visual prototype review PASS**

These are exact pre-DEV candidate objects, not runtime assets:

- `paper-2022-i.application.json`
  (`sha256:5618d5156a669a1eb82ceece0b86f5095067bd02324ce0d601c3d55990b65037`)
- `paper-2024-i.application.json`
  (`sha256:39fd2fcd84fe61e49f96ffbf80728657774cd81d75461b6917f5ebb2abea35af`)

## Source binding

- Production baseline: `github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`.
- Group ids:
  `group-2022-i-writing-application` and
  `group-2024-i-writing-application`.
- Each `modelAnswer`, outer `highlightExpressions[].text`, outer long
  `highlightExpressions[].note`, and array order is copied byte-for-byte from
  that baseline.
- The v3 `reviewCard`, five `reviewMarks`, and four nested
  `lectureAnnotation` objects are the proposed new teaching content. They do
  not reuse the approved prototype's old 2024 letter or its old teaching copy.

## Owner prototype gate

The owner personally inspected the two prepared real local
`PaperBrowsePage` tabs, one for 2022 and one for 2024, and switch each injected
paper between `审题要点` / `亮点句式`. The selected Variant A renderer is
injected only into the current browser; the real website still supplies the
paper canvas, lecture rail, navigation, and scroll, and refresh restores it.
The owner explicitly said “过关” on 2026-07-23 at exact prototype head
`4208c672373433b1b357228c55af1645f5ccbb7e`; DEV may now write these exact
packets through the real validator and persistence projection. Machine
`5/5` / `4/4` only
proves all notes were placed; it cannot substitute for the owner's visual
judgment. The verdict covers:

1. review-card judgments match the prompt and current model answer;
2. every review note teaches a visible function, not a decorative label;
3. each highlight is useful for active student writing at Gaokao level;
4. register and relationship fit the named reader;
5. transfer examples preserve the source pattern without becoming ornate
   model-answer copy.

DEV may transport the confirmed objects unchanged. DEV may not author, rewrite,
shorten, translate, or substitute teaching copy.

## PM teaching audit

| Packet | Grammar / register / relationship / purpose judgment |
| --- | --- |
| `paper-2022-i` | The five marks distinguish invitation type, reader concern, both prompt points, and the present/modal politeness pattern. The four short annotations teach formal collective opening, mitigated request, scheduling latitude, and respectful close; all fit a student writing to a foreign teacher/guest. |
| `paper-2024-i` | The five marks distinguish sharing type, reader-facing concrete detail, both prompt points, and past-tense narration. The four short annotations teach process contrast, experience-to-reflection, past-perfect contrast, and a friend-facing wish close; all fit a student sharing an experience with Chris. |

The `guokao-vocab-checker` scan over every student-usable English annotation
label and transfer example reported zero unannotated out-of-range words and
zero suspect derivations.

## Locked five-mark class

Both real prompts contain exactly two content points, matching the selected
prototype's five-mark order:

`type -> cares -> points[0] -> tense -> points[1]`

This cut supports that exact two-point class only. `points.length !== 2`, any
other grid multiset/order, duplicate non-point grids, or a point-mark
cardinality/index mismatch fails the whole application lecture payload. Future
support for other point counts requires a separate contract revision.
