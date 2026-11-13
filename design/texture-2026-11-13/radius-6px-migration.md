# 6px 圆角迁移清单

2026-11-13 · 配合 DESIGN.md §5 圆角单一家族（Owner 同日拍板删掉 6px）。同日迁移第一批已照这份清单改完；只有 `vocabularyReviewPage.css` 里一条打印样式按「打印样式不动」留着。

## 怎么判

按 DESIGN.md §5「按高度选档」：24px 以下的小件用 4px，28–44px 的控件用 8px，卡片、板和列表容器用 12px，分段切换用 999px。打印样式不动。

高度有三种来源，表里分开标：

- **实测**：本地测试数据下 Playwright 在 1440 宽量到的渲染高度，取中位数。只有 3 条量到了，其余页面（词汇、讲评、草稿卷的部分弹窗）本地数据跑不出来。
- **源码**：CSS 里直接写了 `height` 或 `min-height`。
- **源码估**：按 `padding` 加字号 × 行高（没写行高按 1.5）估的。

除了「实测」，其余都要在迁移时用真实数据复核一遍。

## 守门脚本查得到的 77 条

`scripts/verify-radius-family.mjs` 的 BASELINE 登记的就是这些（按文件 × 值计数，共 77）。每改一处，把对应计数减一；减到 0 删掉那一项，脚本会提醒。

合计：8px 56 条，12px 9 条，4px 2 条，8px 0 0 8px 4 条，0 8px 8px 0 4 条，999px 1 条，不动 1 条。

| 位置 | 选择器 | 高度 px | 改成 | 依据 |
| --- | --- | --- | --- | --- |
| `App.css:237` | `.topbar-page-title-input` | 26 | 8px | 控件；高度按 padding 和字号估 |
| `App.css:376` | `.primary-button, .ghost-button, .add-button, .detail-button, .back-button, .save-button, .` | **28**（实测） | 8px | 控件 |
| `App.css:521` | `.search-field` | 36 | 8px | 控件；高度来自 CSS |
| `App.css:549` | `.field input, .field select, .field textarea` | — | 8px | 控件；上下内边距是 0，高度由别处的 height 定，按输入框算 |
| `App.css:607` | `.version-toggle` | 27 | 999px | 分段切换的外框，按「胶囊只给标签类」；高度按 padding 和字号估 |
| `App.css:1346` | `.difficulty-profile-grid span, .vocab-blocker-list span` | 32 | 8px | 控件；高度按 padding 和字号估 |
| `App.css:1826` | `.icon-button` | 32 | 8px | 控件；高度来自 CSS |
| `App.css:2580` | `.calibration-watch-flag` | 27 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `App.css:2829` | `.calibration-report-watch-item` | 28 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `App.css:2906` | `.paper-blocks-start-num input` | 28 | 8px | 控件；高度来自 CSS |
| `App.css:3051` | `.block-settings-input` | 32 | 8px | 控件；高度来自 CSS |
| `App.css:3089` | `.block-settings-score input` | 28 | 8px | 控件；高度来自 CSS |
| `App.css:3595` | `.concierge-error button` | 34 | 8px | 控件；高度来自 CSS |
| `App.css:3925` | `.concierge-row` | 53 | 12px | 卡片、板或列表容器；高度按 padding 和字号估 |
| `App.css:4020` | `.concierge-action` | 26 | 8px | 控件；高度按 padding 和字号估 |
| `App.css:4740` | `.concierge-skeleton-line` | 12 | 4px | 24px 以下的小件；高度来自 CSS |
| `features/draft-paper/DraftPaperWorkbench.css:61` | `.draft-export-menu-panel button, .draft-outline-actions button, .draft-suggestions button,` | 34 | 8px | 控件；高度来自 CSS |
| `features/draft-paper/DraftPaperWorkbench.css:95` | `.draft-student-field input, .draft-recent-select` | 36 | 8px | 控件；高度来自 CSS |
| `features/draft-paper/DraftPaperWorkbench.css:977` | `.draft-save-space-dialog input, .draft-save-space-dialog select` | 36 | 8px | 控件；高度来自 CSS |
| `features/paper-browse/paperBrowsePage.css:53` | `.paper-browse-export-error` | 37 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/paper-browse/paperBrowsePage.css:1336` | `.continuation-analysis-subcard` | 41 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/paper-intelligence/lectureAnalysisPanels.css:110` | `.pi-ps-analysis-option-section` | — | 12px | 卡片、板或列表容器；高度不明，按名字判断 |
| `features/paper-intelligence/lectureAnalysisPanels.css:451` | `.pi-seven-option-card` | — | 12px | 卡片、板或列表容器；高度不明，按名字判断 |
| `features/paper-intelligence/lectureAnalysisPanels.css:764` | `.pi-cloze-blank-card, .pi-gf-blank-card` | 41 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/paper-intelligence/paperIntelligence.css:81` | `.pi-disclaimer` | 30 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/paper-intelligence/paperIntelligence.css:118` | `.pi-passage-title .pi-section-badge` | 24 | 4px | 24px 以下的小件；高度来自 CSS |
| `features/paper-intelligence/paperIntelligence.css:809` | `.pi-passage-action` | 26 | 8px | 控件；高度按 padding 和字号估 |
| `features/paper-intelligence/paperIntelligence.css:938` | `.pi-topbar-back` | 32 | 8px | 控件；高度按 padding 和字号估 |
| `features/paper-intelligence/paperIntelligence.css:1123` | `.pi-basket-preview-item` | 37 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/paper-intelligence/paperIntelligence.css:1345` | `.pi-option-block` | 37 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/vocabulary-dictation/vocabularyDictationPage.css:258` | `.vocabulary-dictation-settings fieldset button, .vocabulary-dictation-settings fieldset la` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation/vocabularyDictationPage.css:357` | `.vocabulary-dictation-complete button, .vocabulary-dictation-answer-confirm button, .vocab` | 40 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:77` | `.dictation-student-picker select, .dictation-library-tools input, .dictation-combine-setti` | **37**（实测） | 8px | 控件 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:136` | `.dictation-notice` | 45 | 12px | 卡片、板或列表容器；高度按 padding 和字号估 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:210` | `.dictation-library-tools > button, .dictation-pagination button, .dictation-selection-summ` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:466` | `.dictation-combine-settings fieldset button:first-of-type` | — | 8px 0 0 8px | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:471` | `.dictation-combine-settings fieldset button:last-of-type` | — | 0 8px 8px 0 | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:543` | `.dictation-selection-actions details button` | 34 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:622` | `.dictation-created-header-actions button` | 32 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:692` | `.dictation-download-menu > summary` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:983` | `.dictation-task-selection-panel fieldset button:first-of-type` | — | 8px 0 0 8px | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:988` | `.dictation-task-selection-panel fieldset button:last-of-type` | — | 0 8px 8px 0 | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1232` | `.dictation-workbench-message button` | 37 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1247` | `.dictation-review-channel, .dictation-history-filter` | — | 12px | 卡片、板或列表容器；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1287` | `.dictation-history-details > summary` | 32 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1383` | `.meaning-recall-home button, .meaning-recall-result button, .meaning-recall-stage button` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1458` | `.meaning-recall-start-row input, .meaning-recall-suggestion input` | 37 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1489` | `.meaning-recall-start-row fieldset button:first-of-type, .meaning-recall-result-list field` | — | 8px 0 0 8px | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1495` | `.meaning-recall-start-row fieldset button:last-of-type, .meaning-recall-result-list fields` | — | 0 8px 8px 0 | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1670` | `.meaning-recall-export-name input` | 37 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1705` | `.meaning-recall-result-actions fieldset button:first-of-type` | — | 8px 0 0 8px | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:1710` | `.meaning-recall-result-actions fieldset button:last-of-type` | — | 0 8px 8px 0 | 分段按钮组的两端，按控件；高度不明，按名字判断 |
| `features/vocabulary-listen/vocabularyListenPage.css:273` | `.vocabulary-listen-settings fieldset button` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-listen/vocabularyListenPage.css:462` | `.vocabulary-listen-message button` | 39 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-practice/vocabularyHandwriting.css:124` | `.vocabulary-handwriting-selector-mode span` | 50 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-practice/vocabularyPracticePage.css:22` | `.vocabulary-practice-back` | **36**（实测） | 8px | 控件 |
| `features/vocabulary-practice/vocabularyPracticePage.css:114` | `.vocabulary-practice-modes > span` | 48 | 12px | 卡片、板或列表容器；高度来自 CSS |
| `features/vocabulary-practice/vocabularyPracticePage.css:160` | `.vocabulary-match-card` | 142 | 12px | 卡片、板或列表容器；高度来自 CSS |
| `features/vocabulary-practice/vocabularyPracticePage.css:205` | `.vocabulary-match-card-back, .vocabulary-match-card-face` | 53 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:86` | `.vocabulary-program-switcher select` | 38 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:98` | `.vocabulary-student-switcher select, .vocabulary-student-create input` | 38 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:115` | `.vocabulary-student-add-button, .vocabulary-student-create button` | 38 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:127` | `.vocabulary-student-create` | 41 | 8px | 矮的提示条或条目，按控件高度；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:258` | `.vocabulary-progress-current` | 49 | 12px | 卡片、板或列表容器；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:288` | `.vocabulary-progress-weeks button` | 38 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:348` | `.vocabulary-progress-word` | 44 | 8px | 矮的提示条或条目，按控件高度；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:499` | `.vocabulary-group-list li` | 48 | 12px | 卡片、板或列表容器；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:590` | `.vocabulary-stage-meta button` | 32 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:628` | `.vocabulary-word-replay` | 36 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:723` | `.vocabulary-pronunciation` | 35 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:874` | `.vocabulary-control` | 48 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:1166` | `.vocabulary-set-title-control input` | 38 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:1187` | `.vocabulary-completion-actions .vocabulary-print-accent-control` | — | 8px | 控件（屏幕上的口音选择框，不是打印样式）；上下内边距是 0，高度由别处定 |
| `features/vocabulary-review/vocabularyReviewPage.css:1294` | `.vocabulary-review-accent-control > div` | 25 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:1331` | `.vocabulary-run-setup input, .vocabulary-run-setup select, .vocabulary-run-setup textarea` | 44 | 8px | 控件；高度来自 CSS |
| `features/vocabulary-review/vocabularyReviewPage.css:1464` | `.vocabulary-recent-sets button` | 45 | 8px | 控件；高度按 padding 和字号估 |
| `features/vocabulary-review/vocabularyReviewPage.css:1894` | `.vocabulary-visual-compact` | — | 不动 | 打印样式，按规范不碰；永久留在豁免名单 |

## 守门脚本查不到的 3 条

这 3 条写成 CSS 变量 `--fh-radius: 6px`，守门脚本对 `var()` 一律放行，所以查不出来。迁移时一起改；以后可以让脚本也检查名字以 `-radius` 结尾的变量。

| 位置 | 选择器 | 高度 px | 改成 | 依据 |
| --- | --- | --- | --- | --- |
| `features/paper-intelligence/lectureAnalysisPanels.css:102` | `.pi-ps-analysis-options--accordion` | — | 8px | `--fh-radius` 是悬停高亮块的圆角，高亮块是行，按控件 |
| `features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css:714` | `.dictation-download-items` | — | 8px | `--fh-radius` 是悬停高亮块的圆角，高亮块是行，按控件 |
| `features/vocabulary-review/vocabularyReviewPage.css:1447` | `.vocabulary-recent-set-list` | 21 | 8px | `--fh-radius` 是悬停高亮块的圆角，高亮块是行，按控件 |

## 要你看一眼的两类

- **分段按钮组**（`6px 0 0 6px` / `0 6px 6px 0`，共 8 条）：按控件改成 8px。按「胶囊只给标签类」，分段切换应该是 999px，但这几组是两个方按钮拼起来的，改胶囊外形变化大。先按 8px 列，要改胶囊再说。
- **变成 12px 的容器**（9 条）：从 6px 到 12px，变化比改成 4px 或 8px 明显。卡片、板用 12px 是 DESIGN.md 已有的规定，这里只是照做。
