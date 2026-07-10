# draft-student-field — 草稿卷归属学生字段（E4，学生维度种子）

- Cut line: small-medium; schema: **additive 单可空列**; PA-lite 理由：
  一列 nullable 元数据 + 透传展示，可逆，无语义迁移。CR-lite 可。
- 来源：similar-questions program Q3（学生维度三级走的第一级种子）。
  用途：v1.5 草稿卷史排重的 join 键；owner 一对一按学生组卷的归属标记。

## 设计

- `draft_papers` 新增 `student_label TEXT NULL`（自由文本，一对一场景
  无学生实体，不建表不外键）。迁移遵循仓库既有 additive 手法（DEV 先
  侦察现有 schema 演进方式；若无既有机制，用启动时 PRAGMA table_info
  守卫的 ALTER，幂等）。
- store/routes：create/update/get/list 透传该字段（可选）。
- 工作台 UI：标题区一个可选「学生」小输入（失焦保存，走既有自动保存
  链路）；空值零展示。
- my-space 卡片：有值时显示学生名 chip（中性样式，非墨绿——归属是
  元数据不是强调）。
- **硬边界：该字段绝不渲染到卷面**（屏幕预览/print/DOCX 零触碰）——
  它是备课管理元数据，不是试卷内容。

## Scope

白名单：`data/sql/schema.sql`、`server/draft-paper/draftPaperStore.mjs`、
`server/draft-paper/draftPaperRoutes.mjs`、`app/src/domain/questionBank.ts`
（类型 additive）、`app/src/features/draft-paper/`（工作台输入）、
`app/src/features/my-space/`（卡片 chip）、对应 verify 脚本轻断言。

Forbidden：`server/api.mjs`（挂载零改动——与并行刀 E1 的边界钉死）、
`server/search/**`、`server/print-renderer.mjs`、`server/exports/**`、
`shared/**`、`paper-intelligence/**`。

## 验收

1. verify：创建草稿卷带 student_label → get/list 回读一致；不带 → null
   且各面零展示；旧库（无列）启动迁移幂等。
2. 浏览器 QA：工作台填学生名 → 自动保存 → 刷新还在 → my-space 卡片
   出 chip；导出 PDF 卷面上**不出现**学生名（负断言截图）。
3. `npx tsc --noEmit`、`npm run verify:all` 真实退出码全绿。
