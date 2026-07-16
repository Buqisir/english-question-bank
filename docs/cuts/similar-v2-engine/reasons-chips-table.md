# reasons/chips contract table (v2)

Single source table for plan.md §4 ("reasons/chips 单表：与 recipe 同源").
Every `reason.kind` the v2 engine (`server/search/similarQuestions.mjs`)
can emit, which endpoint/recipe produces it, and an example label. Front-end
consumption note per DESIGN.md §7 (Agent Authoring Discipline / 禁兜底) is
at the bottom.

| kind | endpoint | recipe / branch | example label | scored? |
|---|---|---|---|---|
| `topic-match` | both | passages: informational (topic is a hard gate, not a score term); small-question: secondary layer | `同话题·出行方式` | passages: no (informational only); small-question: yes (secondary, boolean) |
| `position-slot` | `/api/similar-passages` | reading only (primary layer) | `同为B篇` / `篇位相邻` | yes (primary, 70/35/0) |
| `authentic-source` | `/api/similar-passages` | all four groupTypes (secondary layer) | `真题` | yes (secondary, 0/99) |
| `facet-hit` | `/api/similar-questions` | reading (skill hit) / grammarFill non-finite (role hit) / grammarFill "other" (facetKey hit) — all primary layer | `同小题题型：inference` / `同款：非谓语作定语 · doing` / `同考点：given.noun.number` | yes (primary, 0/99) |
| `verb-vector` | `/api/similar-questions` | grammarFill finite-verb branch only (primary layer) | `谓语相似：时态+语态+一致` | yes (primary, 0-7) |

## Front-end consumption status (checked, not changed, this cut)

`app/src/features/paper-browse/SimilarQuestionsRailView.tsx` renders every
`reason.label` unconditionally — there is no `switch`/whitelist on
`reason.kind` anywhere in the render path (the v1 SW-1 constant-discourse
filter was already removed in the engine-rewire cut). So DESIGN.md §7's
no-literal-fallback / explicit-whitelist discipline has **no live surface
to violate** for this kind vocabulary today: an unknown kind renders exactly
like a known one (just a `<span>` with the label text), never a silent
drop or a hard crash.

What IS stale: `app/src/domain/questionBank.ts`'s
`SimilarQuestionReasonKind` TypeScript union still lists the v1 kind names.
This is a compile-time documentation contract, not a runtime behavior —
see `cut-note.md` §3 for why it is left to E6/E7 (UI scope, hard-guarded
contract path) rather than patched here.
