# Agent Import Runbook (NCK1 pipeline)

**Agent entry:** `docs/import/agent-contract.md` is the unique start document
for any local coding agent. This runbook is the mechanical how-to that
contract chains to. Do not start from this file alone.

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

## Canonical-required backend boundary

Every newly published package is canonical-required. The backend operator must
provide one relative-path request envelope through `config.canonicalRequestPath`;
`scripts/import-pipeline/02-publish.mjs` loads it with
`loadCanonicalImportRequest(...)`. The envelope is an evidence index, not a
place to paste mutable byte arrays: each document names an immutable local file,
its roles, and its declared media facts.

The envelope itself has this closed outer shape:

```json
{
  "authority": {
    "manifestId": "<current canonicalAuthorityRef.manifestId>",
    "manifestVersion": "<current canonicalAuthorityRef.manifestVersion>",
    "manifestDigest": "<current canonicalAuthorityRef.manifestDigest>"
  },
  "evidence": {
    "documents": [
      {
        "inputKey": "canonical_source_envelope",
        "roles": ["operator_assertions"],
        "declared": {
          "mediaType": "application/vnd.eqb.canonical-fixture+json",
          "originalName": "canonical-source-envelope.json"
        },
        "path": "01-canonical-source-envelope.json"
      },
      {
        "inputKey": "original_question_source",
        "roles": ["question_source", "source_provenance"],
        "declared": {
          "mediaType": "application/pdf",
          "originalName": "paper.pdf"
        },
        "path": "02-original-question-source.pdf"
      },
      {
        "inputKey": "reading_structure",
        "roles": ["structured_source"],
        "declared": {
          "mediaType": "application/json",
          "originalName": "reading-source-capture-v1.json"
        },
        "path": "07-reading-source-capture.json"
      },
      {
        "inputKey": "listening_answers",
        "roles": ["structured_source", "official_answer_source"],
        "declared": {
          "mediaType": "application/vnd.eqb.listening-answers+json",
          "originalName": "answers.json"
        },
        "path": "15-listening-answers.json"
      }
    ]
  }
}
```

`application/vnd.eqb.canonical-fixture+json` is the exact media type registered
by the current authority's `canonical-fixture-evidence` source adapter. Despite
the retained adapter name, backend operators do not author this document or
import test helpers. For an NCK1 PDF package, materialize it and the request
envelope through the production producer:

```bash
node scripts/import-pipeline/build-canonical-request.mjs \
  "<backend-package-dir>" \
  --answers-pdf "<paper-source-dir>/answers.pdf" \
  --instruction-evidence "<reviewed profile-writing-source-evidence.json>" \
  --reviewed-evidence-dir "<reviewed-evidence-dir>" \
  --output-dir "<backend-package-dir>/canonical-evidence" \
  --write
```

The package directory must already contain the normal package-builder outputs
`paper-asset.json`, `answer-key.json`, and the immutable `paper.pdf`.
`--instruction-evidence` is the accepted source transcription/correction
record bound to that PDF; it is never inferred by the producer.
`--reviewed-evidence-dir` must contain the reviewed Reading structured capture
and table proof, both Writing captures and transcriptions, and the Listening
Questions 1–20 with A–C options, official answers, transcript segments, and
timing/audio inventory. The producer only assembles those immutable documents
and an empty registered source envelope. Registered compiler adapters derive
canonical semantics, Source Spans, Transformation Records, and inactive-slot
closure. Missing or conflicting evidence blocks compilation before any output
is written; neither the producer nor package validator supplies an answer,
reconstructs `[表: …]` marker text, or precloses Listening. Rerun the same
command without `--write` to prove every output is byte-reproducible.
The default file name is `canonical-import-request.json`; evidence selection is
owned by the current authority's explicit producer contract, never inferred
from that file name. Under Manifest v27, the command above must select
`application-writing-source-capture-v3.json` and
`application-writing-source-transcription-v3.json`, materialize them as
`21-application-writing-capture-v3.json` and
`22-application-writing-transcription-v3.json`, or fail closed before writing.

Copy the current `canonicalAuthorityRef`; never copy an older request's
authority block. Every `path` is non-empty, relative to the envelope, contains
no `..`, and resolves to an immutable file. Do not hand-author a Canonical
Paper, Publication, or Source Capture as an input. Reviewed structured-source
documents are evidence inputs and require exact source lineage. The exact
admitted `paper-asset.json`, `answer-key.json`, and original PDF/DOCX source
must all occur in Source Capture under their correct roles; the public
publisher verifies the package-file digests again.

Before the state-changing publish, load and compile the envelope fail-closed:

```bash
CANONICAL_REQUEST="<absolute path to canonical-import-request.json>" \
node --input-type=module -e '
  import { loadCanonicalImportRequest } from "./server/paper-canonical/importRequest.mjs";
  import { compileCanonicalPaper } from "./shared/paper-canonical/compiler.mjs";
  const result = compileCanonicalPaper(loadCanonicalImportRequest(process.env.CANONICAL_REQUEST));
  console.log(result.disposition, result.diagnostics);
  if (result.disposition !== "ready") process.exitCode = 1;
'
```

This check proves the evidence/authority closure only.
`publishPaperImportPackage(...)` remains the required package-binding and
atomic-write seam; never treat the preflight as permission to bypass it.

The exact executable boundaries are:

1. **Package and immutable source capture** —
   `buildNck1CanonicalImportRequest(...)` materializes the registered
   whole-paper structured-source evidence from the normal NCK1 package outputs;
   `readImportPackageFromDirectory(...)` and
   `validatePaperImportPackage(...)` admit the backend package;
   `publishPaperImportPackage(...)` invokes `captureDocxSourceMedia(...)` for a
   DOCX input and preserves the source plus extracted media under the immutable
   version. DOCX remains a source-input format only.
2. **Compiler** — `admitCanonicalPaperImport(...)` calls the sole semantic
   entry `compileCanonicalPaper(request)`. The compiler creates Source Capture,
   resolves the bound authority closure, and returns one whole-paper
   disposition. Operators never hand-edit Source Capture, a canonical sidecar,
   or a blocked result.
3. **Publisher** — `publishPaperImportPackage(...)` is the public backend
   admission seam. It validates one complete ready Publication before the first
   store write, stages manifest-last, publishes one immutable version, journals
   the database/latest swap, and performs an exact committed reload.
4. **Loader** — `loadPaperForConsumption(...)` reopens that exact Publication
   against the checked-in `screen` or `print_pdf` Consumer Contract. No caller
   may assemble groups, sidecars, or latest files independently.
5. **Recovery, retry, and rollback** —
   `recoverInterruptedPaperImportPublish(...)` runs before every publish;
   retry the same public publish command after correcting the reported cause.
   An interrupted committed retry is idempotent. Use
   `rollbackPaperImportPublication(...)` only with a validated prior immutable
   version; never copy `latest`, edit a sidecar, or delete a version by hand.
6. **Evidence** — the immutable source package, request-envelope documents,
   Publication manifest/digests, committed current reference, supported
   Consumer Plans, rendered artifact digests, and HEAD are the audit chain.
   Analysis may enrich lecture/teacher output only; it is never source evidence
   for paper semantics or official answers.

Ticket 20 keeps one executable local proof of those boundaries:

```bash
node scripts/verify-paper-canonical-import-pilot-fixes.mjs
node scripts/verify-paper-canonical-import-pilot.mjs
```

It uses the checked-in `paper-2026-i-canonical-pilot` backend package, whose
canonical evidence is bound to the real local exam PDF and answer PDF, plus a
temporary SQLite/assets root. It proves zero-write dry run, publish, exact
reload, restart/retry, rollback, real PaperSurface plain/lecture,
Student/Teacher Print HTML, and direct Chromium PDF. It never writes the
production database, R2, or a historical version. Only after the required
independent review PASS, add `--actual-artifacts --qa-server`; that mode writes
HEAD-bound QA evidence under
`.scratch/paper-canonical-ticket-20-qa/<HEAD>/`, keeps the exact temporary
publication and Screen URLs alive, and prints the URLs for the provisioning
task. The output set intentionally contains no generated DOCX, OOXML, or
DOCX-converted PDF.

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
  "canonicalRequestPath": "./canonical-import-request.json",
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
contract) but points at the PDF for this format — this is a known naming
quirk, not a bug; do not try to rename the field. `02-publish.mjs`'s own
top-level code (loading this file) only does `readFileSync` + sha256 on it
and never checks the extension — but the file still flows into the shipped
publish path and, at `--publish` time (step 8), is checked by
`validatePaperImportPackage` (`server/paper-import/validator.mjs`): the
package must contain exactly 1 source document that is either `.docx` (PK
magic bytes) or `.pdf` (`%PDF` magic bytes). Both formats are accepted by
design (§2 whitelist format ②) — a real, unmodified PDF here will pass; only
a wrong extension or a corrupted/renamed file gets rejected there.

`canonicalRequestPath` is relative to `config.json` and is mandatory for
`--publish`. A missing, unreadable, unsafe, stale-authority, or source-unbound
request fails closed before publication; do not remove the field or bypass the
public publisher to continue.

**Done when:** `node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/import-pipeline/papers/<paperId>/config.json')))"` parses cleanly and both source PDFs plus every request-envelope evidence file exist on disk.

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

**Mandatory high-DPI answer cross-check** (added after the paper-2026-i
CR round): the automated gates only count answers — they cannot tell a
wrong answer from a right one. Before moving on, render the answer page
at ≥300 DPI (e.g. `pdftoppm -r 300`, or a full-page visual Read — never
a low-resolution thumbnail or text extraction, both have produced real
misreads) and confirm every single objective answerKey against the
rendered page, cell by cell. A transcription slip here publishes a wrong
answer that every gate will wave through.

**Done when:** you have a complete `CONTENT[paperId]` entry with all 6 group
shapes filled, and every objective answer both copied from `answers.pdf`
and re-confirmed against the ≥300 DPI render.

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

## 4. AI analysis fan-out (one sub-agent per group)

Not ad hoc — this is the fixed dispatch template (per plan C1). Spawn **one
subagent per analyzable group** (7 total: `reading-a`, `reading-b`,
`reading-c`, `reading-d`, `seven`, `cloze`, `grammar`).

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
   `server/paper-import-ai/grammar-fill-facets-v2.json` first — every blank's
   `facetKey` must be a real LEAF key from that registry (22 leaves, D1
   grammar-facets-v2, 2026-07-15) whose `blank_type` matches the blank's
   given/no-hint status. **Hard gate (D1, 挂导入门禁防哑数据)**: the produced
   analysis file's `schemaVersion` must be `grammar-fill-analysis-v2` — a
   `v1`-shaped grammar-fill-analysis payload is now rejected outright by
   `server/paper-import/validator.mjs`'s schema allow-list
   (`json.schemaVersionUnknown`), so there is no silent fallback to the old
   17-leaf taxonomy. `tense`/`voice`/`agreementSensitive` (finite verb) and
   `form` (non-finite verb) are stamped server-side from `answer`,
   deterministically — do NOT ask the agent to author them.
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

### 6a. Run the publish-time normalization gate (still zero writes)

```bash
node scripts/import-pipeline/verify-publish-gate.mjs <paperId>
```

This command builds the same package and calls `validatePaperImportPackage`
without opening the DB or paper-assets root. Every `cloze` and `grammarFill`
group must appear under `normalizationGroups` with `status: "ready"`. The gate
uses the exact group/questions/blanks source slice and the shipped
`normalizePaperGroup`; it does not generate a second interpretation of the
markers.

If a supported group reports `[normalization.needsReview]`, read its
`normalizationIssues` (`groupId`, code, path, message), correct the source group
in the build input, then rerun steps 3, 6, and 6a. Do not hand-edit a sidecar or
publish around the gate. Validation failure is fail-closed: it creates no DB
tables/rows, version directory, sidecar, or `latest`.

**Done when:** the JSON output has `"ok": true`, `blockingCount: 0`, and every
supported group is `ready`.

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

**New卷须带五类体裁**（r1-genre-truth）: publish leaves `passages.discourse_type`
NULL for brand-new passages — it is real genre truth (记叙/说明/议论/应用/新闻),
not the group's question-type name, and the publisher no longer writes a
question-type-name placeholder into it. After publishing a new paper, run a
genre-truth classification pass over its passages (see
`scripts/genre-truth-classify.mjs` / `scripts/genre-truth-apply.mjs`) before
the paper is considered import-complete.

This is the ONLY step that writes to `data/question-bank.sqlite` and
`app/public/paper-assets/<paperId>/**`. It calls shipped
`publishPaperImportPackage`. A successful publish writes
`paper-normalized-groups-v1.json` beside `paper-asset.json` in both
`versions/vN/` and `latest/`; both files carry the same asset version. Never run this against
production; there is no production flag here, this only ever targets the
local dev DB path baked into `02-publish.mjs`.

**Done when:** console prints `status: published` followed by `paperId: <paperId>`
(the second line only appears on this success path — `02-publish.mjs` prints
`result.publish.paperId`, not a top-level `result.paperId`).

**If it fails instead** (`status: validation_failed`): `02-publish.mjs`
prints the validator's `rejectedFiles` and `blockingIssues` right below the
status line — read those first, they name the exact file and error code
(e.g. `package.docxCount`, `docx.invalidMagic`, `package.rejectedFileType`).
Do not go spelunking in `validator.mjs` or write a throwaway diagnostic
script; the printed list is the diagnosis.

**Rollback and recovery:** version, sidecar, DB transaction, and latest swap
share one publish attempt. A failure removes the incomplete `versions/vN`,
rolls back the DB transaction, and restores the previous `latest` bytes.
Correct the reported filesystem/DB cause, then rerun the same publish command;
the retry reuses the correct next version number. Stale temp directories are
also cleaned automatically at the start of the next publish. If a killed
process left temp residue and you need an explicit local cleanup first, run:

```bash
node --input-type=module -e "import { cleanupPaperImportTempArtifacts } from './server/paper-import/storage.mjs'; console.log(cleanupPaperImportTempArtifacts('./app/public/paper-assets'))"
```

Never delete a completed `versions/vN` or replace `latest` by hand as a
recovery step.

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
