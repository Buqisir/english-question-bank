# one-sheet-paper — 整卷页「一张连续卷」（毛边⑤）

- Cut line: medium; touches schema / data contract: no; PaperSurface: **no
  （零触碰，壳层重排）**; PA-lite 理由：纯页面布局层重构（PaperBrowsePage
  + 其 css），可逆，无契约面；方向与九道剪刀线语义 owner 已逐条拍板
  （2026-07-09，原型 v3「对的对的对的」）。
- 来源：owner 毛边⑤ + 原型三轮迭代（artifact 3af25fdf，v1→v2→v3）。
- 前置：毛边④（paper-passage-letter）合并后开工——阅读组居中字母是
  剪刀线语义的组成部分（字母即篇分隔）。

## 已拍板的设计（原型 v3）

1. **一张连续卷**：卷面列合成单一白纸容器（Resting 阴影只打整张纸
   外缘一次），part/节标题、节指导语全部进纸内、与正文同左右边距；
   米色壳只剩纸外留白。题组卡独立白卡+各自阴影退役。
2. **纸内=卷面排版**：节标题/指导语换卷面字体体系（宋体系加粗/正文），
   退役 UI sans；部标题保持加粗层级。
3. **剪刀线语义**（虚线=题组可搬走内容的起点，提亮范围=剪走范围）：
   - 阅读四篇：虚线在**每篇字母之前**（①-④）。第一节节标题+节指导语
     （覆盖四篇那句）留在首条线上方，不属于任何一篇。
   - 单组节（七选五/完形/语法/应用文/续写）：虚线在**节标题之后、
     指导语之前**（⑤-⑨）——指导语跟题走（属题组 hover/剪走单元），
     「第X节」编号跟卷走（线上方）。
   - 实装判定规则：节下仅一个题组→指导语并入该组单元；节下多个题组
     （阅读第一节）→指导语留节层。
4. **虚线形态**：1px dashed rgba(74,68,56,0.28)，左右各缩进（约 24px，
   不通纸边），只活在屏幕整卷页；print/PDF/DOCX 面零影响。原型里的
   编号小标签是讨论用，不实装。
5. **hover 单元对齐剪刀线**：悬停提亮区域与「加入草稿卷」显形簇的
   作用范围=该组剪走范围（单组节含指导语，阅读组从字母起）。

## Scope

白名单：
- `app/src/features/paper-browse/PaperBrowsePage.tsx`（block 渲染层
  重排：单纸容器/标题进纸/指导语归组判定/剪刀线插入；**不动**数据
  加载、讲评态状态机、URL/popstate、scrollspy 逻辑本身）
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs`（断言随布局窄改+新语义轻断言）

Forbidden：`shared-ui/papersurface/**`（含毛边④刚加的字母渲染，原样
消费）、`paper-intelligence/**`、server/print/export、App.tsx、domain。

## 不变量（刀1-3 全部交互）

rail 贴左+紧凑档、scrollspy（锚点仍按题组，去抖不回归）、讲评把手/
右栏/点题联动/显影层、窄屏抽屉、URL 契约（lecture/questionId/
focusGroupId 深链锚定照常滚到位）、draft chip、悬浮操作簇功能不变
（仅作用区域按剪刀线语义对齐）。挑题态零解析请求不变。

## 验收标准

- paper-2026-i 全卷：单一白纸、九道剪刀线位置与 v3 一致（阅读①-④
  线在字母前；⑤-⑨ 线在节标题后指导语前）；节标题/指导语宋体进纸。
- 悬停验证「提亮范围=剪走范围」：语法填空亮起含指导语不含「第二节」；
  Reading B 亮起从字母 B 到 27 题止。
- 加入草稿卷从新 hover 单元内点击照常工作。
- 刀1-3 不变量抽查全过（含讲评态深链一条龙）。
- tsc 绿；`node scripts/verify-paper-browse.mjs` 绿；verify:all 或 CI 绿。
- 真点浏览器 QA：全卷滚动目检 + 窄屏 + 讲评态，截图入本 cut 目录。

## DEV 纪律

worktree（pwd 自证+setup-worktree.sh，禁 stash/主树路径，不 push 不
开 PR）；汇报=文件清单/verify 摘要/QA 截图/Blind Spots/越界声明。
