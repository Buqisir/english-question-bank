# 柜子：导师能看见哪些对象

Status: done
Claim: wayfinder-session-2026-08-13
Blocked by: None（`01` / `02` 已关闭）
Type: grilling
Map: `docs/cuts/deeptutor-integration/wayfinder/map.md`

## Premise change（票 02）

不再问「怎么喂进港大 DeepTutor KB」。已定：柜子 = Canonical Paper /
Question Group / Analysis / 配相似结果的对象 API，无切段向量知识中心、
无 Markdown 导出建库、无 EQB MCP 给港大进程用。

港大 DeepTutor 的 KB / MCP / 多检索引擎结论只作对照机参考，不进生产。

## Question

EQB 小导师 v1 门厅的工具已定为：当前题组（自动在场）+ `读题组` +
`配相似`。本票只补柜子边界，写进 spec：

1. **教师面 `读题组` 返回什么**：篇章/题干，还是含答案 + Analysis？
   sidecar 缺失时如何降级（整卷浏览已有「解析未发布」）？
2. **`配相似` 谁来调**：模型当作工具自己调，还是老师点了才把对象塞进
   上下文？票 02 grilling 倾向「老师点对象」；Resolution 又把门厅写成
   含 `配相似` 工具——必须收口。
3. **个人练习题（票 06）**：教师 v1 门厅里导师能否读老师自己的练习题？
   默认不在柜，直到老师钉进会话？
4. **学生面过滤**（v1 不做学生面，但 spec 要先写死）：学生版隐藏答案/
   讲评是产品红线。确认走 EQB 工具层按 caller role 剥掉，不另建学生柜、
   不分库。

事实（已查，不必再问）：

- Canonical / Analysis 已在 `paper-assets` 与 analyses sidecar；整卷浏览
  讲评栏按题组取同一份对象。
- `POST /api/similar-questions`（小题）与 `POST /api/similar-passages`
  （篇章）已是零 AI 对象 API；写作题组配相似 400；完形/七选五小题相似
  已下线、走篇章相似。
- 题库 steward / 语义搜索是另一条 AI 找题缝，不是本票的柜子。

## Resolution 记录

2026-08-13 grilling，owner 确认（Q2=B；其余按推荐）：

- **教师 `读题组`**：篇章 + 题干 + 答案 + Analysis。有 sidecar 才带讲评；
  没有则标明「解析未发布」，不编。
- **`配相似`**：模型可调；结果以候选卡片出现（现有配相似抽屉手感）；
  老师勾选后才进入上下文。模型不得把命中直接当已读事实。
- **个人练习题**：v1 门厅看不见。那是变式工坊的柜；门厅只挂 Canonical。
- **学生面过滤**：工具层按 caller role 剥答案/讲评；不另建学生柜、不分库。
  v1 无学生 caller，但 spec 先写死。
