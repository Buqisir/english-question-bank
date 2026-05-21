# Paper Asset V1 产品规则文档

## 概述

`paper-asset-v1` 是全卷资产的正式数据契约。导入单位为 **整张试卷**；PaperSurface 最终目标为完整英语高考标准版面（非仅阅读页）。

---

## 顶层结构

```json
{
  "schemaVersion": "paper-asset-v1",
  "paper": {},
  "sources": {},
  "layoutTree": {},
  "content": {},
  "answerKey": {},
  "analysis": {}
}
```

---

## 锁定规则

### 1. paper 元数据

| 字段 | 说明 |
|------|------|
| `paperId` | 稳定不变的全局唯一标识 |
| `assetVersion` | 每次发布递增 |
| `title` | 试卷标题 |
| `subject` | 科目 |
| `source` | 来源标签 |
| `status` | `draft` / `published` |

- `paperId` 一旦确定不可变。
- `assetVersion` 从 1 开始递增。

### 2. sources 来源

- `primarySourceType`: C6a 阶段为 `docx`。
- DOCX 记录：`fileName`, `sha256`, `sourcePath`, `extractedTextSummary`。
- 不要求 image/OCR 字段。

### 3. layoutTree 版面树

层级建模真实考试结构：

```
part → section → group
```

layoutTree 中引用的 groupId 必须在 content 中存在。

### 4. content 内容

#### 4.1 content.blocks（必需）

`content.blocks` 以语义块数组表示真实试卷排列顺序，允许非题目块：

| 块类型 | 说明 |
|--------|------|
| `notice` | 注意事项 |
| `partHeading` | 部分标题 |
| `sectionHeading` | 节标题 |
| `instruction` | 做题说明 |
| `exampleQuestion` | 例题 |
| `questionRange` | 题号范围引用 |
| `group` | 题组引用 |
| `answerBox` | 作答区 |
| `pageBreakHint` | 软分页提示（V0 不强制浏览器分页）|

#### 4.2 content.groups

- `question` = 得分/作答单位。
- `blank` = 文中空格/定位单位。
- 七选五/完形/语法填空使用 `questionId` 关联 `blankId`。

#### 4.3 选项规则

| 场景 | 存储位置 |
|------|----------|
| 逐题独立选项 | `question.options` |
| 共享选项池（七选五） | `group.optionBank` |
| 语法填空提示词 | `blank.prompt` |

#### 4.4 阅读理解

- Reading A-D 必须有 `passage.paragraphs`。
- 段落 ID 稳定且组内唯一。

#### 4.5 七选五

- `group.optionBank` 存储 A-G 共享选项。
- 36-40 题通过 `questionId` 关联 `blankId`。

#### 4.6 完形填空

- 内联 blanks 41-55。
- 每题有 A-D 选项。

#### 4.7 语法填空

- blanks 56-65。
- 有提示词时记录在 `blank.prompt`。

#### 4.8 写作

- 应用文和读后续写建模为 `writingTask`。
- 包含 answerBox 块和续写开头。

### 5. answerKey 答案

- **`answerKey` 是唯一权威答案来源。**
- 与 content 和 analysis 分离存储。
- `analysis` 中不得出现 `correctAnswer`。

### 6. analysis 分析

- `analysis.groups` + `analysis.questions` 是分析结构。
- analysis 存储**可复用事实**，不存储 UI 副本，不存储长篇 AI 报告。
- C6a-1 可保持 analysis 为空（C6a-2 补充阅读分析）。

---

## 禁止规则（Clean-only）

导入的资产中 **不得包含**：

- `unknown` 字段
- `reviewFlags` 字段
- 未匹配的 quote/highlight
- 失败的 AI 输出
- `correctAnswer`（analysis 中）

如果 analysis 被提交，它必须对目标 group 是干净且完整的。脏 JSON 不可导入。`draft` 表示未发布/未完成，不表示脏。

---

## 外部 AI 分析契约

### JSON 文件输出标准

外部 AI 的任务是生成可保存为 `reading-choice-analysis-v1.json`
的文件正文，而不是生成聊天回复、Markdown 报告或自由格式解析。

模型可以、也应该在内部认真推理题目依据、干扰项机制、定位关系和
quote 精确性；但推理过程不得输出。输出阶段必须只写符合 schema 的
JSON 文件内容。

硬规则：

- 首字符必须是 `{`，末字符必须是 `}`。
- 不得输出文件名标题、寒暄、解释、计划、Markdown、代码块或注释。
- 不得输出顶层 `status` 或顶层 `analysis` 包裹对象。
- 不得自创字段；schema 没有的内容不要表达。
- 信息足够时必须立即生成 JSON 文件正文，不做题目解析以外的无意义思考或任务复述。
- 外部 AI 的深度算力只用于判断答案依据、干扰项分类、定位关系和 JSON 合规性。

### 阅读理解选择题分析字段

每道已发布阅读题必须包含：

| 字段 | 说明 |
|------|------|
| `skill` | 题型技能分类 |
| `questionFocus` | 设问焦点 |
| `stemTranslationZh` | 题干中文翻译（准确自然，不泄露答案分析）|
| `optionAnalysis` | 四选项分析（每项含 `optionTranslationZh`）|
| `locationParaphrases` | 定位关系/同义替换 |

### skill 规则

```json
{
  "primary": "detail",
  "secondary": "inference"
}
```

- `primary` 必须为：`detail` | `inference` | `mainIdea` | `wordMeaning` | `authorPurpose` | `attitude` | `title` | `structure`
- `secondary` 可选，仅允许 `inference`。
- `secondary=inference` 仅在 `primary` 为 `detail` 或 `attitude` 时合法。

### optionAnalysis 规则

- 必须包含 A-D 每个选项。
- 每项含 `optionTranslationZh`（准确自然，不含分析）。
- 恰好一个选项 `status: "correct"`，必须匹配 answerKey。
- 所有错误选项必须包含 trap diagnosis。

### 干扰项类型（Controlled Trap Types）

| primaryType | 中文标签 | 交互性 |
|-------------|----------|--------|
| `sourceLexicalTrap` | 原文词钩干扰 | 可选中，支持 trap line |
| `polarityReversal` | 黑白颠倒 | 可选中，支持 trap line |
| `scopeShift` | 范围偷换 | 可选中，支持 trap line |
| `entityMismatch` | 对象错配 | 可选中，支持 trap line |
| `unsupportedClaim` | 无中生有 | **不可选中，无 evidence/trap line，无原文高亮** |

### locationParaphrases 定位关系/同义替换

UI 标题：定位关系 / 同义替换

- 存储于 `analysis.questions[questionId].locationParaphrases`。
- 描述正确解题路径，不描述错误选项干扰。
- 每题 1-2 项。
- `sourceRole`: `stem` | `correctOption`
- `relationType`: `locationCue` | `paraphrase` | `wordFamily` | `calculation`
- `note` 使用中文解释，保留关键英文表达。

---

## 版本控制

- 本文档与 `schemaVersion: "paper-asset-v1"` 绑定。
- 结构性变更需升级 schemaVersion。
