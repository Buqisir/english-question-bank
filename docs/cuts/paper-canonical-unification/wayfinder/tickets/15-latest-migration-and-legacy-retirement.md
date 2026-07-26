# 制定 33 套 latest 存量迁移与 legacy 退役计划

Status: closed
Type: grilling
Claim: claimed
Blocked by: 盘点全库 latest 资产与所有生产消费变体; 定义原子 sidecar 发布、consumer selector 与回滚合同; 制定新导入 hard gate 与逐题型竖切路线
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/16-synthesize-closed-map.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How will all 33 current `latest` assets be compiled, reviewed, corrected, published, verified, and switched to canonical consumption without rewriting historical `versions/vN` or hiding failures? Define census checkpoints, profile assignment, per-family batches, `needs_review` queues, source/answer rechecks, semantic and visual parity, rollback, legacy fallback retirement, and completion accounting. A family may delete its legacy interpretation only after every in-scope latest asset and all three renderers pass the accepted parity contract.

## Resolution

### 迁移单位与不可越过的边界

迁移输入只由一次冻结的 `app/public/paper-assets/*/latest` census 决定，不由
import config、SQLite version record、runtime profile inference 或现存 legacy
allowlist 决定。当前基线仍是 33 套 `latest`、273 个 Question Groups、1530 道
客观题、1035 组逐题 A–D；实现时先生成一个 checked-in、可复算的 migration
manifest，逐卷绑定：

- `paperId`、全部 `latest` 文件路径/byte length/sha256 与整目录 digest；
- census 固定点、executable authority manifest、Profile、compiler、Consumer
  Contract 的精确 id/version/digest；
- question source、official-answer source、supplement/listening/figure 等待
  capture 的角色清单；
- Profile 候选、family/group/question 数及已知 anomaly ids；
- 每次 compilation、review decision、Publication、surface proof 与 rollback
  attempt 的不可变引用。

manifest 一旦冻结，新增、删除、改名或 byte drift 都停止本轮并触发新 census；
不能把第 34 套静默塞进分母，也不能因一套阻断就把它从分母移除。现有
`latest` 和任何历史 `versions/vN` 永不原位编辑。纠正 source、答案、boundary
或 metadata 必须产生新的 Source Capture、review decision、Transformation
Records 与新的 Canonical Paper Publication；缺失的历史 version 目录也不得按
SQLite 记录重造。

`compileCanonicalPaper(...)` 仍是唯一语义入口，且只接受 immutable source
documents/roles、operator assertions、prior review decisions 和 exact manifest
closure。一次调用只有两种迁移结果：

- `ready`：整卷 Profile/Plan、全部 required active Groups、required inactive
  source closure、source maps、Normalization Report 与 authority closure
  完整，才可 seal 一份 Publication；
- `needs_review | unsupported | incomplete_source | answer_conflict`：只保存
  Source Capture 和 Normalization Report 到迁移证据/队列，不产生 Plan、
  Groups、semantic digest、version、DB write 或 `latest`/ref swap。

因此调查和纠错可以按 family 分批，**发布与切换始终以一整卷 Publication 为
原子**。已迁移卷由共享 loader 选择其完整 canonical families；未迁移卷继续用
Consumer Contract 明示的 whole-family legacy capability。不得增加 paper/group
allowlist、runtime flag、`canonical ?? legacy`、field fallback，或把一个 family
的一部分 Groups 先切 canonical。

### 九个 blockers-first checkpoint

1. **M0 — 冻结 census 与旧状态**：重算 33 套 manifest、33 个
   `answer-key.json`、全部 asset/extras hashes、DB published refs 与真实
   filesystem version inventory。当前 census 已知 filesystem 中历史
   `versions/vN=0`、canonical sidecar=0，而 DB 有 39 条 version records；这类
   漂移作为显式 diagnostic，不能成为读取不存在目录的许可。保存切换前
   Consumer Contract、DB refs、`latest` tree digest 和 rollback proof。
2. **M1 — 重新 capture source/answer 并确认 Profile**：现有
   `paper-asset-v1`、`import-meta.json`、`answer-key.json` 和 Analysis 只是
   migration leads，不能冒充 question source bytes、official-answer bytes 或
   Source Spans。每卷分别 capture question source 与 official-answer source，
   关闭所有附件角色，再从 source-backed whole-paper structure 证明一个
   versioned Profile。只有 source evidence 与候选 shape 一致时才确认当前
   18 套 NCK1、9 套 national legacy、6 套 Zhejiang legacy；不得只靠
   reading/cloze 数量猜 Profile。
3. **M2 — 全量 compile-only dry run**：对冻结的 33 套逐一调用 public
   compiler，不写 store。所有 diagnostics 进入 disposition queue，并冻结
   baseline semantic/accounting signature。一次全量 dry run 必须满足
   `ready + needs_review + unsupported + incomplete_source + answer_conflict
   = 33`。
4. **M3 — 按 family 清队列**：依照下表的固定顺序，只处理当前 family 的
   source closure、exact normalization、review decision 和 parity proof。
   correction 后从新 Source Capture 重编整卷；不得在旧 canonical candidate
   上打补丁。当前 family 未清零前，不进入下一 family wave。
5. **M4 — 整卷 prepublication gate**：只有全部 required families 已在同一次
   compilation 中 `ready`、Plan `complete`、Publication integrity closure
   可由 public loader 重开，且四类 blocked zero-write、crash/retry 与 stale
   load proofs 通过，才允许为该卷 stage 新的 immutable version。新 version
   必须避开 filesystem 与 DB 已占用/保留的所有 version identities；不得覆盖
   或填补历史空洞。
6. **M5 — 四卷边界 canary**：先迁移并实际切换
   `paper-2026-i`（PDF、table/figure、listening inactive、media-type
   mismatch）、`paper-960d0f8d`（asset-only、mixed marker dialect）、
   `paper-2020-bing`（national legacy、无 writing Groups）和
   `paper-zj-2020-jul`（Zhejiang legacy、source-proven zero starters）。
   `paper-zj-2022-jun` 的污染三 starter 作为必须先阻断再凭 source 纠正的
   negative migration proof，不可因 canary 需要而放行。
7. **M6 — 剩余 profile cohorts**：canary 全部接受后，按结构复杂度依次迁移
   剩余 8 套 national legacy、5 套 Zhejiang legacy、16 套 NCK1。每一 cohort
   完成 compile → review/correct → seal → public loader reopen → atomic
   publish/swap → Screen/Print/PDF/DOCX reload → rollback drill 后才进入下一
   cohort。cohort 内仍逐卷原子；一卷失败会保持显式 blocked 并阻断整个
   cohort checkpoint，不回退成“部分 cohort 已完成”。
8. **M7 — 全量 closure**：33 套 canonical selection、全部 family 固定分母、
   disposition queues、actual artifact matrix、independent review 与 owner QA
   先共同闭合；这一步仍保留所有 legacy capabilities，专门证明下一步删除不会
   把 coverage 缺口藏起来。
9. **M8 — 逐 family 退役**：M7 通过后，才按 Cloze → Grammar Fill → Seven
   Choices → Reading → Application Writing → Continuation Writing 的顺序逐
   family 把
   Consumer Contract 的 legacy capability 从 `available` 改为 `retired`，
   删除对应 consumer-side legacy interpretation，并在 exact retirement HEAD
   重跑全量 proofs。Listening inactive 只证明三类 renderer 均为零 occurrence；
   它没有可删除的 current renderer。退役 source-format capture adapters、
   splitters、`packageBuilder` branches、`paper-asset-v1` 或历史
   `versions/vN` 不属于本次 consumer fallback 退役。

### Family waves、固定分母与已知 queue seeds

| Wave | In-scope denominator | 关闭条件与必须保留的已知异常 |
| --- | ---: | --- |
| Cloze reference | 33 Groups / 570 Questions | source/answer identity、marker 与 blank 一一对应；所有 A–D sets 进入共同 selector；不能把当前 renderer 漂移当 source 错 |
| Grammar Fill reference | 33 Groups / 330 Questions | blank/answer joins 全闭合；`paper-960d0f8d` 的 `NN._____` 和两个 grammar 孤立数字需 source-backed review |
| A–D conformance（横跨 Cloze + Reading） | 1035 sets | 680/328/27 current census 只是 migration baseline；同一 logical placement plan 在 Screen/Print、actual PDF、DOCX 均同 mode/row/column/order，无 hybrid/wrap/clipping |
| Seven Choices | 33 Groups / 165 Blanks / 33 shared A–G banks | 19 Groups 的 95 个 marker 后 ordinal 不能盲删；每个 rendered Group occurrence 恰好一个 bank、七个 Option anchors、零 per-Question choice set |
| Reading | 33 papers / 126 Groups / 465 Questions | 18 papers 的 49 个 heading suffix 全部 source review；`paper-2026-i` table/figure 要有原 page/region、native grid/media digest，不能接受 flattened bridge 冒充 closure |
| Application Writing | 24 Groups / 24 Writing Tasks；其余 9 套为 Profile-backed N/A | 不能从 genre/background 猜 Given Skeleton；空 skeleton、word ruling、prompt order 与 answer region 都回到 source |
| Continuation Writing | 24 Groups / 24 Writing Tasks；其余 9 套为 Profile-backed N/A | two-starter 与 plot-led zero-starter 均需 source proof；`paper-zj-2022-jun` 三条污染不得进入 ready |
| Listening inactive | 1 paper / 2 required Inactive Source Slots / 20 questions+answers / 10 transcript segments | `paper-2026-i` source roles、timing 与 no-audio inventory 闭合；Plan complete，但四面 occurrence 恒为零 |

六对 normalized writing payload 相同只创建 provenance-review diagnostics，
不跨卷 deduplicate；`paper-2026-i` 的 PDF bytes 与旧 declared `docx` assertion
并存并由 exact media detection 纠正 canonical fact；`paper-2020-yi`
config-only 不进入 33 套 migration corpus，`paper-960d0f8d` 即使没有 config
也不能从 corpus 消失。

### Review queue 与 source/answer 重核

队列是 durable migration evidence，不是 website import UI。每条 entry 至少
绑定 `paperId`、family/scope、capture/document/observation ids、source spans、
manifest/compiler digests、primary disposition、全部 diagnostics、允许的恢复
动作、review-decision id、重新编译 attempt 与最终状态；只保留安全的 minimal
diagnostics 和 hashes，不复制完整 passage 或答案。

- `incomplete_source` 只能通过补齐或重新 capture question source、
  official-answer source、缺页/附件解除。
- `answer_conflict` 对 1530 道客观题及 listening 20 项逐一把 canonical
  question identity 与 provenance-bearing official assertion 重 join；旧
  `answer-key.json`、Analysis、多数票和常识都无权裁决。Writing Model Answer
  仍是 Analysis，不是 official-answer authority。
- `unsupported` 只能由 owner-approved executable standard/implementation
  扩展解除；reviewer 不得手工把未知 dialect 塞进最接近的 family。
- `needs_review` 只允许 reviewer 在 evidence-complete 的候选 boundary、
  marker、Profile、identity 或 source quirk 间作显式、有 spans 的裁决。

状态流固定为 `queued → evidence_restored/review_decided → recompiled`；只有新的
whole-paper result 为 `ready` 才记 `cleared`。旧 attempt、旧 diagnostic 和
旧 capture 不删除。任何队列非空都显示在 completion report 中，并让相应
family/cohort/whole-paper 计数保持未完成。

### Semantic parity 与实际 renderer parity

legacy 输出不是无条件金标准：Seven Choices 重复 bank、Cloze 列错位、
flattened table、splitter 污染等已知缺陷必须按 source + accepted canonical
contract 修正。每个 canonical-vs-baseline diff 只能是：

1. source-backed semantic equality（identity/order/count/text/answer 不变）；或
2. 带 direct Source Span 或 exact Transformation Record 的 accepted
   correction。

除此之外都阻断。每卷生成 Profile/Plan、family、question/blank/bank、answer、
source-map、numbering/scoring/instruction/answer-region 与 student/teacher
visibility signature；Screen、Print/PDF 与 DOCX 必须消费同一 semantic/
anchor/occurrence signature。Analysis 不得改变任何 signature，A–D layout
mode 不进入 semantic digest。

全 33 套均需生成和检查真实 artifacts，而不是只查 JSON：

- real-click plain/lecture Screen DOM 与 computed placement；
- student/teacher Print HTML 和 actual A4 PDF；
- student/teacher DOCX、关键 OOXML 结构及 LibreOffice-converted actual PDF。

全 corpus 自动检查 family anchors、bank/option occurrences、answer visibility、
response regions、native table/figure、page/clipping 和 A–D placement。Owner QA
先接受四卷 canary，再在每个 remaining cohort 检查至少一个 profile/risk
boundary；它不能替代其余卷的 actual artifact automation。任何 renderer
无法生成/打开、signature 漂移、unknown SKIP、截图/坐标不闭合或 source-backed
correction 未获接受，都让该卷保持未切换。

### 切换、回滚与 legacy 退役

每卷 publish 沿用已接受的 stage → manifest-last → public-loader reopen →
immutable version rename → SQLite transaction + journaled ref/latest swap →
exact committed Publication reload。切换前后记录 store tree、DB rows/refs、
journal、Consumer Contract 与所有 artifact digests。失败处理为：

- pre-commit 恢复旧 ref/latest 并清除未提交 version；
- post-commit recovery 完成同一目标 Publication；
- identical retry idempotent，digest 冲突 fail closed；
- surface smoke 失败用同一 journal repoint 到已验证 prior Publication，或在
  legacy 尚 `available` 时恢复 exact prior Consumer Contract；sidecar 不原位
  修改。

cohort 出现共享缺陷时，按记录的 refs 回滚该 cohort 中本轮已切换的每一整卷，
保持上一 checkpoint，不继续下一 cohort。回滚不会把 blocked compiler 结果
包装成 legacy canonical success。

一个 consumer legacy family 只有在下列条件全满足后才能在同一 reviewed change
中标为 `retired` 并删除 interpretation：

- 该 family 的固定分母全部 `ready → published → canonical-selected`，N/A
  只能由 exact Profile 证明；
- 每个 in-scope `latest` 在 Screen、actual Print/PDF、actual DOCX 三类
  renderer 通过 accepted semantic/visual parity；
- 队列为零，所有 correction 有 source lineage，全部 actual artifacts 和
  hashes 可复算；
- fresh `$code-review` lineage 无 Must Fix，`pnpm -C app run verify:all` 与
  focused migration/recovery tests 没有未声明 FAIL，required owner QA 已接受；
- 上一份带 `legacy: available` 的 exact Git/Consumer Contract release 和
  prior Publication refs 已完成 rollback drill。

退役后缺失、损坏、不兼容或 stale canonical Publication 是显式 hard failure；
loader 不能复活已删 compatibility code。必要回滚只能部署上一份完整代码 +
Consumer Contract release，或 repoint 到兼容的 prior canonical Publication，
不能临时加 runtime flag。source-format adapters 因仍承担 immutable capture
职责，不因 consumer 退役而自动删除。

### Completion accounting

tracked migration ledger 同时提供 whole-paper、Profile、family、disposition、
Publication、surface 与 retirement 七张可交叉复算的视图。每个 denominator
都满足：

```text
pending + blocked + ready_unpublished + published_unverified
+ canonical_selected + rolled_back = in_scope
```

一套卷只有 source/answer/Profile closure、整卷 `ready`、原子 Publication、
exact reload、三类 renderer parity 与 cohort gate 全通过后才进入
`canonical_selected`。最终完成要求同时为：

- census/profile/source/official-answer closure：33/33；
- whole-paper Publications 与 canonical selection：33/33；
- family matrix：Cloze 33、Grammar Fill 33、Seven Choices 33、Reading
  33/126 Groups、Application 24、Continuation 24、Listening inactive
  1 paper/2 slots，所有 exact N/A 有 Profile proof；
- objective/placement accounting：1530/1530 answer joins、1035/1035 A–D
  sets、273/273 Group identities，无 orphan/duplicate；
- four disposition queues 与 accepted-correction queue：0 unresolved；
- Screen/Print-PDF/DOCX actual artifact matrix：所有适用 cells PASS，
  SKIP 只能是合同明确的 N/A（如 inactive listening zero occurrence）；
- 每个声明退役的 legacy family 满足全量分母并在 exact retirement HEAD 再次
  通过；未满足者继续 `available`，不得把 initiative 报成完成。

这项决议不新增领域术语，不修改 `CONTEXT.md`。historical `versions/vN` 的
on-demand compilation、稳定 `paper-asset-v2`、production/R2 backfill mechanics
以及 source splitter/`packageBuilder` consolidation 继续留在 Map Fog；本答案
没有把它们伪切成实施票。下一票只负责凝结全部已闭合决议、重新检查 Fog，并
转入 normal spec/tickets，不得提前实现本迁移。

Recorded verification:

- `node scripts/verify-paper-assets-consistency.mjs` — 199/199 PASS。
- `node scripts/verify-paper-asset-v1.mjs` — 3182/3182 PASS。
- Read-only corpus recount — 33 papers、273 Groups、1530 Questions、1035 A–D
  sets；Reading 126/465、Seven Choices 33/165、Cloze 33/570、Grammar Fill
  33/330、Application 24、Continuation 24。
- Current inventory recount — 33 `latest` directories、0 filesystem
  `versions/vN`、0 `paper-normalized-groups-v1.json`。
- Fixed point to current HEAD corpus/code diff for `app/public/paper-assets`,
  `server`, `app/src`, `scripts/import-pipeline`, `docs/import`, and
  `docs/product` — empty; census inputs did not drift in this Wayfinder line.
- `git diff --check` — PASS。
