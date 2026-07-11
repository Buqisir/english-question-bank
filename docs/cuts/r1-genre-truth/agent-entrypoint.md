# r1-genre-truth（体裁补真值）— 开刀包（High 会话预写，2026-07-10）

analysis-fields program 第一轨（R1）。**后台数据刀，不占 UI 队列，可与
UI 轨任意并行**。刀级 small/medium。

## Must Read

1. `docs/cuts/analysis-fields/program.md` R1 节 + 话题体系节（生态环境
   归属修正在此）。
2. 本文件。

## 已拍板的决策（勿重新讨论）

- 病灶：`passages.discourse_type` 现值=题型名假货（reading/cloze/…），
  与 group_type 冗余；引擎两处配方因此空转。
- 词表**五类封闭枚举**：记叙 / 说明 / 议论 / 应用 / 新闻。
- 存法：**覆写 discourse_type 原列**（迁移前先备份 DB），零 schema 新增。
- 质检：owner 判例抽检 gate（判例裁决制——递边界样本，不递全量）。

## 施工四件事

1. 跑批脚本（scripts/ 下，后台管线风格）：AI 对 273 篇 passages 标体裁，
   受控枚举硬 gate（输出不在五类内即拒收重试）；写作组标**材料本身**
   的体裁。跑批前 `cp data/question-bank.sqlite{,.bak.genre-r1}`。
2. 抽检页：分层样本 ~20 条（五类各若干 + AI 自报低置信的），形态参照
   `docs/cuts/analysis-fields/trap-audit.html`（对味/不对/存疑三判+计分）。
   owner gate 过了才算落库定稿。
3. `verify-genre-truth.mjs`：断言 273/273 覆盖 + 全部落在五类枚举 +
   不再出现题型名旧值；挂 CI（scripts/README.md 登记 + verify-ci.mjs）。
4. 顺手项：话题词表「生态环境」一女二嫁收敛——api.mjs
   `TOPIC_LABEL_TAXONOMY` 环境保护列表删除 '生态环境'（归自然生态，
   与现有 2 条标注一致）；相应 alias 行同步。

## 明确不做（另刀）

- **引擎接线**（similarQuestions.mjs 配方修改：完形/七选五体裁真匹配、
  阅读篇位换真值+词数细排、话题三台阶阶梯）= R1 完成后的
  **engine-rewire 刀**（medium + CR，目标配方表在 program.md）。
  本刀数据零引擎，引擎零数据，边界干净。
- 生产库同步：本地跑批+验收后，随下一次部署走 pull-run-push 流程
  （owner 拍板节点）。

## 验收

- verify-genre-truth 273/273 绿 + verify:all 不回退 + owner 抽检 gate 过。
- AI 成本预告：273 次标注调用，DeepSeek 量级几元内。
