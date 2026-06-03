# PA Review — I16·C 语法填空·动词教学维度（时态 / 语态 / 主谓一致）

Fresh independent PA, cold read against live code + live data. Reviewer: 小川 (PA), 2026-06-03.
All load-bearing claims verified against code paths and the on-disk/DB live data below.

## Verdict

**APPROVE WITH MUST FIX**

Direction is right and the cut is well-sliced (additive, isolated, reuses #180 retrieval +
#181 backfill shape, respects the `94950a1` "don't restuff the analysis prompt" lesson).
The storage-home recommendation (sidecar) is **architecturally sound but the plan's stated
write target and its gitignore claim are both wrong against the live repo**, and the live
coverage is so thin that the cut as written risks shipping a passive-search filter with
**zero or one** real hit. Five Must Fix items; none change the direction.

## Product Principle

Teacher action improved: "搜被动题 / 搜某时态 / 搜主谓一致" — find grammar-fill questions by
the verb teaching axis the teacher wants to drill. Before: a passive-voice search bottoms out
at "this is a finite-verb blank" (one leaf, no tense/voice/agreement). After: the finite-verb
blank carries `{tense, voice, agreement}`, persisted in a sidecar, filterable through the
existing teaching-facets endpoint. This reduces teacher work (no manual scan) and does not
touch the A4 paper surface (no UI this cut). Correct product wedge.

## Exact Architecture Model

- New frozen enum registry `grammar-fill-verb-axes-v1.json` = single source for the 3 axes.
- New AI classifier `analyzeGrammarFillVerbProfile.mjs` (injectable provider) classifies
  finite-verb blanks → `{tense, voice, agreement}`, validated against the registry.
- New injectable backfill orchestrator mirroring `backfillTopicLabels.mjs`.
- New sidecar `analyses/grammar-fill-verb-profile-v1.json`, atomic temp+rename, keyed by
  questionId, never patches the frozen `grammar-fill-analysis-v1.json`.
- teachingFacets gains a verb-profile config + `tenses/voices/agreements` Sets, the index
  build changes from overwrite to merge-by-groupId, and `GET /api/teaching-facets` finally
  wires query filters into the existing `queryGroupsByTeaching`.
- New `POST /api/grammar-fill/verb-profiles/backfill` via route factory; invalidates the
  facet cache on completion.

This model is correct. The Must Fix items are about the data-contract edges, not the shape.

## Verified Claims (evidence)

| Plan claim | Verdict | Evidence |
| --- | --- | --- |
| finite-verb blank carries NO tense/voice/agreement | TRUE | `analyzeGrammarFill.mjs:32-42,259-289` — only `role`/`path`, and only for `non-finite`. Finite leaf has no verb sub-fields. |
| `validateGrammarFillShape` is strict v1 | TRUE | `analyzeGrammarFill.mjs:210-339`; rejects unknown facetKey, enforces 16-leaf registry. |
| 16-leaf registry | TRUE | `grammar-fill-facets-v1.json` = exactly 16 leaves; `grammar-fill.given.verb.finite` is one leaf. |
| `index.set(groupId, {...})` clobbers per config | TRUE | `teachingFacets.mjs:239-242`. A second config for the same groupType/groupId WILL overwrite the grammarFill bucket. Merge-by-groupId is genuinely required (see MF-2). |
| `queryGroupsByTeaching` exists but endpoint ignores filters | TRUE | `queryGroupsByTeaching` at `teachingFacets.mjs:289`; route at `:336-349` returns ALL groups, never reads query params. |
| `writePaperImportVersion` is whole-version atomic, needs full packageData incl. docx, no patch helper | TRUE | `storage.mjs:105-152`; requires `packageData.sourceDocx.buffer` (:129). No single-analysis patch helper anywhere. Sidecar over patch is correctly justified. |
| `backfillTopicLabels.mjs` is the injectable shape to mirror | TRUE | `backfillTopicLabels.mjs:21-59` — fully injected, per-item try/catch into `failed`, returns summary. |
| route composed via factory, not literal push | TRUE | `api.mjs:433-442` — `serverRoutes` spreads `createTeachingFacetRoutes()` / `createQuestionGroupRoutes()`. |
| **"app/public/paper-assets/** is gitignored"** | **FALSE** | `.gitignore:52` only ignores `app/public/paper-assets/*/versions/`. The flat `analyses/` and any `latest/` are TRACKED — `git ls-files` shows `paper-2024-jslk-english/analyses/*.json` committed. See MF-3. |
| "write only to `latest/analyses/`; retrieval reads latest" | **PARTLY FALSE** | The only grammar-fill paper on disk (`paper-960d0f8d`) has **NO `latest/` dir** — only `versions/v1/`. `resolvePaperAssetReadPaths` (storage.mjs:32-48) falls back to `versions/<latest>` when `latest/` is absent. A sidecar written to `latest/analyses/` would create a phantom `latest/` that diverges from the version the index actually reads. See MF-1. |

## Live Data Reality (the dominant finding)

Counted directly against `data/question-bank.sqlite` and `app/public/paper-assets/`:

- **Grammar-fill groups in the system: exactly 1.** DB has no `grammarFill` row at all — it
  stores this group as `group_type='grammar_cloze'` (`group-960d0f8d-grammar-fill`). The
  paper-asset content groupType IS `grammarFill` (what the index reads), so retrieval works,
  but there is only one such group across the entire corpus.
- That one group's grammar-fill-analysis-v1.json lives at
  `app/public/paper-assets/paper-960d0f8d/versions/v1/analyses/grammar-fill-analysis-v1.json`
  (gitignored, local-only — so NOT on a fresh checkout).
- **Finite-verb blanks in that group: exactly 1**, answer `"are"` (hint `be`) →
  present + active + plural. **There is currently ZERO passive-voice finite-verb data.**
- `paper-2024-jslk-english` (the only git-tracked paper) has reading + seven-choices analyses
  only — no grammar-fill at all.

Consequence: as written, the cut's headline demo (`GET /api/teaching-facets?voice=passive`
hits a group) will return **empty** on the live corpus. The owner was burned by both under-
and over-estimating coverage (#181 MF-1). This must be on the table before DEV, not discovered
in PO QA. This is MF-5.

## Must Fix Before DEV

### MF-1 — Sidecar write target must match the read path the index actually uses
The plan writes the sidecar to `latest/analyses/` and asserts retrieval reads latest. The one
real grammar-fill paper has no `latest/` dir; `resolvePaperAssetReadPaths` resolves it to
`versions/v1/`. Writing a sidecar to a freshly-created `latest/` would (a) not be read if a
later `latest/` swap rebuilds from a version without the sidecar, and (b) create a `latest/`
that disagrees with `versions/v1/`. **The persistence helper must write the sidecar into the
SAME baseDir that `resolvePaperAssetReadPaths(paperAssetsDir, paperId)` returns for that paper**
(i.e. resolve baseDir first, write into `<baseDir>/analyses/`), and the index must read it from
that same resolved baseDir — which it already does (`teachingFacets.mjs:205,228`). Do NOT
hardcode `latest/`.
Plan disposition: rewrite the Storage decision + Step 3 to "resolve baseDir via
`resolvePaperAssetReadPaths`, write sidecar into that baseDir's `analyses/`"; add a Step 3
verification that the sidecar lands in the same baseDir the index walks.

### MF-2 — Index merge refactor must carry a #180 regression assertion AND be cap-scoped
The overwrite→merge-by-groupId change at `teachingFacets.mjs:239-242` is genuinely required
(a parallel grammarFill config would otherwise clobber the existing facetKeys/blankTypes/roles
bucket built from the main analysis). Risk: the merge must also preserve `groupType` and must
not let the verb-profile config (which has no groupType-bearing main analysis) blank out the
grammarFill groupType tag. Required: the verifier must assert, against a fixture with both a
grammar-fill main analysis AND a verb-profile sidecar for the same group, that the merged
bucket still contains the original `facetKeys` (incl. `grammar-fill.given.verb.finite`),
`blankTypes`, `roles`, `groupType:'grammarFill'`, AND the new `tenses/voices/agreements`.
Also assert reading `skills`, cloze `pos`, sevenChoices facets are untouched.
Plan disposition: Step 4 verification must name these exact regression assertions; add a
Forbidden line "merge must not drop or overwrite existing per-type facet Sets or groupType".

### MF-3 — Forbidden must correct the gitignore claim and name the real commit hazard
The plan asserts paper-assets are gitignored; they are NOT (only `*/versions/`). The sidecar,
if written to a flat `analyses/` or to `latest/`, lands in a TRACKED path and can be committed.
The "不提交 paper-assets" Forbidden is therefore load-bearing and currently rests on a false
premise. Required: Forbidden must state explicitly that `latest/` and flat `analyses/` are
git-tracked, that the verb-profile sidecar must NOT be staged, and that staging is explicit
(no `git add -A`). DEV must verify `git status` shows no sidecar before commit.
Plan disposition: fix the gitignore sentence in Code Reality; harden the Forbidden line.

### MF-4 — Deterministic-first, AI-fallback for agreement (and a parser sanity gate)
Owner locked "标全形态 A" (classify by answer form). For the dominant cases the answer string
alone is sufficient and a deterministic parser is cheaper AND more reliable than a new AI prompt:
`was/were built` → past+passive; `has/have made` → present-perfect+active; `is/are`,
third-person `-s` → present+agreement. AI is justified ONLY for genuinely ambiguous edges
(bare past vs past-participle without auxiliary, irregulars, agreement that needs the subject
not in the answer). This is NOT a request to drop the AI prompt — owner picked A — but the cut
must not pretend AI is needed for the easy 80%. Required: the AI prompt must receive the
finite-verb `answer` string AND the surrounding sentence (agreement frequently needs the subject,
which the answer alone does not carry — the live "are" case proves this: number comes from the
antecedent "vitamins and minerals", not from "are"). Without the subject context the AI cannot
reliably set `agreement`. Plan Step 1 currently passes "passage + finite blanks with answer" —
confirm the per-blank sentence/subject context reaches the prompt, and add a verifier case that
agreement is derived from subject context, not from the bare answer.
Plan disposition: Step 1 + prompt spec must require subject/sentence context per finite blank;
verifier must include an agreement-from-subject case.

### MF-5 — Coverage is 1 group / 1 finite blank / 0 passive; the cut must state the honest demo
Live: exactly one grammar-fill group, one finite-verb blank ("are" = present/active/plural),
zero passive data. The plan's PO QA promises "`?voice=passive` 命中含被动谓语空的组" — that
will return empty on the real corpus today. DEV must not discover this in QA. Required: (a) the
plan's "覆盖量" PA-ask must be answered with the verified number (1 group, 1 finite blank, 0
passive) and recorded; (b) PO QA must be rewritten to a coverage-honest acceptance: the demo of
record is `?tense=present&voice=active&agreement=plural` hits the one real group, and the
passive path is verified via a fixture/seed, not the live corpus; (c) the backfill summary must
honestly report "profiled 1 finite blank across 1 group" rather than implying broad coverage.
If the owner wants a real passive demo, that requires importing a paper with a passive finite
blank — flag as a PO decision, do not silently assume coverage.
Plan disposition: fill "覆盖量" PA-ask with the verified count; rewrite the PO QA block;
add an honest-coverage Forbidden already present (good) but tie the QA to it.

## Must Fix -> Plan Disposition Checklist

| MF | Required plan.md disposition |
| --- | --- |
| MF-1 | Storage decision + Step 3: resolve baseDir via `resolvePaperAssetReadPaths`, write sidecar into that baseDir's `analyses/`, NOT hardcoded `latest/`; add Step 3 verification. |
| MF-2 | Step 4 verification: name the merge-preserves-existing-Sets + groupType + cross-type regression assertions; add Forbidden "merge must not drop existing facet Sets/groupType". |
| MF-3 | Code Reality: correct the gitignore claim (only `*/versions/` ignored); Forbidden: name `latest/` + flat `analyses/` as tracked, sidecar must not be staged, explicit stage only. |
| MF-4 | Step 1 + prompt spec: pass per-blank sentence/subject context; verifier includes agreement-derived-from-subject case. |
| MF-5 | Answer "覆盖量" PA-ask with verified count (1/1/0); rewrite PO QA to coverage-honest acceptance + fixture-based passive verification; backfill summary honest. |

## Should Watch

- **SW-1 Re-import staleness**: re-import rewrites the main analysis but not the sidecar →
  stale `{tense,voice,agreement}` if blanks change. Acceptable as a documented V0 limitation
  for local single-user; record it. Mitigation later: stamp sidecar with `sourceAssetVersion`
  and have the index skip a sidecar whose version != the resolved analysis version.
- **SW-2 sidecar versioning**: latest-only is acceptable for V0 since the index reads whatever
  `resolvePaperAssetReadPaths` resolves; do NOT mirror into `versions/<v>/` this cut (that
  reintroduces the whole-version write coupling the cut is avoiding). Watch only.
- **SW-3 Tense taxonomy "other" bucket**: with progressive merged into one value and no future
  tense, edge answers (modal+base, subjunctive, `used to`) fall to `other`. Acceptable for 高考
  语法填空; just ensure `other` is searchable and the prompt is told when to use it.
- **SW-4 Index merge fan-out cost**: rebuilding the full index per backfill-then-invalidate is
  fine at this scale (1 group). No action.
- **SW-5 agreement `na`**: imperatives, modals, and non-third-person where number is irrelevant
  must map to `na`, not be forced singular/plural. Ensure the registry + prompt define `na`'s
  trigger precisely so search doesn't over-report.

## Taxonomy soundness (teaching-correctness)

Sound for 高考 语法填空. 5 tenses + `other` matches the cited 速查 chapters (no standalone future
chapter; future is rare in 语法填空). Progressive merged into one value is defensible (the axis
is the verb form, not the time). Voice as an independent cross-tense axis is correct (passive is
taught as its own 专题). Agreement as a light independent axis with `singular/plural/na` is the
right call given it's objectively decidable — but see MF-4: it is decidable from the SUBJECT,
not from the bare answer, so the classifier needs subject context.

## Allowed Files

- `server/paper-import-ai/grammar-fill-verb-axes-v1.json` (new registry)
- `prompts/grammar-fill-verb-profile-v1.md` (new prompt)
- `server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs` (new classifier + validator)
- `server/grammar-verb-profile/backfillVerbProfiles.mjs` + sidecar persistence helper (new)
- `server/search/teachingFacets.mjs` (config + merge-by-groupId + 3-axis filters + endpoint filter wiring)
- `server/api.mjs` (backfill route via factory; expose injected deps; cache invalidate)
- `scripts/verify-i16c-grammar-verb-axes.mjs` (new) + `scripts/verify-ci.mjs` + `scripts/README.md`
- `CONTEXT.md` (domain terms)
- `docs/cuts/I16c-grammar-verb-axes/plan.md` (PA Follow-Up Decisions table)

## Forbidden Files

- `prompts/grammar-fill-analysis-v1.md` (frozen analysis prompt)
- `analyzeGrammarFill.mjs` `validateGrammarFillShape` / 16-leaf logic / `grammar-fill-facets-v1.json`
- `server/paper-import/storage.mjs` `writePaperImportVersion` (do not route the sidecar through it)
- `schema.sql` / any DB migration (sidecar is disk, not DB)
- Any frontend / color token / chip (no UI this cut)
- `app/public/paper-assets/**` (must NOT be staged — and note it is only partly gitignored)
- `.env`, `.claude/launch.json`

## Static Verify Requirements

- `node scripts/verify-i16c-grammar-verb-axes.mjs`: classifier accepts valid 3-axis, rejects
  out-of-registry values / missing fields; only finite blanks produce a profile; backfill
  orchestration (all profiled / already-profiled skipped / one failure isolated / honest
  summary counts); index merge preserves existing grammarFill + reading/cloze/sevenChoices
  facets AND adds 3 axes (MF-2); endpoint `?voice=passive` / `?tense=...&voice=...` AND-filters,
  no-filter = unchanged (#180 backward compat); agreement-from-subject case (MF-4); diff fence
  asserts the frozen prompt + validator + facets registry are untouched.
- `git diff --check`; `node scripts/verify-ci.mjs`; `npm run build --prefix app` (regression only).

## Browser QA Matrix

None — no UI this cut (matches plan). API-level PO QA only, and it must be coverage-honest per
MF-5: real demo = `?tense=present&voice=active&agreement=plural` hits the one real group;
passive path proven via fixture, not the live corpus.

## DEV Readiness

DEV-ready AFTER the 5 Must Fix are folded into plan.md. Teacher action, before/after, current
vs future boundary, allowed/forbidden files, verify scripts, and (no) browser QA are all
statable. The only thing currently blocking is the false storage/gitignore premises (MF-1/MF-3),
the missing merge regression contract (MF-2), the subject-context gap for agreement (MF-4), and
the coverage honesty (MF-5). None are direction errors.

## Open PO Decisions

1. **Real passive demo data**: live corpus has zero passive finite-verb blanks. Is a present/
   active/plural demo acceptable for this cut, with passive proven only by fixture — or does the
   owner want to import a paper containing a passive finite blank first? (Default: fixture-proven
   is fine for V0; do not block the cut on data acquisition.)

(1 open PO decision — well under the 3-max.)
