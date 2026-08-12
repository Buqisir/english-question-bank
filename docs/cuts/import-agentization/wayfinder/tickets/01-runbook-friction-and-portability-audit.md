# 现行导题 runbook 摩擦与可移植性审计

Status: done
Claim: wayfinder-charting-session-2026-08-12 (research 子代理已完成)
Blocked by: None
Type: research
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

只读本仓库主源（`docs/import/agent-runbook.md`、
`scripts/import-pipeline/README.md`、`docs/import-ledger.md`、
`docs/product/nck1-paper-standard.md`、`docs/cuts/` 下相关导入 cut 的票与
记录、`scripts/import-pipeline/**` 脚本本体），回答后续决定所依赖的现状
事实，写成
`docs/cuts/import-agentization/research/runbook-friction-and-portability.md`：

1. **步骤图与状态落点**：单卷端到端到底有哪几步、每步产出什么文件、落在
   哪个文件夹、用什么命令验证「这步完成了」。这是后台读取导入进度的
   事实基础。
2. **摩擦证据**：从 ledger、过往 cut 记录、runbook 自带的风险注记里，
   找出实际发生过的返工/易错/高耗时点（如手工转录、≥300 DPI 答案核对、
   placeholder 归一化坑、`sips` 裁剪坑），逐条给出出处。
3. **能力需求清单**：每一步需要 agent 具备什么能力（PDF 视觉读取、高
   DPI 渲染查看、子代理扇出、shell、长时注意力）；其中哪些是 Cursor
   特有工具，换成 Grok 或其他 coding agent 会话时会卡在哪。
4. **纯机械步骤**：哪些步骤不含判断、今天就可以脚本化/一键化（候选：
   shape gate、dry-run、publish、attach、verify、ledger 追加）。
5. **「任意 Agent 可导题」的差距**：当前 runbook 假设了哪些隐性前提
   （谁派 7 个分析子代理、谁盯重试、谁做视觉核对），要让一个从零进场的
   agent 独立走完，缺哪些契约件。

每条结论标注文件路径出处。不装依赖、不跑导入、不改本仓其他文件。

## Resolution

报告：[`../../research/runbook-friction-and-portability.md`](../../research/runbook-friction-and-portability.md)

- **① 步骤与落点**：格式②路径为 §0→§12，另含 Canonical request 物化与
  genre-truth；进度探针以 `papers/<id>/` staging、`canonical-import-request.json`、
  `app/public/paper-assets/<id>/latest`（+ listening/figures）、ledger 为准，
  每步 Done when 见报告 §1.2。
- **② 摩擦**：实证含手工转录高耗时、低 DPI 误读 Q55→强制 ≥300 DPI、PDF
  validator 首拒、`docxPath` 绝对路径生产崩溃、placeholder 归一化改
  manifest、扇出 JSON/`that/which` 重试、publish Done-when 假警报、extras
  非事务附加等（逐条出处在报告 §2）。
- **③ 能力**：卡点集中在 PDF/高 DPI 视觉、7× Opus 子代理扇出、`sips` 定框；
  Cursor Read/Task 可加速但非可移植前提，无子代理/无视觉的 Grok 会话会卡在
  §2/§4/§5。
- **④ 可一键化**：shape-gate、validate-one 循环、dry-run、verify-publish-gate、
  verify-nck1、（证据齐后的）build-canonical-request、attach、停 API→publish→重启、
  ledger 模板行；转录/分析/裁图/reviewed evidence/Owner QA 不可假装机械。
- **⑤ 契约缺口**：缺无子代理编排合同、reviewed-evidence 作者步骤、人工停点
  状态机、可 publish 的范例 config（`paper-2026-i` 无 `canonicalRequestPath`）、
  统一完成信号；另有 genre-truth/API 与「任意 Agent」策略未对齐。

### 未能核实

- 未实跑 import/publish/verify；未独立对源抽查答案。
- 未展开当前 Manifest 下 reviewed-evidence 完整文件/schema 清单。
- 酸测试卡壳轮次无独立完成报告文件可核。
- 未验证非 macOS playwright 裁图 fallback；未重证 DOCX 格式①×canonical publish。
