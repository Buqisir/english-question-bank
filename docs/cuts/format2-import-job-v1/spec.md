# 格式② Import Job v1 — 将逐卷手艺收进导题 Agent 深模块

Status: ready-for-agent
Date: 2026-08-25
Depends on: accepted Import Agentization contract and the implemented
source-faithful visual-import capability

## Problem Statement

Owner 已经把网站收敛成消费端，也已经让后台导题具备 Source Capture、Import
Candidate、Teacher Confirmation、Canonical Paper、原子发布、六态文件夹探针和
Screen / Print / PDF QA。但格式②（PDF 试题卷 + 独立答案 PDF）仍没有成为一项
真正可重复执行的 Import Job。

今天导一卷格式②，Agent 仍需把整卷内容写进共享脚本里的逐卷登记表，手工编排
切卷、七组分析、答案核对、听力与 figures、Canonical evidence、dry-run、多个
gate、本地 publish、extras、ledger 和 QA。视觉对象虽然已经有 exact candidate、
Teacher Confirmation、Reading Figure Option 和共享渲染合同，深圳 Q33 的首次落地
仍依赖大量单卷 materializer、单卷证据拼接与单卷检查。共享能力已经存在，逐卷
编排却仍住在 Agent 的上下文和源码特判里。

这造成三个直接问题。第一，换一张卷就容易重新支付一次共享工程成本，甚至为了
还原原 PDF 而调单卷 CSS 或写新的 paperId 分支。第二，Agent 要知道太多内部脚本
顺序、完成字符串、路径约定和重试纪律，任一步漏掉都可能把“进程跑完”误判成
“导题完成”。第三，Teacher Confirmation 和最终 Owner QA 虽然是正确的人类停点，
但它们之间的机械工作还没有收进一个可恢复、可重复、可从外部验证的模块。

Owner 要的不是一键 OCR，也不是让模型自动批准内容。Owner 要的是：给本机 coding
Agent 一套受支持的格式②源文件和 paperId，Agent 按同一条 Import Job 跑；普通文字、
表格、`framed_columns` 和 Figure 各走既定路线；同形状的新卷不新增单卷源码；Owner
只在 exact Teacher Confirmation 和最终成品 QA 两处介入。新形状无法归入现有合同
时，Job 应明确停住，而不是临时为这一卷发明规则。

## Solution

建立一个格式②专用的深模块 `Format 2 Import Job`。它在一个外部 seam 上提供两项
操作：开始或继续一项尚未经过 Teacher Confirmation 的 Job，以及携带 exact
Teacher Confirmation 恢复同一项 Job。调用者只需要知道源文件、paperId、当前
Job receipt 和需要的人类确认；切卷、验证、候选绑定、Canonical compilation、
本地原子发布、精确 reload、共享渲染证据和失败收据都收进模块实现。

Import Job 不替代 coding Agent 的语义工作。Agent 仍直接阅读源 PDF、忠实转录、
从答案 PDF 抄录答案、生成受合同约束的 Analysis，并对视觉对象作有源证据的路由
判断。改变在于：这些逐卷结果以版本化、schema-validated 的 per-paper 数据产物
提交，不再通过修改共享脚本、增加 paperId 分支或手写 Canonical Paper 来表达。

Job 复用现有深模块，而不复制它们：Source Capture 保存不可变来源；受信 source
adapter 产生 Import Candidate；Visual Candidate 模块绑定 exact PNG、owner 与
source-truth checklist；Teacher Confirmation 绑定 exact candidate digest；Canonical
compiler 负责语义闭合；public publisher 负责本地原子写入、恢复、重试与精确
reload；Screen、Student/Teacher Print 和 PDF 继续消费同一份 Canonical Paper。

视觉路线默认只准备 `source_crop`。Agent 只有在源裁图的正常尺寸可读性不足、
或 Owner 明确要求替代候选时，才额外准备 `vector_authored` 或
`reference_restored`。PDF 中已有独立图像对象和 placement matrix 时，Job 直接绑定
精确 bytes 与源 PDF point geometry；只有不存在可用 source-measured geometry 且
形状符合已接受的通用 Figure Option 合同时，才使用现有 generic layout。任何新
视觉所有权、混合 Option 模式或无法证明的裁剪都 fail closed。

首个实现用两项现有真实证据证明泛化，而不再做第三套共享合同：深圳 Q33 通过
通用 Job 重演 exact source-crop、Teacher Confirmation、Canonical media 和原 PDF
摆放，不再依赖 Q33 专属 materializer；`paper-2026-i` 通过同一 Job 重演一套完整
格式②整卷的结构、答案、听力、表格/figure、Canonical 和本地消费。完成之后，
再导一套同形状格式②新卷只新增 per-paper 数据与 source evidence，不新增共享
代码、CSS、renderer authority 或逐卷 verifier。

## User Stories

1. As an owner, I want to give a coding Agent one paper PDF, one answer PDF,
   and one paperId, so that I do not supervise a long runbook.
2. As an owner, I want the Agent to use one Format 2 Import Job contract, so
   that each paper does not invent a new import procedure.
3. As an owner, I want the Job to stop only for exact Teacher Confirmation and
   final Owner QA during the normal path, so that my attention is spent on
   semantic trust rather than mechanics.
4. As an owner, I want the Job to report a precise blocking reason for a novel
   shape, so that an Agent does not silently broaden the standard.
5. As an owner, I want an interrupted Job to resume from durable evidence, so
   that a long import does not restart from the first page.
6. As an owner, I want rerunning an unchanged Job to be idempotent, so that a
   retry does not create a different paper or duplicate publication.
7. As an owner, I want the local import console to show the current stop reason
   and exact confirmation or QA entry point, so that I do not reconstruct test
   state from terminal history.
8. As an owner, I want a normal same-shape paper to use a proportionate data
   addition lane, so that it does not trigger a new authority migration, full
   suite, or independent review.
9. As an owner, I want a true shared-shape change to escalate explicitly, so
   that convenience never weakens Canonical safety.
10. As an import Agent, I want per-paper transcription to live in a validated
    data artifact, so that I never edit a shared source registry to add a paper.
11. As an import Agent, I want one current Job receipt to tell me what is done
    and what is next, so that I do not depend on remembered command ordering.
12. As an import Agent, I want each stage to name its required input and
    observable completion result, so that process exit code is never mistaken
    for publication success.
13. As an import Agent, I want deterministic stages to advance automatically,
    so that I spend time on source reading and teaching semantics.
14. As an import Agent, I want bounded retry behavior with stable diagnostics,
    so that repeated gate failures stop instead of looping or mutating standards.
15. As an import Agent, I want source-file changes to invalidate downstream
    receipts, so that stale confirmation or Canonical artifacts cannot survive
    changed source bytes.
16. As an import Agent, I want the current Canonical authority selected by the
    Job, so that I do not copy an old authority block from another paper.
17. As an import Agent, I want to submit source-backed interpretation rather
    than a hand-authored Canonical Paper, so that the compiler remains the
    semantic trust seam.
18. As an import Agent, I want text, real tables, `framed_columns`, Passage
    Figures, and Reading Option Figures to have explicit routes, so that visual
    appearance does not collapse every object into a screenshot.
19. As an import Agent, I want every visual route to retain an exact source
    crop, so that reconstruction is never the only evidence.
20. As an import Agent, I want `source_crop` to be the normal first candidate,
    so that a legible original is not needlessly redrawn.
21. As an import Agent, I want reconstructed candidates to be optional and
    reason-triggered, so that every paper does not pay for three visual methods.
22. As an import Agent, I want PDF image bytes and placement matrices extracted
    deterministically when available, so that I do not tune CSS by eye.
23. As an import Agent, I want page-region crops to retain PDF coordinates and
    physical intent when embedded image objects are unavailable, so that source
    placement remains evidence-bound.
24. As an import Agent, I want a visual candidate attached to a stable Passage
    or Reading Option owner, so that images cannot drift to another question.
25. As an import Agent, I want rejected, missing, or changed visual decisions to
    leave the Job unresolved, so that finishing never outranks fidelity.
26. As a teacher confirmer, I want to compare candidates at normal target size,
    so that enlargement does not hide poor paper readability.
27. As a teacher confirmer, I want to confirm exact candidate digests, so that a
    later rerun cannot substitute different bytes.
28. As a teacher confirmer, I want to accept only source crops when they are
    already faithful, so that I am not forced to choose generated artwork.
29. As a teacher confirmer, I want the comparison to preserve renderer-owned
    stems and labels, so that I judge the figure rather than a flattened strip.
30. As a teacher confirmer, I want every unresolved visual relationship named,
    so that I know why the Job cannot resume.
31. As a teacher, I want Screen, Student Print, Teacher Print, and PDF to consume
    the same confirmed Canonical Paper, so that classroom and paper outputs do
    not disagree.
32. As a teacher, I want source-authored question numbers and Option labels to
    remain real renderer text, so that normal paper typography stays consistent.
33. As a teacher, I want source-authored physical figure placement retained
    without consumer-added crop or stretch, so that visual meaning is preserved.
34. As a teacher, I want Student output to hide answer identity while Teacher
    output retains it, so that the new Job does not weaken version separation.
35. As a teacher, I want exact Screen, Print, and PDF QA links prepared, so that
    I do not reconstruct local services or focus state.
36. As a student, I want image options readable at normal paper size, so that I
    can answer without opening a detached source screenshot.
37. As a student, I want the original differences between figures preserved, so
    that generated cleanup does not change the question.
38. As a developer, I want one public Import Job seam to exercise the workflow,
    so that tests do not couple to internal script order.
39. As a developer, I want existing Candidate, Confirmation, Compiler,
    Publisher, and Consumption modules reused internally, so that a coordinator
    does not become a second semantic implementation.
40. As a developer, I want paper-specific inputs represented as data rather
    than code, so that adding a paper does not change shared source files.
41. As a developer, I want the Shenzhen Q33 result reproduced without a Q33-only
    materializer, so that the first canary becomes proof rather than precedent.
42. As a developer, I want `paper-2026-i` replayed through the same Job, so that
    whole-paper orchestration is proved beyond one Figure Option.
43. As a developer, I want novel schema, ownership, source format, or renderer
    behavior to fail closed into a shared-contract task, so that data addition
    and shared change remain distinct.
44. As a reviewer, I want initial module changes tested at the public Job seam,
    so that implementation refactors do not rewrite the behavior contract.
45. As a reviewer, I want subsequent same-shape papers verified by narrow
    deterministic checks and one real canary, so that safety cost is paid once.
46. As a maintainer, I want obsolete paper-specific registries and materializers
    removed after parity is proved, so that the new module produces net
    locality rather than another layer.
47. As a maintainer, I want no website import UI or runtime model endpoint, so
    that production remains consume-only.
48. As a maintainer, I want no new status database, so that the existing folder
    interface remains the durable operational record.
49. As a maintainer, I want source passages and answer contents excluded from
    status receipts and planning documents, so that evidence stays in its
    bounded paper package.
50. As an operator, I want the Job to stop after local publication and QA
    preparation, so that production shipping still requires separate current
    owner authorization.

## Implementation Decisions

### 1. Relationship to existing authority

- This spec is a narrow successor to the accepted Import Agentization spec. It
  does not replace the Agent Contract, the folder-probe console, the six-state
  lifecycle, or production authorization rules.
- It consumes the implemented source-faithful visual-import capability. It does
  not reopen Reading Figure Option semantics, Screen/Print/PDF rendering, or
  the exact visual Teacher Confirmation contract.
- Format② remains the existing white-listed PDF paper plus independent answer
  PDF source format. Other source formats do not enter this module.

### 2. One external seam

- Build one `Format 2 Import Job` module. Its interface contains two operations:
  start or continue a Job before visual Teacher Confirmation, and resume the
  same Job with an exact Teacher Confirmation receipt.
- The start operation accepts only the supported source identities, paperId,
  provenance, and the current durable Job state. The resume operation accepts
  the same Job identity plus a confirmation bound to the exact candidate
  package digest.
- Both operations return one observable Job result containing lifecycle status,
  stop reason, diagnostics, exact produced artifact identities, and prepared
  human entry points. Callers do not select internal adapters, authority
  versions, renderer modes, command order, or storage paths.
- The module earns its seam by owning orchestration, state transitions,
  invalidation, idempotency, retries, and stop conditions. It must not be a
  pass-through that merely prints the old runbook commands.

### 3. Existing lifecycle, explicit stop reasons

- Preserve the accepted lifecycle: `queued`, `importing`, `awaiting_qa`,
  `ready_to_ship`, `shipped`, or `failed`.
- Teacher Confirmation is a stop reason while the durable lifecycle remains
  `importing`; it does not create a seventh status or a second status database.
- The existing help-needed signal points to the exact local comparison and
  candidate package when confirmation is required. The candidate and
  confirmation artifacts, not the small signal receipt, carry detailed source
  evidence.
- Final Owner QA remains the transition from `awaiting_qa` to `ready_to_ship`.
  The Job does not write the QA-accepted receipt on the Owner's behalf.

### 4. Per-paper data replaces per-paper source code

- Define a versioned Format② transcription artifact stored with the paper Job.
  It carries source-backed group content, questions, options, answer references,
  listening material, writing material, visual placeholders, and provenance
  needed by the trusted Format② source adapter.
- The transcription artifact is an Import Candidate input, not a Canonical
  Paper. Stable identities, normalization, profile binding, answer coverage,
  and Canonical semantics remain compiler-owned.
- Adding a same-shape paper may create or change only its source files,
  per-paper evidence, analyses, candidate/confirmation artifacts, and local
  publication data. It may not add a paperId branch to shared code.
- Existing hardcoded per-paper Format② registry entries are migrated to the
  per-paper artifact only when used as the parity canaries for this module.

### 5. Agent work versus deterministic module work

- The coding Agent reads the source PDFs, transcribes source meaning, preserves
  literal source quirks, produces contract-shaped Analysis, identifies visual
  ownership, and records source-truth relationships.
- The module validates shapes, binds source identities and digests, advances
  mechanical gates, chooses current authority, compiles, publishes locally,
  reloads, and prepares render evidence.
- The module does not call a hosted LLM or image model. Agent model execution
  remains in the coding-agent session under the existing Agent Contract.
- The module never solves objective questions. Official answers come only from
  the admitted answer PDF and the required transcription check.

### 6. Source and answer trust

- Paper PDF and answer PDF exact bytes are captured before interpretation.
  Changed source bytes invalidate every downstream transcription, candidate,
  confirmation, Canonical artifact, and prepared QA receipt.
- The answer PDF remains mandatory. Missing answer source blocks the Job before
  Analysis or publication.
- Answer transcription retains source identity and complete objective coverage.
  AI reasoning may diagnose a mismatch but never becomes answer authority.
- Source typos and inconsistent names are preserved unless an explicit,
  source-bound Teacher Confirmation authorizes a semantic correction.

### 7. Visual routing inside the Job

- Route real text, rectangular tables, accepted `framed_columns`, Passage
  Figures, and Reading Option Figures using the existing vocabulary before
  candidate generation.
- Every visual observation has one immutable source crop or exact embedded
  source image, one Source Capture lineage, and one stable semantic owner.
- Reading Figure Options remain homogeneous A–D sets. Mixed text/figure Options,
  multiple figures per Option, or unsupported owner kinds block the Job.
- The visual route never uses correct-answer identity to associate images with
  Options.

### 8. Source-crop-first candidate policy

- `source_crop` is required and is the default sole candidate when the original
  is legible at the intended physical size.
- `vector_authored` and `reference_restored` are optional alternatives, not a
  per-paper checklist requirement. They are added only for a recorded
  legibility problem or an explicit Owner request.
- All methods follow the same exact-byte Candidate and Teacher Confirmation
  interface. No method receives automatic preference from the Job.
- Automatic edge trim, white-to-transparency rewrite, relabeling, redrawing,
  visual scoring, or candidate self-approval remains forbidden.

### 9. PDF-derived physical layout

- When the source PDF exposes independent image objects, bind their exact bytes,
  object identities, page numbers, placement matrices, and point-space geometry.
- When a visual exists only as a page region, preserve the high-resolution crop
  plus its exact PDF page-region coordinates and physical target intent.
- Source-measured placement is selected by evidence, not by paperId. Screen and
  Print/PDF consume the same bound layout intent.
- The existing generic Figure Option layout is used only for a contract-compatible
  set without usable source-measured placement. The Job may not invent one-off
  CSS offsets, image dimensions, or renderer branches.

### 10. Candidate and Teacher Confirmation

- Visual Candidate creation and exact confirmation remain the sole visual trust
  interface. The Job supplies validated observations and candidates to that
  module and consumes only a confirmed selection.
- A missing, rejected, stale, owner-mismatched, dimension-mismatched, or
  digest-mismatched decision leaves the Job stopped with zero Canonical media
  admission.
- The comparison package shows source and available alternatives at the same
  normal physical target size with renderer-owned text and labels.
- Resume verifies the whole candidate-package digest before any downstream
  artifact is reused or written.

### 11. Canonical compilation and local publication

- The Job calls the existing Canonical compiler and public publisher; it does
  not construct Canonical Question Groups, media closure, paper plans, or
  publication manifests itself.
- The compiler remains responsible for Import Candidate diagnostics, Teacher
  Confirmation, stable identity, complete Canonical Paper semantics, and
  renderer-neutral consumption.
- The publisher remains responsible for pre-write validation, one whole-paper
  atomic publication, recovery, retry, exact reload, and rollback capability.
- Local publication success is proved by exact committed reload, not process
  exit code or a console string.
- The Job stops after preparing the local QA state. Production shipping and its
  receipts remain outside this interface.

### 12. Idempotency and invalidation

- Each durable stage receipt binds the Job identity, input digests, authority,
  produced artifact digests, disposition, and next stop reason.
- Repeating a stage with identical inputs returns the same artifact identities
  or a proven no-op.
- A changed upstream digest invalidates all dependent receipts; the Job never
  mixes old confirmation with new source, old Analysis with new transcription,
  or old layout intent with new media bytes.
- Interrupted local publication uses existing recovery before retry. The Job
  does not delete or overwrite an immutable completed publication to recover.

### 13. Import console behavior

- The local import console continues to read the existing folder interface and
  remains separate from the website.
- While Teacher Confirmation is required, the console may show the concise
  help-needed question, exact comparison entry point, package digest, and resume
  instruction. It must not expose full passages or answer content in a status
  receipt.
- At `awaiting_qa`, the console points to exact Screen, Student/Teacher Print,
  PDF, gate summary, paperId, and first focus state.
- The console has no candidate auto-accept, production button, background model
  invocation, or direct database mutation.

### 14. Compatibility and removal

- Existing published papers remain consumable under their immutable authority.
  This module changes how new Format② jobs are prepared, not historical
  publication meaning.
- Shenzhen Q33 must produce the already accepted candidate digests, Option/media
  identities, source layout intent, and Screen/Print/PDF semantics when replayed
  from identical evidence.
- `paper-2026-i` must reproduce its accepted whole-paper public semantics from
  the new per-paper transcription artifact without a shared registry entry.
- After parity tests pass, remove or retire the Q33-specific Canonical
  materialization path and migrated hardcoded Format② registry entries. Do not
  leave both as supported production paths.

### 15. Proportionate execution lane

- Building this shared Import Job is an import/persistence orchestration change.
  Its implementation receives affected public-seam checks, the final full
  repository gate, and one independent Standards/Spec review.
- After the shared module is accepted, a same-shape Format② paper is a data
  addition: deterministic input validation, exact Candidate/Confirmation,
  atomic publish/reload, one real paper canary, and Owner QA are sufficient.
- A paper that requires a new source adapter, Canonical shape, owner kind,
  renderer behavior, authority version, or publication write pattern escalates
  out of the data-addition lane before mutation.

## Testing Decisions

### Test philosophy

- Test observable behavior through the `Format 2 Import Job` interface. Tests
  should not assert command order, helper calls, private receipt layout, prompt
  wording, or internal adapter composition.
- The highest useful seam is the Job result plus its durable public artifacts:
  lifecycle status, stop reason, diagnostics, exact identities, local
  publication reload, and prepared QA entry points.
- Existing module tests remain only for failures that are uniquely owned below
  the Job seam, such as PNG integrity, exact candidate confirmation, Canonical
  compilation, and atomic publisher recovery.

### Generic Job fixture

- A compact synthetic Format② fixture exercises text, one real table, one
  `framed_columns` block, one Passage Figure, one Reading Figure Option set,
  objective answers, listening raw material, and writing material without
  embedding a full copyrighted paper in the test source.
- Starting the fixture advances through deterministic stages and stops before
  visual Teacher Confirmation with zero local publication.
- Exact confirmation resumes the same Job to a ready Canonical Paper, atomic
  local publication, exact reload, and `awaiting_qa`.

### Public-seam negative cases

- Missing or changed paper PDF, missing answer PDF, changed answer digest,
  incomplete objective coverage, unsupported format, unsafe paperId, stale
  authority, and a second writer all fail before publication.
- Invalid per-paper transcription, mixed Question identities, missing groups,
  unsupported visual ownership, mixed text/figure Options, duplicate media,
  changed PNG bytes, wrong dimensions, changed layout evidence, and stale
  confirmation all fail closed at the Job seam.
- A source or candidate mutation after confirmation invalidates downstream
  receipts and cannot retain `awaiting_qa`.
- Process success without exact committed reload is reported as failure.

### Pause, resume, retry, and recovery

- The same pre-confirmation inputs reproduce the same candidate package digest
  and do not duplicate artifacts.
- A rejected or incomplete Teacher Confirmation leaves the Job in `importing`
  with the exact stop reason and zero Canonical media admission.
- An exact confirmation can resume after process restart using only durable Job
  evidence.
- An interrupted local publish recovers and retries idempotently; a conflict
  with a different immutable publication fails without overwriting it.
- Repeating a completed local Job returns the exact committed publication and
  QA identities as a no-op.

### Q33 parity canary

- Replay Shenzhen Q33 through the generic Job without invoking a Q33-specific
  materializer.
- The accepted four source-crop digests, owner associations, Canonical
  Option/media identities, original-PDF point geometry, normal `400` Reading
  typography, zero `[Fig.]`, and answer separation remain unchanged.
- Screen, Student Print, Teacher Print, and PDF use the same four exact images
  and placement intent. Visual acceptance remains the existing Owner-confirmed
  result; the replay does not ask the model to reapprove it.

### Whole-paper Format② parity canary

- Replay `paper-2026-i` through the same Job using a per-paper transcription
  artifact rather than a shared source registry entry.
- The Job proves required group structure, answer coverage, listening/raw
  figure material, Canonical compilation, atomic local publication, exact
  reload, and representative Screen/Print/PDF consumption.
- The parity test must not publish production data or replace the developer's
  live database; it uses an isolated local store and exact source identities.

### No-paper-code conformance

- A verifier proves that the two parity papers and one synthetic fixture are
  selected through data identity, not paperId branches in shared modules.
- Adding a third same-shape fixture requires only a new per-paper artifact and
  source evidence. The test fails if shared implementation, renderer CSS,
  authority, or a paper-specific verifier must change.
- Once parity is proved, supported old registry/materializer paths are removed;
  tests target the replacement Job interface rather than layering duplicate
  assertions over both paths.

### Rendered behavior and Owner QA

- One actual-paper canary proves the prepared Screen, Student Print, Teacher
  Print, and browser-generated PDF at normal size.
- Student output contains no answer or Analysis leakage. Teacher output carries
  the admitted answer behavior without changing confirmed media.
- The Job prepares exact service, paperId, URL, first focus state, Print views,
  PDF, comparison entry point when applicable, and one concise gate summary.
- Automation verifies that the state is usable but cannot write the Owner QA
  acceptance receipt.

### Repository gates

- During initial implementation, run the focused Import Job behavioral suite,
  existing Candidate/Confirmation and Canonical import seams, atomic publisher
  recovery checks, and affected actual-paper canaries.
- The final initial implementation gate runs the full repository suite and one
  independent Standards/Spec review because orchestration reaches local
  persistence and shared import behavior.
- Every `SKIP` remains literal. Unrelated failures are reported, not weakened or
  silently reclassified.
- After module acceptance, ordinary same-shape paper additions use the narrow
  data-addition gate and Owner QA; full suite and independent review return only
  when shared behavior changes or the Job escalates the paper.

## Out of Scope

- Format① DOCX answer papers or format③ paper/answer DOCX pairs.
- A fourth source format, scanned-image-only papers, automatic OCR pipelines,
  or automatic whole-document visual-region discovery.
- Finding source papers, downloading papers, cloud storage ingestion, or remote
  account integration.
- A long-running background import service, hosted LLM endpoint, runtime image
  model, model queue, or multi-agent scheduler product.
- Multiple concurrent writers for one paperId or a productized multi-paper
  parallel execution system.
- Automatic answer solving, answer inference from visual content, or replacing
  the admitted answer PDF with model judgment.
- Automatic visual correctness scoring, candidate self-approval, or removing
  exact Teacher Confirmation.
- Requiring vector-authored or reference-restored alternatives for every visual
  object.
- New Figure owner kinds, mixed text/figure Options, non-Reading image Options,
  arbitrary rich Option content, public SVG, interactive media, audio, or video.
- A visual editor, crop-adjustment UI, layout designer, or per-paper CSS panel.
- Changes to shared PaperSurface, Print/PDF rendering, Reading Figure Option
  semantics, or current visual authority unless a failing novel shape is first
  escalated into a separate shared-contract task.
- Restoring website import UI or exposing import production actions in the
  consumer app.
- Production deployment, production database mutation, R2 mutation, content
  shipping, merge, rollback UI, or writing QA/shipped receipts without current
  Owner authorization.
- Migrating every historical paper or deleting immutable historical
  Publications.
- New Analysis pedagogy, scoring models, search dimensions, tags, difficulty,
  genre classification policy, or writing-content contracts.

## Further Notes

- The accepted Import Agentization spec remains the product authority for the
  owner workflow and six-state local console. This spec closes one concrete
  implementation gap: format② still requires per-paper source code and manual
  orchestration.
- The source-faithful visual-import implementation paid the shared-contract cost
  once. Future same-shaped image papers should exercise that contract as data,
  not repeat its schema, renderer, authority, full-suite, and review work.
- Q33-specific scripts and evidence are valuable parity oracles. They are not
  the target interface for the next paper.
- The implementation should create net locality: after canary parity, deleting
  the new Import Job should make orchestration complexity reappear across many
  call sites; deleting a legacy per-paper materializer should not remove any
  supported capability.
- This spec is ready to split with `to-tickets` after Owner review. Ticket
  publication is separate; this spec does not pre-authorize automatic task
  dispatch, implementation, merge, or production action.
