# 刀⑧ — 主线报错人话化（草稿卷工作台 + 个人空间）· DEV 契约

Cut size: medium · touches schema/data contract: **no** · product boundary: no（纯错误展示层）
Date: 2026-07-03 · PM: 小川 · Baseline: main @ 1cbd462

## 为什么

品牌承诺是「可信」，但主线两面在出错时把英文技术串直接甩给老师：真库 QA
实拍过个人空间 502 时屏幕上是**两条** `Failed to load My Space: 502`，
无重试出口，只能刷新。体检报告（audit.md P1-4）记录的 50+ 处
`error.message` 生渲染是系统病；本刀先治主线三面里的两面（取题台
ConciergeDesk 的错误处理已达标，不动）。

点位已盘清（16 处，全是 `error instanceof Error ? error.message :
String(error)` 直接进 UI state）：
- `app/src/features/my-space/MySpacePage.tsx`：58/83/101/117/129/152
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`：
  141/220/237/270/292/308/321/338/355/373

## Scope

### 1. 极小错误文案 helper（一个新文件）

`app/src/features/shared/errorCopy.ts`（新目录可建）：

```ts
/** 把未知异常变成能给老师看的一句话；原始错误交给 console 供排查。 */
export function describeError(task: string, error: unknown): string
```

- 返回形如「{task}没成功，可以再试一次。」的人话；`task` 是动作名词
  （如「加载个人空间」「保存草稿卷」「导出 PDF」）。
- 函数内 `console.error(task, error)` 保留原始错误（本地工具，devtools
  是排查通道；UI 不再展示技术串）。
- 不做错误分类学（不解析 status code、不猜网络原因）——今天的错误对象
  没有可靠结构，假装能诊断反而撒谎。一句诚实的「没成功 + 可重试」即可。
- 纯函数除 console 副作用外零依赖；≤30 行。

### 2. 16 处点位全部换用 helper

每处把 `error instanceof Error ? error.message : String(error)` 换成
`describeError('<该动作的中文名词>', error)`。动作名词按调用处语义取
（加载/保存/删除/重命名/新建文件夹/导出/保存到个人空间等），别偷懒全写
「操作」。

### 3. 个人空间加载失败的恢复出口 + 去重

- 加载失败态（现 502 那个）补一个「重新加载」按钮，onClick 调既有的
  加载函数（复用现有 ink CTA 样式类，如空态「去组一份卷子」的
  `.my-space-empty-cta`）。
- 修双条重复渲染：同一个 message 现在页头和内容区各渲染一次——收敛为
  只在内容区一处展示（页头那条删掉或条件化）。

### 4. 草稿卷工作台错误不丢工作

确认（并在 verify 里钉住）：save/export 错误展示时不清空表单/选题状态
（现状应已如此，写断言防回归即可，不需要改行为）。

## Forbidden

- ConciergeDesk / concierge/**（错误处理已达标）零碰。
- `server/**`、schema、Adapter、PaperSurface、print/export 零碰。
- 不改任何数据获取逻辑、reducer、状态结构——只改"错误变成什么字符串"
  和"失败态渲染什么"（灰区文件纪律：display-only + 本契约明确授权的
  重试按钮 onClick 复用既有函数）。
- 不引入 toast 库/错误边界组件/新依赖。
- Color-Lock / No-Blue / Red-Pen；新按钮复用既有样式类，不造新色。
- 经典模式、App.tsx 的 30+ 处（下一刀）零碰。

## Verify

1. 新增 `scripts/verify-error-copy-mainline.mjs`：
   - describeError 纯函数断言（Error/字符串/undefined 输入→人话输出、
     不含原始 message、console.error 被调）；
   - 两个 TSX 源文件里 `error.message`/`String(error)` 直连 UI state 的
     模式**零残留**（negative grep 断言）；
   - my-space 失败态含重新加载按钮接线、message 单点渲染；
   - 工作台错误路径不清空状态的防回归断言。
   挂进 `scripts/README.md`。
2. 既有绿零回归：`verify-home-default-feed.mjs`（37）、
   `verify-concierge-desk.mjs`（230）。
3. `pnpm -C app build` 过。
4. 浏览器 QA 主 agent 亲手（会用真 502 复现：杀 API 进程再进个人空间）。

## DEV 后勤（照做）

- worktree：`git worktree add /private/tmp/eqb-worktrees/error-copy -b
  cut/error-copy-mainline main`；symlink `app/node_modules`、
  `server/node_modules` 回主 checkout。禁止碰主 checkout。
- commit 1-2 个，conventional message，结尾
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>。不 push 不开 PR。
- 报告：worktree 路径+分支+commit+改动文件+verify 摘要+Self-Review
  Blind Spots 2-3 处。
