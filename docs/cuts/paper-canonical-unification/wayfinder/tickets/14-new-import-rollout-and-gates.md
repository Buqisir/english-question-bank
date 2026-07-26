# 制定新导入 hard gate 与逐题型竖切路线

Status: closed
Type: grilling
Claim: claimed
Blocked by: 定义七选五 canonical variant 与双卷 proof 合同; 定义阅读 canonical variant 与图表 proof 合同; 定义应用文 canonical variant 与 given skeleton 合同; 定义读后续写 canonical variant 与 starters 合同; 定义听力 raw/inactive 插槽与未来 activation seam; 定义原子 sidecar 发布、consumer selector 与回滚合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/15-latest-migration-and-legacy-retirement.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What exact sequence, proof assets, behavioral seams, review gates, browser evidence, actual PDF/DOCX checks, and stop conditions make each accepted family independently shippable while immediately preventing new non-canonical imports? Preserve the owner-approved order and distinguish foundation work from family vertical slices. Include a bounded conformance pass for the existing cloze/grammar reference implementation before its pattern is copied: the owner-observed cloze option alignment failure must be closed across its affected renderers without regressing canonical semantics. The accepted A–D selector must prove identical mode decisions and non-wrapping invariants on its gold-reference plus real-corpus fixtures across Screen/Print, PDF, and DOCX. Seven Choices cannot pass while any renderer creates a per-blank A–D layer or emits the shared A–G bank more than once within one rendered question-group occurrence. Define when a family may enter the publish hard gate, how incomplete or `needs_review` packages remain zero-write, and what full-suite/independent-review/owner-QA evidence is required before advancing to the next family.

## Resolution

### 两层开关，而不是半 canonical 发布

把“题型实现可发布”和“新卷允许 publish”分开：

1. 一个题型 slice 只有在自己的 compiler、projection、三类 renderer、真实
   proof、独立审查与必要 owner QA 都通过后，才可在唯一 checked-in Consumer
   Contract 中声明 implementation `available`。这表示代码可安全随产品发布，
   不表示任何 source paper 已 canonical，也不允许 renderer 用 runtime flag、
   paper/group allowlist 或字段探测自行启用它。
2. 新导入保持一个整卷 admission latch。只有当前 Profile 的全部 required
   active families 都 `available`、所有 required Inactive Source Slots 都有
   closed implementation，并且本次 `compileCanonicalPaper(...)` 返回完整
   `ready` Publication，latch 才允许这一次 write。不存在“已完成题型写
   canonical、未完成题型继续写 legacy”的新卷。

因此每个 slice 可以独立合并、回滚和验证；但 rollout 前所有新导入仍走既有
路径，rollout 打开 latch 的同一 checkpoint 起，目标 Profile 的新导入缺少完整
Canonical Paper Publication 就硬失败。后续回滚若无法恢复上一份兼容的
canonical Consumer Contract，只能把新导入关成 unavailable，绝不能重新放行
non-canonical import。33 套现有 `latest` 的选择与迁移仍归下一票。

### 固定实施顺序

顺序严格为：

1. **Foundation A — authority/evidence/publication backbone**：机器 authority
   manifest、Source Capture/Span/Transformation Record、三个 versioned
   Profiles、complete-only Plan、shared Group envelope/rich content、纯
   `compileCanonicalPaper(request)`、`projectCanonicalPaper(...)`、原子
   Publication/publisher validator、共享 `loadPaperForConsumption(...)` 与精确
   Consumer Contract。先以 invented/redacted whole-paper fixtures 证明
   `ready` 和四类 blocked disposition；此阶段不改变现有 consumer 选择，也不
   打开新导入。
2. **Foundation B — reference conformance + A–D selector**：把现有
   cloze/grammarFill reference 收拢到上述 whole-paper interface，删除其
   group allowlist、on-the-fly compatibility normalization 和
   renderer-local fallback pattern；实现唯一 `layoutAbcdOptionSet(...)`。
   关闭当前 cloze Screen、Print/PDF、DOCX 列对齐失败，同时以 unchanged
   canonical semantic digest/source map/question-option order 证明这只是
   renderer conformance 修复。Foundation B 通过前，不得复制现有 pattern。
3. **Seven Choices vertical slice**。
4. **Reading vertical slice**。
5. **Application Writing vertical slice**。
6. **Continuation Writing vertical slice**。
7. **Listening required raw/inactive closure slice**；它仍生成零 Question
   Groups、零 current-surface occurrences。
8. **New-import rollout**：在 public publisher seam 打开整卷 canonical-required
   admission，更新 agent runbook/mechanical pipeline，并用一套新 source
   package 做 dry-run、zero-write blocked proofs、successful local publish、
   reload 与 rollback/retry。此步先于任何 33-`latest` migration。

Foundation 是所有题型共享且只实现一次的 deep Modules 与 reference
conformance；题型 vertical slice 必须从 Source Capture adapter/contract 一直
贯穿 compiler、Publication、shared projector、Screen/Print/PDF/DOCX，不得拆成
schema/React/export 横向阶段。后一题型不得在前一 checkpoint 未关闭时开始。

### 每个题型进入 publish hard gate 的统一资格

题型 implementation 只有同时满足以下条件才可标为 `available`：

- 一个 canonical-only invented fixture 不含 legacy marker、fallback field 或
  Analysis，能通过 public compiler/Publication loader 到所有适用 surfaces；
- 每个已选 hash-bound real proof 从 source closure 编译为 `ready`；旧
  `paper-asset-v1` 字段只能作为 migration lead，不能冒充 Source Capture；
- `needs_review`、`unsupported`、`incomplete_source`、`answer_conflict` 及
  authority/profile/digest mismatch 均在 compiler/loader interface 上有行为
  测试，且不能泄出 Plan、Group、semantic digest 或 partial Consumption Plan；
- 四面共享一个 semantic/anchor/occurrence signature；renderer 不解析 marker、
  猜 profile/heading/skeleton/starter、重建 bank/table/figure 或用 Analysis
  改变 semantics；
- family-specific negative fixtures、source-map coverage、determinism、
  input immutability、student/teacher semantic parity 和 legacy-capability
  rollback 都通过；
- focused checks、app build、`git diff --check`、当前
  `pnpm -C app run verify:all` 全绿；声明的环境性 SKIP 按字面保留，不能记成
  PASS；
- 因每个 visible slice 都触及 data contract、PaperSurface、Print/PDF 与
  DOCX，完成一条以该 slice implementation base 为 fixed point 的 fresh
  `$code-review` lineage；Must Fix 修复后只做同 lineage focused re-review；
- review 通过的 exact HEAD 已由当前任务 provision 到 `qa-local-owner`。Owner
  对 plain/lecture Screen、actual A4 preview/PDF 和 actual DOCX-converted PDF
  的不超过五项 checklist 给出接受；失败就留在当前 slice。

Listening inactive 没有可接受的 current UI/renderer，所以不伪造 browser
owner QA；它以独立审查、full suite、complete Plan 和 Screen/Print/PDF/DOCX
均为零 listening occurrence 的 actual whole-paper proof 收口。New-import
rollout 还要做一次 integrated owner QA，覆盖一套完整新卷的 Screen、
student/teacher Print PDF 与 student/teacher DOCX。

### 固定 proof register

| Checkpoint | Real proof candidates (source closure still required) | Required negative/boundary proofs |
| --- | --- | --- |
| Reference cloze/grammar | `paper-2026-i` cloze + grammarFill；`paper-960d0f8d` label-marker grammarFill；NEEA reference page 9 cloze | malformed/duplicate/ambiguous markers、hint conflict、protected prose numbers、stale source fingerprint |
| A–D selector | NEEA page 4 q21/q22/q23 = `four_columns` / `one_column` / `two_by_two`；page 9 fifteen-row cloze = all `four_columns`；hash-bound current 1035-set census | synthetic unbreakable full-width overflow、hard break、missing glyph/font closure、unsupported content node |
| Seven Choices | `paper-2026-i / group-2026-i-seven-choices` and `paper-960d0f8d / group-960d0f8d-seven-choices` | reproduced legacy `7,7,7,7,7` repeated-bank projection、stray ordinals、unregistered marker、answer conflict |
| Reading | `paper-2026-i / group-2026-i-reading-c` prose and `/group-2026-i-reading-a` title/subtitle + 4×3 table | flattened-marker/placeholder bridge、ambiguous heading/grid/figure placement、missing media/answer closure、hybrid A–D row |
| Application Writing | `paper-2026-i / group-2026-i-writing-application` and `paper-960d0f8d / group-960d0f8d-writing-application` | genre/background-inferred skeleton、missing/conflicting word ruling、bad fixed-part order、Analysis intrusion |
| Continuation Writing | `paper-2026-i / group-2026-i-writing-continuation` and `paper-zj-2020-jul / group-zj-2020-jul-writing-continuation` | `paper-zj-2022-jun` polluted three-entry array、unproven zero starters、wrong Profile/cardinality、Analysis intrusion |
| Listening inactive | `paper-2026-i` 5+15 questions, 20 answers, ten transcript segments, supplied timing, closed no-audio inventory | missing/referenced-but-absent audio、missing timing evidence、overlapping transcript join、answer conflict、non-NCK1 shape |

Real `latest` assets without immutable document/answer closure cannot be
upgraded from compatibility evidence to a publish-positive proof. The slice
must recapture the named source or stop with `incomplete_source`; it may not
weaken the gate or fabricate a Source Span. Full passages/answers stay out of
tracked proof records; retain ids, roles, hashes, counts, semantic signatures
and minimal diagnostics.

### A–D selector conformance

所有 1035 个 current A–D sets 先经同一个 pinned-font/fixed-twip selector
产生 logical placement plan；Screen/Print、PDF 与 DOCX Adapters 只能翻译该
plan，不能重新测量或重选。四类 projection 对每个 set 必须有相同
`mode + row + column + option order` signature。实际渲染使用金样 q21–q23、
十五行 cloze 以及每种 mode 的 corpus boundary fixtures：

- `four_columns` / `two_by_two` 每项必须单行、无 hard break、无 CSS auto-flow
  或 hybrid late row；任一项不 fit 时整组降级；
- `one_column` 只可在合法 break opportunity 使用 420-twip hanging wrap，
  保留显式换行；不可分割 overflow 为 `needs_review`，不裁切、不缩字；
- Screen 与 Print HTML 检查 computed grid/nowrap/placement；Vivliostyle actual
  A4 PDF 检查文字坐标与无 clipping；DOCX 检查原生 tab stop/hanging OOXML，
  再经 LibreOffice 转 actual PDF；
- dense-mode 点位与共同 twip plan 的误差不超过 1pt，十五行 cloze 同列
  x-spread 不超过 0.5pt；任一 surface mode/signature 不同即停止。

selector 输出不进入 canonical semantic digest。Foundation B 必须先证明修复
前后 cloze/reading Question、Option、answer、source-map、semantic order 与
digest 不变，再接受视觉变化。

### Seven Choices 的额外硬门禁

每个 rendered Question Group occurrence 在 plain/lecture Screen、
student/teacher Print HTML/PDF 和 student/teacher DOCX 中都必须同时满足：

- 五个 ordered Question/Blank anchors；
- 零 per-question choice set，因而不可能出现 per-blank A–D 或 A–G layer；
- 恰好一个 group-owned A–G bank、七个 Option anchors；
- bank 不嵌套在 blank/question，不因 page break、teacher supplement 或 draft
  continuous numbering 被复制。

以 occurrence/anchor signature 做行为断言，并对 actual PDF page objects 与
DOCX OOXML 再计数；只数源 JSON 或只做 string snapshot 不能通过。本票查明的
真实旧输出 A–G labels 各五次必须作为 negative regression 保留。

### New-import admission 与 zero-write

public `publishPaperImportPackage(...)` 自身必须无条件调用同一 admission
Module；runbook、CLI 或预检脚本不能成为唯一门禁。顺序固定为：

```text
immutable source package
→ pure compile + authority/profile/family closure
→ seal complete Publication in memory
→ validate complete Publication through public loader
→ only then stage immutable versions/vN
→ reopen and validate staged version
→ DB transaction + journaled latest/ref swap
→ reload exact committed publication
```

`ready` 要求 Plan `complete`、所有 required active slots 正好绑定一组、所有
required inactive slots 有 closed source closure、Publication 全部 digest/
schema/authority refs 完整，且 Consumer Contract 支持每个 family。旧 package、
缺 sidecar、partial family、unknown authority 或任何 blocked disposition
一律返回结构化 validation failure；新导入没有 legacy fallback。

对四类 blocked disposition、`needs_review` family、缺 family capability、
stale publication 和 injected authority/profile mismatch，测试在调用前后
比较目标 paper 的 DB rows/version refs、paper-assets tree、`latest` bytes、
version directory 与 swap journal：全部 byte-for-byte 不变，也不得先创建
“待 review”版本。允许返回 Source Capture + Normalization Report 给 operator，
但它们只在内存或显式 dry-run 输出中，不进入 published store。

`ready` 后的 filesystem/DB crash 继续遵守原子 Publication 票的 recovery：
pre-commit 恢复旧 latest 并删未提交 version，post-commit recovery 完成目标，
相同 retry identity 幂等，冲突 digest fail closed。rollout 必须用 public seam
做 forced failure、process-exit recovery、retry、stale-load 和 prior-publication
rollback，不接受直接调 storage helper 的替代证明。

### Actual evidence 与 stop conditions

每个 visible checkpoint 的 durable QA record 至少保存：exact worktree/branch/
reviewed HEAD、proof ids 与 source/publication hashes、focused commands/exit
codes、四面 semantic signature、浏览器 route/viewport/computed facts、actual
PDF/DOCX hashes/page spans、OOXML/coordinate checks、owner verdict、full-suite
`PASS / SKIP / FAIL`。图片和大文件可留 gitignored session evidence，tracked
记录只保留可复算 facts 与安全 hashes。

出现以下任一项，当前 slice 保持未通过，不能开始下一题型：

- authority/profile/family contract、source bytes/roles、official-answer closure
  或 proof hash 不一致；
- compiler 产出 partial package，或 renderer/loader 出现 group/field-level、
  `canonical ?? legacy`、projection 后 fallback；
- canonical semantic digest 随 renderer、student/teacher、Analysis 或 A–D
  mode 改变；
- A–D mode/row/order 不同、dense option wrapping、hybrid row、超 tolerance
  点位、clipping/缩字；
- Seven Choices 出现任一 per-question option layer、bank occurrence 不等于一
  或 anchor 不守恒；
- actual browser/PDF/DOCX 无法生成、打开、转换或检查，或出现 pagination、
  anchor、answer visibility、writing response-region regression；
- blocked import 写入任何 DB/version/latest/journal，或 crash/retry/rollback
  不能恢复同一完整 Publication；
- focused/full suite 有未声明 FAIL、independent review 尚有 Must Fix，或
  required owner QA 未接受。

这项决议不新增领域名词，不修改 `CONTEXT.md`，不把 33-`latest` batch、
source correction queue、legacy retirement 或生产/R2 mechanics 抢入本票；
这些仍由已声明的下一票决定。没有 Fog 因本答案而变成新的独立问题。
