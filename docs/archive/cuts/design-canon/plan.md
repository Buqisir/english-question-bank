# design-canon Plan — 三址调研学习成果落 DESIGN.md（docs+注释刀）

## Cut Size

small（纯 docs + CSS 注释，零产品代码、零运行时变化）；touches schema /
data contract / product boundary / teaching interpretation: **no**。
CR-lite（主代理冷读）。

## Objective

把 2026-07-14 三址调研（poolside / StyleX / vibe-designing-playbook）
的可采纳项固化为 DESIGN.md 条款与 token 注释——「学到的东西」从聊天
记录变成宪法条文。出处：owner「我们要立项一下，从那三个网址学到什么」。

## 施工清单（全部已在调研报告论证，此处只落地）

1. **gaps.log 条款入 DESIGN.md**（vibe 手册）：agent 遇 token 覆盖不到
   的取值，禁止现场拼字面量兜底；显式记一条缺口（`docs/design-gaps.md`
   新建，格式：日期/位置/想要的值/临时方案），攒批等 owner 拍板收编。
2. **token 对照表**（StyleX「token 即契约」）：`--paper-*` 家族与
   `--motion-*` 家族在定义处（index.css / App.css）补齐用途对照注释
   ——每个 token 一行「它是什么、谁该用它、谁不该用它」；已有注释的
   核对补缺，不重写。
3. **覆盖顺序显式化约定入 DESIGN.md**（StyleX「确定性合并」）：易冲突
   的组合样式（同元素多 class 叠加处）后写样式必须注明「本条覆盖 X，
   因 Y」；作为 agent 写 CSS 的纪律条款，不做工具强制。
4. **留白法条款入 DESIGN.md**（poolside 检阅）：一句话条款——空态与
   低密度面（浏览态组头、空态、卡片内）允许且鼓励奢侈留白，留白不是
   待填补的缺陷；防止未来的刀「顺手填满」。
5. **DESIGN.md 声明分层体检**（vibe 手册六分法的轻量版）：按
   功能边界/领域语义/通用工艺/token 取值 四类给现有条款打标过一遍，
   发现互相打架的条款列出交 owner 裁决（预期 0-2 条）；只体检不重构，
   不搞满配层级。

## 账本备注（不在本刀，立项时一并挂账）

- 「阻断问题清单」（vibe 手册）→ 挂 R2 干扰项战役条目，设计机审优先级
  时一起做。
- 「实物做主视觉」（poolside）→ 挂 时文小报纸 未来档案：落地页用真报纸
  缩影不用概念插画。

## Forbidden

- 零产品代码改动（.tsx/.mjs/运行时 CSS 规则一律不动——只加注释）；
- 不重写 DESIGN.md 既有条款（体检发现的打架项报 owner，不自行改判）。

## Verification

- `node scripts/verify-motion-tokens.mjs` + `pnpm -C app run verify:all`
  （注释不该碰任何断言——全绿即证零运行时变化）。

## 裁决点清单

- [x] DP-1 立项（owner 2026-07-14「立项一下」；采纳清单出自当日调研
  报告，owner 已阅）
- [x] DP-2 主代理 CR-lite 冷读 APPROVE + 体检 0 条打架（2026-07-14，merge b67793d + CI 绿）
