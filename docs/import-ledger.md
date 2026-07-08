# Import Ledger

One entry per paper import, appended (never rewritten) at the end of the
`docs/import/agent-runbook.md` flow (step 11). Newest entry at the bottom.
Each entry: paperId / date / source format / gate result / warnings /
anything worth a human's attention.

---

## paper-2026-i — 2026-07-07

- **Source**: PDF 试题卷 + 独立答案 PDF (`scripts/import-pipeline/papers/paper-2026-i/source/{paper.pdf,answers.pdf}`), format #2 of `nck1-paper-standard.md` §2 whitelist — first paper imported via this format, and the format's接入 cut (`nck1-import-runbook`).
- **Provenance**: 真题, 全国新课标Ⅰ, 2026年新课标Ⅰ卷.
- **Pipeline path**: `scripts/import-pipeline/pdf-extract.mjs paper-2026-i` (new PDF-format builder, bypasses `lib.mjs`'s DOCX-answer-version regex splitter — see `docs/import/agent-runbook.md` §2 for why) → 7-way Opus fan-out (reading-a/b/c/d, seven, cloze, grammar) → `validate-one.mjs` (all 7 independently re-verified PASS) → `02-publish.mjs` dry-run (`OK: 8 files`) → `verify-nck1-standard.mjs` pre-publish (16/16 green).
- **Gate result at DEV handoff**: all pre-publish gates green (§6 fully covered by `verify-nck1-standard.mjs`); `02-publish.mjs --publish` intentionally NOT run by this DEV cut (reserved for the C6 acid-test agent per plan). Whoever runs the publish step should complete runbook steps 8-11 (publish → attach-paper-assets-extras.mjs → post-publish verify → this ledger) and update this entry's gate result to reflect the published state.
- **Warnings / things worth a human's attention**:
  - Reading D's source PDF prints "34." twice (an apparent source numbering typo); standard §2 renumbers 21-35 sequentially regardless, so the 4th D question became 35 — no content lost, just a source-side typo, noted here for traceability.
  - Reading A: passage prose spells the fictional hotel "Sonder Lim Hotel"; its own answer option A spells it "Sonder Lüm Hotel" — a literal source inconsistency, preserved as printed in both places per §2 语义保真 (not "corrected" to match).
  - Reading C: question 29 refers to the study's coauthor as "Commune" while the passage names her "Róisín Commane" — same treatment, preserved as printed.
  - Listening transcript (Text 9, source `answers.pdf`): the source's own dialogue text has an apparently dropped subject in "...until French author Jean Poteau. In the 1980s, was asked to write..." and spells the name "Jean Poteau" where the printed question (Q16) asks about "Jean Bottero" — copied verbatim into `listening/transcript.json`, not corrected (listening content never reaches any analysis/consumption surface per §4, so this has zero downstream risk, but flagging for anyone reading the raw file).
  - Reading A contains the paper's only table (SoFi Stadium football schedule) — handled via the §8 dual-store bridge: flattened text stays in `groups.json`'s materialText, full-table screenshot + manifest are staged under `figures/`. Per §8 this group cannot be added to a draft paper set until the render-fidelity cut lands; the current app was not verified by this DEV cut to actually enforce that gate (out of scope — flagged for whoever owns that follow-up).
  - `figures/manifest.json`'s `placeholderMarker` string had to be updated once to match `normalizePassageText`'s punctuation-spacing output (a space gets inserted after `:` before a letter) — see runbook step 5's note; this is a generic gotcha for any future figure, not specific to this paper.
