# ui-teal-repaint — pa.md（PA 独立冷读审查）

## Verdict

**APPROVE WITH MUST FIX**

方向 owner 已拍板（不审）。落地方案的正确性/完整性/边界经独立核实**基本扎实**：
圈1/圈2 边界成立、爆炸半径可控、C7 CI 断言穷尽扫描**无漏网且行号精准**、C3 坐标准确、
C5/C6 坐标无幻觉。但有 **2 个 Must Fix**（一个是 plan 对"自动继承"面的描述失真会误导
DEV 的 AA 复核对象，一个是 DESIGN.md 契约与 :root 语义色值自相矛盾需 plan 显式定性），
外加若干 Should Watch。均不改方向，改 plan 文字/补断言即可放行。

---

## 5 个高风险点 · 独立核实结论

### 1. 圈1/圈2 边界 — **成立（含关键验证）**
- 关键核：`shared-ui/papersurface/PaperSurface.css` **零** `--eqb-color-*` 引用（`grep -c`=0），
  只吃自己的 `--ps-*` 命名空间令牌（`--ps-ink/--ps-muted/--ps-rule/--ps-active-rail`…）。
  → **改 :root 不波及卷面**，plan 的"圈2绕开"是**真的**，不是假的。
- `paperIntelligencePaperSurfaceHarness.css` 同样零 `--eqb-color-*`，吃 `--pi-ps-*` 令牌。
- 圈2 划入 Forbidden 的 PaperSurface / harness / writingPaperPage / readingAnalysis+LinkOverlay /
  draftPaperPreviewHtml.ts 均是证据色/打印契约，划出合理，无"该改却漏"的用户日常面被误锁。
- 无"不该碰却划进圈1"的契约面。**边界确认通过。**

### 2. 改 :root 的爆炸半径 — **可控，但 plan 描述失真（→ Must Fix #1）**
- 全站直接吃 `var(--eqb-color-*)` 的文件只有 **3 个**：`App.css` / `auth/LoginPage.css`
  （仅 `--eqb-color-bg-warm` ×1）/ `index.css`。**无 tsx 内联** `var(--eqb-color-*)`。半径可控。
- `body` 背景链 = `--surface` → `--eqb-color-bg` = 改后 #F6F6F4 → **病根（body 漏 #F8FAFC）确被根治**。
- **失真点（Must Fix #1）**：plan Suggested Files 写"paperIntelligence.css（181 var）/
  adminWorkbench.css（4 var）自动继承 :root"。实测 **paperIntelligence.css 与
  adminWorkbench.css 都零 `--eqb-color-*` 引用**。它们吃的是 index.css 中间层语义变量
  （`--muted/--accent/--line/--ink/--blue-soft/--mint-text/--amber-text/--coral-text`…）。
  继承链是 :root(C1) → index.css(C2) → 这些面，方向仍对，但 plan 把 AA 复核对象指错了源头。

### 3. C7 CI 断言完整性 — **穷尽扫描：无漏网，行号精准**
- 独立 grep 全部 **117 个** `scripts/verify-*.mjs`，用本刀会改的旧色全集
  （#1A1A1A/#6B645C/#B8323C/#FAFAF7/#F4F2EC/#E5E3DC/#DED9CF/#D3CBBD/#2563eb/#3b82f6/
  rgba(184,50,60)/rgba(99,102,241)/#64748B/#f8fafc…）扫**颜色断言**：
  钉住会改旧色的断言**只在 plan C7 列的 3 个脚本**（verify-concierge-desk / home-default-feed /
  c8-draft-paper-render-model）。**零漏网。**
- 逐行核对 C7 表：676/677/681/682/683/**684**（`rgba(184,50,60,` wash 断言确存在）/688/690/
  733/766/826 全部真实、语义准确；home-default-feed:262 eyebrow #6B645C、
  c8:247 gradient #FAFAF7/#F4F2EC 均实存。**C7 表可直接用**（DEV 仍须改前 grep 复核行号，
  plan 已如此要求）。
- paper-surface 系列的反蓝/反红/反紫断言（insight.mjs L1210-1220 / L1575）是 `railScopedSrc`
  作用域的"**不引入**"类圈2护栏，与本刀禁蓝方向**一致**，本刀不引入蓝故不会误触发。
  plan Forbidden 正确要求不碰它们。**无误伤。**

### 4. C3 删两块重映射的副作用 — **坐标准确，副作用需 plan 点名兜底（→ Should Watch）**
- L4419 = `.app-shell.home-mode-ai {` 外壳块（`background:#FAFAF7` + 4 个 slate 重映射注释自证）；
  L4507 = `.app-shell.home-mode-ai .detail-view {` 块。**行号准确。**
- 删除后 detail 语义 chip 的 `--mint/--amber/--coral` 回到 index.css 标准值。实测这些标准值：
  index.css 里 `--mint-text=--eqb-color-success=#059669`、`--amber-text=#d97706`、
  `--coral-text=#dc2626`（**注意：是 :root 的 #059669/#dc2626，非 DESIGN.md 的
  #4A9D7F/#C4543E** — 见 Must Fix #2）。这些当**文字**用时对新中性底 AA 不足（见下），
  但它们通常显示在 `*-soft`（rgba 0.08）chip 底上、且改底前后底明度几乎不变（#F8FAFC→#F6F6F4），
  故**本刀不新增 AA 破坏**（既有债）。属 Should Watch，非阻断。

### 5. 映射可执行性 + 语义色 AA — **可执行；但语义色作正文文字全部不过 AA（→ Must Fix #2 + Should Watch）**
- 我实算了新中性底 #F6F6F4 上的对比度：
  - **过 AA（4.5+）**：墨绿 #2C6E56=5.59、primary-text #1E4A3A=9.26、muted #6A6A64=5.03、
    ink #1E1E1C=15.43、墨绿对白（按钮）6.05。**plan 声称的墨绿/中性数据属实。**
  - **不过 4.5（作正文文字时）**：danger #dc2626=**4.46**、danger #C4543E(DESIGN)=**4.14**、
    success #059669=**3.48**、success #4A9D7F(DESIGN)=**3.02**、warning #D97706=**2.94**、
    faint #9A9A93=**2.62**。
- 判读：这些语义色**作 chip 底/边/图标/大字/状态点**时合格（≥3:1 大字/UI），
  作**小正文文字**时不合格。plan 保留语义色值不改是既有债——**改底本身不改变它们的 AA 结论**
  （旧底 #F8FAFC 明度近似）。故不阻断，但 C8 浏览器 QA 必须**具体抽验语义色作文字的场景**
  （paperIntelligence 的 mint/amber/coral-text 大量 `color:` 用法 — L44/99/104/109/407/415/…）。
- `#1A1A1A`（文字→#1E1E1C vs 按钮底/选中/focus→#2C6E56）、`#B8323C`（强调→墨绿 vs 危险→danger）
  的语境映射对 dev-hard **可执行**，plan 映射表 + C6 逐处点名坐标（4077/4141/4856/5050/5267-5275）
  足够，无歧义到 DEV 会猜错的地步。

---

## Must Fix Before DEV（阻断，须改 plan）

### MF-1：修正"自动继承"面的描述，把 AA 复核对象指到 index.css 中间层
- **风险**：plan Suggested Files 说 paperIntelligence.css（181 var）/ adminWorkbench.css（4 var）
  "自动继承 :root"。实测二者**零 `--eqb-color-*` 引用**，吃的是 index.css 语义层
  （`--muted/--accent/--line/--mint-text/--amber-text/--coral-text/--blue-soft/--blue-text`…）。
  DEV 若照 plan 去 :root 找波及点，会**漏看 C2（index.css）才是这两面的真正上游**，
  且 C8 AA 抽验会盯错源头。
- **处置（一句话）**：改 plan Suggested Files 与 C8——注明"paperIntelligence/adminWorkbench
  经 **index.css 语义层**（非直接 :root）继承，AA 复核重点是 index.css 的 `--mint/--amber/--coral/
  --blue-*` 映射在新中性底上的 text 用法"。

### MF-2：显式定性 DESIGN.md 语义色（#C4543E/#4A9D7F）与 :root/index.css 实际值（#dc2626/#059669）的矛盾
- **风险**：DESIGN.md（HEAD 已 commit）契约写 danger `#C4543E`、success `#4A9D7F`；
  但 tokens.css :root 实为 danger `#dc2626`、success `#059669`，且 plan C1 明确"success/warning/
  danger 值不改"。→ **交付后 DESIGN.md 契约与代码不一致**，CR 或 owner QA 会当成缺陷打回，
  或 DEV 自作主张去改 :root 语义色（越出 plan 范围、且会连锁 paperIntelligence 语义 chip）。
  这是 SPEC 内部不自洽，不是我臆造。
- **处置（一句话）**：plan 加一条 Locked Decision 显式声明"DESIGN.md 语义色 hex 是**目标态**，
  本刀**不落地**（保留 :root #dc2626/#059669/#d97706），跨文件语义色统一另立债项"，
  并要求 CR 不据此判 DESIGN 不符；否则 owner 拍板是否本刀就把 :root 语义色对齐 DESIGN
  （若对齐则纳入范围 + 补 AA 抽验，因 #C4543E=4.14/#4A9D7F=3.02 作文字更差）。

---

## Must Fix → Plan Disposition Checklist

| MF | plan.md 该如何改 | Status |
|---|---|---|
| MF-1 | 改 Suggested Files「自动继承」段 + C8：注明 paperIntelligence/adminWorkbench 经 index.css 语义层继承，非直接 :root；AA 复核盯 index.css 的 mint/amber/coral/blue 映射 | 待 PM 落 |
| MF-2 | 加 Locked Decision：DESIGN.md 语义色 hex 为目标态、本刀不落地（:root 保 #dc2626/#059669/#d97706）；或 owner 定夺是否纳入范围 | 待 PM/PO 落 |

---

## Should Watch（非阻断）

- **SW-1 语义色作文字 AA 债**：mint/amber/coral-text 在 paperIntelligence 大量作 `color:`
  文字（L44/99/104/109/407/415/475/481/538/564/588/802/1402/1406/1412…）。改底不新增破坏
  （既有债），但 C8 浏览器 QA 必须**具体走到这些证据/状态文字场景**核 AA，别只测外壳。
  非阻断因：既有债、改底明度近似不恶化。
- **SW-2 `--surface` 语义错配**：index.css `--surface: var(--eqb-color-bg)`（=底色 #F6F6F4），
  而 DESIGN.md 说 surface=#FFFFFF。既有错配，plan 不改名故行为不变，非本刀问题。将来若统一
  token 语义需另立债。
- **SW-3 C3 外壳继承塌陷抽验**：删 L4419/L4507 颜色重映射后，外壳（ghost-button 的
  `--surface-strong/--line/--line-strong` 链）继承新 :root/index.css。plan 已要求 grep 残留 +
  浏览器实测，足够；watch 点是别遗漏 L4419 的 `background:#FAFAF7`→中性（plan 已点名 #F6F6F4）。
- **SW-4 C6 `#B8323C` 三处 `color:`（L4141/4856/5050）语境判定**：dev-hard 可执行，
  但要求 DEV 在完成报告逐处列出"判为强调（→墨绿）还是危险（→danger）"供 CR 复核，plan 已有此纪律。

---

## 边界确认

- **圈1/圈2 边界正确**：PaperSurface/harness 用独立 `--ps-*`/`--pi-ps-*` 令牌，改 :root 不波及卷面。
- **爆炸半径可控**：仅 App.css/LoginPage.css/index.css 直吃 `--eqb-color-*`，无 tsx 内联。
- **C7 无漏网**：117 个 verify 全扫，颜色断言只在 plan 列的 3 脚本，行号语义精准。
- **C5/C6 坐标无幻觉**：#B8323C（9 处）、#2563eb(L403)、靛紫 rgba(99,102,241)、
  synonym rgba(15,118,110)(L1378/1380) 全部实存。
- **Forbidden 护栏正确**：paper-surface 反蓝/红/紫断言是圈2护栏、与本刀同向，不碰正确。

## Open PO Decisions（≤3）

1. **MF-2**：DESIGN.md 语义色（#C4543E/#4A9D7F）—— 本刀是"契约留目标态、代码不落地"，
   还是"本刀就把 :root 语义色对齐 DESIGN"（后者需扩范围 + 更严 AA 抽验）？

仅 1 项待决，未超 3。解决 MF-1（纯描述修正，PM 可自决）+ MF-2（PO 拍板）后即 DEV-ready。
