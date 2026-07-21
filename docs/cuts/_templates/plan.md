# <CUT_ID> Plan — <一句话名称>

## Cut Size

<small / medium / large>。

Touches schema, data contract, product boundary, or teaching interpretation: <yes / no>。
<如果是 yes，简述触碰了什么>

## Objective

<一段话说清楚这个 cut 要达成什么。DEV 读完这段就知道目标>

## Locked Product Decisions

<PM 已拍板、DEV 不需要再猜的决定。每条一句话>

- <decision 1>
- <decision 2>

## 硬契约（不得偏离；偏离 = CR 打回）

<锁意图 + 边界 + 验收。每条独立可验证。这一档写「必须成立的事实」，
WHAT/WHY，不是实现步骤>

- C1 <contract 1>
- C2 <contract 2>

## 参考实现（可偏离，偏离须在完成报告里说明）

<给 DEV 的建议做法、候选落点、文案建议。机械 DEV 可给到清单级；
判断更重的 gnarly DEV 只留意图与边界；具体模型 / effort 只看 AGENTS.md。
自选决策进完成报告供 CR 复核>

- <suggestion 1>

## Forbidden

<绝对不能碰的东西。文件路径、模块、行为>

- <forbidden scope 1>
- <forbidden scope 2>

## Suggested Files

<建议的文件列表，DEV 可根据实际情况调整>

- <suggested file>

## Verification

<每条硬契约的验证方式：脚本、命令、手动检查。新契约优先行为断言
（起服打 API / import 真模块），不是源码正则断言>

- C1: <verification command / check>
- C2: <verification command / check>

## Browser QA Matrix

<仅 UI cut 需要。列出关键用例和预期结果>

| Case | Expected result |
| --- | --- |
|  |  |

## DEV Readiness

<哪些步骤可以立即开始，哪些有前置条件>

- Step 1 可以立即开始。
- Step N 依赖 Step N-1 的 verifier 通过。

## 裁决点清单(主代理出场点;施工中勾选)

<仅 medium / large 且主代理有步间裁决点时填写(MF 判定、owner 拍板转达、
QA 闸、merge)。这是 PM 层的断点锚:会话中断后接手者凭它定位 PM 走到了
哪个裁决点,不必重放长会话。裁决结论写进本目录文件,不塞 commit message>

- [ ] <裁决点 1>
- [ ] <裁决点 2>

## PA Follow-Up Decisions

<仅当本 cut 经过了 PA 且有 Must Fix 或 PO 决策时填写。记录 PA 发现的问题和 PM/PO 的处置>

Every PA Must Fix must map back to the checklist in `pa.md`. Big CR
verifies this table before treating the PA loop as closed.

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| `MF-1` |  |  |  |
