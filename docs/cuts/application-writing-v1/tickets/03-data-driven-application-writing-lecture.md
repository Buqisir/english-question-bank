# 03 — 数据驱动的应用文双范文讲评

Status: done
Blocked by: None — Ticket 01 is complete in this worktree.

Spec: `docs/cuts/application-writing-v1/spec.md`
Fixed point: Ticket 01 的完成 commit

## What to build

让任意 application group 在讲评已打开且拥有完整合法 payload 时，都能脱离 retained groupId 白名单使用同一讲评体验：左侧原答题框按顺序显示 AI 参考范文与可选官方范文，右侧继续只显示现有审题卡；缺失或错配数据保持 fail closed。

本票使用非白名单 fixture 证明通用行为，不写真实试点资产。

## Scope

- 完整讲评 mount predicate 只依赖：
  - `lectureOpen`
  - `panelGroupId === groupId`
  - source Writing Task 为 application
  - analysis 为 application
  - 非空 `modelAnswer`
  - 完整合法 `reviewCard`
- 从完整讲评的 availability guard 中移除 2022-i/2024-i groupId 白名单。
- `officialModelAnswer` 不参与 availability：存在则显示，不存在则完全不渲染官方范文区。
- 左侧原答题框内按顺序显示：
  1. `AI 参考范文`
  2. `官方范文`（仅存在时）
- 两块完整保留逻辑换行与段落，不截断、不缩放、不横向溢出，页面自然向下增长。
- 右侧只复用当前四段 `ReviewCard`，不显示范文、亮点表达或额外 AI 内容。
- malformed-present reviewCard、空 modelAnswer、task type 错配继续显示普通答题框加 `解析未发布`，不挂部分 DOM。
- 关闭讲评或 panel ownership 切换时立即恢复普通答题框。
- 保留 2022-i/2024-i 的现有视觉、整框讲评入口、`讲评` handle 与深链行为。
- 不把“所有 application 答题框都变成新点击入口”作为本票隐含需求；非 retained group 通过现有 `讲评` handle 或显式 lecture intent 进入讲评。

## Forbidden

- 不改生成器、driver、真实资产或 reviewCard 内容。
- 不修改共享 PaperSurface、neutral anchors、focus state contract 或 route state。
- 不新增 tab、固定画布、拖拽、批注、下划线、箭头、手写卡片、几何定位或新字体。
- 不修改 continuation 展示。
- 不修改挑题态、student、print、PDF、DOCX、export 或生产配置。
- 不恢复 application highlights 展示，也不删除历史 highlights 数据。

## Acceptance criteria

- [x] 一个不在旧白名单内的 application fixture，在完整 payload 下可挂载双范文讲评。
- [x] 左侧先显示带标签的完整 AI 参考范文，再显示带标签的完整官方范文。
- [x] `officialModelAnswer` 缺省时只显示 AI 参考范文，不出现空标签或假卡片。
- [x] 右侧 ReviewCard 四段顺序、标签和字段映射保持 fixed point 一致。
- [x] application highlights 即使存在也不在完整讲评体验中显示。
- [x] 缺 modelAnswer、malformed reviewCard、application/continuation 错配均 fail closed，不出现部分卡片。
- [x] 关闭讲评或切换 panel group 后普通答题框恢复。
- [x] 2022-i 与 2024-i 的整框入口、`讲评` handle、视觉和响应式行为无回归。
- [x] continuation、历史无 reviewCard application、挑题态和 export isolation 无回归。
- [x] 宽屏 rail 与窄屏 drawer 均能完整阅读两篇范文，无横向溢出。
- [x] focused red-green fixture 证明旧白名单阻止新 group，完成后由 payload 决定 availability。

## Verification

```text
node docs/cuts/application-writing-v1/qa/verify-03-data-driven-lecture.mjs
node scripts/verify-paper-browse.mjs
node scripts/verify-restart3-teacher-analysis.mjs
pnpm -C app exec tsc --noEmit
pnpm -C app run verify:all
git diff --check
```

使用 `qa-local-owner` 做真实点击的 agent browser QA：

1. 非白名单完整 fixture：双范文 + ReviewCard。
2. 缺 official：只有 AI 范文。
3. malformed fixture：普通答题框 + `解析未发布`。
4. 2022-i/2024-i：旧入口和视觉无回归。
5. continuation、窄屏 drawer 与讲评关闭/切换恢复。

## Review and owner QA

- 本票是 user-visible、PaperSurface 邻接的高风险行为变更，但共享 PaperSurface 必须零改动。
- `$implement` 在本任务内完成 TDD、普通 Standards + Spec review、agent browser QA、修复和一个干净 commit。
- 本票单独完成不构成 merge authorization；完整 fresh `$code-review` 在 Ticket 04 后运行。
- Owner QA：本票只使用 fixture，不单独暂停 owner；owner 对真实内容、视觉和交互的最终接受统一在 Ticket 04 之后。

## Result

Commit: This commit; final HEAD is recorded in the completion handoff.
Verify: Focused verifier proved red before implementation (4 expected failures, exit 1) and green after (12/12, exit 0); retained contract 120/120, paper-browse 196/196, restart3 teacher analysis 130/130, direct TypeScript check, and `pnpm -C app run verify:all` (PASS 84 / SKIP 1 / FAIL 0) all exited 0. `qa-local-owner` real-click QA covered a complete non-whitelist fixture, no-official, malformed, 2022-i/2024-i, continuation, narrow drawer, close, and ownership-switch restoration.
Notes: Complete valid application payloads now control lecture availability; the left answer box shows AI then optional official model answer and the right side remains the existing ReviewCard. Application highlights stay hidden. Ordinary Standards review found no issues; Spec review found one application/continuation fallback leak, which was fixed with browser red-green evidence and passed focused re-review.
