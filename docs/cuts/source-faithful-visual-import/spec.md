# 导题 Agent 的源图忠实重建与图片选项 Canonical 化 v1

Status: implemented
Date: 2026-08-24
Planning baseline: `github/main@b9ec0961`
First real canary: 深圳一模 `paper-mock-sz-2026-m1` Reading D Question 33

## Problem Statement

导题 Agent 已经能把普通文字写成段落、把矩形数据写成真表，并把 Word
左右细线框写成 `framed_columns`。但源卷里的视觉对象仍主要依赖整块截图。
这在普通 Passage Figure 上尚能保住「有图」，在图片选项上却丢失了题目本身
的结构：题干、A–D 标号和四幅小图可能被焊进同一张 PNG，Canonical Option
只剩 `[Fig.]`，图片也没有归属到各自的 Option。

深圳一模 Reading D Question 33 正是这个问题的首个真实样本。现有原料是一张
1380×220、200 dpi 的整条 PNG，包含题干、四个选项标号和四幅 plug-flow
示意图；当前 Canonical Option 仍是四个纯文字 `[Fig.]`，没有 Option-owned
media。结果是源语义归属、可访问身份、排版尺寸和三面一致性都无法由
Canonical Paper 直接保证。

同时，Agent 还没有一套受控方法决定视觉对象应该怎样进入导题结果：哪些内容
应继续打成真字或真表，哪些规则型示意图可以重建，哪些照片或不规则插图只能
基于原图修复，哪些情况必须保留原始裁图并交给老师确认。若直接把生成式图片
写进卷面，模型可能增删线条、改变连接关系、重写文字或用更「好看」的图替换
原题含义；若只继续截图，图片选项又永远不能成为稳定的 Canonical 结构。

Owner 需要的是一条后台 Agent 能执行、老师能确认、消费者能稳定显示的完整
路径：从 Source Capture 中识别一项视觉对象，生成或保留候选资产，把候选精确
绑定到 Passage 或 Option，经过 Teacher Confirmation 后形成 Canonical media，
并由 Screen、Student/Teacher Print HTML 与 PDF 消费同一份已确认语义。

## Solution

建立一条 NCK1 导题 Agent 的 source-faithful visual reconstruction v1 路线。
Agent 先根据源内容选择现有结构化路线或视觉路线；进入视觉路线后，保留原图
裁剪作为 source evidence，制作一项或多项候选资产，并为每项候选记录精确
bytes、digest、尺寸、生成方式、目标语义所有者和源图核对清单。

规则型示意图允许由 Agent 使用 SVG 或 Canvas 重建，但 Canonical v1 只接收
经确定性导出的高分辨率 PNG。照片和不规则插图允许基于原图做修复、去噪或
高清化，同样输出 PNG。Agent 无法证明候选忠实，或模型改变了源图语义时，
必须退回原始裁图候选或留下待确认问题，不得为了完成导题而自动选图。

生成或重建结果只进入 Import Candidate。Teacher Confirmation 必须选择并绑定
精确候选 digest；未确认、已拒绝或 bytes 已变化的候选不能成为 Canonical
Paper。模型输出不是答案权威，也不因「看起来清晰」自动成为 Transformation
Record。确认记录负责说明老师接受的是哪一份 exact candidate；Source Capture
和原始裁图保持不可变。

Canonical Reading 的 per-question Option v1 扩展为一个受限联合：一组 A–D
Options 要么全部是现有的非空 literal text，要么全部各自引用恰好一项已闭合
的 figure media。v1 不开放任意富文本树，也不允许同一组选项混合文字模式和
图片模式。Option label 继续由共享 renderer 打真字；题干和标号不得焊进图片。

已确认的 Option Figure 与 Passage Figure 共用 Question Group 的 immutable
media closure、source identity、artifact bytes 和消费投影。Screen、Student
Print、Teacher Print 与 PDF 从同一份 Canonical projection 渲染图片选项，
不在任何消费面调用模型、猜占位符或重新组合语义。

深圳一模 Question 33 作为首个 canary：从现有整条源图中建立四项 source
observations，分别产出 vector-authored 与 reference-restored 候选证据；Owner
选择精确候选集合后，四个 Options 各自拥有对应 figure，题干和 A–D 标号由
renderer 呈现。原整条 PNG 保留为 source evidence，但不再作为 Passage 正文；
四个 `[Fig.]` 不再出现在 Canonical 或任一消费面。

## User Stories

1. As an owner, I want to hand a local Agent one supported NCK1 source and have it classify each visual object, so that I do not manually invent a different import method for every paper.
2. As an owner, I want the Agent to preserve the exact source crop before it reconstructs anything, so that I can always compare the candidate with immutable source evidence.
3. As an owner, I want to see the source crop, vector-authored candidate, and reference-restored candidate at the same physical target size, so that I can judge fidelity instead of being misled by zoom level.
4. As an owner, I want to accept an exact candidate digest rather than a vague generation method, so that a later rerun cannot silently replace the image I approved.
5. As an owner, I want to reject all generated candidates and keep the source crop when necessary, so that finishing the import never outranks preserving question meaning.
6. As a teacher, I want image options to remain attached to their own A–D Options, so that I can point at one option without referring to a detached screenshot elsewhere on the page.
7. As a teacher, I want question stems and option labels rendered as real text, so that their typography, selection identity, and lecture anchors match ordinary questions.
8. As a teacher, I want Screen, Student Print, Teacher Print, and PDF to display the same four option figures, so that classroom explanation and the paper handed to students do not disagree.
9. As a teacher, I want a rejected or unresolved reconstruction to stop publication, so that a visually plausible but semantically wrong diagram does not reach students.
10. As a student, I want each image option to be clear at normal reading and print size, so that I do not need to enlarge a blurry full-width screenshot to answer the question.
11. As a student, I want image proportions preserved without cropping or stretching, so that visual differences between answer choices remain the differences authored by the source.
12. As an import Agent, I want an explicit routing rule for text, tables, framed columns, diagrams, photos, and unsupported visuals, so that I do not turn everything into either OCR text or a screenshot.
13. As an import Agent, I want rule-based diagrams to have a vector-authored route, so that simple lines, gaps, containers, and shapes can be redrawn cleanly without inventing photographic detail.
14. As an import Agent, I want photos and irregular illustrations to have a reference-restoration route, so that I can improve legibility while retaining the source composition.
15. As an import Agent, I want a safe source-crop fallback, so that low confidence does not force me to hallucinate a reconstruction.
16. As an import Agent, I want candidate metadata to name its source location and intended semantic owner, so that an asset cannot be attached to the wrong Passage, Question, or Option.
17. As an import Agent, I want visual acceptance to remain a human confirmation point, so that my generation output cannot approve itself.
18. As a developer, I want Option Figure support to reuse the existing Question Group media closure, so that there is one media integrity model rather than an Option-only side channel.
19. As a developer, I want a closed figure-only Option shape, so that renderers do not need to interpret an arbitrary nested rich-content tree.
20. As a developer, I want text-only Reading Options to remain byte- and behavior-compatible, so that adding image options does not disturb ordinary A–D questions.
21. As a developer, I want mixed text/figure option sets to fail closed in v1, so that an unplanned layout shape cannot leak into one consumer surface.
22. As a developer, I want missing media, digest mismatches, changed bytes, unsupported MIME types, and unresolved ownership to fail before consumption, so that a renderer never repairs Canonical meaning.
23. As a developer, I want the shared projection to resolve media once before Screen or Print begins, so that all surfaces receive the same verified option assets.
24. As a developer, I want generated raster dimensions and physical layout intent separated, so that raw source pixels are not mistaken for CSS pixels or PDF points.
25. As a reviewer, I want a frozen generic fixture plus the Shenzhen canary, so that I can distinguish contract correctness from one manually pleasing image.
26. As a reviewer, I want negative cases for hallucinated text, missing shapes, changed topology, swapped options, and duplicate source ownership, so that a green happy path does not overstate fidelity.
27. As an accessibility reviewer, I want neutral option-image labeling that does not disclose the answer, so that screen-reader metadata does not become an answer hint.
28. As a maintainer, I want the Agent Contract to describe the visual routing decision without adding a website import UI, so that future local Agents follow one production boundary.
29. As a maintainer, I want existing Passage Figures and `framed_columns` to continue through their accepted routes, so that this feature does not reopen already-settled rendering decisions.
30. As an owner, I want the first implementation to stop at a draft PR and exact-page Owner QA, so that a visual shared-contract change cannot mark itself ready or reach production automatically.

## Implementation Decisions

### 1. One source-to-consumer seam

- The feature is one deep path: immutable Source Capture evidence → visual candidate in an Import Candidate → exact Teacher Confirmation → Canonical Question Group media and semantic reference → shared consumption projection → Screen and Print/PDF.
- Consumer surfaces never inspect source crops, generation prompts, model output, or import diagnostics. They receive only confirmed Canonical semantics and resolved immutable media.
- The website remains consume-only. Generation, reconstruction, candidate comparison, and confirmation are backend Agent work.

### 2. Visual routing vocabulary

- The Agent must first ask whether the source object is actually visual.
- Source text remains a paragraph; rectangular row/column meaning remains a table; accepted two-column Word text/table boxes remain `framed_columns`.
- Statistical charts, diagrams, drawings, photographs, and other meaning carried by spatial or pictorial form use the figure route.
- v1 supports visual ownership by a Reading Passage or one Reading Option. Question-owned composites, Writing Task overlays, and other families are not introduced by this spec.
- Routing is explicit Agent judgment over a known source crop. v1 does not add automatic whole-PDF visual detection, OCR box recognition, or a fourth import format.

### 3. Candidate evidence package

- Every visual observation retains an immutable source crop or exact embedded source image, its Source Capture identity, source document and page, crop coordinates when applicable, digest, pixel dimensions, and intended semantic owner.
- Every candidate retains exact output bytes, MIME type, digest, pixel dimensions, reconstruction method, and a reference to the source observation from which it was derived.
- Every candidate includes a source-truth checklist describing count, order, orientation, containment, connectivity, gaps, labels, and other meaning-bearing visual relationships visible in that source. The checklist is evidence for confirmation, not an automated similarity score.
- Prompts, tool/model identifiers, and export settings may be retained as reproducibility notes, but they do not replace exact bytes or human confirmation.
- Candidate artifacts must not contain secrets, account data, private student data, or unrelated full source content.

### 4. Supported reconstruction methods

- `source_crop`: preserve the best lossless or high-resolution source extraction without semantic editing. It is both the baseline and the required fallback.
- `vector_authored`: an Agent may reconstruct rule-based geometry with SVG or Canvas. Editable vector material is evidence only; Canonical v1 receives a deterministic high-resolution PNG export.
- `reference_restored`: an Agent may use reference-image editing to remove capture noise, improve edge clarity, or upscale an irregular illustration. It must not redesign, restyle, add, remove, relabel, or reinterpret meaning-bearing content.
- Canonical v1 accepts PNG output for reconstructed Option Figures. It does not add public SVG media support, execute SVG, or expand the current renderer MIME surface.
- Candidate generation may be non-deterministic. Acceptance is therefore bound to exact candidate bytes, not to an instruction that could produce different bytes later.

### 5. Semantic trust and confirmation

- Generated or reconstructed media never enters a Canonical Paper directly. It enters an Import Candidate with a blocking visual-confirmation issue.
- Teacher Confirmation selects an exact candidate digest for an exact target owner. Confirmation fails if the source observation, target owner, candidate digest, MIME type, dimensions, or bytes differ from what was reviewed.
- A model-generated candidate does not become a Transformation Record merely because it was accepted. Non-deterministic or semantic-risk generation remains recorded as candidate provenance plus an explicit confirmation decision.
- Rejecting all reconstructed candidates is valid. The teacher may confirm the source crop, request another candidate, or leave the import unresolved.
- Correct answers and `correctOptionId` continue to come only from the admitted answer source. Visual generation must not solve the question, infer a new answer, or use answer correctness as permission to alter a figure.

### 6. Reading Option Figure contract

- A per-question Reading A–D option set is homogeneous in v1: all four Options contain non-empty literal text, or all four Options each contain exactly one figure reference.
- Figure Options retain the existing stable Option identities and A–D order. The figure reference points to one media item owned by the same Canonical Question Group.
- Each referenced media item must have resolved immutable bytes, digest, PNG MIME type, positive pixel dimensions, and source artifact identity before projection.
- A Figure Option carries no generated caption as student-visible content. Screen-reader labeling is neutral and identifies the option label without describing a likely answer.
- Figure Options cannot also carry `[Fig.]`, duplicated question text, an embedded A–D label, arbitrary paragraphs, tables, nested figures, or inline answer hints.
- Passage Figure blocks keep their existing contract. The new Option reference does not turn an Option into a Passage block and does not create an Option-only media registry.
- Seven Choices shared banks, Cloze Options, Writing Tasks, and non-Reading families remain literal-only under this spec.

### 7. Shared consumption projection

- The shared projection validates all four Figure Option references, resolves their media artifacts, and exposes one renderer-neutral image-option set.
- Projection fails closed on a missing or duplicate Option identity, mixed option mode, absent media, cross-group media reference, digest mismatch, changed bytes, dimension mismatch, unsupported MIME type, or an incomplete four-option set.
- Renderers receive resolved media artifacts; no renderer performs manifest lookup, marker parsing, source fallback, or semantic repair.
- Existing text-only projection remains unchanged for ordinary Reading questions.

### 8. Screen and Print/PDF behavior

- Option labels remain real renderer text. Only the meaning-bearing illustration occupies the image box.
- A figure-only A–D set uses one shared, versioned layout rule across Screen and Print/PDF: four equal option tracks, consistent label placement, a candidate-independent image box, preserved aspect ratio, centered content, and no crop or stretch.
- Physical layout intent is chosen once for the option set and is independent of candidate pixel dimensions. The system must not map raw source pixels directly to CSS px or PDF pt.
- The four images use the same visual box. Natural internal whitespace may differ only when it is source-backed; the renderer does not normalize away a meaningful difference.
- The admitted asset owns the complete source-authored figure pixels, including source-backed internal whitespace and only the edge clearance already present in the source object. It excludes A–D labels, question text, page margins, comparison padding, and renderer image-box whitespace.
- Automatic edge trimming or white-to-transparency rewriting is forbidden: white gaps, highlights, and JPEG edge noise are not sufficient authority to delete source pixels. The renderer owns physical size, placement, alignment, responsive fit-down, and pagination while preserving aspect ratio with `contain`.
- A Figure Option question is an atomic print unit. If the stem, labels, and four figures do not fit in the remaining page space, the whole question moves together. v1 does not split an option-image set across pages.
- Student surfaces do not expose the correct answer. Teacher surfaces may use the existing answer/Analysis behavior, but the selected figure bytes and placement remain identical.
- No Screen, Print, or PDF path calls an image model or conditionally substitutes a different candidate.

### 9. Shenzhen Question 33 canary

- The existing full-width source PNG remains immutable source evidence and the visual comparison baseline.
- The question stem is represented once as Canonical literal text. A–D labels are represented once by the renderer.
- Four source observations correspond to the four source-authored option diagrams in order. Their association cannot be inferred from the answer; it follows source position and Option identity.
- The Agent produces a coherent vector-authored candidate set and a coherent reference-restored candidate set at the same target image-box intent, alongside the source-crop baseline.
- Owner confirmation chooses the exact four-candidate set, or rejects both reconstructed sets and chooses source crops. A mixed method is permitted only when each selected Option candidate is individually reviewed and the resulting set remains visually coherent at the shared target size.
- After confirmation, the Reading Question owns four Figure Options. The old Passage-level whole-strip figure and all `[Fig.]` option text are absent from the Canonical Question Group and every supported consumer surface.
- The admitted answer identity remains the source-backed existing answer. The canary does not re-solve or re-grade Question 33.

### 10. Agent workflow and repository authority

- The Agent Contract gains one visual-routing decision that points to the accepted table, `framed_columns`, Passage Figure, and Option Figure paths. It does not grow a second runbook or a parallel status database.
- Existing import signals and Teacher Confirmation remain the human boundary. No website import UI, live model endpoint, or background generation service is introduced.
- Because Option Figure changes Canonical shape, shared projection, PaperSurface, and Print/PDF behavior, implementation requires versioned authority/schema artifacts and migration notes rather than an in-place mutation of already-published authority.
- Existing immutable Publications remain readable under their original authority. The new consumer contract is additive for newly compatible Publications and the explicitly migrated canary.
- The Shenzhen canary is prepared and reviewed locally. Publication to production, deployment, R2 mutation, and repository push are separate owner-authorized actions and are not implied by completing this spec.

## Testing Decisions

### Test philosophy

- Deterministic tests exercise public behavior and trust boundaries, not prompt wording, model internals, or the claim that the same prompt will regenerate identical pixels.
- Generated visual quality is evaluated against immutable source evidence and a source-truth checklist at the intended display/print size. Automated pixel similarity alone cannot approve a candidate.
- The generic fixture proves the contract. The Shenzhen canary proves that the contract can carry one real image-option question without restoring flattened markers or a detached screenshot.

### Candidate and confirmation tests

- A candidate package with exact source identity, owner, PNG bytes, digest, dimensions, method, and checklist is accepted as an Import Candidate visual candidate but remains unresolved before Teacher Confirmation.
- Confirmation of an exact candidate digest admits that candidate; changed bytes, changed dimensions, changed owner, missing source evidence, or a different digest reject.
- Rejecting candidates leaves no Canonical media reference and preserves an explicit unresolved issue.
- The source-crop fallback follows the same exact-byte confirmation path as reconstructed candidates.
- Vector-authored and reference-restored evidence are both valid candidate methods; neither method receives automatic preference from the compiler.

### Canonical contract tests

- A synthetic Reading question with four resolved Figure Options compiles, projects, and retains stable Question/Option/media identities.
- Existing four-literal-text Reading Options compile and project exactly as before.
- Mixed literal/figure options, fewer or more than four figures, `[Fig.]` text, missing media, cross-group media, duplicate Option identity, missing artifact bytes, digest mismatch, dimension mismatch, unsupported MIME type, and arbitrary nested content all fail closed.
- Passage Figure and `framed_columns` fixtures continue to pass without adopting Option Figure behavior.
- Seven Choices, Cloze, Grammar Fill, Application Writing, and Continuation Writing reject Option Figure content under their existing contracts.

### Shared rendered-behavior tests

- The same projected fixture produces four Option labels and four resolved images in Screen, Student Print HTML, Teacher Print HTML, and PDF.
- No surface contains `[Fig.]`, duplicates the question stem, renders the old full-strip figure, or reconstructs semantic ownership independently.
- Option-to-media association and A–D order are identical across all surfaces.
- Images preserve aspect ratio, remain inside the shared box, do not crop or stretch, and use the same physical layout intent independent of source pixel size.
- The exact same confirmed bytes remain contained and legible when placed in differently shaped renderer-owned boxes; portability does not permit cropping, rotation, stretching, relabeling, or removal of semantic whitespace.
- The complete question moves atomically at a print page boundary.
- Student output does not expose answer identity; Teacher output retains existing answer behavior without changing image bytes.
- Ordinary text-only Reading questions retain their current A–D layout and geometry.

### Shenzhen canary tests

- The frozen original strip remains available as evidence and is not admitted as Passage content after migration.
- Question 33 has one typed stem, four renderer-owned labels, four Figure Options, zero `[Fig.]` strings, and no Passage-level duplicate figure.
- The four selected media digests are exactly those approved during Teacher Confirmation and remain stable through Screen, Student/Teacher Print, and PDF.
- Source comparison checks each option independently for count, order, orientation, containment, dark/light regions, gaps, and other source-authored relationships. Any missing, added, swapped, relabeled, or topologically changed element fails visual QA.
- Candidate comparison is performed at one fixed target size with the same background and renderer layout. Enlarged inspection may diagnose artifacts but cannot substitute for normal-size QA.

### Repository gates

- During implementation, run focused Canonical contract and rendered-behavior checks plus the shared Paper verification pack.
- Final shared-contract gate includes the full repository verification suite, one independent Standards review, one independent Spec review, and exact-page real Screen/Print/PDF evidence.
- `SKIP` is reported as `SKIP`, not PASS. Existing unrelated failures are not repaired by weakening NCK1 or paper standards.
- Visible acceptance remains an Owner QA stop. Automation may prepare the exact service, paper, URL, question focus, Print views, PDF, and comparison evidence, but it cannot approve the visual result.

## Out of Scope

- Automatic whole-PDF or whole-DOCX computer-vision discovery of every visual region.
- OCR-based automatic reconstruction of text boxes, tables, or `framed_columns`.
- A general Canvas/SVG editor, authoring UI, or website-side image generation control.
- Public SVG media support, executable SVG, animation, video, audio, or interactive diagrams.
- Arbitrary Option rich content, mixed text-and-figure Options, multiple figures per Option, captions inside Options, or nested blocks.
- Question-owned composite figures beyond the four Option-owned figures in the Reading v1 contract.
- Image Options for Seven Choices, Cloze, Grammar Fill, Application Writing, Continuation Writing, listening, or future question families.
- Application-writing lamp overlay, salutation/opening overlay, PDF-pair kitchen work, DeepTutor, prep-hall, or other unrelated uncommitted work.
- Replacing, republishing, or migrating every historical figure paper.
- Automated visual correctness scoring, automatic candidate acceptance, or using a model to solve questions or change answer authority.
- A new confirmation database, new import status machine, restored website import UI, or a backend service that calls an image model at runtime.
- Production deployment, content shipping, force push, release receipts, or writing QA/shipped signals.

## Further Notes

- This spec extends the accepted Agent import path; it does not supersede the broader import-agentization decisions. The website remains consume-only and the local Agent remains the producer.
- The accepted `framed_columns` rule remains the first routing guard: if meaning can be represented as real text and a rectangular table, it does not enter this visual reconstruction path.
- The current Reading Option contract is literal-only and the current consumer projection rejects non-text Option content. Option Figure is therefore a real shared Canonical contract change, not a one-paper CSS adjustment.
- The current Shenzhen Q33 figure is only a useful source/canary. Its present whole-strip ownership and `[Fig.]` Options are evidence of the missing seam, not the target data model.
- This is a suitable small task graph for `implement-spec`, but not a fully AFK visual release. Parallel implementation may prepare candidate methods, contract, and renderers; the orchestrator must stop at the Owner visual-confirmation boundary and leave the PR in draft. It must not mark the PR ready, merge to `main`, push production content, or clean away evidence needed for QA before the owner decision is recorded.
- Tickets are intentionally not created by `to-spec`. After owner review, `to-tickets` should form a small dependency graph around candidate/confirmation evidence, the Option Figure contract, shared rendering, and the Shenzhen canary.
