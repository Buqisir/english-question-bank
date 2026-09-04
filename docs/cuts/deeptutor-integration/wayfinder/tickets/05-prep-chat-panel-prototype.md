# 备课对话面板原型

Status: done
Claim: wayfinder-session-2026-08-16
Blocked by: None（`03-bank-feed-shape.md` 已关闭）
Type: prototype
Map: `docs/cuts/deeptutor-integration/wayfinder/map.md`

## Premise（票 02 / 03）

原型接的是 **EQB 小导师门厅**（当前题组 + `读题组` + `配相似`），不是
Mac 上的港大进程。Open Design 即可（`design/` 下），不进 `app/` 生产 UI，
不改 PaperSurface / 打印 / PDF。

模仿验收 = 协议像（追问、引用对象、不够时澄清），不是 UI 像港大。

票 03 已定：`读题组` 教师面含答案 + Analysis；`配相似` 模型可调、卡片勾选
后才进上下文；个人练习题不在 v1 柜；无「带走」进讲评候选（讲评草稿是
教师第二期）。

## Question

做一个粗原型，让 owner 对着真东西反应第一期备课侧栏：

- **开在哪**：整卷浏览讲评栏旁、题组详情、还是独立页。首状态是什么
  （当前题组已在场 vs 空白等开口）。
- **引用**：回答如何点回题库对象（篇章/题组/空）；mock 即可。
- **工具手感**：mock `读题组` / `配相似` 卡片勾选，不接生产 API。
- **带走**：v1 不要。讲评草稿助手后置。

原型是给 spec 定 UI 契约用的证据，不是第一版实现。

## Resolution 记录

原型：`design/deeptutor-prep-hall-prototype/index.html`
启动：`pnpm -C app prototype:prep-hall` → http://127.0.0.1:4177/?variant=A

2026-08-16 owner 确认（按推荐）：

- **位置**：整卷浏览讲评栏里的页签（变体 A）。打开时默认停在「小导师」，
  「讲评」仍在同一栏一键切回。不新开列，不贴在题组底下。
- **首状态**：当前题组 / 当前空 / Analysis 已在场。
- **引用**：点引用回到卷面并点亮对象。
- **带走**：v1 不要。
