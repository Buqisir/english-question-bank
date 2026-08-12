# 试点：用 Grok 会话按现行 runbook 导一卷

Status: done
Claim: none
Blocked by: None
Type: task (HITL)
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

Owner 至今没有一手跑过导题流程，痛点全靠推测。在做任何自动化决定之前，
用 owner 本机的 Grok（coding agent 会话）按 `docs/import/agent-runbook.md`
原样导一卷真卷（owner 在场），产出第一手证据：

1. Grok 会话在哪些步骤卡住/需要人救（PDF 读取？7 组分析扇出？高 DPI
   答案核对？shell 纪律？）。
2. 每步实际耗时与 owner 被占用的注意力时长。
3. 产物落点是否与票 01 画出的步骤图一致；哪些「完成信号」后台可以直接
   读文件判断。
4. 分析（reading/seven/cloze/grammar 共 7 组）的真实质量观感——为雾区
   「分析质量抽检」提供实据。

前提：owner 提供一套符合格式白名单的源文件（paper.pdf + answers.pdf 或
DOCX 答案版）。只写本地 DB 与本地 paper-assets，绝不触生产。

## Resolution

格式① DOCX 试点 `paper-pilot-2025-zj-jan`（2025 浙江 1 月答案版）在本地跑到
publish 门口后 **未入库**：`--publish` 硬要 `canonicalRequestPath`，而 DOCX
信任身份只认「全国高考一卷」标题、PDF canonical producer 又不服务格式①——
停在该 blocker，未发明映射、未写正式 ledger、未碰 `paper-zj-2025-jan`。

一手摩擦：表格式费用格 → 裸数字伪大题 → Reading A 空段落而 shape-gate 仍绿；
grammar marker 粘连触发 publish-gate；无听力源却撞 `verify-nck1` listening；
无子代理扇出；答案 AI 对照源复核 21–65 全一致（owner 未对答案）。约 2.5–3.5h，
owner 注意力 0。

证据：`docs/cuts/import-agentization/research/pilot-grok-2025-zj-jan.md`
（卡点/耗时/探针/分析观感/答案复核/票 04 契约缺口）。
