# ui-teal-repaint — Cut Note（收官）

## 目标
全站产品外壳配色从"冷 slate + 暖纸红笔"两套混杂，统一为 owner 拍板的
**中性纸底 #F6F6F4 + 墨绿签名 #2C6E56**（专业工具台方向）。执行落地，非重新设计。

## 病根（本刀根治）
`tokens.css :root` 全是冷 slate/blue，`body` 背景从 `:root` 直漏 `#F8FAFC` 冷 slate，
而旧 DESIGN.md 写的"暖纸红笔"从未在 `:root` 落地——规范与代码两套，是 owner
"想象不出颜色"的根。本刀在 `:root` **源头根治**。

## 做了什么（C1–C9）
- **C1** `tokens.css :root`：12 个 `--eqb-color-*` slate/blue → 中性墨绿（改值不改名）。
- **C2** `index.css`：清 3 处硬编码蓝（`--surface-strong`/`--accent-glow`/`--blue-soft`）+ `--blue-text` 切断对 primary 的继承改中性。
- **C3** 收编 `App.css` 两个 `.home-mode-ai` 重映射块（删颜色变量重映射，继承新 :root，留布局）。
- **C4–C6** 全站硬编码扫净（App.css 300+、LoginPage、MySpace、DraftPaper、paperImport×2）：暖纸→中性，红笔 `#B8323C` 强调→墨绿 / 危险→`#dc2626`，金棕→墨绿，蓝/紫清零。
- **C7** 同步 3 个 verify 脚本的颜色断言（chip/selected-chip/focus/hover/notice/eyebrow/gradient）。
- **DESIGN.md** 重写：North Star「老师批注卷子」→「专业工具台」；三铁律 Color-Lock/No-Blue/Red-Pen → **True-Neutral/Single-Hue/Green-Pen 绿笔**；墨绿七档色阶（owner 示意版，OKLCH 明度均匀 + 逐档 AA 验证）。

## 流程 + 结果
`plan.md → PA(APPROVE w/ 2 MF) → PM 压缩 → DEV(dev-hard) → CR(APPROVE 0 MF) → 浏览器 QA(通过)`
- **PA**（fresh Opus）独立核实：圈1/圈2 边界成立（PaperSurface 零 `--eqb-color-*`，改 :root 不波及卷面）、爆炸半径可控、C7 扫 117 脚本无漏网、坐标无幻觉、AA 实算全过。2 MF 已压。
- **DEV**：11 文件，`verify:all` **68/68 全绿**，圈2 Forbidden 全 untouched。
- **CR**（fresh Opus）：APPROVE 0 MF——根源逐字一致、C7 断言↔CSS 一致、8 文件零残留、Green-Pen ≤10% 守住、Forbidden 未越界。
- **浏览器 QA**（真界面）：`body` 实测 **rgb(246,246,244)=#F6F6F4**（病根根治）；墨绿签名验证——主按钮 `#2C6E56` 白字、选中 chip 墨绿 wash+边+深绿字、search-submit 箭头墨绿、我的空间 active 文件夹墨绿；残留扫描首页+我的空间 **slate/blue 0 · 暖纸 0 · 紫 0**。

## 关键决策
- **MF-2（PM 定案 A1）**：语义色 = `:root` 现值 `#dc2626`/`#d97706`/`#059669`（成熟中性专业语义色，与新方向自洽、AA 优于暖化值），本刀不改，DESIGN.md 已对齐（契约=代码）。**owner PO QA 后可 veto**。

## 挂账（不在本刀）
- **语义色作正文文字 AA 既有债**（danger #dc2626≈4.46 / warning 2.94 / success 3.48 对新底）：本刀未新增破坏（底色明度近似），但作小正文文字 <4.5。跨文件语义色统一 + AA 达标 = 独立刀。
- **圈2 卷面渲染去暖**（PaperSurface 暖棕令牌 / 金 rail / 灰阶桌面）：独立决策，未纳入本刀。
- detail 看题页 + paperIntelligence 教师报告的语义色文字场景：浏览器 QA 未直接走到（入口 + 既有债），owner 真机 QA 覆盖；根变量传导已验证会继承新中性墨绿。
- SW-2 `--surface` 语义错配（映射到 bg 非 paper，既有，不改名）。

## Verify
`pnpm -C app run verify:all` 68/68 · verify-concierge-desk 250/0 · verify-home-default-feed 38/0 · verify-c8-draft-paper-render-model 31/0。
