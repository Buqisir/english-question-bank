# ui-teal-repaint — plan.md（DEV 执行契约）

cut size: **medium-large**；touches schema, data contract, product boundary, or
teaching interpretation: **no**（纯 CSS/token 改值 + DESIGN.md 契约文档 + CI
颜色断言同步；零 schema / 数据契约 / 行为逻辑改动，**全部可逆**）。

**PA**：上（聚焦 PA）。理由：改 `:root` 影响全站所有面（含 login /
paperIntelligence 等"自动继承"面），碰 DESIGN.md 契约 + 9 处 CI 断言；漏一处
即 CI 红或某面塌，全站返工贵。PA 聚焦审：①圈1/圈2 边界合理性 ②"自动继承"面
的 AA 风险 ③CI 断言 9 处是否漏 ④L3 重映射删除策略隐患。

**写法档位**：DEV = **dev-hard**（颜色映射需按语境判断——同一 hex 当文字 vs
当按钮底 vs 当选中态，映射不同；纯 sed 会错）。**禁 spawn 子代理**（转包并发
编辑 token 翻倍，见记忆 classic-retire-cut 教训）。

---

## Objective

把全站产品外壳从"冷 slate + 暖纸红笔"两套混杂配色，统一成 owner 拍板的
**中性纸底 #F6F6F4 + 墨绿签名 #2C6E56**（DESIGN.md 已重写为新契约）。**方向
已定，这是执行落地，不重新设计、不试色。** 病根是 `tokens.css :root` 全是冷
slate/blue、`body` 背景从 `:root` 漏出 `#F8FAFC` 冷 slate，而 DESIGN.md（旧）
写的暖纸从未在 `:root` 落地。本刀在**源头根治** `:root`，再扫净散落全站的
硬编码暖色/蓝/紫，同步更新钉死旧色的 CI 断言。

范围 = **纯产品外壳工具面（圈 1）**。卷面渲染 + 证据语义色 + 打印导出（圈 2）
**整体绕开**（见 Forbidden），独立决策。

**基线**：分支 `Buqisir/ui/teal-repaint` ← github/main **a26c275**（已含 #256
topic chip / #257 chip 对比度+赭红选中态 / #258 detail 退役·ADR-0015 / #259
AI 增强退役）。全部坐标已按此基线核实（App.css `.home-mode-ai` 块 L4419/L4507、
CI 断言行号、detail 已退役为看题页）。tokens.css / index.css / DESIGN.md 均未被
这 14 个 commit 触碰。

## Locked Product Decisions（PM 已定，DEV 不再猜）

- 方向 = 中性 + 墨绿，已 owner 拍板（绕一圈两次回到 #2C6E56）。不试色、不加档。
- 色值体系全部定死（下方"色值体系"表），OKLCH 明度均匀 + 逐档 AA 已算验证。
- 主按钮 = 墨绿底 + 白字（6.05:1）。旧"墨黑底按钮"退役。
- 强调只有墨绿一个色相。蓝、紫、赭红红笔、暖金全部收编或清除。
- 语义色 success/warning/danger **值不改**（跨文件不统一是既有债，不在本刀）。
- 卷面渲染 + 证据色 + 打印导出不动（圈 2）。

---

## 色值体系（定死，全部 AA 已算验证）

### 中性（owner 定死）
| 角色 | hex | 用途 | AA |
|---|---|---|---|
| bg | `#F6F6F4` | 全站底（替冷 slate #f8fafc）| — |
| surface | `#FFFFFF` | 卡片/面板/输入 | — |
| surface-2 | `#EDEDEA` | 次层/hover 中性/嵌套 | — |
| ink | `#1E1E1C` | 正文/标题 | 15.4:1 ✅ |
| muted | `#6A6A64` | 次要文字 | 5.03:1 ✅ |
| faint | `#9A9A93` | 非正文（占位/禁用）| 仅非正文 |
| border-subtle | `#E8E8E4` | 最浅分隔 | — |
| border | `#D8D8D2` | 主力可见边 | — |
| border-strong | `#C6C6C0` | 强边 | — |

### 墨绿七档（owner 示意版原值，明度均匀 + 逐档 AA 已验，色相 H≈166 锁定）
| 档 | hex | 用途 | AA |
|---|---|---|---|
| 50 | `#EAF1ED` | 选中浅态/soft tint 底 | 600 在其上 5.27 ✅ |
| 100 | `#CFE4DA` | tag 底/浅 hover | — |
| 200 | `#A5CDBD` | 选中态边/分隔强调 | — |
| 400 | `#5C9C83` | 图标/次强调 | — |
| **600** | **`#2C6E56`** | **主色·按钮·选中·链接·focus** | 白 6.05 / 底 5.59 ✅ |
| 800 | `#1E4A3A` | 深强调字/hover 压深 | 底 9.26 ✅ |
| 900 | `#123020` | 最深/强调标题 | 底 13.21 ✅ |

### 语义色（不改值，独立于墨绿签名）
success `#4A9D7F` · warning `#D97706` · danger `#C4543E`（及各文件既有变体，本刀保留）。

---

## 硬契约（不得偏离；偏离 = CR 打回）

- **C1 源头根治 tokens.css `:root`**：`app/src/shared-ui/tokens.css` 的
  `--eqb-color-*` 按下表改值（改值不改名；`bg-warm`/`desk` 名义漂移记为已知
  语义债，本刀不改名以免牵动全部 var 引用）：
  | 变量 | 旧 | 新 |
  |---|---|---|
  | --eqb-color-bg | #f8fafc | **#F6F6F4** |
  | --eqb-color-bg-warm | #fbfaf6 | **#F6F6F4** |
  | --eqb-color-desk | #f3efe7 | **#EDEDEA** |
  | --eqb-color-paper | #ffffff | #FFFFFF（不变）|
  | --eqb-color-border-subtle | #e2e8f0 | **#E8E8E4** |
  | --eqb-color-border | #d3cbbd | **#D8D8D2** |
  | --eqb-color-border-strong | #cbd5e1 | **#C6C6C0** |
  | --eqb-color-text | #1e293b | **#1E1E1C** |
  | --eqb-color-text-strong | #0f172a | **#141412** |
  | --eqb-color-text-muted | #64748b | **#6A6A64** |
  | --eqb-color-primary | #3b82f6 | **#2C6E56** |
  | --eqb-color-primary-text | #2563eb | **#1E4A3A** |
  | danger/warning/success + soft | — | 保留不动 |

- **C2 清 index.css 硬编码蓝**：`app/src/index.css`
  - `--surface-strong: #f1f5f9` → **#EDEDEA**
  - `--accent-glow: rgba(59,130,246,0.18)` → **rgba(44,110,86,0.20)**
  - `--blue-soft: rgba(59,130,246,0.08)` → **中性 #EDEDEA**（信息 chip 底，不占墨绿预算）
  - `--blue-text: var(--eqb-color-primary-text)` → **改为中性 #6A6A64**（切断对 primary 的继承；信息/事实 chip 文字 = 中性，不抢墨绿签名）
  - `--accent` / `--ink` / `--muted` / `--surface` 等其余映射不动（自动继承 C1 新值）。

- **C3 收编 App.css `.home-mode-ai` 两个重映射块**：`app/src/App.css` **L4419**
  （`.home-mode-ai {` 外壳块，4 个变量）与 **L4507**（`.detail-view {` 块，18 个
  变量）把语义变量重映射成暖色（行号已按 github/main a26c275 核实；detail
  退役刀 #258 只删 TSX，这两块 CSS 原样）。C1/C2 根治后这些暖值会**盖过**新中性
  墨绿。处理：**删除两块内的全部颜色变量重映射行**（`--ink/--ink-strong/--muted/`
  `--surface/--surface-strong/--panel/--line/--line-strong/--accent/`
  `--accent-glow/--blue-soft/--blue-text/--mint-*/--amber-*/--coral-*`），让
  detail/外壳继承 C1/C2 新根值；**保留非颜色属性**（`background` 硬编码改中性
  值、`max-width/margin/padding/display` 等布局原样）。L4419 的
  `background:#FAFAF7`→`#F6F6F4`；L4507 布局保留。

- **C4 全站硬编码暖色/蓝/紫 → 中性/墨绿（圈 1 主战场）**：按"全局映射表"
  （下方参考实现）改。重点文件：`App.css`（300+）、`paperImportAiWorkbench.css`、
  `paperImportWorkbench.css`、`DraftPaperWorkbench.css`、`MySpacePage.css`、
  `LoginPage.css`（暖色硬编码部分）。**同一 hex 按语境映射**（文字 vs 按钮底
  vs 选中态），见映射表例外栏。

- **C5 蓝/紫强调清零**：
  - `#64748B`（App.css slate muted 漏网 ×1）→ `#6A6A64`
  - `#2563eb`（App.css L403 workflow "ready" 态）→ `#2C6E56`（墨绿主态）
  - `rgba(99,102,241,*)` 靛紫 ×7（App.css AI-parse 强调）→ `rgba(44,110,86,*)`
  - `rgba(55,80,120,*)` / `rgba(234,239,245,*)`（App.css slate 卡片 L1219/1306/1308）→ 中性 rgba
  - `rgba(15,118,110,*)`（App.css synonym card 青蓝 L1378/1380）→ 墨绿 `rgba(44,110,86,*)`

- **C6 红笔/暖金 → 墨绿或语义（按语境）**：
  - `#B8323C` 赭红：作**强调/选中/链接** → `#2C6E56`；作**错误/危险** → `#C4543E`（danger）。DEV 按每处语境判断。
  - 暖金 `#C49B2A`/`#C6A044`/`rgb(214,154,71)`、赭石 `#B8732E`/`rgb(199,109,42)`、珊瑚 `#C97B5A`、MySpace 金棕 `#b88950`/`#f2eadf`：作**活动/hover/选中强调** → 墨绿（`#2C6E56` 或 teal-400 `#5C9C83`；active 底 → teal-50 `#EAF1ED`）；若确为**难度/警示语义** → 归 warning/保留。
  - **点名：concierge 选中态 chip（#257 刚上线的赭红 wash）→ 墨绿。** App.css
    `.concierge-starter-chip.is-selected`（约 L5265：`background rgba(184,50,60,0.10)`
    / `border-color #B8323C` / `color #B8323C`）→ 墨绿选中态（建议 `background`
    teal-50 `rgba(44,110,86,0.10)` 或 `#EAF1ED`、`border-color`/`color` `#2C6E56`
    或 teal-800 `#1E4A3A`）；连带 App.css 其它 `#B8323C` 强调（`accent-color` 约
    L4077、`rgba(184,50,60,*)` 约 L4099-4100、`color:#B8323C` 约 L4141/4856/5050）
    逐处按语境判定强调（→墨绿）vs 危险（→danger）。这些各有 CI 护栏，见 C7。

- **C7 CI 颜色断言同步**（改色后必更新，否则 CI 红。这不是 test-gaming——
  护栏钉的正是本刀正当替换的旧暖纸色，见记忆 ui-phase2-overhaul）：
  （行号按 github/main a26c275 核实；#256/#257 已使 verify-concierge-desk.mjs +51 行）：
  | 脚本:行 | 旧断言值 | 改为 |
  |---|---|---|
  | verify-concierge-desk.mjs:676 | chip border `#D3CBBD` | 新 chip 边中性值 |
  | verify-concierge-desk.mjs:677 | chip text `#6B645C` | `#6A6A64` |
  | verify-concierge-desk.mjs:681 | **selected chip border `#B8323C`** | `#2C6E56`（选中态墨绿）|
  | verify-concierge-desk.mjs:682 | **selected chip text `#B8323C`** | `#2C6E56` 或 `#1E4A3A` |
  | verify-concierge-desk.mjs:683 | **selected chip NOT `#1A1A1A`** + 注释「选中态用赭红/暖金」| 改注释为「选中态用墨绿」；断言逻辑随实现（若新选中态仍非墨黑填充可留，否则改判墨绿）|
  | verify-concierge-desk.mjs:684 | **selected chip wash `rgba(184,50,60,*)`** | `rgba(44,110,86,*)`（墨绿 wash）|
  | verify-concierge-desk.mjs:688 | intent-bar border `#DED9CF` | 新中性边值 |
  | verify-concierge-desk.mjs:690 | focus border `#1A1A1A` | `#2C6E56`（墨绿 focus）|
  | verify-concierge-desk.mjs:733 | paper-row hover `#F4F2EC` | 新中性 hover 值 |
  | verify-concierge-desk.mjs:766 | notice `#6B645C` | `#6A6A64` |
  | verify-concierge-desk.mjs:826 | anti-regression：禁 `:focus-visible` 用 `rgba(26,26,26,0.08)` | **保留**（本刀 focus 用墨绿 `rgba(44,110,86,0.20)`，不违反；勿引入 0.08 近隐形环）|
  | verify-home-default-feed.mjs:262 | eyebrow `#6B645C` | `#6A6A64` |
  | verify-c8-draft-paper-render-model.mjs:247 | gradient `#FAFAF7`/`#F4F2EC` | 新中性值 |
  断言里的 hex 必须与 DEV 实际写进 CSS 的新值**逐字一致**。DEV 改前先 `grep -n`
  重新核对行号（这些是易变行，不可信任本表行号，只信语义）。

- **C8 AA 全绿**：所有正文/占位符文字对底 ≥4.5:1，大字/UI ≥3:1。改底色后
  重点抽验"自动继承"面（paperIntelligence 报告、login）与语义色在新中性底上的
  对比度。浏览器 QA 实测 0 AA fail。

- **C9 零蓝零紫零暖纸残留**：改造完，圈 1 所有面浏览器实测：无 slate/blue
  (#3b82f6/#2563eb/slate 系)、无靛紫、无暖纸红笔遗留色（#FFFDF8/#B8323C 作强调）。

---

## 参考实现 · 全局 hex → hex 映射表（DEV 主战场，按语境判断例外）

| 旧（暖/冷） | 默认新值 | 语境例外 |
|---|---|---|
| #FFFDF8（暖纸卡片）| `#FFFFFF` | — |
| #FAFAF7（暖面）| `#F6F6F4` | 当"比底略深的卡面" → `#FFFFFF` |
| #F4F2EC（暖 surface-warm/hover）| `#EDEDEA` | hover 强调可用 teal-50 `#EAF1ED` |
| #EFEDE6（暖 sand）| `#EDEDEA` | — |
| #F0EBE0（暖 deep）| `#E8E8E4` | — |
| #E5E3DC（暖边，主力 33处）| `#D8D8D2` | — |
| #DED9CF（暖边略深）| `#D8D8D2` | strong 层 → `#C6C6C0` |
| #B8B0A0（暖边深）| `#C6C6C0` | — |
| #1A1A1A（近黑墨 71处）| `#1E1E1C` | **按钮底/选中边/focus 强调 → `#2C6E56`** |
| #6B645C（暖弱墨 54处）| `#6A6A64` | — |
| #9A9180（极弱墨）| `#9A9A93` | — |
| #B8B3AA / #8A8275 / #9A9590（暖灰）| 就近 `#9A9A93` 或 `#6A6A64` | 按明度 |
| #B8323C（赭红红笔）| `#2C6E56`（强调/选中）| 错误/危险 → `#C4543E` |
| 暖金/赭石/珊瑚/金棕 | `#2C6E56` 或 `#5C9C83`（强调）；`#EAF1ED`（active 底）| 难度/警示语义 → 保留 |
| #64748B / #2563eb / 靛紫 / slate rgba | 墨绿或中性（见 C5）| — |
| success/warning/danger 值 | 不动 | — |

**语境判断纪律（dev-hard 核心）**：改每一处前判断该色的**角色**——铺面/文字/
边框（→中性）还是 主操作/当前选中/链接/焦点/活动强调（→墨绿签名）。墨绿总量
守 ≤10%（Green-Pen）。有疑义的处，进完成报告列出供 CR 复核。

---

## Forbidden（越线即停 — 圈 2 卷面契约 + 护栏）

- **卷面渲染契约面，一律不碰**：
  - `app/src/shared-ui/papersurface/PaperSurface.css`（证据色 mint/amber、
    金 rail #d4ad60、桌面灰阶 #ececec）
  - `app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css`
    （PR#52 锁定注释，mint/amber 证据色 + `--seven-*` 色环 + `--pi-ps-*` 暖棕令牌）
  - `app/src/features/paper-intelligence/writingPaperPage.css`
  - `app/src/features/paper-intelligence/paperSurfacePrototype/paperSurfacePrototype.css`
  - `app/src/features/reading-analysis/readingAnalysis.css` + `LinkOverlay.tsx`
    （support/trap 证据色 #2E8C5F/#B8732E，与 PaperSurface 证据系统同源）
- **打印/导出 styling**：`app/src/features/draft-paper/draftPaperPreviewHtml.ts`
  （生成打印 HTML 模板，属 print/export 禁区）。
- **契约文件**：`server/**`、domain / schema / `*Adapter.ts`、paper-assets、
  reducer / 状态契约 / 数据获取 / URL state / 跨组件同步。**只改 CSS + DESIGN.md
  + 指定 9 处 CI 断言**，不改任何 TS 逻辑（tsx 内联颜色若有，仅 display-only 改色）。
- **verify 脚本**：除 C7 列的 9 处颜色断言外，**不碰任何 verify 脚本**（尤其
  paper-surface 系列的证据色/防蓝防紫断言，那是圈 2 护栏，与本刀方向一致，保留）。
- **语义色值**：不改 success/warning/danger 的具体 hex（跨文件不统一是既有债）。
- **不改名 token 变量**（`bg-warm`/`desk` 保名改值）。
- **不做 sed 全局无脑替换**（语境例外会错）。

## Suggested Files（DEV 可按实际调整）

- 根源：`app/src/shared-ui/tokens.css`、`app/src/index.css`
- 主战场：`app/src/App.css`、`app/src/features/paper-import-ai/paperImportAiWorkbench.css`、
  `app/src/features/paper-import/paperImportWorkbench.css`、
  `app/src/features/draft-paper/DraftPaperWorkbench.css`、
  `app/src/features/my-space/MySpacePage.css`、`app/src/auth/LoginPage.css`
- 自动继承（改 :root 后目视复核，不主动改）：
  `app/src/features/paper-intelligence/paperIntelligence.css`（181 var）、
  `app/src/features/admin/adminWorkbench.css`（4 var）
- CI：C7 的 3 个脚本
- 契约文档：`DESIGN.md`（**已由 PM 重写为新墨绿契约**；DEV 核对代码与它一致，不再改 DESIGN.md）

## Verification

- **C1–C6, C9**：`node scripts/verify-concierge-desk.mjs`、
  `node scripts/verify-home-default-feed.mjs`、
  `node scripts/verify-c8-draft-paper-render-model.mjs` 全绿（断言已按 C7 更新）；
  然后 **`pnpm -C app run verify:all` 全绿**（AGENTS.md RM 门：全套必须绿，
  不只邻近脚本）。
- **C7**：3 个脚本的新 hex 与 CSS 实写值逐字一致。
- **C8**：浏览器 QA 抽验 AA（下方 Matrix）。
- **C3 收编**：grep `app/src/App.css` 确认 L4553/L4658 块内已无颜色变量重映射
  残留；detail 视图浏览器实测继承新中性墨绿。

## Browser QA Matrix（主 agent 做，真界面实测）

| Case | Expected |
|---|---|
| 找题主面（ConciergeDesk）| body 中性 #F6F6F4、chip/搜索/feed 中性+墨绿签名，0 slate 0 暖纸 |
| 详情视图（题组详情，#258 已退役为看题页 + owner-only 纠错）| 继承新中性墨绿，语义 chip AA 达标，0 蓝 0 暖 |
| 组卷工作台（DraftPaper）| 工具栏/卡片中性、主操作墨绿、0 暖纸 |
| 导入工作台（paperImport / -ai）| 中性 + 墨绿、语义三态色仍在、0 暖 |
| 登录页 | 中性底、主按钮墨绿白字、focus 墨绿、0 暖纸 |
| 我的空间 | active 文件夹墨绿强调、0 金棕 |
| 教师报告预览（paperIntelligence）| 自动继承中性墨绿、信息 chip 中性、AA 达标 |
| body 根背景 | 实测 = #F6F6F4（非 #F8FAFC）— 病根已除 |
| 全站扫色 | 0× (#3b82f6/#2563eb/slate/靛紫/#FFFDF8作强调/#B8323C作强调) |

## DEV Readiness

- C1（tokens.css）先做——它是根，改完全站基线即变，后续硬编码是收尾。
- C2（index.css）紧随。C3（收编 App.css 两块）在 C1/C2 后（否则暖值仍盖）。
- C4–C6（硬编码扫净）逐文件推进，App.css 最大放重点。
- C7（CI 断言）与 C4 并行改（改哪处颜色就同步改对应断言）。
- 全部完成 → verify:all → 报告。

## PA Follow-Up Decisions

（PA 后填）

| PA item | pa.md required disposition | plan.md handling | Status |
| --- | --- | --- | --- |
| | | | |
