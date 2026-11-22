# BUB-255 阅读定位：两套样卷

状态：样卷，待 Owner 拍板。没有推到审核站，没有改线上冻结版本。

这两个文件是 agent 按 `prompts/reading-choice-analysis-v1.md`「定位」一节写的定位补全回复，格式是
`{ questions: { 题号: { locateBy, locate? } } }`，用 `server/paper-import-ai/readingLocate.mjs` 的
`mergeReadingLocate` 合进已审核的阅读解析；合并时校验除定位以外的字段一个字节都没变。

- `locate-paper-gaokao-2025-ii.json`：2025 新课标Ⅱ卷 Q21–Q35，15 题全部通过校验器。
- `locate-paper-gaokao-2024-zhejiang-jan.json`：2024 浙江 1 月卷 Q21–Q35，15 题全部通过校验器。

和 Owner 原先说法的出入：新增了 `answerText`（答案所在那一段原文）。原文依据（evidence quote）常常引三句，
光靠它判断不了答案在不在定位句里；`answerText` 必须落在正确项已有的原文依据里，不另造证据。

还没做：导入时强制要求定位（`requireLocate`）没打开；其余已审核卷子的批量补全；把回复写回题库。
这三件等拍板。

第二版（同日，按 Owner 意见改定位行）：定位行改成「题干词 原词 第几段」或「题干词 → 原文词 第几段」，
答案不在定位句时下一行写去哪找（程序算）。样卷数据跟着改了：2025Ⅱ Q25 原文词改成 hospital teacher，
Q29 定位词改成 Knuth，Q30 定位词改成 doctors；几条桥接句删掉「后一句」「下一段」这类位置词，只留原因。
