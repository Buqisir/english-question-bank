# Paper Intelligence V0

> 状态：V0 设计稿（仅文档与提示词，不写功能代码、不调模型、不接 UI、不入 SQLite）。
>
> 范围：高考英语阅读理解第一节 A-D。
>
> 输出位置：`reports/paper-intelligence/`。

## 1. Product Goal

**第一用户：老师。**

老师的第一眼看到的是**篇章级负荷条**，而不是后台复核提醒。负荷条服务于教研判断：这张卷大致偏易/适中/偏难，五条负荷分别压在哪条线上，是否值得拿来训练或讲评。

复核提醒（boundaryFlags、reviewNeeded、低置信度）是给后台/教研工作人员的内部信号，不进入老师视图，不混进"权威难度"。

V0 成功标准：

- 老师拿到 reports/paper-intelligence/ 下生成的 JSON + Markdown，**觉得有用**。
- 第一验收点是**小题层**：每题的 `answerEvidence`（原文短引文 + 中文解释）和 `distractorAnalysis` 是否准确。
- 篇章级负荷条作为第二验收点：五条负荷打分是否能服众。
- AI 初判（aiInitialBand）只是引导，不是裁决，必须能被老师一眼推翻。

V0 不追求：

- 不追求"权威最终难度"。
- 不追求 empirical difficulty（基于学生作答统计的真实难度）预测。
- 不追求自动组卷、相似题推荐、学生画像。

## 2. Scope

V0 做：

- 阅读理解第一节 A-D 共 4 篇，约 15 道小题。
- 一张已有 golden 覆盖、题型分布均衡的卷（候选：2025 新课标 I 卷或 2021 新课标 I 卷，由后续脚本调用方决定）。
- 输出两份产物：JSON（机器可读主资产）+ Markdown（人工阅读预览）。
- 输出目录：`reports/paper-intelligence/<paperId>/`。
- 触发方式：管理员/后台教研手动触发，单卷一次性跑通。

V0 不做：

- 不调用模型（这一刀只产文档与提示词）。
- 不接 UI（不修改 `app/` 下任何代码）。
- 不入 SQLite（不写 `data/question-bank.sqlite`）。
- 不做学生画像、不做自动组卷推荐。
- 不做基于作答统计的 empirical difficulty 预测。
- 不输出"权威最终难度"标签。
- 不替代教师判断；AI 输出全部需要人工复核。

## 3. Teacher-facing passage loads

每篇 A/B/C/D 给五条**篇章级负荷**（passage-level load），每条 1–5 档：

| key | 中文名 | 含义 |
| --- | --- | --- |
| `vocabularyChunkLoad` | 词汇与词块负荷 | 生词密度、学术词、习语/搭配、跨学科术语；陌生词块出现频率与可猜程度。 |
| `grammarLoad` | 语法负荷 | 长句、嵌套从句、非谓语、倒装/省略、虚拟与情态、复杂指代等结构成本。 |
| `discourseStructureLoad` | 语篇结构负荷 | 段落与主旨的明暗关系、衔接与连贯、对比/让步/递进等论证骨架的可识别度。 |
| `topicBackgroundLoad` | 主题背景负荷 | 话题陌生度、文化/学科常识依赖、跨文化背景所需的额外知识。 |
| `evidenceFindingLoad` | 证据寻找负荷 | 答案证据在原文中"好不好找"——单句 / 跨句 / 跨段 / 全文，定位线索是否明显，是否依赖指代或隐性逻辑。 |

> ⚠️ `evidenceFindingLoad` 只描述"答案证据在原文中是否好定位"，**不要**和单题的 `answerEvidence` 字段混在一起。一个负荷打的是整篇 passage 的整体寻证成本，一个 evidence 字段是单题的原文引文。

### 五档定义（每条负荷通用）

| score | label | 含义 |
| ---: | --- | --- |
| 1 | 轻 | 基本不构成障碍。 |
| 2 | 较轻 | 有少量处理成本。 |
| 3 | 适中 | 有挑战，但正常学生可控。 |
| 4 | 偏重 | 会明显影响一部分学生。 |
| 5 | 过重 | 可能成为主要卡点，需要老师判断这篇是否适合所教班级。 |

### AI 初判（aiInitialBand）

`aiInitialBand` 只允许三个枚举值：`偏易` / `适中` / `偏难`。

**它必须由五条负荷聚合，不允许独立乱判。**

建议默认聚合规则：

- 任一核心负荷为 **5**，或**两条及以上**负荷 ≥ **4** → `偏难`。
- 五条负荷**全部** ≤ **2** → `偏易`。
- 其他 → `适中`。

如果模型出于具体证据要做例外判断（例如一条负荷=5但篇章其他维度都极低），必须在 `aiInitialBand.overrideExplanation` 里写明依据。无 explanation 的 override 视为非法输出，应在脚本侧拒收。

## 4. Question analysis requirements

每篇 passage 下每题都必须包含以下字段。**老师端**与**后台端**字段共存，由前端/导出按权限决定可见范围。

### 4.1 老师端字段（teacher-facing）

- `questionNo`：题号，例如 `21`、`A1`、按试卷原编号。
- `paperSection`：`A` / `B` / `C` / `D`。
- `questionIndexInPassage`：本篇内序号（1-based）。
- `stem`：题干原文。
- `stemTranslation`：题干中文翻译。
- `answer`：正确答案字母。
- `teacherQuestionType`：**老师端四大题型之一**：
  - `细节理解题`
  - `主旨大意题`
  - `推理题`
  - `猜词题`
- `keywords`：题干与定位关键词（数组）。
- `locatingSentence`：定位句（原文短句，定位用，不一定是答案句）。
- `answerSentence`：答案句（原文短句，证据载体）。
- `answerEvidence`：正确答案的证据，**必填**：
  - `quote`：原文短引文（≤ 30 词，避免大段抄回）。
  - `explanationZh`：一句中文解释为什么这是正确答案。
- `distractorAnalysis`：干扰项数组，每个错误选项都要分析，可简短：
  - `optionLabel`：A/B/C/D。
  - `category`：见第 5 节干扰项分类。
  - `subtype`：可选，仅 `detail_word_misleading` 有子类，不确定时 `null`。
  - `shortReason`：一句中文，说明为什么错。
  - `quote`：原文短引文（按引用规则决定是否必填，见第 5 节）。
- `synonymSummary`：**必填**，**只总结正确答案**的同义替换路径，例如 `require → have to follow`。不分析错误选项的同义替换。

### 4.2 篇章级字段（passage-level）

挂在每篇 passage 上，不挂在小题上：

- `passageOutline`：
  - `mainIdea`：一句话主旨。
  - `logicalLayers`：3-5 个逻辑层次（数组，每个为一句中文，描述这一层做了什么）。
- `keyChunks`：篇章级**重要词块** 8-12 个：
  - `surface`：原文形态。
  - `kind`：`word` / `phrase` / `chunk`。
  - 当 `kind === "word"` 时必给 `ipa`（音标）和 `pos`（词性）。
  - 当 `kind === "phrase"` 或 `"chunk"` 时**不给音标**，只给 `meaning` 和 `usageNote`（一句用法说明）。
  - `meaning`：中文释义/整体意思。
  - **例外**：若 A 篇（短应用文）确实不足 8 个有教学价值词块，可输出 6–7 个，但必须在同级附加 `keyChunksNote: string` 说明"词块不足 8 个，不凑数"。不要为了满足数量硬编低价值词块。

### 4.3 后台字段（backend-only）

后台字段仅供 reviewer / 教研复核使用，老师端默认不显示：

> ⚠️ 当输入中**未提供** `existingLabels` 时，以下后台字段均为**模型初判**（model-inferred），不是已确认标签。Model-inferred backend labels should be treated as reviewable。对于边界类（boundaryFlags 非空）、T9/T10、以及低置信度（confidence < 0.8）的情况，`reviewNeeded` 应为 `true`。

- `surfaceType`：与 `scripts/review/rules/reading-parse.md` 保持一致的枚举（`single_detail_normal` / `multi_detail_learn_from` / `word_meaning` / `inference_general` / `example_function` / `paragraph_function` / `writing_technique` / `paragraph_main_idea` / `passage_main_idea` / `author_purpose` / `attitude_tone` / `adjective_summary` / `abstract_phrase_summary` / `why_did` 等）。
- `answeringMove`：`direct_locating` / `option_backtracking` / `context_guessing` / `coverage_test` / `function_to_argument` / `minimal_inference` / `rhetorical_method_identification` / `description_to_adjective` 等，遵循 reading-parse.md 已有规约。
- `tCard`：T1–T10，**仅作为任务 / 同义转换 / 抽象跨度分类**，不是真实难度公式。
- `boundaryFlags`：合法枚举集 `T1_T2 / T2_T6 / T3_T6 / T4_T6 / T5_T10 / T7_T8 / T6_T9 / T2_T4 / T6_T10`。
- `reviewNeeded`：布尔。
- `confidence`：0–1 浮点（可选）。
- `qualityRisk`：质量风险标签数组（可选，见第 6.4 节），与难度负荷分开。

## 5. Distractor taxonomy

V0 保留三大类干扰项（与现有教研口径一致）：

| category | 中文 | 默认引用规则 |
| --- | --- | --- |
| `detail_word_misleading` | 细节词误导 | **必须引用原文短句** |
| `not_mentioned` | 无中生有 | 不强制引用 |
| `common_sense_distractor` | 常识干扰 | 不强制引用 |

`detail_word_misleading` 的 `subtype` 可选，不确定时 `subtype = null`。允许的子类：

- `scope_shift`：偷换范围
- `object_mismatch`：偷换对象
- `cause_effect_shift`：偷换因果 / 目的 / 条件
- `opposite_direction`：正话反说
- `half_right_half_wrong`：半对半错
- `misplaced_evidence`：证据错位

引用规则补充：

- `detail_word_misleading` **必须**引用原文短句（包括所有子类，尤其是 `opposite_direction` 正话反说）。
- `opposite_direction` **只能**作为 `detail_word_misleading` 的 subtype 出现。正话反说本质是与原文方向相反，属于细节词误导的一种；不存在"落在 not_mentioned 下的 opposite_direction"。
- `not_mentioned` 与 `common_sense_distractor` 不强制引用。
- 如果某个错误选项被判为**强干扰项**（容易整批学生选错），即使分类是 not_mentioned/common_sense，也**建议**补一条原文引文以便讲评。

## 6. JSON schema draft

> 这一份不是严格 JSON Schema，但字段名、类型、必填/可选要明确到能让后续脚本直接实现。

### 6.1 Top-level

```text
PaperIntelligenceReport {
  schemaVersion: string                         // 必填，例如 "0.1.0"
  generatedAt: string (ISO-8601)                // 必填
  generator: {
    promptVersion: string                       // 必填，例如 "paper-intelligence-v0"
    modelId: string | null                      // 必填，由调用层注入；本文件不绑定具体 model
    runId: string                               // 必填
  }
  sourcePaper: SourcePaperMeta                  // 必填
  passages: PassageReport[]                     // 必填，A-D 共 4 篇
  paperLevelNotes?: string                      // 可选，整卷级备注
}
```

### 6.2 SourcePaperMeta

```text
SourcePaperMeta {
  paperId: string                               // 必填，内部 id（与 import-bundle 关联）
  paperName: string                             // 必填，例如 "2025年新课标I卷"
  year: number                                  // 必填
  region: string                                // 必填，例如 "新课标I"
  section: "阅读理解第一节"                       // 必填，固定值
  sourceFile?: string                           // 可选，DOCX 文件名
}
```

### 6.3 PassageReport

```text
PassageReport {
  paperSection: "A" | "B" | "C" | "D"           // 必填
  passageTitle?: string                          // 可选
  passageBodyRef?: string                        // 可选，引用原文存储 id；不在此重复整段原文
  loads: PassageLoads                            // 必填
  aiInitialBand: AiInitialBand                   // 必填
  passageOutline: PassageOutline                 // 必填
  keyChunks: KeyChunk[]                          // 必填，长度 8-12（A 篇短应用文允许 6-7，须附 keyChunksNote）
  keyChunksNote?: string                         // 条件必填：keyChunks.length < 8 时必填，说明不凑数原因
  questions: QuestionAnalysis[]                  // 必填
}
```

### 6.4 PassageLoads

```text
PassageLoads {
  vocabularyChunkLoad: LoadBar                   // 必填
  grammarLoad: LoadBar                           // 必填
  discourseStructureLoad: LoadBar                // 必填
  topicBackgroundLoad: LoadBar                   // 必填
  evidenceFindingLoad: LoadBar                   // 必填
  qualityRisk?: QualityRiskItem[]                // 可选；与难度负荷分开
}

LoadBar {
  score: 1 | 2 | 3 | 4 | 5                       // 必填
  label: "轻" | "较轻" | "适中" | "偏重" | "过重"    // 必填，与 score 一一对应
  shortReason: string                            // 必填，一句中文
  evidenceItems: LoadEvidence[]                  // 必填，可为空数组但不省略字段
                                                 // 硬约束：score >= 4 时 evidenceItems.length >= 1
                                                 // （偏重/过重负荷必须有原文证据支撑）
}

LoadEvidence {
  quote: string                                  // 必填，原文短引文 (≤ 30 词)
  note?: string                                  // 可选，一句中文
  paragraph?: number                             // 可选
}

QualityRiskItem {
  type: "ambiguous_answer" | "no_clear_evidence" | "translation_dependent"
      | "controversial_distractor" | "other"    // 必填
  shortReason: string                            // 必填
}
```

> 质量风险（`qualityRisk`）**不能**进入难度负荷的打分公式，也不能影响 `aiInitialBand`。它是教研复核信号，与负荷条并列展示而非合并。

### 6.5 AiInitialBand

```text
AiInitialBand {
  band: "偏易" | "适中" | "偏难"                   // 必填
  basis: "aggregation"                            // 必填，固定值，标识这是聚合产物
  overrideExplanation?: string                    // 条件必填：当 band 与默认聚合规则不一致时必填；一致时可省略
}
```

### 6.6 PassageOutline & KeyChunk

```text
PassageOutline {
  mainIdea: string                               // 必填，一句中文
  logicalLayers: string[]                        // 必填，长度 3-5
}

KeyChunk {
  surface: string                                // 必填
  kind: "word" | "phrase" | "chunk"              // 必填
  ipa?: string                                   // word 必填；phrase/chunk 必须省略
  pos?: string                                   // word 必填；phrase/chunk 必须省略
  meaning: string                                // 必填
  usageNote?: string                             // phrase/chunk 必填；word 可选
}
```

### 6.7 QuestionAnalysis

```text
QuestionAnalysis {
  questionNo: string                             // 必填
  paperSection: "A" | "B" | "C" | "D"            // 必填
  questionIndexInPassage: number                 // 必填，1-based
  stem: string                                   // 必填
  stemTranslation: string                        // 必填
  answer: "A" | "B" | "C" | "D"                  // 必填
  teacherQuestionType:
    "细节理解题" | "主旨大意题" | "推理题" | "猜词题" // 必填
  keywords: string[]                             // 必填
  locatingSentence: string                       // 必填
  answerSentence: string                         // 必填
  answerEvidence: {
    quote: string                                // 必填，原文短引文
    explanationZh: string                        // 必填
  }
  distractorAnalysis: DistractorItem[]           // 必填，覆盖所有错误选项
  synonymSummary: string                         // 必填，仅总结正确答案的同义替换

  // 后台字段（teacher 视图默认隐藏）
  surfaceType: string                            // 必填
  answeringMove: string                          // 必填
  tCard: "T1"|"T2"|"T3"|"T4"|"T5"|"T6"|"T7"|"T8"|"T9"|"T10"  // 必填
  boundaryFlags: string[]                        // 必填，可为空数组
  reviewNeeded: boolean                          // 必填
  confidence?: number                            // 可选 0–1
}

DistractorItem {
  optionLabel: "A" | "B" | "C" | "D"             // 必填
  category: "detail_word_misleading"
          | "not_mentioned"
          | "common_sense_distractor"            // 必填
  subtype: "scope_shift" | "object_mismatch"
         | "cause_effect_shift" | "opposite_direction"
         | "half_right_half_wrong" | "misplaced_evidence"
         | null                                  // 仅 detail_word_misleading 可非 null
  shortReason: string                            // 必填
  quote?: string                                 // detail_word_misleading 必填（含所有 subtype，尤其 opposite_direction）；其余可选
}
```

## 7. Output layout

V0 的产物只落到文件系统，不入库：

```text
reports/paper-intelligence/
  └── <paperId>/
        ├── report.json                          # 主资产，遵循上面 schema
        ├── preview.md                           # 人工阅读预览（Markdown）
        └── run-meta.json                        # 触发记录、提示词版本、模型 id
```

`preview.md` 的章节顺序固定（与 `prompts/paper-intelligence-v0.md` 第 7 节一致）：

1. 答案与解析
2. 同义替换总结
3. 文章脉络分析
4. 词汇和地道语块积累

> Markdown 是给人看的预览，不是 UI 契约；前端如要消费请走 JSON。

## 8. Boundaries & non-goals

- **T 卡不是难度公式**。T1–T10 描述的是阅读任务、同义转换、抽象跨度的 taxonomy，不可直接映射为难度分。请见 `reports/difficulty-calibration-v1.md`。
- **难度多维负荷与质量诊断分开**。`PassageLoads` 五条是难度负荷；`qualityRisk` 是质量诊断信号，二者并列、不互相调权。
- **AI 不是裁决者**。所有 AI 输出（包括 `aiInitialBand`、`teacherQuestionType`、负荷打分）老师都可以直接覆盖。后续若入库，遵循 `AGENTS.md` 的 "AI 建议需要人工确认" 原则。
- **不输出权威最终难度**。V0 不发布 `finalDifficulty` / `empiricalDifficulty` 这类字段；如果未来要做，必须基于真实学生作答数据，与 V0 文档分离。

## 9. References

- `knowledge/synonym-difficulty/synonym_difficulty_cards.v1.json` — T1–T10 卡定义，含 SOLO 层级与边界例。
- `scripts/review/rules/reading-parse.md` — surfaceType / answeringMove / boundaryFlags / 后台 normalization 规则。
- `knowledge/reading-parse/golden-reading-parse-cases.jsonl` — 教师确认的标注金样。
- `knowledge/reading-parse/golden-high-order-reading-cases.jsonl` — 高阶题型金样。
- `reports/difficulty-calibration-v1.md` — 真实老师难度 vs AI 难度分歧记录，强调 T 卡不直接当难度。
- `prompts/paper-intelligence-v0.md` — 与本文件一一对应的提示词模板。
