# 管理后台的信息架构与审核体验

Status: done
Claim: none
Blocked by: [01](01-runbook-friction-and-portability-audit.md)
Type: grilling
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

后台是 owner 审核与上线的唯一面。基于票 01 的步骤图/状态落点，与 owner
拷问定下：

1. **状态模型**：一卷在后台里有哪几种状态（排队/导入中/待答案核对/待
   QA/可上线/已上线/失败），状态从哪读（文件夹落点？状态文件？）。
2. **答案核对怎么审**：人工确认点①的界面形态——转录出的答案表与
   ≥300 DPI 原卷渲染怎么并排呈现，逐格确认怎么记录。
3. **发布前 QA 怎么审**：人工确认点②看什么——试卷预览（Screen/Print）、
   分析抽样、verify 门禁绿灯汇总？
4. **列表与检索**：一两百套/年的量下，后台首页给 owner 看什么（队列、
   最近导入、待办确认点）。
5. **命名**：这个面的正式名字（管理后台/导题后台/Import Console），
   定下后写入 `CONTEXT.md`。

执行时用 `$grilling` + `$domain-modeling`；涉及视觉方向先读
`docs/steering/README.md` 相关条目。

## Resolution

Owner 2026-08-12 接受（含状态/QA面/首页推荐）。

1. **命名**：**导题后台**（`CONTEXT.md`；英译 Import Ops Console，中文名为准）。
2. **确认点**：
   - 不对答案（人）。答案随解析字段做全；**AI Answer Transcription Check** 对照源抄写/与解析一致性（非解题；nck1 §3）。后台无人工答案表。
   - **上线前 QA（人）** 必留。
3. **状态模型**（读盘为主）：`queued` → `importing`（含 AI 答案复核）→ `awaiting_qa`（本地 publish + 门禁绿 + AI 复核过）→ `ready_to_ship`（QA 通过）→ `shipped`（本机 ship 收据）/ `failed`。
4. **QA 面**：Screen 预览 + Student/Teacher Print 入口 + verify/门禁绿灯一行；分析不设必过抽检清单。
5. **首页**：待办优先（待 QA + 失败）+ 最近导入；不做统计仪表盘。
