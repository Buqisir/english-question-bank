# 详情页重设计 spec —— 速览头 + 一张纸露一角

- 日期：2026-07-15（brainstorming 全程 + 原型 B 实测，owner 逐步拍板）
- 状态：**owner approved**（原型 `?detailVariant=paper-peek` 真数据实点通过）
- 原型：`app/src/features/question-detail/DetailPaperPeekPrototype.tsx`（throwaway，
  正式刀重写折回后整删）

## 一句话身份

详情页 = **「这题值不值得进我的卷」的判断台**。老师在找题心流里点进来，
3-10 秒拿到判断依据（大意 + 题型/考点分布 + 卷面质感），动作只有一个主线：
加入草稿卷；判断不了的深看走整卷预览/讲评。

## 老师想看什么（owner 原话拍板）

1. **大意**——一句话/一段中文概括（已有 `summary` 字段，后台生产）。
2. **各小题的题型**——细节理解/推理判断……（阅读）；考点分布（语法填空）。
3. 「貌似就没什么想看的了」。

## 三条不能放（负空间，与放什么同等重要）

1. **解析不放**——会吃掉解析页/讲评态的功能位。渲染层结构性保证：卷面用
   只读 PaperSurface 挂载（`lectureFocus=null`、`onFocusIntent` noop、无
   answers/evidence），不是靠自律。现有 AnalysisDisclosure 折叠解析区**整体
   退役**出详情页。
2. **生产不放**——ADR-0015 既有结论，维持。
3. **管理不放**——owner-only 编辑/删除保留但收次要位（低频纠错兜底，
   member 不可见，现状规则不变）。

## 页面结构（上→下）

```
返回找题
┌ 速览头（工具侧中性 token + 墨绿签名）─────────────┐
│ meta 行：题型·题数 · 真题/模拟                     │
│ 标题                                             │
│ 大意段（summary，≤68ch）                          │
│ 题型/考点 chips（见数据契约）                       │
│ 话题标签丸（有则显示）                              │
│ 动作行：[加入草稿卷](主) [看整卷] [讲评] [相似篇章] (编辑/删除次位) │
├ 一张纸（暖纸卡浮中性页，my-space 微缩 A4 判例）────┤
│ 该题组 PaperSurface 只读挂载，默认露一角 ~340px，   │
│ 顶部页边距裁掉（首行内容尽早出现），底部白→白渐隐 +   │
│ 居中「展开卷面」丸；展开=完整卷面原貌，可收起         │
└──────────────────────────────────────────┘
```

拍板过程记录：大意取 C（一句话打头+原文兜底）→ 题干层与原文兜底合并为
"接一张纸"（owner 提出）→ 纸的默认姿态取 B（露一角，A 首屏太空 / C 回到
"读"形态）。

> 补录（2026-07-15，E6 对齐）：动作行含「相似篇章」系本 spec 起草时的
> 漏项——详情页组头篇章相似入口已由 owner 在
> `docs/cuts/similar-questions/program.md` §配方 v2 逐裁点拍板
> （原型 prototype-passage-entry.html 场景 1）。E6 刀
> （`docs/cuts/similar-passages-entry/`）在现详情页落地共享候选面板，
> 本刀重设计时原样重挂进新动作行，点击仍为原地展开。

## 数据契约

- **大意**：`QuestionGroupDetail.summary`（已有，零新生产）。
- **卷面**：`parsePaperIdFromHref(paperSurfaceHref)` → fetch
  `/paper-assets/<paperId>/latest/paper-asset.json`（fallback 无 latest）+
  figures manifest（best-effort）→ 按 groupType 走五个现有 adapter 构建单组
  模型（与 paper-browse/解析页同一管线，所见即所印）。现库 273/273 组有
  已发布纸面资产；无纸组降级为「卷面未就绪 → 去整卷预览」占位（不维护第二
  套 bespoke 渲染）。
- **题型/考点 chips**（一期范围）：
  - 阅读：已存 reading parse 的 per-question `questionType` 计数（原型实测
    该字段部分组缺失——正式刀需先核字段覆盖率，缺失显示「未标注」不造假）。
  - 语法填空：详情页本就要 fetch 该卷 assets 目录，顺手拉
    `analyses/grammar-fill-analysis-v2.json`（D1 已落库），本组各空
    `facetKey` → `grammarFillFacetRegistry.ts` 文案 → 计数 chips
    （"谓语·过去时 ×3"粒度沿 registry 22 键）。
  - 完形/七选五：一期**只显示题数不显示分布**（无对应成熟维度，不占位
    不造假）；后续有拍板的维度再接。
- **话题标签**：`detail.topicLabels`（已有）。

## 退役清单（正式刀删除面）

- 详情页 bespoke 语篇渲染（`buildPassageSegments`/figure 占位那套在本页的
  使用；`passageFigureSegments` 若仍被他页引用则保留模块本身）。
- 逐题题干+选项列表渲染、AnalysisDisclosure 在本页的全部挂载
  （含"故事大意与串词成篇"等折叠区——大意升格到速览头，其余解析内容随
  解析退役条款离场）。
- 相应 CSS 与 App.tsx 侧不再需要的 parse-props 传递（App.tsx 改动收最小面，
  保留 openDetail 数据通路，能少动就少动）。
- 原型三件（DetailPaperPeekPrototype.tsx / detailPaperPeek.css / 本页
  PROTOTYPE 注释接线）整删，正式实现重写不搬运。

## 边界（Forbidden）

- `shared/papersurface/**` 契约零改动（只读挂载是既有 props 形态）。
- 解析内容（答案/证据/讲评文案）零进入本页。
- 找题 feed 卡、整卷预览、讲评态、组卷台不在本刀 scope。
- 暖纸边界：页壳中性，纸卡自暖（判例合规，不新增色彩决策）。

## 错误与边角

- 无 paperSurfaceHref / 资产 404：速览头照常，纸位显示降级占位（带去整卷
  预览指引；若整卷也无则只留文案）。
- summary 为空：不留空段，直接 chips（后台生产补数据是独立事）。
- writing 组：纸挂载走 WritingPaperPage 包裹（原型已验证路径）。
- 展开态性能：单组挂载与整卷页单卡同量级，无新增风险。

## Verify / QA 要点（正式刀）

- 静态断言：详情页源码零 AnalysisDisclosure 挂载、PaperSurface 挂载
  props 钉死只读形态（lectureFocus null / onFocusIntent noop）。
- chips 数据断言：阅读 questionType 覆盖率核数；语法填空 facetKey→registry
  全命中（复用 D1 verify 的 registry 完备性保证）。
- 浏览器 QA：四题型各一组实点（含无标签组、writing 组、露一角/展开/收起）。

## 后续（不在本刀）

- 完形/七选五的分布维度拍板后接入 chips。
- 找题 feed 卡是否也吃"大意+chips"精简（独立议题）。
