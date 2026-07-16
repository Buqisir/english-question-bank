# similar-v2-engine (E5) — DP-2 主代理 QA（本地服 + 真实 API 调用）

环境：wt-similar-v2-engine 本地服（`server/api.mjs`，`QUESTION_BANK_API_PORT=8790`
避开当前已在跑的主仓库 8787 实例——先 `lsof -iTCP:8787` 撞见主仓库进程，
换端口重启并核实 `/api/health` 的 `dbPath` 落在本 worktree 才继续，血书纪律
不误踩主仓库）。QA 帐号：`qa-local-owner`（`node scripts/create-user.mjs
--reset-password` 本 worktree 内重置，真实登录会话 cookie）。真实调用对象
= 本 worktree 真库 `data/question-bank.sqlite`（D1 尚未落库，schemaVersion
仍是 v1；谓语向量字段读不到值属预期）。

## 鉴权

- 未登录 POST `/api/similar-passages` → `401 {"error":"not_authenticated"}`（登录态门禁生效，与既有相似端点同层）。
- 登录后两端点均 `200`。

## `/api/similar-questions`（小题相似）

- **阅读**，种子 `q-zj-2022-jan-025`（skill=inference）：结果全部带
  `facet-hit`「同小题题型：inference」+ `topic-match` 两条 reason，
  `matchedQuestionIds` 只含真正命中 inference 的那道题。
- **语法填空·非谓语**，种子 `q-zj-2022-jan-059`（role=adverbial）：命中
  `group-2023-jia-grammar-fill` 等候选，reason 为
  「同款：非谓语作状语」（真库 v1 数据没有 `form` 字段，chip 按设计优雅
  省略 form 段，未崩溃）。
- **语法填空·谓语（finite）**，种子 `q-2020-i-058`：`seedProfile.facets`
  给出 `agreementSensitive: [false]`（真库无 `tense`/`voice` 字段，
  `entry.tense`/`entry.voice` 均 `undefined`，向量恒 0——**符合预期**，
  联调等 D1 落库）；候选分数解码 `primary=0`，仅 `topic-match` secondary
  在起作用。谓语向量特性本次跑不出真实排序区分度，这是已知且被 plan 明确
  记录的过渡态，不是本刀 bug。
- **完形/七选五种子 → 400**：`q-2024-i-041`（cloze）→
  `{"error":"完形填空的小题相似已下线，该题型走篇章相似"}`，`HTTP 400`。
- **混类多种子 → 400**：`[q-2020-i-058(finite), q-zj-2022-jan-059(non-finite)]`
  → `{"error":"语法填空一次只能按一个考点找相似，请分开提交种子"}`，`HTTP 400`。

## `/api/similar-passages`（篇章相似，新端点）

- **阅读**，种子 `group-960d0f8d-reading-b`：`group-2025-i-reading-b` 等
  候选 `score=709900`（`70*10000+99*100`），reasons =
  `position-slot「同为B篇」+ authentic-source「真题」+ topic-match`，
  三条链路同时验证：篇位 primary 层、真题 secondary 层、话题信息 chip。
- **七选五**（非 reading，验证"非 reading 无篇位档"）：种子
  `group-2024-i-seven-choices`，候选 `score=9900`（`0*10000+99*100`），
  reasons 只有 `authentic-source` + `topic-match`，无 `position-slot`——
  证实非 reading 类型确实拿不到篇位档，真题即最高档。
- **种子零话题 → 诚实空态**：`group-2026-i-reading-a`（真库确认零话题
  标签的组之一）→ `{"results":[],"poolStats":{"totalInPool":0,"returned":0},
  "notice":"该篇暂无话题标签，暂时无法找相似篇章"}`——不静默兜底，明示文案。

## 结论

DP-2 过。两端点的行为与 plan/pa 计分设计逐条吻合；发现的两个"符合预期
而非 bug"的过渡态（谓语向量恒零、完形/七选五小题相似 400）均已在
`cut-note.md` §4 记录为需要 owner 关注的部署顺序风险（尤其是完形/七选五
的 400 会打断现有「配相似」按钮的真实用户体验，直到 E6/E7 把该按钮改指
`/api/similar-passages`）。
