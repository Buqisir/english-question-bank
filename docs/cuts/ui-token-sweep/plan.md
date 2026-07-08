# ui-token-sweep（UI 一致性刀③：token 纪律大扫除）— DEV 执行契约

cut size: medium(-lite); touches schema/data-contract/product boundary: no
（纯 CSS + 钉色 verify 断言同步）。背景：`docs/cuts/ui-coherence/audit.md`
优先问题 ③（焦点环三套 / 圆角漂移 / 阴影散落 / 语义色硬编码 / AA）。

## 范围内文件（只这四个）

`app/src/App.css`、`app/src/auth/LoginPage.css`、
`app/src/features/admin/adminWorkbench.css`、
`app/src/features/draft-paper/DraftPaperWorkbench.css`
（+ 被钉色断言命中的 `scripts/verify-*.mjs`）

**排除**（发现命中也不动，报告里列出即可）：`shared-ui/papersurface/**`
（契约）、`paperSurfacePrototype/**`（死码，刀⑥/架构债）、
`paperIntelligence.css`（reading-analysis 孤儿支）、`writingPaperPage.css`
与一切卷面纸感阴影、`paperIntelligencePaperSurfaceHarness.css`（刀②刚收）。

## 1. 焦点/选中环统一（章程：`0 0 0 3px rgba(44,110,86,0.20)`）

已定位 7 处旧环（App.css 3466/3491 `outline: 2px solid rgba(44,110,86,.6)`；
3762/3787/4282 `box-shadow: 0 0 0 2px @0.6`；3650/4510 `inset 0 0 0 2px @0.6`）：
- box-shadow 外环 → 章程环原值。
- inset 两处（用于被裁剪场景）→ `inset 0 0 0 3px rgba(44,110,86,0.35)`
  （保留 inset 与可见性，色相入章程；在报告里附截图确认可见）。
- outline 两处 → 改章程 box-shadow 环 + 必要的 `outline: none`；若该处
  box-shadow 已被占用（叠加态）则叠加逗号声明，不得丢环。
全仓 grep `rgba(44, 110, 86, 0.6` 归零（排除目录除外）。

## 2. 圆角回刻度（章程：4 / 6 / 8 / 999）

- LoginPage.css:22 卡片 12→8；该文件内 8px 的输入框/按钮→6。
- adminWorkbench.css 卡片 12→8。
- App.css 一次性值：5,7→6；10,12→8；16→8。逐处过目：如某处 16px 是
  圆形头像/pill 语义则改 999 并在报告说明；其余机械归位。

## 3. 阴影收敛（章程：Resting `0 1px 2px rgba(30,30,28,0.06)` /
Floating `0 8px 24px rgba(0,0,0,0.12)`；Focus 环见 §1）

- DraftPaperWorkbench.css:344 `0 18px 46px @0.22`（超重）→ Floating。
- App.css:397（卡片静止）→ Resting；:3324（若为弹层/下拉）→ Floating，
  （若为静止卡）→ Resting——按元素角色判，报告里写明每处判法。
- App.css:1604 `-12px 0 40px`（侧抽屉方向性阴影）→ Floating（接受失去
  方向性；若视觉明显变差在报告举证，PO QA 裁）。
- LoginPage.css:24 `0 12px 32px` → Resting（Flat-By-Default；登录卡是
  静止卡不是弹层）。

## 4. 语义色硬编码入 token

- App.css:927/2268 `#16a264` → `var(--eqb-color-success)`。
- App.css:940/2280 `#c49b2a` → `var(--eqb-color-warning)`。
- 顺手 grep 这两个 hex 全仓归零（排除目录除外）。

## 5. #9a9a93 可见文字 AA 修复

审计实测两处（home 在 #ededea 上 2.4:1、my-space 在 #fff 上 2.8:1）。
grep App.css 及范围内文件中 `#9a9a93` / `var(--eqb-color-text-faint)` 的
**文字色**用法：placeholder / :disabled / aria-hidden 装饰属合法保留；
真实可见文字 → `var(--eqb-color-text-muted)`。逐处列进报告。

## 6. 钉色断言同步（DESIGN.md 明文要求）

grep `scripts/verify-*.mjs` 中上述所有旧字面量（`0.6)` 环、`#16a264`、
`#c49b2a`、`12px` 登录卡等）；命中则改断言为新章程值/委派形式，逐条在
报告单列理由。不许静默放宽任何断言。

## Forbidden

排除清单文件；TSX 一律不动；不加 token 定义（用现有）；不顺手做刀④⑤⑥
范围（骨架、hover 按钮、口吻、死 CSS 清扫——遇到只记录）。

## 验收

1. `npm run build --prefix app` 绿。
2. grep 证明：范围内 `rgba(44, 110, 86, 0.6`、`#16a264`、`#c49b2a`、
   `0 18px 46px`、`border-radius: 5px|7px|10px|12px|16px` 归零
   （排除目录除外）。
3. 相关 verify 复跑绿（以 §6 排查结果为准；至少跑 verify-error-copy-mainline、
   verify-concierge-desk、verify-home-default-feed 及被改断言的脚本）。
4. Playwright（1440×900）：home / draft-paper / my-space / admin 截图 +
   JS 断言：tab 聚焦一个 ghost-button 与一个 chip，computed box-shadow
   含 `rgba(44, 110, 86, 0.2`；home 上原 2.4:1 的元素 computed color 不再是
   #9a9a93。登录页本地 open 模式不可达：CSS 机械改动以 build+grep 验收，
   视觉留生产部署后 PO QA（写进报告）。
   环境同刀②（8787 + 4173，跑完杀进程）。截图放
   /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-token/。
5. 完成报告：§1-§6 逐条落实清单（每处 file:line 旧值→新值）、判断类
   改动（阴影角色判定、16px 语义判定）单列、verify 断言改动单列、
   截图路径、已知风险。
