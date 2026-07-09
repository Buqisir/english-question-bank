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
