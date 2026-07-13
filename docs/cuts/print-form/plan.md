# print-form — plan.md（打印形态 A4/A3 + 分页建议改真分页衍生，draft-desk 队列刀C）

- cut size: **medium**；touches schema: **纯追加一列**（`draft_papers.print_form`，
  懒 ALTER，student_label 先例 :183-210）；data contract: pagination 响应追加
  字段（additive）+ 草稿 GET 摘除死字段 `pageBreakSuggestions`（无前端消费者，
  侦察已证）；product boundary: no；teaching interpretation: **判据语义已 owner
  拍板**（议题2 六裁点 2026-07-10 + 建议引擎必答题 2026-07-12，勿重开）。
- PA: **PA-lite**。降档理由：原型 `docs/cuts/draft-desk/prototype-print-form-v2.html`
  owner 逐裁点拍板（六裁点在 program.md 议题2 节）+ 07-12 拍板「挪出刀B单独做」；
  纯追加 schema。CR 复核降档是否成立。
- 基线：`github/main` @ 3234735（含刀B 全部）；分支 `print-form`，worktree
  `../wt-print-form`。
- **并行边界**：engine-rewire 在飞（server/search/ + paper-browse 前端 +
  verify-similar/paper-browse 两脚本）——本刀全程不碰这些面；`verify-ci.mjs` 与
  `scripts/README.md` 双方均追加行，收口串行后合并者 rebase 即解。

## 侦察事实（DEV 直接用，勿重查）

- 词数启发式 `buildPageBreakSuggestions`：`server/draft-paper/draftPaperStore.mjs`
  :406-434（600/700/1000 魔法数字），:536 挂进草稿 GET。**前端零消费**（唯一
  引用 = `scripts/verify-c8-print-ready-gate.mjs:63` 源码切片断言 +
  `draftPaperPreviewHtml.ts:27-28` PO-1 延后注释）。
- 分页真值源：`getDraftPaperPagination`（store :1014-1046）返回 DOM 契约 HTML——
  `.preview-page` 分节、题组 `<section class="question-group" data-group-id>`；
  **同一 groupId 出现在 ≥2 个 `.preview-page` = 被页边界腰斩**。签名缓存 LRU8。
- 叠按钮通道：刀B 步3 已在预览 iframe 注入每题操作条（含「前置分页」按钮，
  PATCH items 接口 `patchDraftPaperItem` 已有）——建议标注骑同一通道。
- 计数徽标：`DraftPaperWorkbench.tsx:905` 硬编码「共 N 页 · 双面 ceil(N/2) 张 · A4」。
- PATCH 卷级路由已有（draftPaperRoutes.mjs:103）；`rowToDraftPaperSummary`
  :436-454 为字段出口。

## Must Do

1. **`print_form` 字段**：`draft_papers` 懒 ALTER 加 `print_form TEXT`
   （'a4'|'a3'，NULL 视同 'a4'；照 student_label 先例含只读连接回退）。卷级
   PATCH 白名单放行；summary/detail 输出 `printForm`。**记住上次**（裁点3）：
   新建草稿时 server 侧取该用户 `updated_at` 最近一份草稿的 print_form 作默认，
   无则 'a4'——不用 localStorage（ADR 红线：不做本地唯一持久化）。
2. **建议引擎换真分页衍生**（owner 必答题拍板：魔法数字整套删除）：
   - 删 `buildPageBreakSuggestions` + `estimateEnglishWords`（若无他用）+ :536
     挂点；草稿 GET 不再回 `pageBreakSuggestions`（死字段，前端类型同步删）。
   - `getDraftPaperPagination` 结果新增 `pageBreakSuggestions`：解析契约 HTML 得
     group→pages 映射，题组跨页 p→p+1 记建议当且仅当**真断**：
     `a4`：任何跨页都断；`a3`（对折双面 2-up，面对 = 版(1,2)/(3,4)/…）：仅
     p 为偶数时断（版2→版3 翻面、版4→版5 换张；版1→版2、版3→版4 同面并排
     不算断——owner 改判原文）。建议项 `{ itemId, groupId, reason }`，reason 说
     人话如「跨页断篇（第2/3版，翻面）」。判据函数独立可测（纯函数）。
   - **print_form 不进分页签名**（裁点2：A4/A3 不改排版，只改判据与计数；
     建议从缓存 HTML 便宜衍生，缓存零失效）。suggestions 按当次请求的
     versionType 结果计算。
   - `/pagination` 路由响应透传 `pageBreakSuggestions`（additive）。
3. **卷头 A4/A3 切换 UI**：工作台卷头（计数徽标旁）双态切换，PATCH 落库、
   乐观更新；不设设置页、不卡新建入口（裁点3）。切换后建议与计数即时随判据
   刷新（分页 HTML 不重渲）。
4. **计数徽标随形态**：a4 维持现文案；a3 改「共 N 版 · 对折 ceil(N/4) 张 · A3」
   （原型文案语言，DEV 以 prototype-print-form-v2.html 为准微调措辞）。
5. **建议显示恢复（PO-1 收账，安静标注语言）**：被建议题组的叠按钮条上加
   安静徽标（如「建议前置分页 · 跨页断篇」），点击 = 触发现有「前置分页」
   PATCH（pageBreakBefore=true）→ 签名变化自然重渲；建议消失即闭环。安静
   常驻、建议+确认、**永不自动重排**（裁点5）。无建议时零 UI。
6. **verify**：
   - `verify-c8-print-ready-gate.mjs:63` 切片断言诚实换向（断言启发式**已删**、
     魔法数字零残留）。
   - 新 `verify-print-form.mjs`：①懒 ALTER 幂等；②判据纯函数全表（a4 各跨页断；
     a3 偶断奇不断）；③从含跨页题组的契约 HTML fixture 衍生出正确建议、无跨页
     零建议；④print_form 不在分页签名内（源码或行为断言）；⑤新建草稿继承
     上次 print_form。注册 `scripts/README.md` + `verify-ci.mjs`（housekeeping
     守卫要求同刀）。
   - 既有 draft 面 verify（c8 家族、golden-path e2e）如受响应字段增删影响，
     修断言不放水（数据真实性教训：修夹具非放断言）。
7. 自验 + checkpoint commit + 收口 commit（一行 message）。

## Forbidden（本刀不许动）

- `server/search/**`、`app/src/features/paper-browse/**`、
  `scripts/verify-similar-questions.mjs`、`scripts/verify-paper-browse.mjs`
  （engine-rewire 在飞面）
- ~~`app/src/domain/questionBank.ts`（engine-rewire 契约点）~~ **收口追授
  （PM 2026-07-13，engine-rewire 已合并、并行锁解除）**：允许且仅允许
  ①`DraftPaperSummary` 追加 `printForm: DraftPrintForm`（+类型定义一行）
  ②`DraftPaper` 摘除死字段 `pageBreakSuggestions`——替换 DEV 施工期的
  service 层交叉类型绕行（DraftPaperWithForm），恢复单一类型真源。
- 分页渲染器本体 `paginationRenderer.mjs` / `chromiumPool.mjs` / DOM 契约
  `paginationDomContract.mjs`（消费其产物，不改契约本身）
- PDF/打印出口的 A3 拼版（刀E 后续兼容追加）；按张分组预览视图（裁点2 明拒）
- 生产机/生产库

## 裁决点清单（PM 断点锚）

1. 【DP-1】DEV 完成 → 主代理亲手复核（narrow + verify:all + tsc）→ fresh
   Opus CR → MF 处置（主代理）。
2. 【DP-2】主代理浏览器 QA（卷头切换、计数联动、建议标注点击生效、A3 判据
   实卷对照）→ 收口串行（engine-rewire 先合则 rebase）→ merge → 盯 main CI。
3. 【DP-3】owner 观感 QA（切换手感 + 建议可信度；部署后，非关门条件）。

## Verification（worktree 内逐条）

```
node scripts/verify-print-form.mjs
node scripts/verify-c8-print-ready-gate.mjs
node scripts/verify-draft-pagination-dom-contract.mjs
pnpm -C app run verify:all
```
