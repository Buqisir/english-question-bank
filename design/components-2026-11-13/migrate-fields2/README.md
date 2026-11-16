# 字段构件第二轮：剩下的输入框和下拉（2026-11-15）

把听写工作区、过生词、整卷页、Agent 口令、录题面板里还在各写各的输入框和下拉，换成 `app/src/shared-ui/Field.tsx`
的 TextField / TextAreaField / SelectField。这一轮用不上 SegmentedField、OptionSelectField、SearchField，原因写在各处。
字一个没改：标签、占位符、出错文字原样搬过去。没有 commit。

对照拼图（左换前 = HEAD 临时 worktree，右换后 = 工作区；元素截图，四周留 16px）：

- `compare-dictation.png`：听写工作区
- `compare-vocab-review.png`：过生词
- `compare-paper-admin.png`：整卷页 PDF 版本（两边都没拍到）、Agent 口令
- `compare-entry.png`：录题面板
- `shots.json`：每张图有没有拍到；每个控件换前换后的无障碍树信息（角色、名字、描述、invalid、required）、实测样式、Tab 顺序

拍图脚本 `scripts/component-inventory/fields2-shots.mjs`，拼图脚本 `fields2-compare.mjs`（照 followup-shots.mjs 的写法，端口偏移 72）。
原始截图在 `.scratch/component-inventory/fields2/{before,after}`，不进仓库。换前、换后各只跑了一次。

## 一、清单

| # | 文件 | 原来的写法 | 换成 | 看得见的变化 |
|---|---|---|---|---|
| 1 | `vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx` | 「当前学生」`<label>` 包 `<select>`，页面 CSS 画框 | `SelectField` inline lg | 高 35 → 36；字 12/500 → 14/400；边由墨色变浅灰，箭头换成构件的 16px 向下箭头 |
| 2 | 同上 | 「搜索词组」：自己画的框 + 放大镜 + `aria-label` | `TextField` lg + `hideLabel` + `icon`（放大镜） | 高 35 → 36；边由墨色变浅灰；字 500 → 400。读屏名字不变（改由 `<label for>` 给） |
| 3 | 同上 | 「从 / 到」两个日期 `<label>` 包 `<input type=date>` | `TextField` inline lg `type="date"`，宽 142 照搬 | 高 37 → 36，同上换边色和字重 |
| 4 | 同上 | 合并设置「打印标题 / 听写标题」 | `TextField` lg（标签在上） | 高 35 → 36，同上 |
| 5 | 同上 | 待复习「推荐下一轮 [n] 词」 | `TextField` inline lg number + `trailing` 单位「词」 | 高 35 → 36；「词」改由 aria-describedby 念（见二） |
| 6 | `VocabularyMeaningRecallPanel.tsx` | 认词「抽 [n] 词」 | 同 5 | 高 33 → 36；字 12 → 14 |
| 7 | 同上 | 错词听写「文件名」（`aria-label="错词听写文件名"`） | `TextField` inline lg，宽 240，`aria-label` 保留 | 高 → 36（换前这一处没拍到，在弹层里，见四） |
| 8 | `vocabulary-review/VocabularyReviewPage.tsx` | 「当前学生」下拉（`aria-label="切换当前学生"`） | `SelectField` lg | 高 38 → 36；字 14/600 → 14/400；边 `--line-strong` → `--eqb-color-border` |
| 9 | 同上 | 「词汇课程」下拉（`aria-label="切换词汇课程"`） | `SelectField` lg | 同 8（只有多套课程时才出，没拍） |
| 10 | 同上 | 新建学生「学生姓名」+「保存」，出错是红字一行 | `TextField` lg + `error` + `trailing`（保存键） | 高 38 → 36；出错由红字改成：框边红 + 灰字一行带三角图标（DESIGN.md §5 Notices 的写法），框带 `aria-invalid` |
| 11 | 同上 | 「目标生词数」 | `TextField` lg number | 高 44 → 36；字 16/600 → 14/400 |
| 12 | 同上 | 「用中文逗号隔开」多行 | `TextAreaField` lg rows=4 | 高 114 → 102；字 16/600 → 14/400 |
| 13 | 同上 | 完成页「单词纸名称」+「保存名称」 | `TextField` lg + `trailing` | 高 38 → 36（两边都没拍到，见四） |
| 14 | 同上 | 完成页「下载读音」下拉，外面一圈边 | `SelectField` inline lg | 外圈的边去掉，边画在下拉本身上（两边都没拍到） |
| 15 | `paper-browse/PaperBrowsePage.tsx` | 顶栏「PDF 版本」`<select className="ghost-button">` | `SelectField` sm + `hideLabel` | 高 32 → 28（和顶栏小号键同高）；不再是 `.ghost-button`，所以顶栏 FluidHoverList 的悬停滑块不再滑到它上面（两边都没拍到） |
| 16 | `paper-browse/PaperReviewControls.tsx` | 讲评「查看哪款 PDF」下拉 | `SelectField` lg + `hideLabel` | 高 → 36（没拍） |
| 17 | 同上 | 讲评「手动复制试卷信息」只读多行 | `TextAreaField` lg readOnly rows=7，宽上限 75ch 等原值照搬 | 边、焦点换成构件的（没拍） |
| 18 | `admin/AgentTokens.tsx` | 「名称」`<label>` 包 `<input>` | `TextField` lg required，宽 228 照搬 | 高 34 → 36；字 13 → 14 |
| 19 | `workbench/EntryModal.tsx` | 22 个 `<label className="field">`（15 输入、5 多行、2 下拉） | 15 `TextField`、5 `TextAreaField`、2 `SelectField`，都 lg；宽的加 `className="wide"` | 底色灰（`--surface-strong`）→ 白；标签 13/700 → 12/500；多行里的字原来没继承字体，是浏览器默认等宽 13.3 → 14 无衬线；多行高 88 → 81（跟 rows 走）；焦点由 3px 淡影改成墨焦点环 |

全部 19 处的焦点都改成构件的墨焦点环（2px `--eqb-color-action`，外扩 2px）。听写、过生词、Agent 口令原来就是同样的环，录题面板原来是 3px 淡影。

## 二、键盘和读屏（无障碍树实测）

数据在 `shots.json` 的 `ax`，用 CDP `Accessibility.getPartialAXTree` 取，1440 档。

| 控件 | 换前 角色 / 名字 / 描述 | 换后 角色 / 名字 / 描述 |
|---|---|---|
| 听写 当前学生 | combobox / 当前学生 / — | combobox / 当前学生 / — |
| 搜索词组 | textbox / 搜索词组 / — | textbox / 搜索词组 / —（名字来源由 aria-label 改成 `<label for>`） |
| 从 | Date / 从 / — | Date / 从 / — |
| 打印标题 | textbox / 打印标题 / — | textbox / 打印标题 / — |
| 推荐下一轮 | spinbutton / 推荐下一轮 词 / — | spinbutton / 推荐下一轮 / 词 |
| 抽 | spinbutton / 抽 词 / — | spinbutton / 抽 / 词 |
| 过生词 当前学生 | combobox / 切换当前学生 / — | combobox / 切换当前学生 / — |
| 目标生词数 | spinbutton / 目标生词数 / — | 同左 |
| 用中文逗号隔开 | textbox / 用中文逗号隔开 / — | 同左 |
| 学生姓名（正常） | textbox / 学生姓名 / — | 同左 |
| 学生姓名（出错） | textbox / 学生姓名 / —，invalid=false | textbox / 学生姓名 / 词汇服务暂时不可用。，**invalid=true** |
| Agent 口令 名称 | textbox / 名称 / —，required | 同左 |
| 录题 来源类型 | combobox / 来源类型 / — | 同左 |
| 录题 年份 | spinbutton / 年份 / —，required | 同左 |
| 录题 摘要 | textbox / 摘要 / —，required | 同左 |
| 录题 题号 | textbox / 题号 / —，required | 同左 |

- **Tab 顺序**：拍到的每一处，换前换后 Tab 经过的控件一样、顺序一样（`shots.json` 每条的 `tabBefore` / `tabAfter`；搜索框那一条记录里的字从「搜索词组」变成空，是因为记录取的是 aria-label 属性，换后名字改由 `<label>` 给，无障碍树里的名字没变）。
- **单位「词」**：原来「推荐下一轮」「抽」和「词」都在一个 `<label>` 里，名字念成「推荐下一轮 词」；换后名字是「推荐下一轮」，「词」挂在 aria-describedby 上，念成「推荐下一轮，数值 20，词」。字没改。
- **学生姓名出错**：换前只有一行红字 + role=alert，框本身不知道出错；换后框带 aria-invalid、描述是出错那一行，按「保存」后马上播报的 role=alert 那句另外留着（只给读屏，看不见）。读屏用虚拟光标逐行读时，出错的话会听到两遍（看得见的一行和只给读屏的一句），见六 · 3。
- **录题必填**：「地区」清空后按保存，换前换后焦点都停在「地区」、浏览器原生提示「Please fill out this field.」，invalid 由浏览器管（没写 aria-invalid，和原来一样）。
- 390 档换后只拍到学生姓名、Agent 口令、录题三处，读屏信息和 1440 一样。

## 三、每处换前换后（看拼图）

- **听写工作区**（`compare-dictation.png`）：1440 档样子几乎一样，差别在边色（墨 → 浅灰，悬停才深一档）和字重；「当前学生」的字从 12 变 14，下拉宽 94 → 102。390 档换后没拍到。
- **过生词**（`compare-vocab-review.png`）：高 38 / 44 收成 36；「目标生词数」「用中文逗号隔开」的字从 16/600 降到 14/400，最显眼。学生姓名出错由红字改成红边 + 灰字。
  - 换后截图里「学生姓名」后面的「保存」被挤成「保…」：框占满一行，键跟着缩，键上的字被省略号吃掉。拍完以后在 `field.css` 补了一条（跟在框后面的单位、动作键 `flex: 0 0 auto`），按规矩没有重拍，拼图里还是修之前的样子。
- **Agent 口令**（`compare-paper-admin.png`）：高 34 → 36，字 13 → 14，宽 228 不变。
- **录题面板**（`compare-entry.png`）：变化最大的一处：灰底无明显边 → 白底浅灰边；标签变小变轻；多行里的字由等宽改成无衬线。

## 四、没拍到的

按规矩换前、换后各只跑一次，拍不到的不重跑。

| 哪一处 | 换前 | 换后 | 原因 |
|---|---|---|---|
| 过生词 完成页（单词纸名称、下载读音） | 1440、390 都没拍到 | 1440 没拍（脚本只在 390 拍），390 没拍到 | 要先走完一轮过生词、生成单词纸才出这两个控件；脚本走到完成页那步超时 |
| 整卷页 PDF 版本 | 1440、390 都没拍到 | 同左 | 临时库里种的题组没有整卷数据，页面报「整卷预览没打开…：Cannot read properties of undefined (reading 'blocks')」（`shots.json` 的 `paperProbe`），顶栏没有 PDF 版本下拉。是拍图脚本种数据的问题，和这次改动无关 |
| 讲评「查看哪款 PDF」「手动复制试卷信息」 | 没拍 | 没拍 | 同上，要有讲评数据；脚本没写这一步 |
| 错词听写「文件名」 | 没拍 | 没拍 | 在错词听写打印弹层里，要先有错词；脚本没写这一步 |
| 过生词「词汇课程」 | 没拍 | 没拍 | 只有多套课程时才出 |
| 听写工作区 390 档 | 拍到 | 没拍到 | 换后 390 档开始时页面停在上一档留下的状态，等待超时 |
| 过生词 学生下拉、目标生词数、多行 390 档 | 没拍到 | 没拍到 | 1440 那档走完以后学生停在完成页，390 档找不到起始页 |
| 学生姓名 390 档 | 没拍到 | 拍到 | 同上（换前） |

没拍到的这几处，代码改动和拍到的同一种写法；样式靠 tsc、build 和读代码核对过，没有看过实物。

## 五、没做的，和原因

1. **「直接推荐一轮」里的「[n] 词」**（认词面板）：没有看得见的标签字，TextField 的标签必填，加一个就是改字。留着原样。
2. **切换键组**（口音「美音 / 英音」、听写发音、顺序「随机 / 原顺序」、过词读音）：不是输入框也不是下拉，是 `aria-pressed` 的按钮组，验证脚本按 `aria-pressed` 断言；「随机」带图标，SegmentedField 现在放不下图标。换成 SegmentedField 会改读屏角色（按钮 → 单选），算改行为，下一轮单独做。
3. **勾选框、单选、滑块**：打乱词序、打印方式的单选（在菜单里）、词组行和复习行的勾选、手写体选择、滑块、听写播放页 chip 组里自定义间隔的数字框、相似题栏的勾选——字段构件里没有对应的件。
4. **范围外**：顶栏卷名、登录页、ux-walkthrough 脚本里过时的草稿页选择器。
5. **死样式没删**：`.dictation-number-entry …`（vocabularyDictationWorkbench.css）和 `.search-field …`（App.css）在代码里已经找不到用处，但不是这次替换造成的，没动，留给清理那一轮。

## 六、删掉 / 改掉的旧样式（删前都 grep 过，只有被换掉的地方在用）

- `App.css`：`.field`、`.field input/select/textarea` 几条（含焦点、高、多行、`input[type=file]`）；`.entry-question-grid .field` 换成 `.entry-form .eqb-field`、`.entry-question-grid .eqb-field` 的下边距。
- `vocabularyDictationWorkbench.css`：学生下拉、搜索框、日期、合并设置、推荐下一轮、认词「抽」的 label / input / select 几条；新加宽度几条都写了 Explicit-Cascade 注释。
- `vocabularyReviewPage.css`：学生、课程、新建学生、单词纸名称、下载读音、`.vocabulary-run-setup` 的 label / input / select / textarea 几条。
- `paperReviewControls.css`：讲评多行一条，改成只管宽高上限的 `.paper-review-manual-copy .eqb-field-control`。
- `adminWorkbench.css`：口令名称的 label / input / 占位符 / 焦点几条，换成 `.agent-token-name` 管宽度。
- `shared-ui/field.css`、`Field.tsx`：TextField 加 `icon`、`trailing` 两个口子和对应几条样式（见七）。

## 七、构件上加的两个口子

- `icon`：框里左边 16px 图标（第一处是「搜索词组」的放大镜），字往右让出 `space-3 + 16 + space-2`。
- `trailing`：跟在框后面、同一行的单位字（类名 `eqb-field-unit`，12/500 次要灰）或动作键。不进框、不自动挂 aria-describedby，要念的单位由调用处给 id 自己挂。跟在后面的东西不缩（见三，「保…」那条）。

## 八、脚本断言要跟着改的（改了，没跑）

- `scripts/verify-vocabulary-meaning-recall.mjs` 第 353 行左右：原来匹配 `<input … aria-label="错词听写文件名" … value={dictationTitle}>`，改成匹配 `<TextField … label="文件名" … aria-label="错词听写文件名" … value={dictationTitle}`。单独拿正则对新源码试过能配上；脚本本身没跑。
- 别的 verify-* / smoke-* 里没有找到用到这次改动的类名或写法的断言（grep 过 `.field`、各处新旧类名）。

## 九、要 Owner 定的

1. **切换键组要不要下一轮换成 SegmentedField**（读屏角色由按钮变单选，验证脚本的 `aria-pressed` 断言要跟着改；SegmentedField 要先能放图标）。建议：换，先给 SegmentedField 加图标口子，再一起改脚本。
2. **「[n] 词」要不要加一个只给读屏的标签**（比如「推荐词数」），这样能换成 TextField。建议：加，看不见的字不影响页面，读屏现在只念「数值 20」不知道是什么。
3. **过生词起始页的大字号输入（44 高、16/600）收成 36 / 14/400**，起始页会显得轻一些。建议：接受，和全站字段一致；要保留「大」的感觉就用 lg 再加一档，不在页面里另写。
4. **整卷页顶栏 PDF 版本不再跟着悬停滑块走**（原来借 `.ghost-button` 混在键列表里）。建议：接受，下拉不是键，滑块滑到它上面反而像能点一下就执行。
5. **「下载读音」外圈的边去掉、改画在下拉上**。建议：接受。
6. **学生姓名出错时，读屏虚拟光标会念两遍出错的话**（看得见的一行 + 只给读屏的 role=alert）。建议：Field 构件加一个 `announce` 开关，让出错那一行自己带 role=alert，去掉页面里另放的那句；属于构件改动，没在这一轮做。

## 十、DESIGN.md 要改的（没改，写在这里）

- §5 Inputs / Fields「还没收进构件」那一张单：听写工作区、过生词、整卷页 PDF 版本、讲评、Agent 口令、录题面板已收进；剩下的是切换键组、「[n] 词」、勾选 / 单选 / 滑块。
- §5 Inputs / Fields 加一句 TextField 的 `icon`（框内左 16px 图标）和 `trailing`（框后单位 / 动作键，不缩）。
- §5 Inputs / Fields 出错写法补一句：要「一出错就播报」的地方怎么做（现在是页面另放 role=alert，见九 · 6）。

## 缺的变量

见 `docs/design-gaps.md`「2026-11-15 字段构件第二轮的几处尺寸」：图标 16 在 calc 里是字面量；各页字段宽 142 / 64 / 240 / 228 / 440 没有 token，照原值写字面量。

## 工作区里不是这一轮改的

`app/src/features/draft-paper/DraftPaperRail.tsx`、`DraftPaperWorkbench.css`、`DraftPaperWorkbench.tsx` 和 `scripts/component-inventory/rail-shots.mjs` 在工作区里也有改动，不是这一轮做的，没碰。

## 协调人复核（2026-11-15）

- 看过四张对比图。字段都换成了白底细边、墨焦点环，和首页、草稿卷那一轮一个样子，合格。
- 补拍了一次（`FIELDS2_ONLY=review-create,dict-settings,dict-top`，端口偏移 74；脚本加了这个开关；图在 `.scratch/component-inventory/fields2-recheck/`，不入库）：
  - 「学生姓名」后面的「保存」完整显示了，1440 和 390 都不再缩成「保…」。
  - 听写工作区 390 宽：当前学生、搜索词组和从 / 到、打印标题 / 听写标题都正常，没有溢出。
- 「美音 / 英音」那组切换键还是旧样子，留到切换组换 SegmentedField 那一轮。
- Owner 2026-11-15：听写页的音量提示（`dictation-volume-warning`）先不管，原句不改，也不换 Notice。
