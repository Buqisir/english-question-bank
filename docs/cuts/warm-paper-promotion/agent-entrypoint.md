# warm-paper-promotion（暖纸转正小刀）— 开刀包（High 会话预写，2026-07-10）

队列位置：lecture-rail 之后。刀级 small/medium，CR-lite 可。
出身：High 议题 1+3 grilling（决策全文在 `docs/cuts/draft-desk/program.md`
关联决策「割裂议题 grilling 落锤」节）。

## Must Read

1. `docs/cuts/draft-desk/program.md` 关联决策五裁点（色温法原文在此）。
2. 本文件。
3. 背景（可跳）：`.impeccable/critique/2026-07-10T05-30-00Z__full-project.md`
   Coherence 节「两套壳色温并存」+ 专项审计 P0-D1（纸背糊死）。

## 已拍板的决策（勿重新讨论）

- **色温法**：纸页入暖（整卷/讲评/工作台预览=暖纸桌+暖纸），工具页
  中性（home/找题/admin）。整卷/讲评现有暖色值从"违章"转正为
  `--paper-*` token 家族。
- 三条法（色温法/命名法「个人空间」统一/删除法两档）条文随本刀写进
  DESIGN.md——命名法与删除法的**实施**归卷宗柜刀，本刀只入法条。

## 施工三件事

1. **token 转正**：paper-browse/讲评页现有暖色值（审计原话 15/15 脱离
   DESIGN.md）收编为 `--paper-*` token（index.css 定义 + DESIGN.md 登记）。
   **纯等值替换，两页零视觉变化**——QA 用前后截图 diff 证明。
2. **工作台预览入暖**：DraftPaperWorkbench 预览区桌面换暖纸桌 token +
   A4 纸面加 Resting 阴影（0 1px 2px rgba(30,30,28,.06) 量级，收审计
   P0-D1），去渐变桌。owner 议题3「背景灰怪」即此闭环。
3. **DESIGN.md 三法条文**（见上）。

## 边界与提醒

- `DraftPaperWorkbench.tsx` 是灰区文件：display-only 改动 OK，禁碰
  reducer/state/数据获取（AGENTS UI Collaboration 节）。
- 禁碰 print/PDF/DOCX 导出样式（契约面，非本刀范围）——暖纸只上屏幕面。
- my-space 微缩 A4 卡的暖纸化归卷宗柜刀，本刀不碰 my-space。

## 验收

- verify-paper-browse + verify:all + main CI 绿；palette-hex 护栏不回退
  （新增色值一律走 token）。
- 浏览器 QA：整卷/讲评页前后截图逐像素无差；工作台预览暖桌+纸影生效；
  owner 过目工作台观感。
