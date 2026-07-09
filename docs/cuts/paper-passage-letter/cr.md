# CR — paper-passage-letter（阅读篇章居中 A/B/C/D）

- Reviewer: 独立 CR（fresh cold read）
- Diff: `b1dbced..85c735e`（单 commit `feat(paper-passage-letter)`）
- Verdict: **APPROVE**
- Review depth: 中（触碰 PaperSurface 高危面 + docxRenderer 局部放行，逐面核界）

## 结论

三个消费面（屏幕 PaperSurface / print-renderer / docxRenderer parity）严格守
plan 契约与 §48/§83-84 标准，无 Must Fix。派生规则安全、插入点无副作用、
verify 断在真行为、tsc 绿、QA 截图（含负控）齐全。放行合并。

## 核过的关键点

1. **字母派生穷举安全（重点1）**：`/([A-D])$/` 应用于 PaperSurfaceSection 的
   `section`。逐一核对所有喂 PaperSurface 的 adapter 的 section 取值：
   - reading（paperAssetSurfaceAdapter）：`SECTION_BY_READING_GROUP_ID` →
     裸字母 A/B/C/D；fallback `group.title.replace(/^Reading\s+/i,'').trim()`
     对真资产 "Reading A" → "A"。唯一产字母源，符合预期。
   - cloze `完形填空` / grammarFill `语法填空` / sevenChoices `七选五` /
     writing `读后续写`|`应用文写作` / metadata `阅读理解` —— 全为中文标签，
     尾字符 空/五/写/解，**永不匹配** `/([A-D])$/`。plan 裁定1 的 adapter 侧
     断言经复核成立。
2. **渲染插入点无副作用（重点1）**：`passageLetter && <div className=
   "ps-passage-letter">` 仅在 `.ps-passage-body` 前插一行，不改段落/句子/挖空/
   焦点/anchor 既有结构。每个 reading 组 = 单一 section = 单字母行（整卷四篇
   各一），不重复不漏。CSS `.ps-passage-letter` 复用 `--ps-font-size` /
   `--ps-line-height` token，margin `calc(font-size * line-height)` ≈ 一行，
   无级联副作用。
3. **print-renderer 派生源与 DOCX 一致（重点2）**：
   `block.sectionTitle || item.sectionTitle || detail.title` 与 docxRenderer
   逐字相同。插入位置在 group-meta 后、passage 前；CSS `.passage-letter`
   bold + center + `break-after: avoid`（对齐 §3b「标题不落页尾」），无独立
   font-size 继承 body 10.5pt（§48「不放大」）。margin 由 token 实算
   `paperFontSizePt(10.5) * paperLineHeight(1.714) = 18.00pt`，精确命中 §3
   固定 18pt「各空一行」。非 reading 组 detail.title 为中文，fallback 惰性
   不触发 → 零影响（verify 已断言）。
4. **docxRenderer 严格一行放行（重点3）**：diff 仅将 const 行加 `|| detail.title`
   + 注释，无夹带。属 plan 裁定2 显式授权，parity 而非 PDF 单面超前。
5. **verify 断真行为（重点4）**：
   - print（Test 8b）：用真资产真 `buildPrintHtml` 产 HTML，断言
     `<div class="passage-letter">A</div><div class="passage">` 实际出现 +
     非 reading 组零字母 + CSS bold/center。真行为，非 source-grep。57/57 绿。
   - screen（paper-browse）：用真 adapter 真资产建 surface-model，断言 section
     取值命中/不命中正则（含 cloze/grammarFill 负控）。168/168 绿。
   - tsc `--noEmit` 绿。

## Should Watch（非阻塞）

1. **屏幕面 verify 是代理断言而非 DOM 渲染**：paper-browse verify 断的是
   adapter 产出的 section 值命中正则（派生的**输入**正确），并在测试内**重复**
   了同一正则，而非挂载 PaperSurface 断 `.ps-passage-letter` 真渲染。若日后
   有人改动组件内正则/条件，此断言捕不到。缓解：组件逻辑极简（一行条件 JSX）+
   plan 要求的浏览器 QA 截图（reading-a-letter.png 已见居中 "A"，
   cloze-no-letter.png 为负控）已覆盖当前状态。低风险，记入 fidelity gap。
2. **classic basket 路径 reading 无字母（DEV 自报局限，判级=可接受）**：
   paperAssembly/paperDraftModel 把 `sectionTitle` 设为
   `groupTypeLabel[reading]='阅读理解'`（truthy）→ `block.sectionTitle` 先命中
   → fallback 永不触达 → 该路径 reading 组无字母。**但**：docx 与 print 逻辑
   逐字相同 → parity 不破；且此为**既有行为**（本刀前 docx 已是
   `block.sectionTitle || item.sectionTitle`，classic basket 早已无字母），
   本刀**零回归**。plan 称该路径「无存活 UI 入口」。若未来 classic basket
   导出被重新接线上，reading 字母会静默缺失——届时需补，非本刀债。
3. **未来英文节名的巧合误伤**：`/([A-D])$/` 会对任何未来「尾字符为大写 A-D 的
   英文 section」误派字母（如假想的 "Task B" / "Part D"）。当前所有 adapter
   中文标签均安全，组件注释已记录该假设。属未来 adapter 架构盲点，非当前缺陷。

## PA-lite 降档复核

同意。纯渲染加法：零 schema/数据/交互变更；DOCX 已有同款行为作 parity 真身；
高危面（PaperSurface）改动为最小加法（一个 const + 一个条件 div，无重构）；
回滚 = revert 单 commit。降 PA-lite 成立。

## Forbidden 守界

diff 仅触 6 个白名单文件（PaperSurface.tsx/css、两 verify 脚本、
print-renderer.mjs、docxRenderer.mjs 一行）。adapters/domain/schema/asset/
其他题型路径/面板组件均未动。docxRenderer 的一行为 plan 裁定2 显式放行。守界。

## Self-Review Blind Spots（喂 Big CR）

- 屏幕面无端到端 DOM 断言，依赖人工 QA 截图定格——Big CR 若做全站渲染回归时
  应把 `.ps-passage-letter` 纳入真挂载断言。
- classic basket 导出路径是否真无存活 UI 入口，本 CR 未独立穷举全部路由，采信
  plan/DEV 陈述；若 Big CR 触及导出入口盘点，值得二次确认。
