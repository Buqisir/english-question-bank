# CR — flow-panel 刀 1（整卷页一页两姿态：布局重排 + 讲评右栏骨架）

- 审查者：CR 子代理（fresh 冷读，reviewer ≠ implementer）
- 基线：`main` @ 0e295d6
- 待审：`github/worktree-agent-ae9dbb950149cf8ee` @ 8d1516b
- 深度：medium 刀标准 CR（L3 用户可见 UI）
- 结论：**APPROVE**（无代码级 Must Fix）；合并前须闭合一条 Follow-up Gate（窄屏 QA，已由主代理认领）。

## Changed Scope

diff 只动 4 个文件，全部在白名单/允许范围内：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`（+93）
- `app/src/features/paper-browse/paperBrowsePage.css`（+153/-7）
- `scripts/verify-paper-browse.mjs`（+111，断言 22-25）
- `docs/cuts/flow-panel/qa/qa-notes.md`（+51，QA 记录文档）

Forbidden 全部零触碰：`papersurface/**`、`paper-intelligence/**`、`server/**`、
`domain/**`（仅新增**类型 import** `AnswerKeyEntry`/`PaperContentGroup`，未改文件）、
`App.tsx`/`AppTopbar`/App.css、print/export、其他页面。**Scope 干净。**

## Verification Evidence（独立复跑，非抄 DEV 数字）

- 在临时 detached worktree（8d1516b，不触碰主树）实跑
  `node scripts/verify-paper-browse.mjs` → **112 passed, 0 failed**，含新增 22-25。
- 逐条读了新断言，确认非同义反复、能真兜行为：
  - `buildAnswerRowText` 三分支断言各自钉住 `groupType==='writing' return null` /
    `entries.length===0 return '答案未入库'` / `.sort((a,b)=>a.questionNo-b.questionNo)`——
    删任一分支断言会红。fn body 抽取正则 `function...[\s\S]*?\n\}` 因函数体内无独立成行
    `}`（子箭头均为表达式体）故抽全，判定可靠。
  - 深读守卫断言钉 `card?.hasPaperSurfaceAnalysis && card?.paperSurfaceHref`，与详情页同形。
  - CSS 断言真钉两套断点：`@media(min-width:1200px)` 下 panel `position:sticky` 常驻列、
    `@media(max-width:1199.98px)` 下 `position:fixed` 抽屉 + backdrop；并反向钉 `.paper-browse-shell`
    不再 `max-width` 居中。
- tsc：未在无 node_modules 的 worktree 复跑；已人工核类型——`AnswerKeyEntry`/`PaperContentGroup`/
  `answerKey.answers`/`questionNo` 均存在，`card.paperSurface*` 三字段在 `QuestionGroupCard` 上为可选，
  `href={card.paperSurfaceHref ?? undefined}` 类型自洽。接受主代理 tsc 干净 attestation。

## 正确性核对（逐轴）

- **lectureOpen 门控**：`useState(false)` 默认收起；handle 无条件渲染、panel+backdrop 仅
  `lectureOpen &&` 时挂载。✓
- **buildAnswerRowText 三分支**：writing 返回 null（不渲染答案行）；命中项按 questionNo 排序后
  以全角空格 join；无命中返回「答案未入库」。逻辑与撤刀 Chunk B 一致。✓
- **scrollspy 跟随**：`renderLecturePanel` 复用既有 `activeAnchor`，`asset.content.groups[activeAnchor]`
  命中题组则渲染速览，命中 part/section 标题（anchor 非 groupId）则落空态「滚动到题组查看速览」——
  契约 3.d 明确允许此从简。✓
- **深读链接守卫**：`Boolean(card?.hasPaperSurfaceAnalysis && card?.paperSurfaceHref)`，无则不渲染，形态同详情页。✓
- **两套断点 CSS 结构**：桌面 panel 为 grid 第三列（`220px 1fr 380px`，sticky 独立滚动）；
  窄屏 panel `position:fixed` 抽屉 + backdrop 蒙层。**关键点已核实：backdrop 默认
  `display:none`，只在 `max-width:1199.98px` 内 `display:block`——桌面常驻列模式下 backdrop
  不会覆盖全屏吞点击。** handle z-31 > panel z-30 > backdrop z-29，窄屏下 handle 仍可点关。✓
- **不变量（Chunk A）**：diff 纯增量，未改 scrollspy useEffect、focusGroupId 深链 effect、
  悬浮操作簇、PaperSurface 挂载/adapter/数据加载、basket-chip。shell className 由静态改模板串但
  保留 `paper-browse-shell` 基类。**无回归面。** ✓
- **零新增网络请求**：answerKey/questions 均取自已加载 `asset`，无 fetch。✓

## Findings

### Must Fix（阻断合并）

无代码级 Must Fix。

### Follow-up Gate（合并前须闭合，非代码改动）

- **窄屏（<1200px）抽屉浮层 + 触屏 QA 尚未真机验证。** 这是 plan「验收标准」明列的必做项
  （「含窄屏视口与触屏仿真」），DEV 因 sandbox 无法缩视口未能完成。源码层面我已确认该段
  CSS/JS 无结构性问题（fixed panel + backdrop，JS toggle 与视口宽度无关，backdrop 桌面
  display:none）。**合并前须由主代理 Playwright 补验窄屏开合 + 背景蒙层点击关闭 + 触屏点击。**
  验收标准既已写死此项，未补验即合并即视为绕过验收门。

### Should Fix（建议本刀或紧邻补，不阻断）

- **窄屏抽屉的键盘/焦点 a11y 缺失**：无 Esc 关抽屉、开抽屉后焦点不移入、关闭后不还焦到 handle、
  无 focus trap。窄屏 backdrop 使其呈模态语义，却缺模态 a11y。当前唯一键盘关闭路径是 Tab 到
  backdrop（`<button>`）按 Enter——勉强可达但不达标。桌面为常驻列不涉模态，问题只在窄屏。
  plan 未把 Esc/焦点列入验收，故不阻断；但本仓 my-space 刀有 CR 就删除弹窗补 Esc+还焦的先例，
  建议至少补 Esc 关抽屉 + 关闭还焦到 handle。

### Should Watch（记录，不自动转任务）

- **verify「behavioral proof」名不副实**：22-25 后那段注释自称「re-deriving the same computation
  the component performs」，实则**并未执行** `buildAnswerRowText`（该函数未导出，脚本只校验了
  fixture 里 reading 组有 answerKey 覆盖 + 存在 writing 组）。真正的输出行为证据来自 owner 桌面
  QA（已对 answer-key.json 逐条比对）。非阻断——源码级分支断言真、桌面 QA 覆盖真输出；若日后想
  上真单测，需把 `buildAnswerRowText` 导出（属另一刀）。建议修正该注释措辞以免误导后续 agent。
- **prefers-reduced-motion 未处理**：shell 的 `transition: grid-template-columns` 与 handle 过渡无
  reduced-motion 降级。plan 允许「transition 简单即可」，非阻断。
- **handle 的 aria-expanded 无 aria-controls**，且同时带 aria-pressed + aria-expanded（toggle 与
  disclosure 语义混用）。轻微，非阻断。
- **草稿卷 chip 与讲评栏/handle 极端滚动位置重叠未逐像素核对**（DEV 盲区 2）。桌面 QA 报无遮挡，
  未验极端滚动位。非阻断，随窄屏 QA 一并肉眼扫一眼即可。

## DEV 自报盲区 — 逐条裁决

1. **窄屏抽屉未真机验证** → 源码层无结构性问题（已核 backdrop 桌面 display:none、fixed 定位、
   toggle 与视口无关）。裁决：接受为已知缺口，转为上文 Follow-up Gate，合并前必须 Playwright 补验。
2. **chip 与讲评栏极端滚动重叠未逐像素核对** → 转 Should Watch，随窄屏 QA 顺带核。
3. **part/section 命中空态文案从简** → 契约 3.d 明确允许从简，裁决：接受，无需改。

## Self-Review Blind Spots（供后续 Big CR/主代理优先复核）

- **未复跑 tsc / verify:all**（worktree 无 node_modules）。仅人工核类型 + 复跑了
  verify-paper-browse（112 绿）。tsc 干净与 verify:all 70 绿沿用主代理 attestation——若怀疑，
  这是最该重跑的一点。
- **窄屏真实渲染未亲验**：我只静态读了 CSS 断点，未在真实 <1200 视口跑过。fixed panel 与文档级
  滚动、iOS Safari 100vh、以及 `min(380px,92vw)` 在极窄屏的表现，属我判断信心较低区。
- **IntersectionObserver + 讲评栏组合**：讲评栏挂载不改变 scroller DOM，理论上不影响既有 observer；
  但我未实测「开讲评导致卷面重排 → activeAnchor 是否抖动」这一交互路径。

## Failure / Attack Angle

- 最可能的假绿：**把窄屏 QA 当成「CSS 断言已覆盖」而跳过真机验证**。CSS 断言只证明规则文本存在，
  不证明 iOS/触屏下抽屉真能开合、backdrop 真能点关、handle 不被抽屉盖住不可点。plan 验收明写此项，
  跳过即绕过验收门——已列为 Follow-up Gate。
- 次可能：未来 agent 见 verify 里「behavioral proof」字样，误以为 `buildAnswerRowText` 已有执行级
  回归保护，改动其排序/过滤逻辑却只有 fixture-sanity 断言接不住——已在 Should Watch 点名。
- 潜在误用：窄屏抽屉缺 focus trap，键盘用户开抽屉后 Tab 会跑到抽屉后面的卷面，模态语义与实际行为
  不符——已列 Should Fix。

## Residual Risk

代码正确性、scope、不变量三项均通过，桌面路径已由 owner 真点 QA（答案行对 answer-key.json 逐条
比对、深读跳转、focusGroupId 深链、chip 无遮挡）覆盖。**残留风险集中在窄屏未验一处**，且已有源码级
CSS 断言兜底结构、JS toggle 已桌面验证行为无关视口。补完窄屏 Playwright QA 后无残留阻断项。

## Recommendation

**APPROVE**（无代码级 Must Fix，scope 干净，verify 真绿且断言真兜行为）。
合并前须闭合一条 Follow-up Gate：窄屏（<1200px）抽屉 + 触屏 QA（plan 验收明列，主代理已认领
Playwright 补验）。Should Fix（窄屏抽屉 Esc/还焦）建议紧邻补，不阻断本刀。

---

# CR — flow-panel 刀 2（整卷页讲评栏：点题联动 + 五解析面板搬家统一宽度）

- 审查者：CR 子代理（fresh 冷读，reviewer ≠ implementer，未参与本刀实现）
- 基线：`main` @ d375123
- 待审：`github/worktree-agent-a87296353c151a243` @ b84f671
- 深度：medium 刀标准 CR（L3 用户可见 UI，wiring 密集，细读）
- 结论：**APPROVE**（无代码级 Must Fix，scope 干净，验收明列的窄屏/桌面 QA 转 Follow-up Gate）

## Changed Scope

diff 只动 3 个文件，全部在白名单内：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`（+463/-50）
- `app/src/features/paper-browse/paperBrowsePage.css`（+22/-8）
- `scripts/verify-paper-browse.mjs`（+~160，断言 26-33）

Forbidden 全部零触碰（diff 文件级已证实）：`shared-ui/papersurface/**` 未在 diff；
`paper-intelligence/**`（五面板 + 两 adapter + paperIntelligence.css）**仅被 import，未被修改**——
`git diff` 文件列表里无任何 paper-intelligence 文件；`server/**`/`domain/**`（仅新增**类型 import**
`WritingAnalysis`）/`App.tsx`/print/export/其他页面均零改动。**Scope 干净。**

## Verification Evidence

- 按主代理指示，已证实项（verify-paper-browse 120 绿 / verify-ci 70 绿 / tsc / build /
  五题型浏览器实测）不重跑；改为**逐条读新断言判其能否真兜行为**（下）。
- 确认 `scripts/verify-paper-browse.mjs` 已注册进 `scripts/verify-ci.mjs`（第 80 行），
  新断言真在 CI 门内跑，非孤儿脚本。

### 新断言质量（26-33，逐条读过）

- **27/28 是本刀最要害的两条不变量断言，且是真兜行为的正则**：
  `lectureFocus={isPanelGroup ? lectureFocusForSelection : null}` 与
  `onFocusIntent={lectureOpen ? (intent) => handleGroupFocusIntent(...) : () => {}}`——
  若有人把挑题态也接成交互（去掉三元的 static null/no-op 分支），断言会红。真钉「挑题态零焦点噪音」。
- **28** 钉 fetch effect 的 `if (!lectureOpen) return`——「挑题态零新增请求」在源码层被钉死（非运行时证据）。
- **33 是仅有的两条执行级断言**：真 `await import` 两个 adapter，对 paper-2026-i 真夹具跑
  `buildClozeAnalysisSurfaceModel`/`buildGrammarFillAnalysisSurfaceModel` 并断言
  `analysisByQuestionId` 非空——证明「按需补拉」的 adapter 有真数据可跑，非纯字符串匹配。质量好。
- **29/30/31/32** 为 source-regex（seed 分支存在、「解析未发布」≥3 处、深读链接字符串已清、
  容器选择器存在）——shape 级，对「搬家 wiring 是否接上」够用，但不证运行时。
- **弱点（非阻断）**：`(pageSrc.match(/解析未发布/g) || []).length >= 3` 是字符串计数启发式，
  不校验各题型分支归属；未来若误删某一题型的兜底但另一题型多写一处，计数仍可能 ≥3。已在下方点名。

## 正确性核对（逐轴）

- **五面板 fetch→adapter→panel 与 harness 协议一致**：`selectLectureQuestion` 的种子逻辑逐分支
  镜像 `PaperIntelligencePaperSurfaceHarness` 的 `request-lecture-focus` 分支——cloze 取
  `evidenceRows.find(!isOptionSide)`、grammarFill 取 `evidenceRows[0]`、reading 取
  `supportEvidenceId + answer`，sevenChoices/writing 不种子。与 harness 源码（第 798/816/837 行附近）逐字对齐。✓
- **状态回路**：`onFocusIntent('request-lecture-focus')` → `selectLectureQuestion` → `lectureSelection`
  →（`lectureFocusForSelection` 仅喂 `isPanelGroup` 组）→ PaperSurface 高亮；面板
  `onSelectOption/onSelectEvidence` → `handleLectureSelect*` 回写 `lectureSelection.evidenceId/optionLabel`
  → 同一 `lectureFocusForSelection` → PaperSurface 重绘证据高亮。单写者模型（page 是 lectureSelection
  唯一 writer），回路自洽。✓
- **跨组点题**：点 B 组卷面题 → `handleGroupFocusIntent(B,...)` 设 `lectureSelection.groupId=B` →
  `panelGroupId=B`（lectureSelection 优先于 activeAnchor）→ 右栏切 B。activeAnchor-clear effect 仅在
  **activeAnchor 变化时**触发（deps `[activeAnchor]`），点题不改 activeAnchor 故不会被立刻清掉。✓
- **挑题态零请求门控 / 无残留**：fetch effect `if (!lectureOpen) return`；paperId 变时五个 lecture state
  全 reset（`setLectureAnalysisByGroupId({})` 等）；非 panelGroup 的组永远拿 `lectureFocus={null}`、
  挑题态 `onFocusIntent={() => {}}`——无跨组高亮泄漏。✓
- **缺 analysis 降级**：cloze/grammarFill/writing 拉取失败或文件缺 → 该组 `{kind:'unavailable'}` →
  讲评栏显「解析未发布」，卷面 PaperSurface 仍挂 plain surfaceData 不崩、不阻塞其他组。try/catch
  逐组兜住，单组失败不污染其他组。✓
- **卷面 surfaceData 切换**：讲评态且 cloze/grammarFill 已成功拉到解析时，卷面挂载切到
  analysis-based surfaceData（含证据高亮数据源），镜像 harness `clozeAnalysisModel` 覆盖 plain 的做法；
  挑题态（`!lectureOpen`）永远 plain——「零解析噪音」不变量保留。✓
- **CSS 宽度归一化作用域**：`.paper-browse-lecture-analysis` 容器只在 PaperBrowsePage DOM 里出现，
  覆盖规则（`* {max-width:100%}`、`table {display:block;overflow-x:auto}`）scoped 在该容器下，
  **不泄漏到解析页**。`paperIntelligence.css` 本体零改动；虽被 import 进本页成全局样式，但解析页
  本就已加载同一份全局表，bundler 去重，无重复污染。✓
- **不变量（刀 1 交互）**：Esc 关抽屉 + 还焦到 handle（effect 保留）、handle z-31 > 抽屉 z-30 >
  backdrop z-29、紧凑 rail、scrollspy、桌面三栏 grid `88px 1fr 380px`——diff 未动这些结构。✓
- **PaperSurface 零修改**：diff 无 papersurface 文件；仅通过既有 props（`lectureFocus`/`onFocusIntent`/
  `blankFocusMode`/`mode="lecture"`）接入。✓

## 审查轴 1（蒙层交互改动）— 裁决

DEV 把窄屏抽屉 backdrop 从「全屏可点关闭 `<button>`」改为「`pointer-events:none` 纯视觉暗化 `<div aria-hidden>`」。

- **取舍正确**。窄屏抽屉模式下 backdrop `inset:0` 覆盖全屏、卷面在其后；plan 验收明列「窄屏抽屉里
  点题联动」为必做流程。若 backdrop 吞点击，用户点不到蒙层下露出的卷面题目，窄屏点题联动无法成立。
  `pointer-events:none` 让点击穿透到卷面 → 触发 focus intent → 抽屉面板更新，正是所需。DEV 的判断成立。
- **窄屏把手始终可达**。抽屉模式下 handle `position:fixed; right:0; top:50%; z-index:31`，抽屉
  `z-index:30`（`right:0` 的 `--open:380px` 位移只在 `min-width:1200px` 生效，窄屏 handle 停在
  right:0）——handle 叠在抽屉右缘上方，z-31 > 30，视觉可见且可点。触屏下唯一关闭路径（无键盘 Esc）
  是点 handle，可达。✓
- **a11y 模态语义弱化，可接受但记 Should Watch**。抽屉无 `role="dialog"`/`aria-modal`、无 focus trap、
  **丢了「点蒙层外关闭」这一触屏常见预期**。关闭仍有 handle + Esc 两路兜底，故不阻断。就本仓成熟度
  与教师内部工具定位，可接受。
- **更好的形状**：轴里设想的「蒙层只覆盖非卷面区」在窄屏抽屉下无干净可切分区（卷面正是要保持可点的
  那块，且被抽屉大面积覆盖）——DEV 的「全屏穿透蒙层」反而是最简正确解。可选增强：抽屉头部加一枚显式
  关闭「×」提升触屏可发现性（当前靠边缘 handle，发现性略低）。列 Should Watch，不阻断。

## Findings

### Must Fix（阻断合并）

无代码级 Must Fix。

### Follow-up Gate（合并前须闭合，非代码改动）

- **窄屏（<1200px）抽屉点题联动 + 触屏仿真 + 桌面五题型逐字比对 QA 须落盘。** plan 验收明列
  「paper-2026-i 全五题型 + 窄屏抽屉里点题联动 + 触屏仿真，截图入 docs/cuts/flow-panel/qa/（dao2-*）」。
  DEV 自报 QA 已做但截图未落盘（环境限制）、且 ≥1200px 三栏未 live 验（其环境卡 1000px）。源码层
  三栏 grid 与面板 DOM 定位无结构性问题（已核 `88px 1fr 380px` + aside 为第三 grid child），但**验收
  既写死截图落盘 + 五题型逐字比对，未补即视为绕过验收门**。主代理已认领 Playwright 补验。

### Should Watch（记录，不自动转任务）

- **点题选择与 scrollspy 的 clear effect 竞态 = DEV 盲区 2「导航后首次点击偶发无反应」的最可能根因。**
  clear effect（`setLectureSelection(prev => prev && prev.groupId !== activeAnchor ? null : prev)`，
  deps `[activeAnchor]`）在 activeAnchor **每次变化**时触发，且 activeAnchor 落在 part/section 标题
  （非 groupId）时也会清掉选择。深链 `focusGroupId` 进页触发 smooth-scroll 到目标组，滚动**沉降过程中**
  IntersectionObserver 持续改 activeAnchor；若用户在沉降未稳时点了题，setLectureSelection 刚设好即被
  下一拍 activeAnchor 变化的 clear effect 抹掉 → 表现为「首次点击无反应」。偶发、仅在滚动动画期，
  稳态点题正常，故非阻断。**建议修法**：clear 只在 activeAnchor 变成「另一个真题组 id」时执行（
  `asset.content.groups[activeAnchor]` 命中且 ≠ 选中组），part/section 标题态不清；或用 ref 标记
  程序化滚动期间抑制 clear。列 Should Watch 供刀 3（popstate/URL 状态）一并收拾。
- **「解析未发布」断言用字符串计数（≥3）**，不校验各题型分支归属，跨题型增删可能互相掩盖。非阻断，
  未来若拆分兜底文案建议改为按题型分支各自断言。
- **`.paper-browse-lecture-analysis * { max-width:100%; box-sizing:border-box }` 用后代通配符**强制所有
  子元素 border-box，可能改变 pi 组件内假设 content-box 的 padding 尺寸。属视觉细节，DEV 报已逐面板 QA，
  随 QA 截图肉眼扫一遍即可。
- **抽屉缺显式关闭「×」**（触屏可发现性），见轴 1 裁决。

## DEV 自报盲区 — 逐条裁决

1. **≥1200px 桌面三栏未 live 验** → 源码层三栏 grid + aside 第三 child 定位正确，无结构性问题。
   裁决：接受为已知缺口，并入上文 Follow-up Gate，主代理 Playwright 补验。
2. **讲评把手「导航后首次点击偶发无反应」未定位根因** → 代码层给出最可能根因：**activeAnchor-driven
   clear effect 与点题选择在 smooth-scroll 沉降期的竞态**（详见 Should Watch）。裁决：非阻断（偶发、
   仅滚动动画期、稳态正常），建议按上述修法在刀 3 收拾。复现思路：深链带 focusGroupId 进页 → 开讲评 →
   在卷面平滑滚动尚未停时立刻点一题，观察选择是否被 clear。
3. **paper-2026-i 语法填空 `__NN__` 空格点不着 = 与 harness 共享的既有数据形状限制** → 复核判断成立：
   本刀 grammarFill 卷面走 `buildGrammarFillAnalysisSurfaceModel` 同款 adapter + harness 同款渲染，
   点击命中依赖 blank 的数据形状，本刀未引入新的空格渲染逻辑；用 harness 对照证实非本刀引入，合理。
   裁决：接受，挂账去向 = `docs/import/data-health-*` 数据健康清单（数据形状问题，非交互刀范围）。
4. **QA 截图未落盘** → 转上文 Follow-up Gate（截图落盘是 plan 验收硬项）。

## Self-Review Blind Spots（供后续 Big CR / 主代理优先复核）

- **未复跑任何 verify/tsc/build**（按主代理指示已证实项不重跑）。我的信心建立在「逐条读断言 + 逐轴读源码」
  上，未亲跑 120 绿。若怀疑，最该重跑的是 verify-paper-browse（含 33 的执行级 adapter 断言）与 tsc
  （五面板/adapter 的 props 类型契约靠 tsc 兜，我只静态核了 wiring 形状，未核每个 panel prop 签名逐字段）。
- **五面板 prop 签名未逐字段核**：我信任 tsc 绿证明 `SevenChoicesAnalysisPanel`/`PaperAssetAnalysisPanel`/
  `ClozeAnalysisPanel`/`GrammarFillAnalysisPanel`/`WritingAnalysisPanel` 的 props 与本页传值匹配，
  未打开五个组件源逐一比对 prop 名/可选性。若 tsc 实际未覆盖某 loose 类型，这是盲点。
- **真实窄屏 / 触屏渲染未亲验**：仅静态读 CSS 断点与 z-index 层序，未在真 <1200 视口跑抽屉开合 +
  蒙层穿透点题 + handle 叠加抽屉是否真可点。iOS Safari 100vh / `min(380px,92vw)` 极窄屏表现信心较低。
- **surfaceData 切换的视觉正确性**：讲评态 cloze/grammarFill 卷面切 analysis-based surfaceData，我核了
  数据源切换逻辑正确，但未验切换后卷面渲染是否与解析页逐字一致（属 QA 逐字比对项，Follow-up Gate 覆盖）。

## Failure / Attack Angle

- **最可能的假绿**：把「120 绿 + source-regex 断言齐全」当成「五题型搬家在浏览器里真对齐解析页」而
  跳过截图落盘 + 逐字比对 QA。26/29/30/31/32 只证 wiring 文本存在，不证运行时面板内容与解析页同组一致、
  不证窄屏抽屉真能穿透点题。plan 验收写死此项——已列 Follow-up Gate。
- **次可能**：clear effect 竞态（Should Watch 1）在 demo 时偶发「点了没反应」，若被当成随机 flake 忽略，
  刀 3 接 URL/popstate 状态时会放大（滚动+历史导航叠加更易触发）。已点名根因与修法。
- **潜在误用**：未来 agent 见挑题态 invariant 断言（27/28）为正则形，若重构把三元改成
  抽取的 handler 变量（语义等价但正则不匹配），断言会误红——属脆性正则，非行为漏洞，提一嘴。
- **stale fallback**：深读链接（`paperSurfaceHref`/「深读解析」）已从源码与 CSS 双清（断言 31 + CSS
  删 `.paper-browse-deep-link`），无旧路径残留可达。✓

## Residual Risk

代码正确性、scope、不变量、harness 协议一致性四项均通过；挑题态零请求/零焦点噪音不变量被 source-level
断言钉死；缺 analysis 降级逐组兜住不崩。**残留风险集中在两处**：①窄屏/桌面五题型真机 QA 未落盘
（Follow-up Gate，主代理认领）；②点题×scrollspy 竞态导致偶发首击无反应（Should Watch，非稳态、非阻断）。
补完 Playwright QA 后无残留阻断项。

## Recommendation

**APPROVE**（无代码级 Must Fix，scope 干净，verify 断言真兜挑题态不变量 + 一条执行级 adapter 断言）。
合并前须闭合一条 Follow-up Gate：窄屏抽屉点题联动 + 触屏 + 桌面五题型逐字比对 QA 截图落盘
（plan 验收明列，主代理已认领 Playwright 补验）。蒙层 `pointer-events:none` 取舍裁定**正确**。
点题×scrollspy 竞态根因已定位，建议刀 3 收拾，不阻断本刀。
