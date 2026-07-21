# applied-writing-lecture · Handoff（2026-07-21，会话切换）

> 2026-07-21 更新：DP-3 二轮 owner QA「不合格」→ 三轮返工已落
> （选中零变色/信件排版/hover 抖动根除 + 右栏常驻审题卡，拍板全文
> decisions.md §7）。主代理复核：tsc 0、DP-2 24/24、verify:all
> 84P/1S/0F。待 owner 三轮 QA。delta CR 范围扩为 `fdfd868..HEAD`。

## 现在停在哪

**裁决点 DP-3（owner PO QA）进行中，其余全部干净。** 分支
`applied-writing-lecture`（worktree `../wt-applied-writing-lecture`），
工作树 clean，未合并未 push。

## 已完成 & 已验证

- DEV 一轮（D1–D6 + 试点 fixture）`e419ddb..fdfd868`；fresh Opus CR
  **APPROVE 0 MF**（`cr.md`，commit `5e339cd`）。
- D7 试点两卷过双 gate（`64d3490`）：2024-I 全套新产；2022-I 修两超纲词
  （horizons/slot）重挂。
- **DP-3 首轮 owner QA 拍板 → DEV 二轮返工 `2be7923`**（拍板全文
  `decisions.md` §6）：审题卡改课堂真卡四节（基础五定/圈要点编号/
  读者三问/价值落点，判型写「描述类/思辨类」）；〔判〕〔读〕〔时〕〔点〕〔清〕
  显性标志删除，锚句点开才出讲解；选中/激活一律不变色；解析框白底、
  头部徽标删除。两卷 reviewCard 用 owner 教案第一课参考卡原文重灌
  （走真产线双 gate）。
- 主代理复核（二轮后，均真实退出码）：restart3 148/0、tsc 0、
  verify:all 84P/1S/0F、DP-2 脚本 21/21。

## 悬空清单（仅 3 项，全部有主）

1. **DP-3 owner QA 未完成**（卡在本地登录摩擦上，非产品问题）：
   起服务 `cd wt-applied-writing-lecture/app && npm run dev`；重置账号
   `node scripts/create-user.mjs --reset-password --username qa-local-owner
   --password <P>`（注意 DP-2 脚本每次跑都会革除会话，owner 登录前重置
   一次）；QA 入口
   `http://127.0.0.1:5173/?view=paper-browse&paperId=paper-2024-i&focusGroupId=group-2024-i-writing-application&lecture=1`
   （另两卷：paper-2022-i 同款；paper-zj-2026-jan 验「解析未发布」）。
   对照单在 plan.md（注意其中「审题卡六格/标志互指」表述对应旧版，以
   decisions.md §6 新拍板为准）。
2. **二轮 delta（`64d3490..2be7923`）未过 CR**：一轮 CR 只盖到
   `fdfd868`。DP-4 merge 前需对 delta 补一把 fresh Opus CR（重点：
   schema 形状二改、锚句 hover/lock 状态机修复——DEV 自报小改动、
   validator 11 字段 gate）。
3. **DP-4 收官全套未动**：merge（在主树执行）→ 盯 main CI → STATUS
   收官行（含 token 账单：DEV 322k+177k、CR 72k、guide 28k ≈ 0.6M 子代理
   tok；主代理出场≈8 次）→ 移除主树 `.claude/contract-unlock`（现存在，
   故意留到收官）→ `git worktree remove` → wayfinder 票 06 解锁
   （`.scratch/applied-writing-analysis/`，06 票已挂 SW1 口径备忘）。

## 主树侧状态

- main HEAD `d7c0b72`（plan 两 commit 均已入）；`.scratch` 地图 05 关票、
  06 阻塞标注齐。`.claude/contract-unlock` 在（勿删，DP-4 收）。
- 本地 dev 服务已关；worktree 的 data/*.sqlite 是本地副本
  （question-bank 曾被 QA 跑空过一次，从主树 cp 即恢复）。
