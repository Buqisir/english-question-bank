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
- **Gate result — published (2026-07-08)**: `02-publish.mjs --publish` succeeded (`status: published`, DB row `paper_import_runs.status = 'published'`, `asset_version: 1`) → `attach-paper-assets-extras.mjs` copied `listening/`+`figures/` into `latest/`+`versions/v1/` (4 folder-copy ops) → `verify-nck1-standard.mjs` re-run in POST-PUBLISH mode: **16/16 checks passed, All green.** First `--publish` attempt (previous DEV cut, 2026-07-07) had failed with `status: validation_failed` because `server/paper-import/validator.mjs` hard-rejected the PDF source doc by extension; fixed in commit `8cb5ba0` (validator now accepts exactly 1 source doc that is either `.docx` (PK magic) or `.pdf` (%PDF magic)); this run is the first successful publish of format ②.
- **Known runbook/script quirk hit during publish**: `02-publish.mjs`'s success path only prints `status: published`, never the `paperId:` line the runbook's step 8 "Done when" expects — `publishPaperImportPackage`'s returned object has no top-level `paperId` field (it's nested under `result.publish.paperId`), so `02-publish.mjs`'s `if (result.paperId) console.log(...)` guard never fires. Cosmetic only (confirmed the real paperId via the DB row and the `app/public/paper-assets/paper-2026-i/` dir instead), but worth fixing in the script or amending the runbook's "Done when" wording so a future agent doesn't chase a false alarm. **已修(本 commit)**: `02-publish.mjs` now prints `result.publish?.paperId`, and the runbook's step 8 "Done when" wording matches the actual two-line output.
- **Warnings / things worth a human's attention**:
  - Reading D's source PDF prints "34." twice (an apparent source numbering typo); standard §2 renumbers 21-35 sequentially regardless, so the 4th D question became 35 — no content lost, just a source-side typo, noted here for traceability.
  - Reading A: passage prose spells the fictional hotel "Sonder Lim Hotel"; its own answer option A spells it "Sonder Lüm Hotel" — a literal source inconsistency, preserved as printed in both places per §2 语义保真 (not "corrected" to match).
  - Reading C: question 29 refers to the study's coauthor as "Commune" while the passage names her "Róisín Commane" — same treatment, preserved as printed.
  - Listening transcript (Text 9, source `answers.pdf`): the source's own dialogue text has an apparently dropped subject in "...until French author Jean Poteau. In the 1980s, was asked to write..." and spells the name "Jean Poteau" where the printed question (Q16) asks about "Jean Bottero" — copied verbatim into `listening/transcript.json`, not corrected (listening content never reaches any analysis/consumption surface per §4, so this has zero downstream risk, but flagging for anyone reading the raw file).
  - Reading A contains the paper's only table (SoFi Stadium football schedule) — handled via the §8 dual-store bridge: flattened text stays in `groups.json`'s materialText, full-table screenshot + manifest are staged under `figures/`. Per §8 this group cannot be added to a draft paper set until the render-fidelity cut lands; the current app was not verified by this DEV cut to actually enforce that gate (out of scope — flagged for whoever owns that follow-up).
  - `figures/manifest.json`'s `placeholderMarker` string had to be updated once to match `normalizePassageText`'s punctuation-spacing output (a space gets inserted after `:` before a letter) — see runbook step 5's note; this is a generic gotcha for any future figure, not specific to this paper.

### paper-2026-i 生产同步(2026-07-08)

- 生产机按 runbook 步骤 8-10 发布:`status: published`、attach extras 4 项、
  `verify-nck1-standard` **17/17 POST-PUBLISH 全绿**;生产 DB 9 题组入库,
  eqbank.cc 200,前端已重建。
- 实证一个可移植性 bug:config.json 的 docxPath 曾是本地绝对路径,生产
  发布时源文件找不到 → 包内空条目崩溃。已修:02-publish.mjs 对相对
  docxPath 按 config 所在目录解析,config.json 改为 `source/paper.pdf`
  (本 commit)。生产当次以临时 sed 方式完成,树已还原干净。
