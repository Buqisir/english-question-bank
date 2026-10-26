# Agent Import Contract (NCK1)

本文是导题操作入口，负责状态恢复、生产、验证、提交与返工，不另定义视觉数值。
试卷规范总入口是[试卷格式标准](../product/exam-paper-format-standards.md)，
数据产品要求见[NCK1标准](../product/nck1-paper-standard.md)；机器结构遵循
适用版本的manifest闭包。源角色/答案正确与实际三面排版正确是两类证据，
schema/digest通过不能替代源对照，合成HTML测试不能替代真实产物验收。

## Current isolated rehearsal agreement

The Owner's 2026-09-20 agreement is recorded in
`docs/cuts/full-import-rehearsal/plan.md`. In this local experimental candidate,
new `public-paper-v1` scanned imports use Agent proofreading, not intermediate
Owner OCR work. After genuine page-by-page source comparison and `push-ocr`, run
`review.mjs proofread-ocr <paperId> --revision <exact-revision> --input <review.json>`.
Input contains the existing evidence-bound `confirmation` and `correctionNotes`:
each note has `itemId`, `kind` (`ocr_repair`, `source_typo`, or `uncertain`),
`sourceText` (faithful PDF transcription) and `reason`. Every changed ordered
item needs a note. For OCR repairs/uncertainty, confirmed text must equal the
source transcription; only clear source typos permit a different final text.
Do not polish unidiomatic language, solve questions or silently change answers.
Run the returned exact `pull-ocr-confirmation` command; the server records the
real Agent identity and returns a source-bound correction report. No Owner
receipt is authored by the worker. Final Candidate approval stays Owner-only.

If a printed region has no OCR words, run `ocr-proofread.mjs evidence <paperId>
--work <work> --regions <requests.json>` against the existing v2 trace. The JSON is
an array of `{ "page": "official-answers-2-p04", "bbox": { "x": 170, "y": 610,
"width": 310, "height": 40 } }` in original 144 dpi page pixels; only page and bbox
fields are accepted, never text. The same Tesseract version runs `chi_sim+eng`,
PSM 6 at 3x scale on the immutable source raster. Original observations, word
numbers and draft references stay intact; words overlapping earlier observations
are discarded. New word numbers append to the worksheet. The trace's
`regionReobservations` ledger links each new observation to engine parameters,
source PDF/raster digests and retained raw TSV; trace words mark
`source: "region-reobserve"`. Canonical observations retain their existing closed
schema. Assign new word ranges only after comparing the source, then use the
unchanged compile, push-ocr, proofread-ocr and pull-ocr-confirmation gates to
produce fresh evidence and receipt bindings. Never hand-author observations.

After pulling that immutable receipt, author only the publishable correction entries and run
`review.mjs finalize-ocr-correction-report <paperId> --input <entries.json>`. Each entry has
`ocrItemId`, `before`, `after`, `sourceLocator: { documentId, page }`,
`materializationTarget: { jsonPointer }`, `reason`, and exactly one category:
`ocr_misrecognition`, `source_spelling_error`, or `source_layout_error`. The latter two require
positive source evidence; never infer a source error from a text delta and never include grammar,
style, or other editorial corrections. The v2 sidecar is outside Materialization, is included in
the Candidate bundle identity, binds the exact server-held OCR receipt/original source digest set,
and verifies `after` against current Materialization so later layout edits cannot impersonate the
historical OCR confirmation. Missing means no report exists; an empty `entries` array is a present,
bound report. Legacy `source_typo` receipts remain historical evidence and are not reclassified.

The CLI finalizer and server use the same historical-item binding check. For
`ocr_misrecognition`, `before` remains the exact historical OCR text. `after`
must equal the confirmed text, except for the proved projections below:
an exact `<source question number>. ` prefix may move out of a question's
`stem` into its number field; or one LF may separate two complete, consecutive
confirmed items represented by adjacent text runs in the same table cell.
Both projections require the target's source document/page to match the
historical item, and the table's next run must equal the next confirmed item.
These are not source errors. No general whitespace trimming, fuzzy text match,
receipt rewrite, or deletion of correction entries is permitted.

New `agent-ocr-correction-report-v3` reports additionally permit the versioned
`chinese-context-numbering-fullwidth-v1` projection: only the enclosing ASCII
parentheses of Chinese-context numbered entries become `（` / `）`. The CLI
finalizer records `standardizationProjection` with the exact receipt identity,
historical confirmed text, target JSON pointer and UTF-16 change ranges; CLI
and server recompute it from the receipt and source-backed target context using
the submission gate's language rules. English clauses, English quotations and
English sentences with Chinese word glosses remain excluded. The complete OCR
item must map to one text run; unprovable cross-run mappings fail closed.
Digits, spaces and all other characters remain exact. Historical `before` and
category remain unchanged, v2 reports retain their original rules, and the
compatible sidecar filename remains `agent-ocr-correction-report-v2.json`.
This is not a source error or a `source-text-review-v3` punctuation correction.

### Source-text preprocessing, without intermediate Owner approval

New raw-source workspaces carry `config.spellingReview: "source-text-review-v3"`.
Historical `spelling-only-v1` and `source-text-review-v2` records retain their exact replay rules.
For an Owner-requested correction of an existing paper, preserve its finalized
report/revision, set the working config to v3 and author a new complete review;
never relabel an old attestation as a new review. CLI names and the sidecar filename
remain compatible; `schemaVersion` identifies the applicable policy.
After faithful materialization and before answer checks, summaries and metadata:

1. Run `review.mjs prepare-spelling <paperId> --output <request.json>`.
2. The import agent reviews every supplied target in source/group context and
   completes the request's `report` object. This is a real spelling review, not
   a blanket generated pass. No implicit model invocation or Owner checklist.
3. Run `review.mjs finalize-spelling <paperId> --input <authored-report.json>`,
   then `review.mjs verify-spelling <paperId>` and continue the normal import
   through the complete Screen/PDF preview.

Correct unambiguous misspellings, obvious grammar errors and repeated ordinary
spaces between words, including questions, options, answer words and writing
material. A real dictionary word can still be an evidenced typo in context.
There is no presumed deliberate-misspelling exemption for distractors. Record
categories `spelling`, `grammar`, `whitespace`, or `punctuation` with Chinese contextual reasons.
Use whole-word spelling edits, minimal whole-word/phrase grammar edits, and only
reduce internal runs of two or more ASCII spaces to one in `whitespace` edits.
The v3 `punctuation` category permits only context-confirmed English dash typography
(en dash with one ASCII space on each side), spacing between an exterior curly
double quote and an English word, and removal of ordinary spaces inside curly
double quotes. Keep closing quotes adjacent to punctuation, such as `In”?`.
Use nonempty exact original spans; preserve letters, digits, other punctuation,
meaning and answer identity. Do not normalize hyphens, numeric ranges, Chinese
punctuation or ambiguous quote/dash usage. Do not polish awkward English, substitute uncertain
word choices, spelling variants, unfamiliar names, or technical terms. Retain
raw authoritative answers and separately show any applied correction; answer
checks must compare against the evidence-backed corrected projection, not pretend
the corrected answer is byte-identical to the original source.
**Uncertainty is not a blocker:** preserve the doubtful word, mark `uncertain`
with a brief note, and finish importing. A target may also contain independent,
clear corrections. Send `nonBlockingDoubts` only with the final preview for the
Owner to glance at; never pause midway for these judgments. No doubts means no
extra Owner task. Approval/publication retain their existing separate boundary.
The successful `push` result includes `spellingReview` with the retained doubts
for this exact Candidate. Relay these in the same Amp message as the preview;
do not create another website review page or require an extra approval. On
resume, `verify-spelling` reconstructs the handoff from the retained report.

### One final Owner report

Deliver one **校正报告与预处理完成表**, containing all selected product PDF links, the exact
Screen link, preprocessing statuses, applied corrections and retained doubts.
Do not make the Owner reconstruct the handoff from multiple progress messages.
Write all Owner-facing explanations in Chinese, including spelling notes,
correction reasons and evidence `checks.*.detail`; retain the exact English
source excerpts, identifiers and commands. Explain each retained observation's
meaning, category and reason for leaving it unchanged, rather than presenting
every observation as an error or an Owner confirmation task. Translating a
historical handoff is presentation-only: retain the original bound evidence and
spelling sidecar, and do not create a new Candidate or rerender PDFs for prose.
Generate it with `review.mjs preprocessing-report <paperId> --evidence <evidence.json>
--output <report.md>` after current Candidate/summary/metadata checks and preview QA.
The output is a local Markdown artifact, not another website or an approval gate.

Current four-product reports use `preprocessing-handoff-evidence-v4` with
`largeComplete`, `largeNoListening`, `economy8`, and `answerOnly`. The first
three retain their bound pagination policies; answerOnly has natural positive
page counts, not a fixed page target. Complete delivery requires content and
visual evidence for all four exact files. v4 also accepts HTTP Screen links
only on `127.0.0.1`, `::1`, or `localhost`, visibly labelled local-only; all
other hosts require HTTPS. Credentials, extra query parameters, fragments and
paper/revision mismatches remain invalid. A local link does not establish
remote Owner access or completed Screen QA. Do not relabel historical reports.
When v4 includes Screen, the report CLI reads authenticated status from the
configured Review API and resolves that revision's paper/source/Candidate
binding. Supply the existing Review origin and Agent credential; an unavailable
or mismatched revision fails closed. Reports without Screen remain offline.

For a source explicitly lacking listening by exam design, set the sealed
`config.json` field `listening: "absent-by-exam-design"` before building products.
Do not infer this declaration from absent audio. New PDF-product workspaces
require zero Canonical listening groups with this declaration, or exactly two
without it; disagreement fails closed. Preserve the existing Materialization
`not_supplied` source evidence. Freeze uses `paper-pdf-products-v3` at the stable
manifest path and exactly `largeNoListening`, `economy8`, `answerOnly` in that
order. Its explicit `economyPageLimit` follows the bound plan (8 by default).
Use `preprocessing-handoff-evidence-v5` for this three-product handoff; all three
files need the same exact-byte content/visual evidence and Screen revision
binding as v4. v1/v2 product manifests and v1–v4 reports retain their original
contracts. Historical analyzed packages without PDF-product commitments retain
their separate source contract. Raw-source and product workspaces check the
declaration; freezing new products always checks it.

New source-faithful directions and listening examples use Materialization v4
under the v62 authority. Its `sourcePresentation.instructions` has one
`{slotId, text, source}` for each of `reading.a`, `seven-choices`, `cloze`,
`grammar-fill`, and both listening slots when supplied. Preserve the source
directions, including the stated playback count; do not copy profile defaults.
`sourcePresentation.listeningExample` is `null` without listening, otherwise
`{state: "not_supplied", source}` after inspecting the question source, or
`{state: "provided", source, stem, options: [{label, text}], answer}` with A–C
options and the actual example answer. This is not a formal Question answer.
Screen and Print/PDF share this projection. Historical v1–v3 inputs keep their
old opening; do not silently relabel a stored Candidate or confirmation.
The default consumers are Screen v46 and Print/PDF v47. Earlier consumers can
still replay historical input, but cannot consume sourcePresentation-bearing
publications: they would otherwise discard the source example/directions.

OCR confirmation v3 adds explicit `semantic_table` and `content_media` visual
classifications. A table supplies rectangular `rows: [{header, cells}]`, each
cell containing confirmed `itemId`s, not rewritten text. An image supplies
`itemIds` for all OCR text inside its region and `afterItemId` for a surviving
preceding item; its immutable PDF region is cropped, never regenerated. An
explicit `afterItemId: null` in this closed v3 image shape instead denotes the
unique page-top boundary, only for a separate PDF `question_source`. Its text
items must start at index 0 (or be empty for an imageOnly crop), and no
unaccounted content may precede or sit beside the crop; confirmed furniture
above it is allowed. Missing or unknown string anchors never imply page top.
This capability selects OCR producer v29; confirmations without it retain
their existing producer version, bytes and image IDs. Answer figures still
require their exact same-page preceding text anchor. An
image may also follow the exact final confirmed item of a surviving semantic
table, meaning the boundary after that whole table; interior table cells and
items consumed by another image cannot anchor it. Every observation inside a
visual must be accounted for exactly once. Images and tables
retain the source-parser's question group and neighboring source anchors;
moving intact visuals between groups does not preserve their binding.
Images currently require a separate PDF question source; tables require separate question
and answer sources. Merged/nested tables and emphasized
cell text remain blocked rather than flattened silently. Answer-source tables
stay answer evidence: capture scoring references against those answer locators
in the existing source-references sidecar; never insert them into student groups.
明确的命题细目表头（题号／题型／分值／考查的主要内容及知识点／难度）结束写作参考
采集，其附录与续表保留在原件、OCR evidence 和 confirmation 中，并在 references review
记录排除原因；不把它们当作评分，也不据此把真实评分标为 `not_supplied`。
精确的两行客观答案网格（“题号”＋递增题号／“答案”＋逐题 A–G）同样只保留为源答案证据，
排除于写作参考并逐表记录。详解结束写作参考采集后，仅独立的完整评分总标题紧邻完整的任务
评分标题才可重新开启评分采集，复用原有范文；详解正文提到“评分”不构成重新开启的依据。
The v8 OCR producer receipt binds this new confirmation; preserve older output
and receipts before starting a new source-input revision, and rebind sidecars.

Evidence uses `schemaVersion: "preprocessing-handoff-evidence-v1"` and exact
`paperId`, `sourceDigest`, `candidateDigest`. `pdfs` is an array of
`{edition, path, sha256}` with editions `cover8`, `cover10`, `no-cover8`,
`no-cover10`. File paths resolve relative to the evidence JSON. `screen` contains
`url` and `revisionId`; never put credentials in the URL.
For the Owner-selected three-product line, use `preprocessing-handoff-evidence-v3`
with `economy8` (exactly 8 pages), `largeNoListening` (at most 10), and
`largeComplete` (at most 12). Complete delivery requires `pdfContent` and
`pdfVisual` PASS records listing every delivered PDF's distinct bytes, path and
SHA, as for v2 below. Report each selected font/line height explicitly, especially
the economy fallback. Preserve separate QA evidence matching the selected plan,
renderer and fresh revision to the protected PDF response; this Source/Candidate
report does not by itself establish that binding or Owner approval. Historical
v1/v2 reports and their edition meanings remain unchanged.
For an explicitly selected long paper, use `preprocessing-handoff-evidence-v2`
and editions `cover-long10`, `cover-long12`, `no-cover-long10`,
`no-cover-long12` instead. The 10/12 counts are ceilings, not exact counts;
report the real page count and do not pad. The four PDFs still require actual
visual/content QA: the entire application prompt, including numbered notices,
and the complete answer box must occupy one page. A diagnostic PDF that splits
the prompt across pages is not an accepted edition even if its last fragment
shares the answer-box page.
For a complete v2 four-PDF handoff, `pdfContent` and `pdfVisual` must both be
`pass` and list each distinct PDF's exact path and SHA among their retained
files. The generator checks these bindings and page ceilings; the Agent's
visual/content attestations still require real inspection and are not machine
proof of listening completeness or same-page layout.
The legacy v1 four-edition evidence is not reinterpreted or migrated.
Optional `checks` keys are `sourceExtraction`, `answerTranscription`,
`listeningPlayback`, `screenVisual`, `pdfContent`, `pdfVisual`, and `ocr`.
Each has `status` (`pass`, `not_performed`, `not_applicable`) and truthful `detail`.
`pass` additionally needs `checkedAt` and retained `files: [{path, sha256}]`.
The generator validates current bindings, evidence bytes and actual PDF page
counts; it labels source/visual checks as Agent attestations, not independently
proved semantics. Missing checks remain explicitly incomplete. Spelling,
summaries and metadata status comes from the validated current projection, never
from a claim that generic code was implemented. Do not silently carry old PDF,
Screen, answer-check or summary evidence across a changed Candidate.

The original source bytes and faithful Materialization remain unchanged.
`spelling-review-v1.json` records full target coverage, exact UTF-16 word ranges,
before/after, source locators, reasons and retained doubts. Candidate derivation
first verifies original source fidelity, then applies the bound spelling overlay;
Review, summaries and metadata consume the same corrected view. The report is
included in bundle/source identity and canonical evidence, including replay.
Changing it invalidates downstream digest-bound checks and sidecars. The earlier
OCR report still describes pre-overlay Materialization and must be finalized
against the resulting Candidate, rather than relabeling spelling as OCR repair.
Code verifies coverage, bindings and exact category-constrained edits; semantic
spelling/grammar judgment is an import-agent attestation, not something these checks prove.
`source-text-review-v4` is an explicit, opt-in extension of v3: only a complete
terminal run of ASCII spaces/tabs in a Question option may be removed. Its
`terminal_whitespace` correction records the actual native DOCX option paragraph
in `sourceParagraphLocator`, since the inherited target locator can refer to
the question stem. The validator checks the exact option path, original UTF-16
span, entire terminal run and Chinese reason. The Candidate/Review replayer also
opens the digest-bound original DOCX, checks the stated option paragraph exists
and is the sole matching option line after the inherited question-stem paragraph
(at most four paragraphs later); it rejects prose, a stem paragraph, a repeated
match or absent/mismatched DOCX. The Agent still confirms the source
meaning and explains the edit in Chinese. v3
reports remain v3 and cannot use this deletion. Preserve the old sidecar in
review history and rebuild Candidate-bound evidence under a new Review revision.
Missing review or stale/corrupt evidence is an agent-side technical repair, not
an Owner spelling-approval step. Historical workspaces without the policy remain
compatible; adding a report explicitly opts their current Candidate into the
overlay. Do not rewrite an existing finalized revision or claim it was reviewed.

### Amp 送审、网页发布（Owner 2026-10-14 确认）

当前流程为：在 Amp 准备和校对 → Owner 明确「可以送网页审核」→ Agent 提交
该 Candidate → Owner 在 `/ops/` 点击卷名直接打开精确 revision 的 Screen →
Owner 点击「发布到题库」。导题授权本身不是 Candidate 送审授权；新版修改后也
须重新获得送审确认。OCR 准备/校对不等于最终 Candidate 送审。隔离本地预览可以
用于 Amp 讨论，但不得因此自动上传生产 Candidate。

网页只保留试卷列表、精确 Screen 链接、发布与退回修改；不再用 Owner 三栏
工作台、独立版式认可或授权兑换页作为日常必经步骤。退回写入绑定当前 revision
与 bundle 的问题，Agent 在 Amp 处理并在新 revision 中声明解决；Owner 在列表
确认问题已解决后才能发布。旧版本和证据保留，不删除、不自动认可新版。

「发布到题库」一次点击明确表达认可当前版本和向用户公开两项意图；服务端仍
分别保存 approval 与 promotion。Owner 会话、同源校验、精确 revision/bundle/
renderer、未解决问题、真实文件与 Canonical publication 门禁缺一不可；公共卷
仍记录 `layout_only`，不扩大为答案或音频语义认证。服务器直接执行既有单卷
publisher，不依赖 Amp 在线，也不向浏览器提供 ship token。重复点击只读回原
promotion；发布中、失败或 UNKNOWN 不由网页自动恢复/重试。先只读对账，必要的
恢复另取明确授权。既有 Agent recovery 与默认关闭的 scoped publication 路线仅
供明确授权的历史/恢复事务，不是网页发布的前置步骤。

本流程不自动发布已在 Review 的任何卷，不修改旧认可记录，不恢复网站导题。
代码部署仍须单独授权。以下历史「认可后再口头要求上线」描述不再约束上述网页
直接发布动作；聊天里的「可以送审」始终不是发布授权。

Owner-facing delivery uses a direct exact-revision website Screen preview,
not the OPS dashboard. Send the OCR report in the Amp conversation: source
location, original recognition, corrected text and reason; distinguish OCR
repairs from evidenced source spelling/layout errors. For long reports, give
a concise summary and attach the full details. A separate report portal is not
required. Keep current-version and historical OCR records distinct, and do not
claim a complete or clean report when evidence is missing. Existing login,
immutable Review records and Owner-only approval/publication gates remain;
changing the preview entrypoint does not approve or publish the paper.

Imports and their summary/metadata workers run locally, one writer per paper
worktree. Continue an existing local thread; do not default to the dedicated
Import Project or start/resume an Orb. A necessary independent worker explicitly
uses `executor: runner`, a live local `runner_id` and an allowed `working_directory`,
without `project` or `orb_size`. An unavailable runner blocks dispatch; it does
not authorize a cloud fallback. Follow `importing-nck1-papers` for local intake
and exact preview handoff after explicit Amp permission to submit for review. Owner publication
now uses the authenticated list above. Plain chat is not server-authenticated
publication authorization. For retained legacy scoped publication, see
`docs/cuts/orb-import-single-paper-promotion/spec.md` for activation and recovery
boundaries. Normal paper publication is a data operation; code/standard changes
still require their own reviewed deployment transaction.

Before any Review network access, bind the exact authorized API origin in the
local `.amp/import-review-origin` file (one HTTP(S) origin, no credentials).
Dedicated import-profile Orbs refuse Review access without this disk binding;
any bound workspace refuses an environment origin that differs, before sending
a request. For isolated rehearsal, bind only the verified local API origin,
never infer the binding from inherited environment variables or replace it to
make a mismatch pass. Production binding requires a production-scoped Goal.
Do not wrap credential overrides in `bash -l`: login startup can replace them.
Use a non-login process and fail-fast command chaining. Review rejects redirects.
This guards accidental target changes; it does not grant authorization or stop
a local writer from deliberately changing the binding. Source-intake and direct
HTTP tools are separate surfaces and remain subject to the same Goal boundary.

External analyzed-package audio is heard in the ordinary Candidate Screen review and covered by
ordinary Screen/PDF approval. New approvals persist `external-listening-owner-review-v2` with
`reviewMethod: owner_screen_pdf_approval`, exact counts/audio identity, actor, and time; there is no
separate playback/cohesion/safety checklist. Historical v1 receipts remain valid and exact. Raw-source
Listening evidence and quick-check gates are unchanged.

For this rehearsal use `source-intake.mjs continue <submissionId> --signal-only`
and the signal-only staging path, never ASR. Historical ASR/Owner-OCR instructions
below describe the retained legacy paths, not a requirement to run them here.
Finish all summaries and compact search metadata and deliver the real playable
Paper, original PDF comparison and correction report before Owner review.
These local changes have not been deployed or activated in the live controller.

> 新 raw-source 导入的当前主合同是 `public-paper-v1`。本分支已接线完整源卷和逐段摘要，
> AI OCR/提取校对、源答案抄录检查和必要的结构化检索元数据仍是硬门禁；当前 CLI 已实现
> metadata 的 prepare/finalize/verify，不能用九份教学解析或假空字段代替。无 profile 的历史工作区和
> external `analyzed_package` 继续原九份分析合同，恢复时不得迁移身份。

本地 Amp 导一卷 NCK1 的**唯一进场文档**。先读完本文件再动手。
Owner 在 Amp 提供题源并明确发起导题；Amp 是唯一沟通与启动入口，不再由网站提交或
webhook 自动接卷。新卷按下文 off-ledger 本地文件流程初始化，不伪造台账记录。
预览确认与上线是两步：提供真实 Screen 和四款 PDF，确认后仍须 Owner 明确要求
上线才可执行单卷 promotion。改标准/程序走 PR；修订卷子数据不因此要求另提代码 PR。
正式私有文件存储及网站年月／产品访问已有本地候选，尚未部署；私有R2未配置，
本地源副本仍保留。按[四产品存储合同](../product/paper-pdf-products-v1.md)执行，
不把普通导题授权当成生产配置、R2写入或上线授权。
项目级 `importing-nck1-papers` skill 会在导题、继续某卷、审核返工、状态查询和
认可后上线准备任务中自动触发；Owner 不需要记命令。台账 submission 先运行只读
`node scripts/import-pipeline/source-intake.mjs status <submissionId>`，无需 paperId。
已有 off-ledger 卷或 handoff 后运行 `review.mjs preflight <paperId>`，
再从返回的唯一状态恢复。

所有新 NCK1 卷默认走统一入口，不再先判断格式①/②/③。`init` 为新 raw source 写入
`config.importProfile: "public-paper-v1"`；listening supplement hydration、历史工作区和
analyzed package 保留已有 config/profile：

- 数据产品要求：`docs/product/nck1-paper-standard.md`（导题过程中不改；owner 拍板修订后以新文本为准）；可执行结构按规范总入口的适用机器绑定。
- 统一入口：先运行 `node scripts/import-pipeline/universal-nck1.mjs preflight`。`materialize`
  从不可变源生成 `nck1-source-materialization-v1`，完整保存题面、源答案、题号映射、
  source locators、表格与媒体。源冲突、缺答案或视觉待审仍失败关闭，摘要不能补题或改答案。
  材料确认后运行 `review.mjs prepare-summaries`；请求在摘要不存在时即可生成，内含精确
  paper/source/candidate IDs、输出 schema、版本化 prompt、全部目标 group、权威答案及每个
  paragraph ID/content。生成后用 `verify-summaries` 检查绑定、严格 schema 和完整且唯一覆盖。
  `review.mjs push` 上传原始 bytes、summary sidecar 和 digest 进入不可变 Review revision。
  Owner 明确 Review，认可不公开；只有后来明确“上线 <paperId>”才可 promote。摘要是
  AI-derived 辅助信息，不是源权威、教学解析或语义准确性认证。

### 当前公共卷增量与消费者

新卷在进入 Review revision 前还必须完成 compact search metadata 与既有自动事实门禁。
metadata sidecar 已贯穿不可变 revision、Review store、promotion、发布存储和公共检索消费；
写作相似题 UI 仍未实现。具体字段、生产者/消费者和阶段见计划。核心边界如下：

- Owner 只审核最终 Screen/PDF 版式；Print HTML 是 PDF 内部生成步骤，不是独立审核任务。认可 receipt 的精确字段是
  `approvalScope: 'layout_only'`，不得表达人工检查了摘要、主题、语义、原题准确性或答案映射。
- OCR/提取、proofreading、source-answer transcription check 及自动 source/schema/coverage/
  answer validation 仍由既有程序/AI 导入路径完成。缺失或冲突来源通过既有 Materialization
  issues、source-answer checks 和 validation gates 失败关闭，不得塞进 layout review，也不新增
  factual-exception schema/receipt/workflow。源答案 variants 保持既有权威文本，不另造 alternative
  schema；其 provenance 与平台人工 review 分离。
- 摘要继续逐正文段落生产；另存多值 `topicLabels`，每个值都是受控 taxonomy 的 canonical
  label，publisher 按表解析为 `theme/themeGroup/subtopic`（一级仅人与自我/人与社会/人与自然），
  并写入真实 genre（记叙/说明/议论/应用/新闻）。genre 不是题型。
  题型检索字段严格复用 `similar-question-dimensions.md` 和现有 schema 的 reading
  family/subtype/detailScope/technique + 程序 A–D 篇位、七选五 position/role/primary mechanism、
  完形 pos/signatureFacet、语法 hint/source facts + facet/role/route/features 与程序答案形式、
  应用文 form/function/theme、续写最小 situation/conflict/relationships。
- 公共路径不把受控的多值 `topicLabels` 当作“额外标签”禁止。仍禁止产生新 difficulty/CEFR、
  翻译、教学 prose、证据 coordinate spans、Embedding/Jev、范文或虚构续写结局。不得把段落
  摘要复制成长 emotion/event 表；写作相似题 UI 的缺口必须如实报告。
- `wordCount` 由程序统计指定正文 paragraph IDs 中匹配 `[A-Za-z]+(?:['’-][A-Za-z]+)*` 的
  英文 lexical tokens（缩写或连字符形式各计一个），
  排除题号/空号、提示词、选项、chrome、答案和范文；`paragraphCount` 只数合格正文结构 ID；
  `questionCount` 数该组 question IDs；写作是 `questionCount: 0`、`taskCount: 1`。保存算法版本和 scope IDs。
  所有归属使用结构 ID，不使用高亮坐标。语法 `contextParagraphIds` 被 sidecar 保留和校验；
  当前不宣称 standalone renderer 已消费它。
- 语法单空练习提供所在完整段；确有跨段依赖时只加入最小、按源顺序且有据的上下文，不能
  盲取上一段。分值由程序按 §1 现行 NCK1 标准派生，源写作字数/格式/段首约束原样保留。
- revision 必须绑定 source/candidate/summary/metadata/validation/render digests；promotion 仍需
  Owner 后续明确上线。旧 reviewed 资产不得自动回填、改 profile、改 approval identity。

```bash
node scripts/import-pipeline/review.mjs prepare-summaries <paperId> --output /abs/summary-request.json
# 若需要模型：内置 low，features=[]；只传上述请求
node scripts/import-pipeline/review.mjs verify-summaries <paperId>
node scripts/import-pipeline/review.mjs prepare-search-metadata <paperId> --output /abs/metadata-request.json
# 若需要模型：内置 low，features=[]；只传 metadata request
node scripts/import-pipeline/review.mjs finalize-search-metadata <paperId> --input /abs/authored-metadata.json
node scripts/import-pipeline/review.mjs verify-search-metadata <paperId>
node scripts/import-pipeline/review.mjs push <paperId>
```

摘要只覆盖 prose body paragraphs（含 continuation 的来源叙事正文及结构化列中的阅读正文）；
不覆盖标题、选项、说明、听力稿、表格/媒体或续写给定段首。七选五/完形/语法填空可用
权威答案理解补全语篇，但不得修改公开源。通常一至两句中文；不得添加教学策略、逐题解释、
高亮、Embedding、taxonomy 外标签，或虚构性别、动机、因果和后续情节。
- 阅读 Word 细线框（框里只有能打的字和矩形表）：写成 Canonical `framed_columns`（nck1 §8）；观感见 `docs/product/exam-paper-format-standards.md` §3c。不要截整图当 Canonical 正文，不要为单卷改 CSS。下一卷步骤见 `docs/cuts/reading-framed-columns/spec.md`「下一卷怎么干」。
- 旧格式①/②/③脚本只保留已接入存量卷回退；新卷不得向旧脚本添加 `paperId`、CONTENT 登记或 shape association 特例。

以下仅用于 Owner 在 Amp 明确要求继续的历史台账任务，不能由旧 webhook 通知触发。
原绑定 worker 只凭 submission ID 运行只读 `source-intake.mjs status <submissionId>`，
不搜索、猜测或向 Owner 索要 paperId。按返回的 `nextCommand` 显式运行 continue。
claim 后从不可变 snapshot 确定身份：原始新卷固定使用 `paper-<submission UUID>`；
补充/纠错使用 `targetPaperId`；新 analyzed_package 下载并校验归档后读取 `package.json.paperId`，
仍需完整包准备器校验，不把身份发现当作内容验收。已有 progress 的 paperId 必须保留；
`--paper-id` 仅用于兼容明确的既有工作区，不得用占位 ID 或覆盖 target/package 身份。
程序串行完成并恢复
claim、download、init 及普通源 materialize/preflight，只复用摘要绑定的完整收据；返回
`source_ready` 或确切 blocker 后停止。不要用模型手工复制下载、摘要校验、文档提取、OCR
或音频检查。`init` 返回歧义、缺件或 `needs_owner` 时即停并报告确切待办；除非当前任务
明确涵盖且语义已经确认，不执行远端 `needs-owner`；不得猜源文件角色。`analyzed_package` 只走
`init` 的确定性完整包准备器，禁止 OCR、提取或模型 fallback。普通 raw source 才继续使用
`universal-nck1.mjs` 的 preflight/materialize 及既有 OCR、媒体和听力程序。
只读 status 不安装、不 heartbeat、不写 receipt。未知 claim/远端结果、半成品、源漂移、
paper/thread 错绑或 lease 丢失都失败关闭且不自动重放；continue 自身不发送 needs-owner、
handoff 或任何 Review 终态。`next` 保留阶段名，`nextCommand` 才是可执行的下一步。
本标准接卷任务包括 status 验证 initialization receipt 后提供的显式 `handoffCommand`：
它必须在 Review push 和等待摘要/metadata 生成之前执行。handoff 仅结束领取租约并关联工作区，
不是源审查通过、Review 认可或上线；即使尚有 source_review 待办也必须继续完成那些门禁。
成功后 status/continue 返回 `handed_off` 和 Review preflight 命令，不重新 claim。
handoff 响应丢失保留 started/unknown 证据，不重放，不通过删除记录恢复。
领取期间 `lease` 返回 expiresAt 与 renewalCommand；在源/音频审阅前及每 10 分钟续租，
暂停或过期后先核对，不自动重新领取。summary/metadata 与 Owner Review 在 handoff 后进行，
不保持 source-intake 租约。听力尚未形成初始化收据前仍需有限租约；不得为提前 handoff 伪造审查。
仅对已显式运行旧 `--opening-check` 的历史 source-intake 接卷，听力内容检查由
导题 Agent 审阅绑定的首段 ASR 与源材料证据，提交真实的
`listening-audio-content-review-v1`（`reviewedBy: import_agent`），再显式运行
`source-intake.mjs finalize-listening <submissionId> --paper-id <paperId> --review <review.json>`。
`status.tasks` 提供 ASR/源材料路径、真实内容审阅输出路径、finalize 命令和复查命令。
程序负责比对与门禁；失败不能改写为 pass，也不因 CLI 暂停就把常规听力检查交给 Owner。
当前默认信号准备与全题组导航复核按[听力准备与导航复核](listening-review.md)执行，
不调用旧 finalizer、不把首段收据提升为全卷认可。
以下 Owner OCR 权限限制只描述旧流程；当前隔离演练按本节顶部的 Agent OCR receipt 与
Candidate-bound v2 correction report 执行。不得冒充 Owner、伪造收据；源缺失或冲突须报告具体缺件。

本地先检查 Node 24、锁定依赖及当前所需 OCR/音频/渲染工具。不要在 macOS 执行 Linux
Orb setup，也不要在导题中途安装或升级依赖掩盖失败。`.agents/setup --import-tools-only`
仅保留为历史 Linux 环境准备入口，不是当前默认启动步骤。隔离 Review 使用新的运行库
副本、本地凭据和实核 loopback origin；不可原地启动备份或执行旧 Orb launcher/PID。

导题审核使用独立 Review DB 与文件目录作为 QA 事实源；Candidate 不进入正式题库。
消费端网站不导题，`/ops/` 只做人工审核与 Agent 反馈，不运行 LLM。

## 开局（Owner给源材料与考试年月，其余由Agent处理）

Owner 2026-10-07更新输入：只交完整源材料与考试年份、月份，不再逐卷填写其余字段。
Agent下载或定位源文件，确定绝对路径，按实际内容识别 `question_source`、`official_answers`
或 `question_and_answers`，不按临时文件名猜角色。正常导入至少一份完整试题源和一份
权威答案源；若暂时只有题卷，走下述source-only暂存，不进入普通导入状态机。

完整source set才分配`paperId`（真题如 `paper-2026-ii`；模拟卷如 `paper-mock-gd-2026-m1`）。
只有题卷时先使用通用`sourceSetId`，不为单卷造paperId特例。所有卷一律以扫入题卷的
正式卷名为准，真题、模拟卷、B/C区及其他卷不设例外；保留原字词与位置，不另起卷名。
如实出处和其余导题字段由Agent按源及固定NCK1合同生成，不要求Owner
重新录入，不用文件名或答案册标题代替卷名。实际缺源、题头歧义、明确日期冲突才报具体异常。

考试年月独立于卷名，取Owner输入，供题目沿所属Source按时间索引；不从学年、导入时间、
paperId或题头猜考试年月，不虚构日。新卷缺年月不能冒称准备完成。本地init和attach-answers
接受`--year`／`--month`并封存到config与source manifest；raw-source intake 的
`source-intake.mjs init`或首次`continue`也须传这两个参数，续跑不得丢失或推断年月。
已有初始化的续跑、音频补充和 analyzed-package 沿用各自已封存的身份与日期。
Review、publisher和网站查询
已有接线候选；尚未在生产执行。完整规则及当前限制见[产品合同](../product/paper-pdf-products-v1.md)。历史Revision不原地覆盖，
名称后续校正也按源题头核对并走版本变更，不继续以旧Owner命名替代来源。B/C三卷已有
本地源卷名候选，未改原Review绑定或发布记录；自动处理不授权自动审核、批准或发布。
长名通过PDF题头缩字号适配，不缩写源卷名；候选数值与Screen边界见产品合同。

不匹配 `nck1-paper-standard.md` 固定 NCK1 九题组 → **停**。缺完整权威答案时只允许
source-only暂存后停；不得Materialize、上传Review、AI解题或发布。源载体和普通版式变化
不是新格式，也不新增格式刀。

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node scripts/import-pipeline/universal-nck1.mjs init <paperId> \
  --paper-name '<卷名>' --provenance '<出处>' \
  --year <Owner给定年份> --month <Owner给定月份> \
  --source question_source=/abs/questions.docx \
  --source official_answers=/abs/answers.pdf
```

若题卷和答案确实在同一个DOCX/PDF中，改用一个
`--source question_and_answers=/abs/paper-with-answers.pdf`。producer只在完整写作题后找到
恰好一个明确答案heading时拆分；无heading、双heading或位置不明返回
`NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`并停，禁止按“后半文件大概是答案”猜。

权威答案文件可以是纯答案键，也可以附带逐题详解/写作范文；两者都只生成同一套完整
21–65答案值。Owner 2026-10-06 已确认新增独立纯答案版，目标产品及阶段见
[四款 PDF 产品合同](../product/paper-pdf-products-v1.md)：写作源范文与评分参考改为
独立版本化 source-references，不混入客观答案、AI analysis 或旧材料化 schema。
原文件bytes/digest仍作为Source Capture证据保留。源参考及固定产品已有本地不可变
Review／发布接线候选，正式验收待Ship；不把 scratch sidecar 当成已审补件，不改历史 Candidate。
逐题详解不进入纯答案版，Student/Teacher 不再是目标产品选择。
评分参考含表格时，`answer-products.mjs prepare --structured-scoring` 输出
`source-references-v2` 请求；落盘文件名仍为 `source-references-v1.json`。
essays 沿用 v1 paragraphs，scoring 使用按源顺序排列的 paragraph/table blocks；
表格逐单元格保存原文、独立 locator 与文档 SHA，保留空格子，不压成范文段落。
v1 侧件继续读取，不静默迁移。原生 DOCX 须重放完整未合并表格，PDF 须逐格核源；
只有既有 `includeScoring` 展示才渲染评分表，默认 answerOnly 不增加评分内容。
细节见[本地版本迁移说明](../cuts/import-format-capabilities/manifest-v64-migration.md)。
只有ABCD而缺56–65文本答案仍不完整；
答案值与解释边界不清时必须停。听力原文继续按独立listening contract处理。

新raw-source工作区在所有非产品输入稳定后运行
`node scripts/import-pipeline/freeze-products.mjs --paper-dir <workspace>`，生成四个
`products/<edition>.pdf`及绑定输入字节、卷名、年月的manifest，再正常提交Review。
产品目录已存在时命令拒绝覆盖；输入或产品返修须用新工作副本、新revision，不回写旧批准。
原卷的网页PDF预览／下载只读该精确已审版本的固定文件，不点击时重排。

听力按[听力准备与导航复核](listening-review.md)执行。默认准备整文件解码、完整
normalized playback 与信号候选，不隐式运行旧180秒首题ASR。导题Agent负责
所有源对话的身份、顺序、完整性、实际遍数及可用播放范围；优先复用同音频的本地
ASR，只定点处理未决范围，不因漏识别报题就报“录音不符”或重跑全卷。候选段数量
相等不能证明题组对应。`prepare/finalize/verify-listening-review` 保存源/Candidate/
音频绑定的导航复核，逐组区分usable、review_required、blocked；非实质疑点保留，
实质疑点仅阻断受影响用途。不得冒称逐字、直接听审或全录音内容安全认证。
旧首段检查仅显式`--opening-check`运行，历史v1/v2收据按原范围验证、不回写。
仅导航复核与其精确证据可复用原冻结PDF；任何题卷说明校正必须使打印输入失效。

题卷与录音的播放遍数冲突按 Owner 已确认的
[听力遍数规则](../product/nck1-paper-standard.md#4-听力条款)处理：核实实际播放次数后，
修正新题卷说明以匹配录音，记录原文、修正及音频依据；保留源文件和旧 revision，
不修改录音，也不将该修正伪装成 OCR 错误。此项不再逐卷请求同样的决定，
但不授权把识别重复当真实重复、放行其他内容疑点或批准发布。

Screen 听力播放器使用分段进度线；音频准备和发布不再生成波形、采样峰值或
波形图像，也不再提供 `prepare-listening-waveform` 命令。题段起止时间、实际遍数、
题号映射和导航复核保持原合同，独立于波形数据。信号分段中的 PCM 重复检测用于
定位候选与实际遍数，不是播放器波形绘制，不因此删除。
第一节只有在已有时间段完整覆盖1–5题时显示整体耳机入口，保留题间停顿；
缺失、不完整或越界时间段不猜。信号分段仍为候选，不声称语义已核验。

历史兼容：旧工作副本可继续携带 `materialization/listening-audio/waveform-v1.json`；
有音频且文件存在时仍按原路径、角色及独立文件摘要封存，保持历史 Review bundle
和固定 PDF 输入摘要，不再解释或校验其中峰值。服务端同时接受带此文件和不带此文件
的新 Candidate，不修改已封存 revision、批准 receipt、schema 或 Canonical 身份。
新发布的 `listening/playback-ui-v1.json` 只含播放 SHA、时长、题段和自身摘要。
旧发布文件仍按包含波形字段的完整原始对象验证摘要，并保留原音频 SHA／时长绑定；
通过后只消费题段，忽略波形。缺失或损坏的派生文件不阻止已验证音频和卷面读取，
也不提供未校验的时间段。Print／PDF不显示波形，旧固定 PDF 不重新生成。

只有题卷时，先安全保留来源；图片页改用重复的
`--source-page question_source:<页码>=/abs/page.png`：

```bash
node scripts/import-pipeline/universal-nck1.mjs capture-source-only <sourceSetId> \
  --paper-name '<卷名>' --provenance '<题卷出处>' \
  --source question_source=/abs/questions.pdf
node scripts/import-pipeline/universal-nck1.mjs source-only-status <sourceSetId>
node scripts/import-pipeline/universal-nck1.mjs list-source-only
```

它写入gitignored `imports/source-only/`，保留原bytes、页序和digest，但不生成config、
Materialization、Candidate或Review revision。以后找到权威答案，再显式绑定status给出的
`questionSetDigest`并创建新的完整source set；旧`capture.json`和题卷bytes不修改：

```bash
node scripts/import-pipeline/universal-nck1.mjs attach-answers \
  <sourceSetId> <newPaperId> \
  --question-set-digest 'sha256:…' --answer-provenance '<答案出处>' \
  --source official_answers=/abs/answers.pdf
```

该命令只确认“调用方把这份答案绑定到哪份不可变题卷”，不猜答案是否属于该卷；新的
complete set仍必须通过正常Materialization、答案覆盖检查和Owner Review。

## 单 writer

同一 `paperId` 同时只允许一个 writer。发现该目录已有另一会话在写 → 停，不要并行、不要抢写。多卷并行本契约不做产品化。
当 source-intake snapshot 的 mode 为 `analyzed_package` 时，必须改走
`source-intake.mjs init` 内的确定性完整包准备器，并遵循
`docs/import/analyzed-package-contract.md`；不得把 ZIP 作为 universal `--source`，不得
调用 OCR、逐页提取或 Sol/AI 回退。修正版只使用 snapshot 的 `targetPaperId`。修正包先在
该 submission 的 `source-intake-inbox/<submissionId>/prepared-workspace` 完整校验，再以
Import Agent 凭据读取目标 Paper，核对 snapshot 的 `baseRevisionId` 仍是当前 revision；
两者均通过后才替换本地 workspace。原 workspace 移到同一 inbox 的
`previous-workspace`，成功后也保留作恢复备份；初始化 receipt 记录 ZIP 字节 identity、
实际 prepared projection digests、base revision 和备份路径。同一 submission 重跑 init
只核对 receipt 与当前 workspace，不再次替换。后续 Review upload 把 receipt 的 base
revision 纳入 bundle identity，服务端再次以当前 revision 比对，冲突即拒绝。
以下 B 路径与九份教学分析规则只适用于历史 absent-profile 工作区和 external
`analyzed_package` 的既有分析合同，不适用于 `public-paper-v1`。这部分教学方法与实验
材料继续保留，不能据此给新 raw-source 卷补分析、Embedding 或语义标签。

九份教学分析必须按 staged contract 拆给聚焦任务：阅读 A—D 各自独立，七选五、完形、语法填空、应用文、读后续写各自独立；不要让一个模型上下文包办整卷。该卷唯一 writer 负责汇总，同一工作树内默认逐份写入；并行只能做纯读取，或使用独立工作树和不重叠写面。九份齐全后统一跑确定性 projection，再由一个只验不写的任务检查串题、非精确证据、答案/ID 漂移、模板化复读和不恰当篇幅。不得以多 writer 绕过 Materialization、revision 或认可合同。

### B 路径：Low 直接解析，项目内正式校验

采用 Owner 选择的 B：每组由新的普通 Low 线程直接生成，启用 fast，不调用 Oracle、
`nck1_analyze_group`、`amp.ai.generate` 或其他模型。不再使用旧 Grok 解析插件。
自动 webhook/dispatcher 已退休。Owner 明确发起的新导题若需要独立线程，
用 `create_thread` 显式指定本地 runner 与内置 Low，不覆盖模型或推理档位，
创建时显式 `features: []`；旧绑定仍保留，不自动创建替代线程。
新 public-paper-v1 摘要与检索元数据同样使用内置 Low，
优先复用合适的本地 Low 线程；必须新建时显式传 `agent_mode: low`、`features: []`、
`executor: runner`、当前本机 `runner_id` 及允许的 `working_directory`，不传 Import Project。
先核对独立工作树、同版合同/校验代码和不重叠写面；不得为了访问当前 checkout 重建线程。
不再注册自定义 Low 副本；Low 跟随 Amp 的模式配置，不保证固定为 DeepSeek。
若 Low 不可用则停止，不切换模式或调用 Oracle/Task。实际 provider/model/usage 仍须实测。
已绑定 coordinator/lease 不擅自迁移。远端历史任务仅保留证据，不因本地改路由恢复远端 writer。

### 已退休的自动接卷与历史恢复

自动通知、reserve/bind 和派单入口已退休，不得按 ADR-0019 的历史激活步骤重启。
`node scripts/import-pipeline/source-intake-dispatch.mjs status <submissionId>` 仅供原
controller 只读核对历史绑定，永远不返回可自动启动状态。旧任务仅在 Owner 于 Amp
明确要求继续时，按既有 identity/claim/lease 规则恢复；不转移 lease 或替换绑定。
本地源码退休不证明远端 capability 已注销。远端 controller 已停止自动派单；
旧 handler/生产通知配置是否撤销，须独立核实，不能用 reload 或卸载推断注销成功。

journal 位于 `.scratch/source-intake-dispatch/<submissionId>/`，目录 0700、记录 0600，
含 reservation token，禁止输出、入 Git 或转移；更新 controller 时保留。失去该 Orb/journal
不构成在新 controller 重建任务的授权。数据库的唯一绑定和 claim/lease 校验仍为最终权威。

### 历史解析模式

以下 Low + fast 仅适用旧解析合同，不覆盖上面的新 public-paper-v1 路径。
旧解析或校对若使用 Medium，使用普通速度，不启用
fast。通过 `create_thread` 派发 Medium 时显式传 `features: []`，避免继承父线程的
fast；这不是切换默认生成模式、项目路由或迁移既有 coordinator/lease 的授权。

协调者用 `create_thread`，显式设置 `agent_mode: low`、`features: [fast]`、
`executor: runner`、本机 `runner_id` 及允许的独立 `working_directory`。
历史解析也遵守本地执行要求，不传 `project` 或 `orb_size`，不创建任何 Orb。
Low 是模式与路由选择，不是 Terra 的不可变模型保证；
实际 model/provider/usage 另行核验，不能从线程标题推断。失败不自动升档或换模型。

新线程只接收该组不可变请求（`group`、`sourceGroup`、`authoritativeAnswers`、
`outputContract`、`teachingDoctrine`），不得接收整卷、submission inbox、claim receipt
或其他组结果。明确本机只读输入与独立输出路径，不假定不同工作树共享未提交代码或本地 main。
两边必须具有同版合同和校验代码；尚未进入 origin/main 的代码须明确传递，不能仅发送 SHA。
协调者在文件就绪后才发开始消息，并记录任务起点。

Worker 在接收题组开始生成前，先确认本机 Node 24 和项目 Ajv 可用。缺依赖时停在环境
准备阶段，不运行 Linux Orb setup，不写共享 node_modules 或改锁文件。准备后重新确认
依赖，再接收开始指令。十个单组均使用同一个正式校验入口：

```bash
node scripts/import-pipeline/validate-analysis.mjs request.json analysis-reading-b.json
```

文件名按题组替换；支持 `reading-a` 至 `reading-d`、`seven`、`cloze`、`grammar`、
`application`、`continuation`、`listening-unit`。它只读输入，不写文件；语法填空仅在
内存副本上执行既有 `stampGrammarFillDerivedFields`，再正式校验，与全卷路径一致。
非零退出就是 FAIL，禁止用自编基本检查或 `jq` 替代。请求格式见
`scripts/import-pipeline/README.md`；必须保留同一单组源材料和答案权威。
阅读只有数值坐标错误时，允许另行输出新文件：

```bash
node scripts/import-pipeline/derive-reading-ranges.mjs request.json raw-analysis.json prepared-analysis.json
```

必须保留原稿；阅读修复程序只依据唯一精确引文派生位置，不能改文字、答案或关联，
不适用于其他题型。全卷写入后，协调者必须运行 `review.mjs verify-analyses <paperId>`；
任何单组 PASS 都不代替它。应用文校验还检查题目给定格式和字数，续写检查材料证据；
程序不判断教学质量，也不替代 Owner Review。

Worker 完成或失败都主动回报文件路径、字节数、SHA256、正式校验结果与限制，然后 final
结束，不等确认、不无限打磨；回报工具不可用时在 final 给出交付信息并停止。协调者取回
文件核对摘要、复跑校验后串行接纳；出现阻断保留证据，不自动重试或恢复旧失败线程。
没有请求时不加顾问或第二遍模型润色。教师内容审核与 Owner Review 继续保留。

项目 `.agents/setup` 使用 `npm ci --prefix server` 安装锁文件中的 Ajv；必须检查实际安装
结果，不能仅凭脚本存在认定成功。不另装 Python jsonschema。缺依赖时报告环境阻断，
由环境准备阶段修复，不在解析生成中途安装或改 validator。

## 本地算力边界

导题、摘要、metadata、OCR、音频处理与渲染均在本机执行；旧 Import Project 不再是
默认路由，自动派单仍退休。本地 runner 不可用就停止，不回退到 Orb。
Low 是模型模式，不代表计算资源规格。扫描/OCR、ASR 与渲染前记录实际 CPU、内存、
可用磁盘和耗时；资源不足先降低并发，不自动转云端、放宽门禁、转移 claim 或重复导入。

可并行的只有互不写同一状态、输出路径唯一的逐页读取/转换/复核工作；并发必须有界并
给 Agent 与系统工具留余量。Materialization、`verify`、`build`、revision、lease、handoff
和 promotion 继续由该卷唯一 writer 串行提交。CPU 只加速本地文档处理，不提高 AI
答案权威，也不替代扫描件逐页视觉复核。

## 文件夹接口（agent ↔ 导题后台）

根目录：`scripts/import-pipeline/papers/<paperId>/`。后台只读下列探针。

| 信号 | 路径 | 含义 |
| --- | --- | --- |
| 进入 `materializing` | `config.json` | 已开局 |
| 公共卷逐段摘要中 | `paragraph-summaries-v1.json` | `public-paper-v1` 的 `review.mjs push` 硬前置；须逐正文段落完整覆盖并绑定 source/candidate digest |
| 旧分析合同处理中 | 4× `analysis-reading-{a,b,c,d}.json` + `analysis-seven.json` + `analysis-cloze.json` + `analysis-grammar.json` + `analysis-application.json` + `analysis-continuation.json` | 仅历史 absent-profile / external `analyzed_package`；九份原始 bytes 进入不可变 revision |
| 答案复核过 | `signals/ai-answer-check.json` | AI Answer Transcription Check 已过 |
| 卡死 | `signals/blocked.json` | 硬停；见原因码 |
| 要人裁决（非例行 QA） | `signals/help-needed.json` | 例如非记叙型续写、格式不在白名单 |
| 网页 QA 已过 | `signals/qa-accepted.json` | 仅由 `review.mjs accept` 按认可摘要写 |
| 旧本地 publish（兼容） | `signals/locally-published.json` + 同版本 `latest/` | 仅供离线验证/存量恢复；不再是 Review-backed 生产上线前置 |
| 已上线 | Review API `promotion.state=published` | 服务端绑定 approval/revision/digests/vN 的正式审计收据 |

`signals/` 下是小 JSON 收据，不要把答案表或全文写进去。

### 收据形状

`signals/ai-answer-check.json`：

```json
{ "ok": true, "checkedAt": "<ISO-8601>", "method": "source-markings-vs-answerKey" }
```

`signals/blocked.json`：

```json
{ "code": "canonical_unavailable", "at": "<ISO-8601>", "note": "<one line>" }
```

`signals/help-needed.json`：

```json
{ "question": "<owner must decide>", "at": "<ISO-8601>" }
```

`signals/qa-accepted.json`：

```json
{
  "schemaVersion": "web-import-review-qa-accepted-v1",
  "acceptedAt": "<ISO-8601>",
  "by": "<owner account>",
  "approvalId": "approval-…",
  "revisionId": "rev-…",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…"
}
```

`signals/locally-published.json`：

```json
{
  "schemaVersion": "universal-nck1-local-publication-v1",
  "publishedAt": "<ISO-8601>",
  "approvalId": "approval-…",
  "revisionId": "rev-…",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…",
  "assetVersion": 1,
  "versionName": "v1",
  "canonicalPublicationDigest": "sha256:…"
}
```

`signals/shipped.json`：

```json
{
  "schemaVersion": "nck1-import-shipped-v1",
  "paperId": "<paperId>",
  "shippedAt": "<ISO-8601>",
  "command": "node scripts/pull-run-push.mjs push <paperId> --owner-said-ship",
  "approvalId": "<approvalId>",
  "revisionId": "<revisionId>",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…",
  "assetVersion": 1,
  "versionName": "v1",
  "canonicalPublicationDigest": "sha256:…"
}
```

已知 `blocked.json` 原因码：`source_incomplete`（统一材料化缺页、缺权威答案、冲突或不闭合）、`canonical_unavailable`（旧入口 producer / compile 仍 fail-closed 时）、`gate_failed`（同一门禁自动修 2 次仍红）、`continuation_non_narrative`、`ship_failed`（整库 push 失败）。

## 状态

线上权威状态：`materializing` → `awaiting_review` ↔ `changes_requested` →
`approved` →（Owner 另说“上线”）→ `publishing` → `published`，已知拒绝或
明确中止为 `failed`。`approved` 与 `published` 是两个不同人类决定。

下面的 `locally_published` / `ready_to_ship` / `shipped` 只描述旧本地探针兼容，
不授权、也不再驱动 Review-backed 生产上线。

`preflight` 合并本地文件探针与 Review API 当前 revision；不看进程 exit code，
也不把旧的本地认可收据当成当前认可：

| 状态 | 判定 |
| --- | --- |
| `materializing` | 尚未提交可审核 revision，继续不可变源、Materialization、Candidate 与答案复核 |
| `awaiting_review` | Review API 当前 revision 为 `awaiting_review` |
| `changes_requested` | Review API 当前 revision 有未决问题，或 renderer 已更新需重提 revision |
| `approved` | Review API 当前 revision 已认可；本地 QA 收据或本地发布尚未与其闭合 |
| `locally_published` | 当前认可已有精确本地发布收据，但 `latest` / 答案复核闭合不完整，停下检查 |
| `ready_to_ship` | 当前 web approval、`qa-accepted`、`locally-published`、同版本 `latest/`、SQLite published asset、Canonical current publication 和答案复核精确闭合 |
| `shipped` | `signals/shipped.json` 与当前 Review approval 和本地发布身份精确闭合 |
| `failed` | 有 `signals/blocked.json`、收据损坏，或进入审核阶段后未能核对 Review API |

`help-needed.json` 不是独立状态，叠在当前态上等人。

只读 preflight：

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
```

它返回 `state`、本地/Review 探针、`blockers` 和 `next.action`。它不上传 revision、
不 accept、不 publish、不取得 shipping guard，并固定返回
`production.pushAllowed: false`；上线授权只能来自 Owner 当前单独口令和后续 ship
promotion 命令。

## 硬门禁

新卷先走统一材料化缝。导题过程中**不改** `nck1-paper-standard.md` 来过闸（标准修订须 owner 另拍板后落档）。不绕闸。同一门禁最多自动修 **2** 次，仍红 → 写 `signals/blocked.json`（`gate_failed`）并停。

0. 先运行环境 `preflight`，再生成 `materialization/nck1-source-materialization-v1.json`。已知 NCK1 结构的 DOCX pair 运行 `node scripts/import-pipeline/universal-nck1.mjs materialize <paperId>`：producer 确定性解析段落、表格、题号、section、blank 与权威答案，生成逐段 locator、候选骨架和 `nck1-docx-materialization-review-v1.json`。它绝不解题补答案；语义不唯一时 `disposition` 为 `needs_agent_review`，只在 `review.required` 留结构化异常，Materialization `issues` 非空并失败关闭。Agent 审这些异常；`public-paper-v1` 随后生产逐正文段落摘要，只有历史 absent-profile / external `analyzed_package` 才按既有合同生产九份教学分析。任何派生内容中的正确项只能抄自该 Materialization 的权威答案；AI 绝不解题补答案。producer receipt 绑定版本与全部 source digest；源未变时直接 resume，若 Agent 已编辑 Materialization 则标记 `agent_modified` 且不覆盖。源字节漂移必须新建 Source Capture。PDF 有文本层直接转录；扫描 PDF 先 OCR 后逐页视觉复核；其他载体按原规则处理。DOCX 正文每个源 `<w:p>` 必须一对一生成独立 `paragraph` block，并用指向该段的 `docx_part` locator；禁止把相邻段落合并，也不要把阅读 A/B/C/D 等独立篇目标记写进正文。两篇写作必须保留源顺序：题干 →（续写标题与逐段材料）→ 独立 `注意` 结构 → 框内给定标题/称呼或两条续写开头语；`注意` 保留源本来的组合段，或保留“注意：”及其后一个或多个编号段，不得为了统一视觉而合段；必须含词数且与 `wordCountTarget` 一致，源有答题格式或其他编号说明时一字不漏。续写 `material` 每项一对一对应一个源段落，给定标题、称呼和开头语不得混进题干或材料。DOCX 初始化时自动产生不可变 PDF rendition，形状绘图从 rendition 按页裁。语义表格必须为 `table`，整表截图只能作 `visual_proof`。当前媒体助手只允许确定性提取/裁剪；清晰图只裁准和摆准。未来低清图若启用AI辅助候选，必须保留原图、禁止擦水印，绑定原图/候选digest，经`/ops/`并排及overlay/闪烁逐项人工确认后，才可由三面共同引用同一候选；该确认gate实现前仍不得生成式重画。用 `universal-nck1.mjs extract-docx-media` 或 `crop-pdf` 确定性生成媒体。
   应用文在「注意」后还有素材/图片、末尾另有给定语时，producer 不得仅凭单格表格自动判为答题框。Agent 逐页确认后，可在 finalize OCR 报告 / spelling / Candidate 摘要之前运行 `node scripts/import-pipeline/ocr-proofread.mjs writing-givens <paperId> --group <groupId> --refs <blockId1,blockId2,...> --agent-confirmed`。按 `givenSkeleton` 顺序显式列出全部源 block ID，命令只升级为 v7 并写入 `writingTask.givenBlockRefs`，不推断、移动或改写原文字/角色，也不清除其他 issues。校验不通过则不落盘。它沿用既有 Agent 编辑 Materialization 的机制：producer receipt/review 不变，inspect 显示 `agent_modified`，随后仍走 verify/build 和 digest-bound Teacher Confirmation。预览可加 `--output <path>`；读取树外只读输入时使用 `--input <materialization.json> --output <different-path>`，不会覆盖来源。
   扫描题卷 Reading 的同一自然段跨页时，保留两份封存 item、原文字和 Materialization block，不在 OCR 中重打整段、不合并或删除历史 correction entry。Agent 对照相邻原页确认同段、续行不缩进后，先运行 `node scripts/import-pipeline/ocr-proofread.mjs paragraph-join-plan <paperId> --group <groupId> --items <completeItemId1,completeItemId2> --reason "<原图核读事实>" --output <new-plan.json>`。计划绑定当前 Materialization、原 source bytes、evidence、confirmation 和 receipt 摘要，展示完整源片段及唯一连接空格；命令完整 replay 源与 validator，通过才写计划。核对后运行 `node scripts/import-pipeline/ocr-proofread.mjs paragraph-join-apply <paperId> --plan <new-plan.json> --agent-confirmed`。它只增加显式 v8 `paragraphJoins`，Canonical 将两片段编成一个自然段，保留两个来源及原 correction 指针。仅接受同文档相邻页、同一源派生 Reading 组、相邻正文 item/block，期间只能有已确认家具；跳页、夹图、跨组、重复消费、摘要漂移和其他未决 issues 均失败关闭。该入口不自动扫描、推断或批量应用。`--paper-dir <read-only-paper-dir> --output <new-file>` 可生成树外输入的计划/预览，输出须在源目录外，且不得覆盖已有文件。
   原地应用复用 fast 的 `spelling` 起点 redo：保留旧 Materialization，归档旧 spelling、OCR 更正报告、summaries、metadata、听核 sidecar、references、分页/PDF 与本地 Canonical 派生文件，清除相应完成标记；原 OCR evidence/confirmation/receipt 与 producer receipt 不变。已存在 Candidate/push/preview 或 UNKNOWN 本地证据时拒绝应用，先按原事务只读对账。然后运行 `fast-import.mjs after-proofread <paperId>` 和 `finish`，重做报告绑定、摘要及 Screen/Print/四款 PDF 检查；旧摘要不能直接改 digest 复用。`--agent-confirmed` 是来源关系的作者确认，不是 Teacher Confirmation、Owner approval 或发布授权。
   答案 PDF 中确属讲解、且不属于存活范文或明确评分入口的图，Agent 必须先核读原页，再显式运行 `node scripts/import-pipeline/ocr-proofread.mjs exclude-explanation-figure <paperId> --figure <sourceRegionId> --figure-sha256 <sha256:figureIdentity> --anchor <completeItemId> --reason "<原页与讲解归属事实>" --agent-confirmed`。图身份使用 `sourceReferenceFigureIdentity()`，不是 PNG 文件 SHA。声明绑定原 PDF SHA、crop 身份、锚 item、完整 evidence/confirmation 摘要与核读理由，记录在既有 `source-references-draft.json`，随后进入封闭的 `source-references-v5` sidecar；旧 v1–v4 schema 和无声明输出不变。producer/admission 共用核验，不按文字或位置自动分类；原图及被图消费的 OCR items 完整保留于 source evidence，只排除于 writing references，不能重新作为正文塞回。漂移、重复、缺失确认或试图排除范文/评分图均拒绝。`--paper-dir <read-only-paper-dir> --output <new-file>` 仅生成源目录外预览，拒绝覆盖。已有本地 Candidate/push/preview、未闭合 OCR operation/UNKNOWN 时失败关闭，先只读对账。原地应用归档旧 references sidecar、draft/request/input、分页计划和全部 PDF，并清除 references 及后续完成标记；源与上游摘要、听核、报告不变，不把旧参考内容重新绑定新 digest。接着运行 `fast-import.mjs finish <paperId>` 并重新检查 PDF；来源角色的 `--agent-confirmed` 不是 Teacher Confirmation 或发布授权。
1. `node scripts/import-pipeline/universal-nck1.mjs verify <paperId>`。缺页、缺答案、答案冲突、未闭合表格、重复/漂移媒体或 Materialization `issues` 非空均写 `signals/blocked.json` 并停。
2. `node scripts/import-pipeline/universal-nck1.mjs build <paperId>`，产生 digest-bound Candidate 摘要与 `confirmed: false` 的 Teacher Confirmation 模板。
3. `public-paper-v1` 依次运行 `prepare-summaries` / `verify-summaries` 与 `prepare-search-metadata` / `finalize-search-metadata` / `verify-search-metadata`，得到 `paragraph-summaries-v1.json` 和 `public-search-metadata-v1.json`。既有 Materialization issues、source-answer checks 或 validation gates 有未决项即失败关闭，不新增独立 factual-exception receipt。仅历史 absent-profile / external `analyzed_package` 生成九份 staged analysis 并运行 `verify-analyses`。各 profile 门禁缺项、冲突或绑定不完整即失败关闭。
4. 设置 `QUESTION_BANK_IMPORT_OPS_ORIGIN` 与 Agent token，运行 `node scripts/import-pipeline/review.mjs push <paperId>`。push 按 profile 重跑摘要与 metadata 门禁或旧 `verify-analyses`，并将 metadata 绑定不可变 revision/store。网页 revision finalize 后不可修改；Owner 在 `/ops/` 只审核最终 Screen/Student Print/Teacher Print/PDF 版式，认可 receipt 使用 `approvalScope: 'layout_only'`。旧 revision 不会因后来补文件而获得新 sidecar。
5. 有问题：Agent 用 `review.mjs status` 或自己的 `import_agent` 网页待办箱读取反馈并回复；修好 Materialization 或当前 profile 的派生文件后重新 `verify` / `build` 与对应摘要/分析门禁，再用 `review.mjs push <paperId> --resolves <issueId>[,<issueId>]` 提交新 revision。不得覆盖旧 revision。
   若问题仅属于 `pdf` 的 `friendly8` 或 `friendly10` edition，不改 Source、Materialization、
   题目或分析。运行 `review.mjs pagination-qa <paperId> --edition <edition> --auto`
   获取真实 PDF、逐页 PNG、slot/page 报告与有界建议；只用 `--break-slots` 和允许的
   `--cover-gaps` 试修，精确页数通过后显式 `--save-plan`。可选
   `pagination-plan.json` 绑定 source/Candidate 并进入 revision bundle；随后仍须
   `push --resolves <issueId>` 新建不可变 revision。不得手写 CSS、改版心／字体／行高，
   不得为找“最优”继续扩大既有 24-render 上限。8/10 页自动方案若使用 PDF-only 的选项库
   fallback，会在 plan 中保存 `allowSplitOptionBank: true` 并由显式重放保持一致；单条选项仍不可拆。
   自动规划失败仍非零退出，但必须使用独立 diagnostic PDF/逐页图片和结构化失败报告继续
   修复，且不得保存 plan；`--auto` 不得与显式 break/cover 编辑参数混用。
6. Owner 在网页认可后，Review API 保存绑定 source/Candidate/visible structure、当前 profile 的摘要或分析、files/bundle 的 approval；Agent 停下。无需在 Orb 生成本地 QA/发布收据，且不得因认可自动上线。
7. 只有 Owner 后来在当前对话明确说 `上线 <paperId>`，才运行 `node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship`。命令先用低权限 Agent token 读取最新认可，再用**只在本次上线动作中提供**的独立 ship token 请求生产服务。服务端从不可变 Review bytes 重建 Teacher Confirmation、Canonical request 与当前 profile 的 sidecar，调用共享 publisher 原子写单卷正式 rows、Canonical current、`versions/vN`、`latest` 和媒体。不得从 Orb 上传整个 SQLite 或 broad assets。

`materialize`、`verify` 与 `build` 都不会创建认可、approve、publish 或 ship。Teacher Confirmation、不可变 Review revision、Owner 网页认可和上线口令边界保持不变。

以下旧格式编号步骤（包括分析、发布 dry-run 与 QA 门禁）仅供已经登记的存量入口继续复现；`public-paper-v1` 新卷不执行这些步骤：

1. 切卷：格式① `node scripts/import-pipeline/01-split.mjs papers/<id>/config.json`；格式② `node scripts/import-pipeline/pdf-extract.mjs <paperId>`（先按 runbook 填 `CONTENT`）；格式③ `node scripts/import-pipeline/03-split-docx-pair.mjs papers/<id>/config.json`（试题 DOCX + 答案解析 DOCX，从解析抄 `answerKey`）。
2. 7× `node scripts/import-pipeline/validate-one.mjs papers/<id>/config.json <key>`，key 同上。无子代理时**同一会话串行**写 7 组。禁止把别的 `paperId` 的分析 remap 当本卷交付。
3. **AI Answer Transcription Check**（必跑，替代人对答案）：对照源标记抄写，并与解析正确项一致。禁止 AI 解题当答案（标准 §3）。通过后写 `signals/ai-answer-check.json`。
4. 写作分析（新卷必交，见下节）。格式③缺这两份稿不得 `--publish`。
   `--publish` 成功后必须把它们写入 `latest/analyses/writing-analysis-v1.json`,
   不得只留在 `papers/` 或下一卷再丢。应用文卷面 chrome(注意块 + 框内给定
   标题、题干不粘词数)随格式③ producer 落地,见标准 §6 / 附录 A。
5. **仅格式②**：按 runbook 做 canonical 物化（`build-canonical-request.mjs` + `canonicalRequestPath`）。不要手写 Canonical Paper。格式① / 格式③本步跳过。
6. Dry-run：`node scripts/import-pipeline/02-publish.mjs papers/<id>/config.json`（**禁止** `--publish`）。
7. `node scripts/import-pipeline/verify-publish-gate.mjs <paperId>` → `"ok": true`。
8. `node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>` PRE-PUBLISH → All green。
9. **格式①** 且 6–8 全绿：跑 trusted-DOCX producer，把 `config.canonicalRequestPath` 指到写出的 `canonical-import-request.json`：
   `node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs <docxPath> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`
   派生身份必须与开局 `paperId` 一致（全国一卷 `paper-YYYY-i`；浙江 1 月答案版 `paper-zj-YYYY-jan`）。不要手写 Canonical Paper，不要套用格式② PDF envelope。producer / compile 仍失败 → 写 `signals/blocked.json`，`code` = `canonical_unavailable`，停。**不得发明临时映射。**
   **格式③** 且 6–8 全绿：跑 DOCX-pair producer（开局 `paperId` 必填；不得占用 `paper-YYYY-i` / `paper-zj-YYYY-jan`）：
   `node scripts/import-pipeline/build-docx-pair-canonical-request.mjs <试题.docx> <答案解析.docx> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`
   身份以开局 `paperId` 为准，不按标题派生。不要手写 Canonical Paper，不要套用格式① trusted-DOCX 或格式② PDF envelope。producer / compile 仍失败 → 写 `signals/blocked.json`，`code` = `canonical_unavailable`，停。
10. 6–8 全绿且 `canonicalRequestPath` 可被 `loadCanonicalImportRequest` 加载：按 runbook 停本地 API → `--publish` → 重启 API →（格式②）`attach-paper-assets-extras` → POST `verify-nck1` → ledger。缺该 request 时不得把该卷当成已 publish。此处只描述存量入口复现；不得把它的 `latest/` 先发布顺序套到通用入口。
11. 本地 publish 成功后 **停**。不替人点 QA，不自动 push，不跑 `scripts/pull-run-push.mjs`。

## 停点

- **不对答案（人）。** 答案随解析字段做全；托底是 AI Answer Transcription Check。
- **网页 QA（人）必留。** Owner 在 `/ops/?view=review` 看复用现有 `PaperBrowsePage` / `PaperSurface` 的真实 Screen，以及共享 Canonical seam 生成的 Student Print / Teacher Print / PDF。对 `public-paper-v1`，Owner 只认可最终渲染版式，不逐项核对摘要、metadata、原题准确性或答案映射；这些由前置自动门禁闭合。认可 receipt 必须明确该限制。历史 absent-profile / external `analyzed_package` 保持原审核合同，不能静默改类。问题绑定 immutable revision；网页认可写服务端精确 approval，但不发布。
- **上线。** 网页认可后停。导题后台无生产按钮。Owner 必须**当前**另说「上线 <paperId>」之后，才按下一节执行服务端单卷 promotion。

## 上线

网页认可后仍然停下。只有 Owner 在**当前线程**直接说 `上线 <paperId>` 后，才可运行：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship
```

运行时提供 `QUESTION_BANK_IMPORT_OPS_ORIGIN`、低权限
`QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`，以及只在本次明确上线动作中提供的独立
`QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN`。两个 token 必须不同；日常 Project Orb Secret
只安装 Agent token，不能长期取得 ship token。命令先以 Agent token 读取当前最新
approval 并摊开 revision 与全部 digest，再以 ship token 请求 promotion。网页 Cookie、
Owner 网页会话、Agent token 都不能调用写入口。

### 硬前置

服务端在第一笔正式内容写入前，以 Review DB `BEGIN IMMEDIATE` 重新确认：最新 revision
仍是 renderer-current Candidate、已认可、无未决问题、所有不可变文件 bytes/digest
完整，并与请求的 approval/source/Candidate/visibleStructure/analysis/bundle identity
逐项一致。随后同一控制事务创建 shipping guard 与 `publishing` 回执。任何新 revision、
问题、重新认可或摘要漂移都失败关闭。

服务端 publisher 在任何 DB/asset 写入前，把目标 `assetVersion`、`versionName` 和
Canonical publication digest 写回 promotion。正式 question-bank rows、Canonical
current、五份 analysis、`versions/vN`、`latest` 和该卷媒体由既有 publisher 的
staging/journal/事务/补偿边界提交；不会上传或替换整库。成功后 Review 事务写
`published` 回执并释放 guard。本地新四产品候选在内容事务前归档全部已审文件，
成功发布记录绑定该清单；R2配置及生产启用尚未执行。现有定时R2灾备仍独立，
文件归档不表示数据库／整站备份已经完成。

重试：只有同一 exact approval 的状态为 `failed` 或 `publishing`，且 Owner 当前另说
`重试上线 <paperId>`，才运行：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-retry-ship
```

口令“上线”不能当“重试上线”。已提交但回执缺失时，服务端核验预先绑定的 vN 与
Canonical digest，直接补全同一回执，不创建 vN+1；pre-commit 失败则恢复旧 DB/current/
latest 并复用同一目标。已知 admission 失败记 `failed` 并解锁；未知异常保留
`publishing`+guard。

若无法自动恢复，确认旧进程不存在并人工检查生产 DB/current/latest 后，只有 Owner
当前明确说“解除上线锁”才可运行：

```bash
node scripts/import-pipeline/review.mjs release-ship-guard <paperId> <guardId> --owner-said-abort-ship
```

该命令用 ship token 将 active promotion 明确记为 `failed/ABORTED` 后解锁；不得为继续
导题而盲目执行。若正式内容其实已提交，后续 exact retry 会先核验同一 vN，再补
`published` 回执。

### 授权

QA 之后 Owner 必须另说“上线”（当前口头，不是历史聊天里的旧句）。导题后台只读
展示 `上线 paper-<id>` 或失败后的 `重试上线 paper-<id>`，永远没有执行按钮。没有
当前直接授权就不要运行 promotion。

`--owner-said-ship` / `--owner-said-retry-ship` 只表示 agent 已听到**这一次**口头授权。不得在 owner 没说时自行加上。

### 跑前必须摊开

1. 目标是生产 `eqbank.cc` 的 Review-backed 单卷 promotion；先读 go-live record。
2. 精确 `paperId`、approvalId、revisionId 与六个 digest。
3. 只改这一卷；不传 SQLite，不同步 broad assets，不包含 Orb 其他本地改动。
4. publisher 会写目标 vN、正式 rows、Canonical current、当前 profile 的摘要或五份分析 sidecar、latest 与媒体；旧
   immutable version 保留供 rollback。
5. 正式文件存储按部署时的固定配置执行，新产品文件先归档并验证；R2启用需明确环境授权。
   定时整站灾备仍由独立快照覆盖，本次promotion不声称整站备份完成或本地副本已减容。

### 收据

- `promotion.state=publishing`：guard 已持有；目标 vN 可能尚未写或正在恢复。
- `promotion.state=published`：精确 Review identity、vN、Canonical digest、当前 profile 的摘要或分析 digest
  与时间已落 Review DB。
- `promotion.state=failed`：已知拒绝或明确 abort；重试仍需新 Owner 口令。

## 写作分析（旧分析合同必交）

权威在本仓库。以下仅适用于历史 absent-profile / external `analyzed_package`，不适用于
`public-paper-v1`；保留其教学 doctrine 与实验材料，不要删除或改写成公共卷摘要合同。
适用卷必须按下面交稿，不要发明替代合同，也不要只改当前这一套。消费端讲评已能展示应用文 ReviewCard 与续写 `continuationAnalysis`；旧卷迁移仍是后续工作。

- **应用文**：先读 `docs/product/application-writing-doctrine-v1.md` 与 `prompts/application-writing-model-answer-v3.md`（agent 入口：`prompts/application-writing-agent-entrypoint.md`）。落盘 `modelAnswer` + 完整 ReviewCard（11 项：`form` `topic` `reader` `person` `tense` `type` 两个 `points` `readerWho` `readerCares` `readerWants` `value`）+ 源有则 `officialModelAnswer`。交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。完整 payload 时点击答题框打开讲评：框内按顺序叠放「AI 参考范文」与可选「官方范文」，右栏只 ReviewCard。不新增 tab，不按 2022-i / 2024-i 白名单决定入口。
- **读后续写**：先读 `docs/product/continuation-writing-analysis-contract-v1.md` 与 `prompts/continuation-analysis-v1.md`。落盘 `continuationAnalysis` / `continuation-analysis-v1` 五段（`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、`languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。形状闸：`node scripts/verify-continuation-analysis-v1.mjs` 所锁的 schema（`schemas/paper-import/continuation-analysis-v1.schema.json`）。只覆盖记叙型；说明 / 议论型停，写 `signals/blocked.json`（`continuation_non_narrative`）或 `help-needed.json`。旧 `continuationDesign` 只认历史资产。

## 导题后台

生产同域入口 `/ops/`；本机同源壳为 `node import-ops/server.mjs`（默认
`http://127.0.0.1:8790/ops/`，代理到 `EQB_APP_ORIGIN`）。Owner 能提问题、验证
修复和认可；`import_agent` 真实服务账号能读取待办、查看同一表面和回复，但不能
关闭问题、认可或上线。页面只读展示 promotion 审计状态；无 LLM 动作、无生产按钮。

## 禁止

在消费端恢复导入动作或复制审核渲染器；后台直连 LLM API；从 Orb 上传/替换整库或 broad assets；导题时为过闸改 nck1 标准；格式①临时 canonical 映射；Review-backed 纸卷走 `pull-run-push push`；未获当前 Owner 口头「上线」/「重试上线」动生产；把 ship token 装成日常 worker secret；为下一道同类 Word 细线框改 PaperSurface / print-renderer。
