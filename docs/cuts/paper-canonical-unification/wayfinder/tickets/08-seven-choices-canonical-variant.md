# 定义七选五 canonical variant 与双卷 proof 合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 定义卷型模板与整卷装配单合同; 定义题组通用 envelope 与 rich content nodes; 定义 A–D 选项整组择形算法与金样卷 parity
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/09-reading-canonical-variant.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How should seven-choices paragraphs, five semantic blanks, Question identity, one group-owned A–G option bank, answer authority, and punctuation ownership fit the shared canonical envelope without preserving raw blank markers? Select two contrasting real proof groups, enumerate supported source dialects and fail-closed cases, and define semantic parity and anchor expectations for plain/lecture Screen, Print/PDF, and DOCX. Each rendered occurrence of the question group must contain exactly one shared A–G bank, must never synthesize a per-blank A–D choice layer, and must include a regression proof for the owner-observed repeated/nested-bank Print/PDF failure. The result must specify the new-import gate and historical compatibility evidence needed before this family can retire its legacy interpretation.

## Resolution

[Prototype asset: Seven Choices canonical variant 与双卷 proof 合同](../../prototypes/seven-choices-canonical-variant.md)

Select one closed `CanonicalSevenChoicesVariantV1`: exactly five ordered,
unique Question/Blank pairs share exactly one group-owned A–G bank, and each
official answer joins to that bank by stable `optionId`. The envelope's
Question and Blank refs match the member order exactly. Plan display numbers
remain outside the Group; Analysis may attach by stable ids but is never
answer authority.

Source Adapters replace only registered marker dialects with semantic
`blank_ref` nodes. Current `__NN__` and `_____NN_____` dialects plus the
producer-evidenced exact `(1)`–`(5)` local-ordinal mapping are versioned
separately; literal punctuation stays in adjacent text nodes, while source
marker bytes remain in the Source Map/Transformation Records. Missing evidence
fails `incomplete_source`, ambiguous identity or stray local ordinals fail
`needs_review`, unregistered dialects fail `unsupported`, and conflicting
official keys fail `answer_conflict`.

Every plain/lecture Screen, Print/PDF, and DOCX occurrence consumes one
renderer-neutral shared-bank projection with five Question/Blank anchors,
seven Option anchors, exactly one bank, and zero per-question choice sets.
The real `group-2026-i-seven-choices` failure was reproduced: detail exposes
`7,7,7,7,7` options and Print/DOCX emit A–G five times each. The accepted
conformance contract rejects that shape for repeated bank, forbidden
per-question layer, and nested bank; the historical “pure A–D” observation
remains unclaimed because the current fixed point does not reproduce it.

The throwaway logic prototype compiled contrasting real
`paper-2026-i / group-2026-i-seven-choices` and
`paper-960d0f8d / group-960d0f8d-seven-choices` hash-bound proofs to `ready`.
Five semantic surface projections per proof shared one signature, one bank,
zero per-question sets, five pairs, and 17 stable anchors. The linked asset
records the new-import zero-write hard gate and the complete 33-`latest`
compatibility/real-render/owner-QA evidence required before legacy retirement;
the throwaway code was deleted after capture.

Recorded verification:

- `node .scratch/wayfinder-08-seven-choices-prototype.mjs --all` — `PASS`
  before throwaway deletion.
- Current public export reproduction — Question option counts
  `7,7,7,7,7`; Print HTML and DOCX XML label occurrences A–G each `5`.
- `git diff --check`.

No `CONTEXT.md` change, Fog graduation, or new ticket is required.
