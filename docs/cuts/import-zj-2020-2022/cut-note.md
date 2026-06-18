# Cut Note: import-zj-2020-2022

**状态**: 已发布入库 + PR [#219](https://github.com/Buqisir/english-question-bank/pull/219)(CI verify 绿)。
**Tier**: large(碰 server 发布数据契约 + 不可逆入库)。

## 目标与结果
浙江 2020–2022 共 6 套(各年 1月 + 6月/7月)真题导入入库。
**结果**: 6 套全部 `status: published`,48 题组入库(real_exam / 浙江)。

## 改动(15 文件)
- `lib.mjs`: 七选五/完形题号硬编码 → 按阅读末题动态接力(向后兼容)
- `packageBuilder.mjs`: `FORMAT_PROFILE`(按完形题数 15/20 选) — 分节标题/每题分(seven2,cloze1.5)/阅读门/续写门 starter 可选
- `validator.mjs`: 发布期阅读门按完形题数(浙江3篇 A-C / 新课标4篇 A-D)
- `analyzeCloze.mjs`: 完形题数门 15 → 15||20
- 新增 `verify-zj-package.mjs`(byte-diff) + `verify-publish-gate.mjs`(端到端发布门) + 6 套 config.json

## 验证
- **4 CR 全 PASS**(见 cr.md CR-1..CR-4: lib题号 / packageBuilder profile / 续写门 / validator阅读门)
- 新课标 16 套 byte-identical(零回归): paper-2024-i / 2025-ii / zj-2026
- 6套 split 答案 100% 核对 + 36/36 AI 解析 + status=published
- c7-paper-import contracts/publish verify PASS + CI verify PASS

## 教训(已沉淀 memory: zhejiang-legacy-import-2020-2022)
1. **发布链路 3 道格式门散在 2 模块**(packageBuilder 阅读+续写门 / validator 发布期阅读门);初版 PA 只审 packageBuilder → 漏 validator → `validation_failed`。**导异格式先跑 verify-publish-gate 走真 publish 门。**
2. **exit 0 ≠ 发布成功**(02-publish 即使 validation_failed 也 exit 0) → 查 `status: published` + DB。
3. import-meta sha 由 02-publish 运行时现算;离线 verify 要复现。

## 待办
- **owner QA**(发布后,可重发布修): 2020-jan A4 分节满分文本破版? 2020-jul 续写 starters=[] 前端渲染?
- **写作解析-应用文**: 6套应用文范文已入库(paper-assets/<id>/latest/analyses/writing-analysis-v1.json;driver ALLOWED 已扩6套老卷;Workflow Opus 扇出 + persist 6/0)。
- **写作解析-续写**: **deferred**(owner 2026-06-18 选"先交应用文,续写另议")。原因: lib 对浙江老卷续写区 starter 提取失败(6套的 continuationStarters 抓到 注意事项/答案范文/标签,如 2022-jan 抓"(1)词数(2)关键词"、2020-jan 抓整段范文、2021-jun 第二个是"Paragraph 2:"标签;2020-jul 本就无段落开头语)。续写解析需准确的 2 段开头语作输入,现不可靠。**题目续写材料 passage 本身干净不受影响**(已验证)。续写解析需先修 lib buildContinuation 对老卷续写切分(提准 starter)+ 重发布 writing-tasks,或人工提取 starter — 作为独立 cut。
