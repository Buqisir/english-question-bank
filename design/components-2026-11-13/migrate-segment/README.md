# 切换组换分段选择 + 推荐词数输入框 + 学生姓名出错播报（2026-11-15）

把词汇几页里用 `aria-pressed` 按钮排成一排的「选一个」组，换成 `app/src/shared-ui/OptionField.tsx` 的 SegmentedField；
「直接推荐一轮 [n] 词」的输入框换成 TextField 并补上读屏标签；Field 加 `announce`，学生姓名出错改用它播报。
看得见的字一个没改。没有 commit。

对照拼图（左换前 = HEAD 临时 worktree，右换后 = 工作区；元素截图，四周留 16px；静态、键盘焦点两种；1440 / 390 两种宽）：

- `compare-workbench.png`：听写工作区（合并设置口音、已选听写口音、认词首页顺序 / 推荐词数、认词结果听写发音）
- `compare-review.png`：过生词（过词读音、新建学生出错）
- `compare-public.png`：扫码听音页（发音、每词播放）；扫码听写页那两行标「已退回，没换」
- `shots.json`：每张图有没有拍到；每组换前换后的无障碍树（角色、名字、checked、invalid、描述）、实测样式、Tab 停几次、方向键前后的选中项

拍图脚本 `scripts/component-inventory/segment-shots.mjs`（照 fields2-shots.mjs 写，端口偏移 75，`SEGMENT_ONLY=步骤名` 只跑一步），
拼图脚本 `segment-compare.mjs`。原始截图在 `.scratch/component-inventory/segment/{before,after}`，不进仓库。
换前、换后各只跑了一次，两边都没有「没拍到」，页面没有报错。读屏核对用的是 CDP 无障碍树，不是真读屏软件。

## 一、构件改动

- `ChoiceOption.icon?: ReactNode`：只有 SegmentedField 画。放在标签字前面，外包 `<span className="eqb-segmented-icon" aria-hidden="true">`，读屏不念。
  尺寸由调用处给（`size={16}`），构件不写死，因为还没有图标尺寸变量（见 `docs/design-gaps.md`）。
  `.eqb-segmented-option` 改成 `inline-flex` 居中，图标和字之间 `--eqb-space-1`。没图标的选项样子不变。
- `FieldFrame.announce?: boolean`（TextField / TextAreaField / SelectField / SegmentedField / OptionSelectField 都往下传）：
  开了以后，出错那行放在一个一开始就在 DOM 里的 `<div className="eqb-field-live" role="alert">` 里，出错文字出现时念一次。
  页面上只有这一份字，读屏也从 `aria-describedby` 拿同一份，不再另放一行隐藏字。没有提示也没有出错时，这块用 visually-hidden 的写法收起来（不能用 `display: none`，否则播报区不算已存在）。

## 二、清单

| # | 文件 | 原来的写法 | 选项 | 换成 | 看得见的变化 |
|---|---|---|---|---|---|
| 1 | `vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx` 合并设置 | `<fieldset>` + 两个按钮，**没有** `aria-pressed`（读屏分不出选了哪个） | 美音 / 英音 | `SegmentedField hideLabel`（标签「口音」只给读屏，原来 legend 也是隐藏的） | 方块按钮 → 胶囊；选中项白底 + e1 阴影 + 字重 500；高 36 → 32 |
| 2 | 同上 已选听写面板 | `<fieldset>` + `aria-pressed` 按钮 | 美音 / 英音 | `SegmentedField hideLabel`；390 宽时撑满一行 | 同 1 |
| 3 | `VocabularyMeaningRecallPanel.tsx` 认词首页「顺序」 | `<fieldset>` + 按钮，没有 `aria-pressed`；「随机」前有 Shuffle 图标 | 随机（图标）/ 原顺序 | `SegmentedField hideLabel`，图标走新 `icon` 槽；390 宽撑满 | 同 1；图标 16px 不变 |
| 4 | 同上 认词结果「听写发音」 | `<fieldset>` + legend + `aria-pressed` 按钮 | 美音 / 英音 | `SegmentedField layout="inline"`（标签看得见，和原 legend 同字） | 同 1 |
| 5 | `vocabulary-review/VocabularyReviewPage.tsx`「过词读音」 | `<fieldset>` + legend + `aria-pressed` 按钮 | 美音 / 英音 | `SegmentedField layout="inline"` | 高 42 → 32；胶囊；390 宽时靠右 |
| 6 | `vocabulary-listen/VocabularyListenPage.tsx`「发音」 | `<fieldset>` + legend + `aria-pressed` 按钮 | 美音 / 英音 | `SegmentedField`，撑满一行 | 高 36 → 32；胶囊；公开页没有悬停滑块（见五） |
| 7 | 同上「每词播放」 | 同上 | 1遍 / 2遍 / 3遍 | `SegmentedField`，值用字符串 '1'/'2'/'3'，回调里转回数字 | 同 6 |
| 8 | `VocabularyMeaningRecallPanel.tsx`「直接推荐一轮 [n] 词」 | 裸 `<input type=number>`，没有标签，读屏名字是旁边的「词」 | — | `TextField hideLabel layout="inline" size="lg"`，读屏标签「推荐词数」；「词」放 `trailing`（`eqb-field-unit`）并由 `aria-describedby` 念 | 高 33 → 36；宽 64 照搬 |
| 9 | `VocabularyReviewPage.tsx` 学生姓名出错 | 构件出错行 + 页面另放一行 `<p role="alert" className="visually-hidden">` | — | 删掉页面那行，`TextField announce` | 看不出；DOM 里出错字由 2 份变 1 份 |

## 三、实测结果（shots.json）

- 1–7 每组：Tab 停的次数由 2–3 次（每个按钮一次）变 1 次；换前方向键不动，换后左右键移焦点并同时选中，再按回来能恢复。
- 角色由 group + button 变 radiogroup + radio，每项带 checked。1、3 换前连 pressed 都没有，现在读屏能念出选中项。
- 8：无障碍名字由「词」变「推荐词数」，描述「词」。
- 9：出错时播报区（`eqb-field-live`）在出错前就已存在且为空；出错后输入框 invalid=true，描述「词汇服务暂时不可用。」；表单里出错字份数 2 → 1。
  （截图环境没接词汇服务，所以拍到的出错是这句，不是「已有同名学生档案」；走的是同一条出错路径。）

## 四、没换的，和为什么

| 位置 | 为什么没换 |
|---|---|
| 扫码听写页 `VocabularyDictationPage.tsx`「每词播放」「词间书写时间」 | 换过一次又退回了。1440 宽时设置在 220px 的侧栏里，每格约 100px，换前按钮已经竖着折成 26×53（目测很挤）；分段选项不折行，每项约 42–45px，换后溢出格子。「词间书写时间」是 3/5/8 秒加一个自填秒数的输入框，不是纯选一个。要换得先改这块排版（见七） |
| 认词记录 / 历史听写、全部 / 常错 | 切的是下面整块内容，是标签页的意思，不是表单里选值 |
| 每行「重点」「暂停」 | 两个可以同时开，不是选一个 |
| 「显示已暂停」 | 单个开关 |
| 每词「对 / 错 / 未测」 | 每点一下就直接保存；换成单选组后方向键每走一步都会保存一次。「错」用危险色，构件没有这一种 |
| 周次导航、进度词格 | 项多，是导航 |
| 打印菜单里的「打印方式」 | 本来就是 `role="radio"`，在弹出菜单里 |

## 五、缺的变量 / 构件缺口（已记进 `docs/design-gaps.md`）

- 图标尺寸没有变量，16px 由调用处写 `size={16}`。
- FluidHoverList 的滑块样式（`.fluid-hover-list`）写在 `App.css`，扫码听音页这类公开入口不加载它，所以那里的分段选择没有悬停滑块。
- 「撑满一行」在听音页、已选听写面板、认词顺序三处各写了一对覆盖（`.eqb-segmented {display:flex; flex:1}` + `.eqb-segmented-option {flex:1}`），可以收成 SegmentedField 的一个属性。

## 六、改掉的 CSS 和脚本断言

- 删掉：`vocabularyReviewPage.css`、`vocabularyListenPage.css`、`vocabularyDictationWorkbench.css` 里这些组原来的 fieldset / legend / button / `.is-selected` / `:focus-visible` 规则，
  以及已选听写面板里「Overrides the shared button radius」那条。
- 页面里 `.x button` 这类规则（0,1,1）会盖过 `.eqb-segmented-option`（0,1,0），所以加了 `:where(:not(.eqb-segmented-option))` 排除。
  用 `:where` 是为了不抬高权重：直接写 `:not()` 会让下载菜单的按钮和 `.dictation-batch-export-actions` 的排版被盖掉（试过）。每处都有 Explicit-Cascade 注释。
- 脚本断言（改了，**没跑**）：
  - `scripts/verify-vocabulary-meaning-recall.mjs`：legend「听写发音」的正则 → 查 `SegmentedField … label="听写发音" … options={ACCENT_OPTIONS}`，另查 ACCENT_OPTIONS 里有美音 / 英音。
  - `scripts/verify-vocabulary-dictation-review.mjs`：已选听写口音的 `aria-pressed` 正则 → 查 `SegmentedField` `dictation-task-accent` + ACCENT_OPTIONS + OptionField.tsx 里 `role="radio" … aria-checked={checked}`；
    「Overrides the shared button radius」那条 → 查 `:where(:not(.eqb-segmented-option))` 的选择器和注释。
  - `scripts/verify-vocabulary-rendered-behavior.mjs`：过生词 美音 / 英音、听音页 2遍 / 美音 / 英音 / 次数 0 那几处，`getByRole('button')` + `aria-pressed` → `getByRole('radio')` + `aria-checked`。
    听写页 2遍 / 3遍 两处跟着退回，仍是 button + aria-pressed。
  - 改过的正则都用 node 对着现在的源码跑过一遍，能匹配上。

## 七、DESIGN.md 要改的（本轮没动 DESIGN.md）

- §5 Inputs / Fields「还没收进构件」：去掉「切换组」和「[n] 词」两项；补一句扫码听写页设置、对 / 错 / 未测、视图切换仍未收。
- §5 SegmentedField 那段：写上 `icon` 槽（16px，在字前，读屏不念，尺寸由调用处给）。
- §5 Field 那段：写上 `announce`（出错只念一次，DOM 里只有一份字；页面不要再自己放隐藏的 role=alert）。

## 八、要 Owner 定的

1. 读屏标签「推荐词数」是新加的字（只给读屏，看不见）。建议：就用它。
2. 扫码听写页设置的排版。建议：220px 侧栏里改成一栏竖排，每组占满宽，再把「每词播放」换成分段选择；「词间书写时间」另做成分段 + 自填。
3. 对 / 错 / 未测要不要变单选组。建议：变，但方向键只移焦点不保存，空格 / 回车才保存；「错」的危险色要先在构件里加一种。
4. 认词记录 / 历史听写、全部 / 常错 要不要做成标签页构件。建议：做，放进下一轮。
5. `.fluid-hover-list` 的样式挪进 shared-ui。建议：挪，公开页才有滑块。
6. SegmentedField 加「撑满」属性（如 `fill`）。建议：加，删掉三处重复覆盖。
7. 学生页上分段选择由 36 / 42 变 32、方块变胶囊。建议：接受，和工作区一致。
