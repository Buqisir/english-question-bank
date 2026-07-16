# CR — detail-page-redesign（速览头 + 一张纸露一角）

- 审别：fresh CR（冷读独立会话），medium / L3，合并前审。
- diff：`git diff main...wt-detail-page-redesign`（+1231 / −1707，14 文件）。
- verify 事实（流水线代理已跑，真实退出码全 0，本 CR 未重跑）：build 绿；
  verify-detail-redesign 15/15；verify:all 79/1/0；DP-2 41 checks 双跑幂等。

## Verdict: APPROVE（0 Must Fix / 3 Should Watch）

契约面零触点、退役清单整删、负空间三条结构性落地、verify 锚更新只加强不放松、
PA-lite 降档仍成立。无阻断项。

---

## 四条 DEV 自报盲区裁决

1. **阅读 chips 真值分支只有源码级断言** — 接受，记 SW1。
   `buildTypeChips` reading 分支是一行 `(q.questionType||'').trim() || '未标注'`
   的 Map 计数；「未标注」分支已由 DP-2 ⑤ 用真实数据（唯一一条
   `reading_parse_results`，questionType 全 undefined）浏览器实点。真值分支与
   之只差三元第一操作数非空，无独立逻辑风险，display-only。fixture 级验证是
   nice-to-have 非必需。
2. **无纸组降级用 page.route 强制 404** — 接受。拦截命中的是真实组件同一条
   `fetch !res.ok → throw → catch → placeholder` 分支，只是响应合成而非造 DB
   行；DP-2 ⑥ 断言速览头照常 + 占位文案非空。替代验证成立。
3. **grammar `-v1.json` vs spec `-v2.json`** — 复核通过。代码按磁盘实际
   `grammar-fill-analysis-v1.json` 读取（QuestionGroupDetailView.tsx:270），
   以 `schemaVersion === 'grammar-fill-analysis-v2'` 门控（:273），注释
   （:137-141）准确解释「磁盘名沿 v1、内容 schemaVersion 已 v2」；PM 更正后的
   spec（design.md:73-75）与之一致。verify 脚本对真实 fixture 核了 schemaVersion。
4. **App.tsx 删除面（4 组 state + 3 辅助函数）** — 逐一确认无误伤。
   `grep setVerifyResult|setClozeParse|setSevenChoicesParse|setGrammarParse|
   build*VerifyResult` 全 app/src 仅剩注释命中，零残留调用点；这些 state 唯一
   消费者是已整删的逐题 AI 解析区。TS build 绿是强证据（任何悬空引用会编译失败）。
   `readingParseResult` 是唯一幸存者，chips 需其 per-question questionType，保留正确。

---

## Should Watch（非阻断，记录待观察）

- **SW1**：阅读 chips「真值计数」分支（questionType 有值时渲染真实题型）无
  fixture/浏览器覆盖，仅源码断言 + 未标注分支浏览器覆盖。当后台补齐 questionType
  数据后，生产首次渲染真实题型 chips 未经观测。建议 DP-3 或后续任一组有真实
  questionType 时 owner 扫一眼即可闭环。低风险。
- **SW2**：DP-2 ⑥ 的 route glob `**/paper-assets/<id>/**/paper-asset.json`
  可靠拦截的是 `/latest/paper-asset.json` 主路径；fallback
  `/paper-assets/<id>/paper-asset.json`（无 latest）落真实 server——该 fixture
  真实 server 亦 404，故降级仍触发。断言成立但间接依赖「无 latest 路径真 404」。
  健壮性够用，仅记录。
- **SW3**：语法填空考点 chips 在 `loadModel` 内、paper-asset.json 成功之后才
  fetch，与「一张纸」加载共命运。理论上纸 404 时 grammar chips 也会空（而 spec
  「资产 404 速览头照常」）。但 chips 源（grammar-fill-analysis-v1.json）与
  paper-asset 同目录，实际 273/273 齐备且同存亡，无真实缺口。记录不阻断。

---

## 已核清单（通过）

- **契约面零触点**：`shared/papersurface/** · app/src/domain/** · schemas/** ·
  *Adapter.ts` diff 为空——Forbidden 满足。PaperSurface / 五 adapter 只 import
  复用，零改。
- **负空间三条结构性保证**：QuestionGroupDetailView 代码零 AnalysisDisclosure
  （import + 挂载俱删，verify §1 断言）；唯一 `<PaperSurface>` 钉死
  `lectureFocus={null}` + no-op `onFocusIntent` + `mode="lecture"` + `annotations=[]`
  + 无 answers/evidence 作答通路（verify §2）；解析内容零进入本页。
- **退役清单整删**：DetailPaperPeekPrototype.tsx / detailPaperPeek.css 物理删除；
  `detailVariant` / `useDetailPeekVariant` / `DetailPeekSwitcher` 代码零残留
  （仅历史说明性注释命中，verify §3 用 stripComments 豁免注释后断言）。
- **E6 相似篇章随迁完整**：动作行入口（`data-ra-entry="detail-view-similar"`，
  四题型 gate + paperSurfaceHref gate）+ 原地展开（速览头下方 SimilarPassagesPanel）
  + fetch-on-expand 面板本体逐字搬运未改；换题 reset effect 保留。DP-2 ⑦ 实点。
- **verify 锚三件（plan §6 授权清单为界，只加强不放松）**：
  - `verify-analysis-layering`：§2 从「wired N ways」翻为「零 AnalysisDisclosure
    残留」+ 新增 6 条 retired-marker 断言（question-ai-block / 四组级 label），
    §3 useState 计数 3→4。更严。
  - `verify-classic-retire-2`：useState 3→4 + load/expanded 精确声明断言；
    加入草稿卷/删除/内容面 selector 随新结构迁移，语义不变；退役 state 断言从
    「仍定义」翻为「4 组已删 + readingParseResult 幸存」，更严。
  - `verify-paper-browse`：看整卷计数从裸 `看整卷` 收窄为按钮 JSX（降级占位文案
    合法多次提「看整卷」），行为语义不变；PaperSurface import 从「absent(C6)」
    翻为「present + 只读（钉死在 verify-detail-redesign）」，spec 数据契约授权。
    未见顺手放宽无关断言。
- **新脚本原子登记**：verify-detail-redesign.mjs 已入 verify-ci.mjs registry +
  scripts/README.md 同刀。
- **CSS**：复用既有 token（--muted/--ink/--accent/--eqb-color-primary），页壳中性
  纸卡自暖，无新增色彩体系决策。视觉终裁归 owner DP-3。
- **PA-lite 降档仍成立**：无契约面（已证零触点）+ 方向经原型 owner 逐步拍板，
  降档理由充分。

## Self-Review Blind Spots（如喂后续 Big CR）

- SW1 的真值 chips 渲染 + SW3 的 grammar chips/纸加载耦合，是本刀纯静态/单库
  fixture 覆盖不到的两处；若后续有 questionType 真实数据或缺资产真实组入库，
  优先补一次实测。
