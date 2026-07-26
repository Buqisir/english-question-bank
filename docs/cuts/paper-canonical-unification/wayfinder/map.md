# EQB 试卷 Canonical 大一统 — Wayfinder Map

Status: charted
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/15-latest-migration-and-legacy-retirement.md`
Terminal: no

## Notes

- Objective: make every currently supported high-school English paper family pass through one source-traceable canonical backbone before Screen, Print/PDF, and DOCX consumption.
- Worktree: `/Users/huangxuewei/Projects/wt-paper-canonical-unification-20260725`
- Branch: `codex/paper-canonical-unification-20260725`
- Chart fixed point: `19ffc7744c656b526f55934c8c73e245acf7323f`
- Owner-confirmed scope:
  - keep Source Capture immutable;
  - record deterministic transformations and fail closed to `needs_review` when meaning or identity is ambiguous;
  - share one normalization envelope while giving each question family its own canonical variant;
  - separate reusable Paper Format Profiles from each paper's Canonical Paper Plan;
  - keep Analysis as a supplement rather than a constructor of paper semantics;
  - publish additive canonical sidecars instead of starting with `paper-asset-v2`;
  - make tables and figures first-class canonical content;
  - represent listening in the whole-paper plan as `raw/inactive` without activating a website Question Group in this effort;
  - hard-gate new imports first, then migrate all 33 current `latest` assets; historical `versions/vN` remain immutable in the first migration;
  - preserve distinct NCK1, Zhejiang legacy, and national legacy profiles rather than rewriting real historical formats into one exam shape.
- Accepted vertical order: standards/profile/plan foundation, including the shared A–D option-layout selector → seven choices → reading → application writing → continuation writing → listening raw/inactive → new-import rollout → all-`latest` migration and legacy retirement.
- Existing cloze and grammar-fill work is the protocol reference, not proof that its current renderers are already correct. Owner-observed baseline failures must be reproduced and closed before the pattern is copied:
  - cloze options currently lose visual row/column alignment;
  - Seven Choices Print/PDF currently introduces an invalid per-blank A–D choice layer and repeats or nests the group's shared A–G option bank.
- Treat the Seven Choices symptom as a semantic projection failure, not only visual polish: one group owns exactly one A–G option bank, while its five semantic blanks reference that shared bank. Treat cloze alignment as a renderer conformance failure unless the census proves an upstream structural cause.
- Owner-confirmed A–D layout invariant, evidenced by NEEA reference page 4 questions 21–23 and page 9 cloze: choose one layout for the whole option set—four columns `A B C D`, two-by-two rows `A B` / `C D`, or one column `A` / `B` / `C` / `D`. Try the densest mode that fits; never let CSS auto-flow or one late option create a hybrid extra row. Exact typographic measurement, safety margin, and overlong one-column behavior remain for the dedicated prototype ticket.
- The selected A–D layout is renderer-derived presentation, not Canonical Question Group semantics. The rule covers per-question A–D options; Seven Choices A–G and listening A–C keep their own family rulings.
- Every resolution task reads `AGENTS.md`, `CONTEXT.md`, this map, and only its selected ticket plus the smallest authority/code surface it names.
- Use `$wayfinder` for map operations, `$domain-modeling` when language changes, and `$codebase-design` for module interface and seam decisions. Research and prototype tickets use their matching entry skills when available.
- Do not copy copyrighted passages, answers, student data, credentials, or source files into Wayfinder artifacts. Asset investigation records ids, hashes, shapes, counts, and minimal diagnostic excerpts only.
- Tickets are claimed before resolution; closed answers live in their tickets
  and appear below only as linked one-line gists.

## Decisions so far

<!-- Append one linked one-line gist only when a ticket closes. -->

- [审计现有试卷标准的权威、缺口与矛盾](tickets/01-audit-current-authorities.md) — 现状由规范、admission 与 producer/consumer 三层共同决定；23 项证据显示来源、profile、plan/group、analysis 与 renderer 权威均未收拢。
- [盘点全库 latest 资产与所有生产消费变体](tickets/02-census-assets-producers-consumers.md) — 33 卷 census 定位 Seven shared-bank projection 与完形列对齐的最早错误层，并固化 1035 组 A–D measured proof、数据异常和迁移风险。
- [确定模块化试卷标准与机器权威结构](tickets/03-executable-standard-authority.md) — 以唯一 human index 和带 digest 的机器 manifest 收拢标准，六类事实互斥归属并由 schema、语义 conformance 与跨 renderer gate 联合强制。
- [定义 Source Capture 与清洗留痕合同](tickets/04-source-capture-normalization-ledger.md) — 以不可变 bytes/observations、pre-normalization Source Span 和 exact-only 变换台账分离证据与派生语义，并区分四类 fail-closed 阻断。
- [设计 canonical compilation 深模块接口](tickets/05-canonical-compilation-module-interface.md) — 选择 one-shot evidence compiler：一个纯函数从 immutable source bytes 到整卷原子 canonical artifacts，blocked 分支只保留 Source Capture 与 Normalization Report。
- [定义卷型模板与整卷装配单合同](tickets/06-paper-format-profile-and-plan.md) — 以 versioned Profile 独占卷型规则、complete-only Plan 绑定整卷实例，并让三类 renderer 共用一个语义投影 Module。
- [定义题组通用 envelope 与 rich content nodes](tickets/07-rich-content-and-group-envelope.md) — 以封闭 shared envelope、family-discriminated option owner 与最小 rich-content 网格/媒体模型消除重复 bank 和 renderer 语义回编。
- [定义 A–D 选项整组择形算法与金样卷 parity](tickets/07a-abcd-option-layout-selector.md) — 以 pinned shaping、固定 twip tabs 与 whole-set fallback 让三类 renderer 共用同一 4/2/1 placement plan，并对不可渲染单列内容 fail closed。
- [定义七选五 canonical variant 与双卷 proof 合同](tickets/08-seven-choices-canonical-variant.md) — 以五组 Question/Blank identity、一组 shared A–G bank 与跨 renderer occurrence conformance 消除 raw-marker 回编及重复/嵌套 bank。
- [定义阅读 canonical variant 与图表 proof 合同](tickets/09-reading-canonical-variant.md) — 以单一有序 rich-content stream、Reading 标题角色、原生表格/图像与共享 A–D plan 消除 marker/flattened 回编并锁定四面 semantic/anchor parity。
- [定义应用文 canonical variant 与 given skeleton 合同](tickets/10-application-writing-canonical-variant.md) — 以完整 prompt 语义视图、source-provided Given Skeleton 与单一 answer-region occurrence 禁止 genre/background 猜骨架并锁定四面 parity。
- [定义读后续写 canonical variant 与 starters 合同](tickets/11-continuation-writing-canonical-variant.md) — 以 two-starter / plot-led 两个 exact family contract、source-proven 零 starter 与单一 answer-region occurrence 锁定三面 parity 并 fail closed 三条目污染。
- [定义听力 raw/inactive 插槽与未来 activation seam](tickets/12-listening-raw-inactive-slot.md) — 以两项 Inactive Source Slot、field-complete source closure 与 closed inventory 保持整卷 complete/零听力 Group，并把 activation 留给新 Profile/active family contract。
- [定义原子 sidecar 发布、consumer selector 与回滚合同](tickets/13-atomic-sidecars-and-consumer-selector.md) — 以整卷 integrity-closed Publication、共享 loader 与 family-atomic selection 统一版本/回滚，禁止 Group/字段/渲染中途的半 canonical fallback。
- [制定新导入 hard gate 与逐题型竖切路线](tickets/14-new-import-rollout-and-gates.md) — 以 foundation-first family checkpoints、统一跨 renderer proof 与整卷 canonical-required admission 让各 slice 可独立发布，并在迁移前阻断新的 non-canonical imports。

## Fog

- Whether a future stable canonical package should eventually replace `paper-asset-v1` with `paper-asset-v2`; additive sidecars are the accepted first destination.
- On-demand canonical compilation for historical `versions/vN` after the first `latest`-only migration.
- The active listening domain model, audio timing contract, website consumption, and listening renderers.
- A backend normalization review console beyond durable reports and agent-operated correction; website import UI remains forbidden.
- Retirement or consolidation of source-format-specific splitters and `packageBuilder` branches after every supported profile has migrated.
- Production rollout, R2 synchronization, and production backfill mechanics after local migration and release gates are proven.
- New paper families, unsupported question types, or other subjects discovered outside the current 33-paper census.
- Exact implementation-ticket slicing beyond the accepted foundation-first order; it will be created only after the decision map is closed.
