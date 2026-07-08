# Agent Import Runbook (NCK1 pipeline)

Self-contained execution contract for importing one Gaokao English paper into
the local question bank, from raw source files to publish + backfill +
ledger + verify. An agent following this document needs no other history of
this repo's import work — only this file and the docs/scripts it points to:

- **Data contract** (structure, numbering, scoring, answer rules, listening/
  figures conventions): `docs/product/nck1-paper-standard.md` — read this
  FIRST, it is the source of truth; this runbook is the execution of it.
- **Pipeline mechanics reference**: `scripts/import-pipeline/README.md`
  (stages, hard discipline, existing 12-paper precedent).
- Existing shipped validators (do not modify, only call):
  `server/paper-import-ai/**`, `server/paper-import/**`.

Local-only. Never touches production (`.env.qa`, the production server, or
`scripts/pull-run-push.mjs`). Everything below runs against the local SQLite
DB (`data/question-bank.sqlite`) and local dev server.

## 0. Format whitelist check (before anything else)

`nck1-paper-standard.md` §2 only allows two source formats. Confirm the
paper's source files match one before starting:

1. **DOCX 答案版** (2020-2025 precedent, 12 papers already imported this way)
   — see `scripts/import-pipeline/README.md` stages 1-5. This runbook does
   NOT re-document that path.
2. **PDF 试题卷 + 独立答案 PDF** (2026 起, this runbook's path) — the format
   below. Source files live at
   `scripts/import-pipeline/papers/<paperId>/source/{paper.pdf,answers.pdf}`.
   `paper.pdf` = the student-facing exam paper (all stems + options, no
   answers). `answers.pdf` = the 评分参考: objective answers 1-65, writing
   scoring rubric + 下水文 (model essay, if the source provides one), and
   (for national-format papers) the listening transcript + timing/rate
   table.

If the source doesn't match either format: **stop**. Do not invent a new
format ad hoc — a new format needs its own owner-approved mapping in
`nck1-paper-standard.md` 附录 A first (§7).

Confirm the answer source exists (§3 answer redline): if the paper has no
answer file and the owner didn't supply one separately, **do not import it**.

## 1. `config.json`

Every paper gets `scripts/import-pipeline/papers/<paperId>/config.json`
(this is the only file in that directory tracked outside this format's
source/listening/figures — see `scripts/import-pipeline/.gitignore`, which
already excludes the regenerable `groups.json` / `analyze-*` / `analysis-*`
files without needing any changes).

For the PDF+answers-PDF format, hand-write it (there is no `gen-configs.mjs`
equivalent yet — that script only scans a local DOCX folder):

```json
{
  "docxPath": "/absolute/path/to/scripts/import-pipeline/papers/<paperId>/source/paper.pdf",
  "paperId": "paper-<year>-<juan>",
  "provenance": {
    "sourceType": "真题",
    "region": "全国新课标Ⅰ",
    "paperName": "<year>年新课标Ⅰ卷",
    "year": <year>,
    "defaultTags": ["真题", "<year>", "新课标Ⅰ卷"]
  }
}
```

The field is literally named `docxPath` (existing shipped `02-publish.mjs`
contract, untouched by this cut) but points at the PDF — `02-publish.mjs`
only does `readFileSync` + sha256 on it for archival storage, it never
checks the extension. This is a known naming quirk, not a bug; do not try to
rename the field (that would mean editing `02-publish.mjs`, out of scope).

**Done when:** `node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/import-pipeline/papers/<paperId>/config.json')))"` parses cleanly and both source PDFs exist on disk.

## 2. Read the source PDFs directly (no OCR script)

Use your PDF-reading tool directly on `source/paper.pdf` and
`source/answers.pdf` — do not try to script-extract text with `pdfjs-dist`
first. Reasoning (see `nck1-paper-standard.md`'s 回填 note): this source
format is a genuine 试题卷 layout (MC options listed below the passage, no
inline `【答案】` markers) — completely different from the DOCX
答案版 convention `lib.mjs`'s regex splitter was built for. Reverse-
engineering new regex heuristics for an unseen visual layout, sight unseen,
is higher rework-risk than direct transcription validated by shipped shape-
gate code. `pdfjs-dist` stays the pre-approved fallback (`scripts/` or
`server/` layer only, never `app/`) if a paper's PDF resists direct reading
(e.g. no extractable text layer) — not needed for a normal text-layer PDF.

PDFs over ~15 pages need range reads (`pages: "1-10"`, `pages: "11-20"`,
etc. — max 20 pages/call). Transcribe faithfully — §2 语义保真 means you
copy exactly what's printed, including apparent source typos/inconsistencies
(e.g. this cut hit a hotel name spelled two ways in one passage, and a
person's name spelled two ways between a listening question and its
transcript — both were preserved as-is, not "corrected"; note any such
quirk in your own completion report so a human reviewer knows it's not your
transcription error).

Fill in `scripts/import-pipeline/pdf-extract.mjs`'s `CONTENT` registry with a
new `CONTENT['paper-<id>']` entry — copy the shape of the existing
`CONTENT['paper-2026-i']` entry exactly (same pattern as
`zj-inject-answers.mjs`'s `KEYS` table: one hardcoded entry per paperId, no
premature abstraction). Required shape per group:

- `reading`: array of 4 `{ letter: 'a'|'b'|'c'|'d', paragraphs: [string,...], questions: [{stem, options:{A,B,C,D}, answerKey}, ...] }` — §1 says A=3 questions, B/C/D=4 each.
- `seven`: `{ paragraphs: [string with __36__.._40__ blank markers,...], optionBank: [{label,text}, ...7 entries A-G], answers: [5 letters, blank order] }`.
- `cloze`: `{ paragraphs: [string with __41__.._55__ blanks,...], questions: [{options:{A,B,C,D}, answerKey}, ...15 entries] }`.
- `grammar`: `{ paragraphs: [string with __56__.._65__ blanks + "(hint)" where the source gives one,...], questions: [{prompt: hintWordOrNull, answerKey}, ...10 entries] }`.
- `application`: `{ paragraphs: [prompt text], applicationGiven: 'given title/format string, or omit' }`.
- `continuation`: `{ paragraphs: [material text,...], continuationStarters: [2 given starter sentences] }`.

Blank marker convention (`__NN__`) and grammar hint format (`__NN__ (word)`)
must match exactly — they are what `lib.mjs`'s shipped analysis-message
builders and the frontend blank-renderer expect.

**Answers**: copy every objective answer (21-65) directly from
`answers.pdf`'s 评分参考 page into the matching question's `answerKey` — do
NOT let any AI "solve" the questions to produce or cross-check answers
(§3 hard redline: AI-derived answers may never become the stored answer,
regardless of confidence).

**Done when:** you have a complete `CONTENT[paperId]` entry with all 6 group
shapes filled and every objective answer copied from `answers.pdf`.

## 3. Build + shape-gate

```
node scripts/import-pipeline/pdf-extract.mjs <paperId>
```

This assembles the candidate structure, runs it through the SAME shipped
shape-gate builders as the DOCX path
(`buildReadingAnalysisMessages` / `buildSevenChoicesAnalysisMessages` /
`buildClozeAnalysisMessages` / `buildGrammarFillAnalysisMessages` from
`lib.mjs` and `server/paper-import-ai/**`, unmodified), and on success writes
`papers/<paperId>/groups.json` + one `analyze-<key>-combined.txt` per
analyzable group (`reading-a/b/c/d`, `seven`, `cloze`, `grammar` — 7 files).

If a shape gate fails, the error names the missing/malformed field — fix the
`CONTENT` entry (step 2) and re-run. This step never calls an AI model; it
is pure deterministic validation, safe to run repeatedly.

**Done when:** console prints `[DONE] All shape gates passed.` and the BUILD
REPORT's per-group answer strings match what you read from `answers.pdf`.

## 4. AI analysis fan-out (Opus, one sub-agent per group)

Not ad hoc — this is the fixed dispatch template (per plan C1). Spawn **one
subagent per analyzable group** (7 total: `reading-a`, `reading-b`,
`reading-c`, `reading-d`, `seven`, `cloze`, `grammar`), each **pinned to
Opus** (judgment-heavy: trap typing / skill tagging / facet classification
needs the stronger model; the mechanical steps above are Sonnet-appropriate
but this step is not).

Per-agent prompt must include, verbatim:

1. The absolute path to `papers/<paperId>/analyze-<key>-combined.txt` — this
   file already IS the complete system+user prompt (system spec first,
   task/input JSON second). Tell the agent to read it and follow the system
   section's schema exactly.
2. The exact output path to write to:
   `papers/<paperId>/analysis-<key>.json` (single JSON object, no markdown
   fences, no prose — first char `{`, last char `}`).
3. The exact self-validation command:
   `node scripts/import-pipeline/validate-one.mjs papers/<paperId>/config.json <key>`
   (PASS/exit 0 or FAIL/exit 1 with the error message).
4. **Retry rule**: on FAIL, read the error, fix the JSON, re-run validate.
   Cap at 4 attempts total. Common failure modes seen in this cut's fan-out:
   a straight ASCII `"` used as a Chinese-prose emphasis mark breaks JSON
   parsing (use fullwidth `“ ”` instead); a `/`-joined answerKey (e.g.
   `"that/which"`) must be matched as ONE branch in the AI's `answer` field,
   not reproduced with the slash — the validator splits the *key*, not the
   AI's answer.
5. For the grammar-fill group specifically: tell the agent to read
   `server/paper-import-ai/grammar-fill-facets-v1.json` first — every blank's
   `facetKey` must be a real LEAF key from that registry whose `blank_type`
   matches the blank's given/no-hint status.
6. Any known source quirk relevant to that group (e.g. a name spelled two
   ways) — tell the agent it's a literal source quirk, not to "fix" it.

Have each agent report PASS/FAIL + attempt count back to you.

**Done when:** all 7 agents report PASS. Independently re-run the validate
command yourself for every key (trust but verify — an agent's self-report is
not proof):

```
for k in reading-a reading-b reading-c reading-d seven cloze grammar; do
  node scripts/import-pipeline/validate-one.mjs papers/<paperId>/config.json "$k"
done
```

## 5. Listening + figures raw-material staging

Per `nck1-paper-standard.md` §4/§8 (schemas fully specified there, this cut's
回填). Build directly under `papers/<paperId>/`:

- `listening/questions.json`, `listening/answers.json`,
  `listening/transcript.json` — copy verbatim from `answers.pdf` (transcript
  + timing/rate table) and `paper.pdf` (stems/options for Q1-20). No DB
  writes, no group building — these are inert files.
- `figures/manifest.json` + one PNG per table/figure — see §8 for the
  boundary (table = flatten to text + screenshot; figure = screenshot only).

**Table/figure screenshot procedure** (macOS, no new dependencies):

```bash
pdftoppm -f <pageNum> -l <pageNum> -r 300 -png source/paper.pdf /tmp/pageN
sips -g pixelWidth -g pixelHeight /tmp/pageN-0N.png   # find full-page pixel size
# view the full-page PNG, eyeball the table's bounding box, then:
sips --cropOffset <offsetY> <offsetX> -c <height> <width> /tmp/pageN-0N.png --out figures/<name>.png
```

(`sips --cropOffset` args are Y then X despite the confusing `--cropOffset
offsetY offsetH` help text — verify by viewing the cropped result before
finalizing.) `playwright` is the pre-approved fallback if `sips`/`pdftoppm`
can't get a clean crop for a given source.

**Materialtext/placeholder consistency (important, easy to get wrong):**
if you embed a placeholder marker like `[表: fig-<id>]` inside a paragraph
string that later passes through `normalizePassageText` (which
`pdf-extract.mjs` applies to every paragraph), punctuation-spacing rules can
alter the marker's exact bytes (e.g. inserting a space after `:` before a
letter). **Register the placeholder in `figures/manifest.json` using the
POST-normalization text** — check by reading back
`papers/<paperId>/groups.json` after step 3, not by eyeballing what you
typed. `verify-nck1-standard.mjs` (step 7) catches a mismatch here, but
catching it yourself first is faster.

**Done when:** the three listening JSON files and the figures folder +
manifest exist with real content copied from the source PDFs (not placeholder
text).

## 6. Dry-run the package build (still no `--publish`)

```
node scripts/import-pipeline/02-publish.mjs papers/<paperId>/config.json
```

No `--publish` flag: this only exercises the shipped
`buildPaperImportAiPackageFiles` assembly end-to-end (validates every
analysis again, resolves the format profile — cloze count 15 → the
新课标 profile with scores reading 2.5 / seven 2.5 / cloze 1 / grammar 1.5,
matching §1 — and prints the corrected `import-meta.json` provenance block).
Zero DB writes, zero filesystem writes outside the dry-run's own return
value.

**Done when:** console prints `OK: <N> files` (8 for a standard 9-group-minus-listening
paper) and the corrected provenance block matches the paper's actual
year/region/paperName.

## 7. `verify-nck1-standard.mjs` (pre-publish pass)

```
node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>
```

Checks `nck1-paper-standard.md` §6 in full: 9 groups present with the right
group_type and question counts, question-number ranges exactly 21-35/36-40/
41-55/56-65, the cloze-count precondition for correct §1 scoring, all 45
objective answers present exactly once, the 3 listening files structurally
complete, and the figures manifest/placeholder/materialText triangle
consistent. Auto-detects PRE-PUBLISH vs POST-PUBLISH mode by whether
`app/public/paper-assets/<paperId>/latest` exists yet — before step 8 it will
report PRE-PUBLISH and skip the "did the copy step run" check.

**Done when:** "All green." (exit 0).

## 8. Publish (local DB only — hard discipline from `scripts/import-pipeline/README.md`)

```bash
# 1. Stop the local API to release the SQLite write lock:
lsof -ti :8787 | xargs kill
# 2. Publish:
node scripts/import-pipeline/02-publish.mjs papers/<paperId>/config.json --publish
# 3. Restart the API (must use nohup — a bare `&` gets reaped when the tool session exits):
nohup node --env-file-if-exists=.env server/api.mjs &
```

This is the ONLY step that writes to `data/question-bank.sqlite` and
`app/public/paper-assets/<paperId>/**`. It calls shipped
`publishPaperImportPackage` — untouched by this cut. Never run this against
production; there is no production flag here, this only ever targets the
local dev DB path baked into `02-publish.mjs`.

**Done when:** console prints `status: published` and `paperId: <paperId>`.

## 9. Attach listening + figures to the published asset tree

```
node scripts/import-pipeline/attach-paper-assets-extras.mjs <paperId>
```

Copies the staged `listening/` + `figures/` folders (step 5) into
`app/public/paper-assets/<paperId>/{latest,versions/vN}/` — these folders
carry no DB/question-group semantics (§4), so this is a pure additive file
copy alongside the shipped publish artifacts, safe to re-run.

**Done when:** console prints `Done. N folder-copy operation(s)...`.

## 10. `verify-nck1-standard.mjs` (post-publish pass)

Re-run the exact same command as step 7:

```
node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>
```

It now auto-detects POST-PUBLISH mode and additionally checks that
`listening/` + `figures/` landed under `app/public/paper-assets/<paperId>/latest/`.

**Done when:** "All green." (exit 0) in POST-PUBLISH mode.

## 11. Ledger

Append one entry to `docs/import-ledger.md` (create it from the template
there if this is the first entry) recording: paperId, date, source, gate
result, warnings, anything worth a human's attention.

## 12. Owner browser QA (not this runbook's job to perform, but point to it)

After publish, the owner spot-checks locally per the cut's Browser QA
Matrix: find `<paperId>`'s Reading A group in search → detail text renders
(A篇 shows as flattened text, "本篇含表" is expected pre-render-fidelity-cut
behavior, not a bug); build a paper set including B/C/D → A4 preview renders
normally. If Reading A (the table-bearing group) is added to a draft paper
set, standard §8's consumption-degradation rule applies (含表截图题组暂不可
组卷) — that gate lives in a different cut, not here; if the current app
doesn't yet enforce it, flag it as a known gap in the completion report, do
not silently work around it.

## Known runbook risk notes (for whoever runs this next)

- The `docxPath` field name pointing at a `.pdf` file (step 1) is confusing
  on first read — call it out explicitly if a future agent hesitates there.
- Manual PDF transcription (step 2) is the highest-effort, highest-
  attention step in this whole runbook. Budget real time for it; do not
  rush a 10-page exam paper's transcription to save turns — a wrong option
  letter or a dropped word is worse than a slow, careful read.
- The placeholder-marker/normalizePassageText interaction (step 5) is a
  subtle gotcha likely to bite a fresh agent once; the wording above is
  written to preempt it, but watch for it anyway.
- `sips --cropOffset` argument order is undocumented beyond the confusing
  built-in help text; always eyeball the cropped result before trusting it.
