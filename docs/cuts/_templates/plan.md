# <CUT_ID> Plan — <一句话名称>

## Cut Size

<small / medium / large>。

Touches schema, data contract, product boundary, or teaching interpretation: <yes / no>。
<如果是 yes，简述触碰了什么>

## Objective

<一段话说清楚这个 cut 要达成什么。DEV 读完这段就知道目标>

## Locked Product Decisions

<PM 已拍板、DEV 不需要再猜的决定。每条一句话>

- 
- 

## Must Do

<分步，每步独立可验证。步骤之间有依赖就写清楚>

### Step 1 — <名称>

- 
- 

### Step 2 — <名称>

- 
- 

## Forbidden

<绝对不能碰的东西。文件路径、模块、行为>

- 
- 

## Suggested Files

<建议的文件列表，DEV 可根据实际情况调整>

- 

## Verification

<每步的验证方式：脚本、命令、手动检查>

- Step 1:
  - 
- Step 2:
  - 

## Browser QA Matrix

<仅 UI cut 需要。列出关键用例和预期结果>

| Case | Expected result |
| --- | --- |
|  |  |

## DEV Readiness

<哪些步骤可以立即开始，哪些有前置条件>

- Step 1 可以立即开始。
- Step N 依赖 Step N-1 的 verifier 通过。

## PA Follow-Up Decisions

<仅当本 cut 经过了 PA 且有 Must Fix 或 PO 决策时填写。记录 PA 发现的问题和 PM/PO 的处置>

- 
