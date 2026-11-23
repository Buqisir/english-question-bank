// The teacher analysis print has a fixed vocabulary: each function on the page
// is one component, and each component owns its classes and the style rules
// written for them in styles.mjs. Nothing else may put a class on the page or
// style one; scripts/verify-companion-analysis-export.mjs checks both
// directions. The table in docs/product/companion-analysis-components.md is
// this list in prose, with what each component looks like and why.
//
// To add a look, add or extend a component here first; a one-off class in a
// question-type module fails the check.
export const analysisComponents = [
  { name: 'Masthead', role: '卷头：出版标记、卷名、一段短绿线',
    classes: ['frontmatter', 'house-mark', 'title-rule'] },
  { name: 'AnswerKey', role: '答案速查：答题卡式的表，五题一格，题号在淡绿底带上，答案在下',
    classes: ['answer-overview', 'answer-overview-section', 'answer-grid', 'answer-grid--text', 'answer-run', 'answer-cell'] },
  { name: 'BodyGrid', role: '正文双栏，栏间一条竖线',
    classes: ['analysis-body'] },
  { name: 'PartHead', role: '部分标题和小节标题：只靠字重、颜色和留白，不画线',
    classes: ['paper-part', 'part-title', 'paper-section', 'section-title'] },
  { name: 'GroupHead', role: '题组标题（进页眉）和本组答案行',
    classes: ['analysis-group', 'analysis-group--reading', 'analysis-group--seven', 'analysis-group--cloze',
      'analysis-group--grammar', 'analysis-group--writing', 'analysis-group--listening',
      'group-heading', 'group-title', 'group-key', 'group-key-answers', 'group-key-answers--letters'] },
  { name: 'Label', role: '接排标签：正文字号的松烟绿粗体，写在块的第一行行首',
    classes: ['micro-heading', 'inline-label', 'heading-lead'] },
  { name: 'PassageBlock', role: '篇章级的块：篇章大意、篇章结构、完形主线和串空、全文译文、原文',
    classes: ['overview', 'reading-discourse', 'cloze-main-line', 'cloze-thread', 'full-translation', 'source-relationships'] },
  { name: 'Mark', role: '原文和译文里的标注：线索淡绿底加题号上标（不加括号），填入的答案粗体加前置题号 [41]',
    classes: ['source-relationship', 'translation-annotation', 'source-underline', 'answer-fill',
      'blank-no', 'clue-tail', 'clue-no'] },
  { name: 'QuestionHead', role: '题头：绿底反白题号块、答案，接排讲解第一行；阅读接英文题干（定位词粗体），下一行淡墨中文译文',
    classes: ['question', 'question--reading', 'question--seven', 'question--cloze', 'question--grammar',
      'question--listening', 'question-lead', 'question-heading', 'question-number', 'question-answer',
      'answer-text', 'question-stem', 'question-stem--en', 'question-stem-zh'] },
  { name: 'Prose', role: '讲解正文',
    classes: ['analysis-prose'] },
  { name: 'EvidenceQuote', role: '原文依据：定位（题干词 → 第几段）、引号引原句并淡绿底、同义替换（对应选项）；分析写了定位时，引文按原文顺序合并定位句和答案句，定位词加粗，答案不在定位句里时下接一行原因，阅读开头一行图例',
    classes: ['evidence-quote', 'evidence-locate', 'evidence-paraphrase', 'evidence-bridge', 'locate-cue', 'locate-legend', 'locate-note', 'locate-where', 'locate-find'] },
  { name: 'Distractors', role: '干扰项：不设标签，一项一行，写「X 项（选项译文）错在：」，完形写「意为：」；选项字母粗体',
    classes: ['distractor', 'distractor--reading', 'distractor--cloze', 'reading-distractor-item', 'cloze-distractor-item'] },
  { name: 'ContextChain', role: '七选五：空前、答案、空后三行；空在段首印上段末尾、段尾印下段开头（找法用到才印），全文开头结尾那一行不印；锁定词粗体',
    classes: ['context-chain', 'context-chain-answer'] },
  { name: 'ExtraOption', role: '七选五多余选项：放在它最像的那一空，标「多余项」；哪一空都接不实的放题组末尾',
    classes: ['extra-option', 'extra-tag', 'extra-options'] },
  { name: 'LongSentence', role: '长难句：成分用方括号括出，句子解析、参考译文接排',
    classes: ['long-sentences', 'long-sentence', 'long-sentence-source', 'long-sentence-related'] },
  { name: 'ListeningMaterial', role: '听力材料：段落标题、话题、原文、译文、选项',
    classes: ['listening-material', 'listening-topic', 'listening-transcript', 'listening-source',
      'listening-translation', 'listening-options'] },
  { name: 'FactList', role: '写作的审题卡、原文理解、续写约束：左标签右内容，行间留白不画线',
    classes: ['writing-block', 'review-card', 'review-group', 'review-facts', 'reader-facts', 'review-points',
      'story-map', 'route-paragraph', 'continuation-section', 'continuation-grounded', 'continuation-evidence',
      'legacy-analysis-preserved'] },
  { name: 'ModelEssay', role: '参考范文：英文左对齐，段间小空',
    classes: ['model-answer', 'model-essay', 'model-paragraph', 'model-signoff'] },
]

export const analysisComponentByClass = new Map(analysisComponents.flatMap(component =>
  component.classes.map(className => [className, component.name])))
