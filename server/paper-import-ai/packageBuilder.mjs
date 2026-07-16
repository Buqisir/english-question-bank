import path from 'node:path'

const READING_LABELS = ['A', 'B', 'C', 'D']

// 试卷格式 profile：完形(cloze)题数为主键 —— 15=新课标；20=老卷(浙江/全国),再按阅读篇数分流。
// newStandard / zjLegacy 分支的 heading + 分值必须逐字复现历史字面量(byte 兼容；勿改标点/全半角括号/空格)。
const FORMAT_PROFILES = {
  newStandard: {
    readingLabels: READING_LABELS,
    readingScore: 2.5,
    sevenScore: 2.5,
    clozeScore: 1,
    requireContinuationStarters: true,
    requireWritingFamilies: true,
    headings: {
      readingPart: '第二部分 阅读',
      readingSection1: '第一节 阅读理解',
      seven: '第二节 (共5小题；每小题2.5分，满分12.5分)',
      langPart: '第三部分 语言运用(共两节，满分30分)',
      cloze: '第一节(共15小题；每小题1分，满分15分)',
    },
  },
  zjLegacy: {
    readingLabels: READING_LABELS.slice(0, 3),
    readingScore: 2.5,
    sevenScore: 2,
    clozeScore: 1.5,
    // 浙江早期"情节续写"(如 2020年7月卷)无段落开头语,合法格式 —— 开头语可选。
    requireContinuationStarters: false,
    requireWritingFamilies: true,
    headings: {
      readingPart: '第二部分 阅读理解（共两节，满分35分）',
      readingSection1: '第一节（共10小题；每小题2.5分，满分25分）',
      seven: '第二节（共5小题；每小题2分，满分10分）',
      langPart: '第三部分 语言运用（共两节，满分45分）',
      cloze: '第一节（共20小题；每小题1.5分，满分30分）',
    },
  },
  // 全国甲/乙/丙(老全国卷,2020–2024)：阅读 A-D 15题/七选五/完形20/语法,写作是短文改错+普通作文(不导)。
  // 与浙江老卷同为 cloze=20,但阅读 4 篇(浙江老卷 3 篇)且分值不同(阅读/七选五各 2 分)。
  nationalLegacy: {
    readingLabels: READING_LABELS,
    readingScore: 2,
    sevenScore: 2,
    clozeScore: 1.5,
    requireContinuationStarters: false,
    requireWritingFamilies: false,
    headings: {
      readingPart: '第二部分 阅读理解（共两节，满分40分）',
      readingSection1: '第一节（共15小题；每小题2分，满分30分）',
      seven: '第二节（共5小题；每小题2分，满分10分）',
      langPart: '第三部分 语言知识运用（共两节，满分45分）',
      cloze: '第一节（共20小题；每小题1.5分，满分30分）',
    },
  },
}

// 计 distinct reading 字母(A-D)数；与 validator 同一结构定义(MF-3:两侧同口径,否则一放一拦)。
function countReadingLetters(readingGroups) {
  const letters = new Set()
  for (const g of readingGroups || []) {
    const l = groupLetter(g)
    if (l) letters.add(l)
  }
  return letters.size
}

// 格式解析(MF-1 全真值表)：cloze 题数为主键,cloze=20 时再按阅读篇数分流,未知格一律 throw 不静默回退。
//   cloze=15/缺      → 新课标(永不查阅读篇数;半解析新课标若 cloze 被误数成 20 由下方 throw / 写作组反断言兜底)
//   cloze=20 ∧ 4篇   → 全国老卷  | cloze=20 ∧ 3篇 → 浙江老卷  | cloze=20 ∧ 其它篇数 → throw
//   cloze ∉ {15,20}  → throw
// 禁用 region/paperId 作键(provenance 在 builder 之后注入)；阅读篇数是结构信号。
// MF-2:严禁用 continuation/application 是否存在作分流键——它对全国(合法无写作)与续写解析失败的新课标都为 null,分不开。
export function resolveFormatProfile(clozeGroup, readingGroups) {
  const n = Array.isArray(clozeGroup?.questions) ? clozeGroup.questions.length : null
  if (n === null || n === 15) return FORMAT_PROFILES.newStandard
  if (n === 20) {
    const passages = countReadingLetters(readingGroups)
    if (passages === 4) return FORMAT_PROFILES.nationalLegacy
    if (passages === 3) return FORMAT_PROFILES.zjLegacy
    throw issue('unknown_paper_format', `完形20题但阅读篇数=${passages}(仅支持全国老卷4篇/浙江老卷3篇)，不能发布。`, { clozeQuestionCount: n, readingPassages: passages })
  }
  throw issue('unknown_paper_format', `完形题数 ${n} 无法识别试卷格式(仅支持新课标 15 或老卷 20)，不能发布。`, { clozeQuestionCount: n })
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function titleFromFilename(fileName) {
  const base = path.basename(String(fileName || 'AI 导入试卷'), path.extname(String(fileName || '')))
  return compact(base) || 'AI 导入试卷'
}

function yearFromTitle(title) {
  const match = String(title || '').match(/20\d{2}/)
  return match ? Number(match[0]) : new Date().getFullYear()
}

function regionFromTitle(title) {
  const text = String(title || '')
  // Strip leading date prefix like "26.3" or "2026."
  const stripped = text.replace(/^\d{2}\.\d+\s*/, '').replace(/^\d{4}[.\s]\s*/, '')
  // Match Chinese characters before exam keywords
  const match = stripped.match(/^([一-鿿]{2,8}?)(?:高三|高考|中考|初\d|高\d|一模|二模|三模|联考|卷|试题|英语|数学|语文)/)
  if (match) return match[1]
  // Fallback: first 2-6 Chinese chars
  const fallback = stripped.match(/^([一-鿿]{2,6})/)
  return fallback ? fallback[1] : ''
}

function examCodeFromPaperId(paperId) {
  return String(paperId || 'paper-ai-import')
    .replace(/^paper-/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'ai-import'
}

function groupLetter(group) {
  const match = String(group?.groupId || '').match(/reading-([abcd])$/i)
  if (match) return match[1].toUpperCase()
  const titleMatch = String(group?.title || '').match(/Reading\s*([A-D])/i)
  if (titleMatch) return titleMatch[1].toUpperCase()
  return ''
}

function questionNoFromId(question, fallback) {
  const match = String(question?.id || '').match(/(\d{1,3})$/)
  const parsed = match ? Number(match[1]) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function correctLabel(questionAnalysis) {
  const correct = (questionAnalysis?.optionAnalysis || []).find((option) => option?.status === 'correct')
  return compact(correct?.label)
}

function issue(status, message, extra = {}) {
  return { status, message, ...extra }
}

function normalizeAnalysisForOfficialAnswers(analysis, parseResult) {
  const merged = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [],
    meta: {
      ...(analysis.meta || {}),
      generatedBy: 'external-ai',
      promptVersion: 'reading-choice-analysis-v1',
      reviewStatus: 'reviewed',
      importMode: 'paper-import-ai',
    },
    groups: {},
    questions: {},
  }

  for (const group of parseResult.readingGroups || []) {
    if (!analysis.targetGroups?.includes(group.groupId)) {
      throw issue('analysis_group_missing', `${group.title} 缺少 AI 解析。`, { groupId: group.groupId })
    }
    merged.targetGroups.push(group.groupId)
    merged.groups[group.groupId] = cloneJson(analysis.groups?.[group.groupId] || {})

    for (const question of group.questions || []) {
      const answer = compact(question.answerKey)
      if (!answer) {
        throw issue('answer_key_required', `${question.id} 缺少答案解析版答案，不能发布。`, {
          questionId: question.id,
        })
      }
      const questionAnalysis = cloneJson(analysis.questions?.[question.id] || null)
      if (!questionAnalysis) {
        throw issue('analysis_question_missing', `${question.id} 缺少 AI 解析。`, {
          questionId: question.id,
        })
      }
      const aiAnswer = correctLabel(questionAnalysis)
      if (aiAnswer && aiAnswer !== answer) {
        throw issue('answer_conflict', `${question.id} 答案冲突：答案版 ${answer} / AI ${aiAnswer}。`, {
          questionId: question.id,
          officialAnswer: answer,
          aiAnswer,
        })
      }
      for (const option of questionAnalysis.optionAnalysis || []) {
        option.status = option.label === answer ? 'correct' : 'wrong'
      }
      merged.questions[question.id] = questionAnalysis
    }
  }

  merged.targetGroups.sort()
  return merged
}

export function mergePaperImportAiAnalyses(parseResult, analysesByGroupId) {
  const merged = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [],
    meta: {
      generatedBy: 'external-ai',
      promptVersion: 'reading-choice-analysis-v1',
      reviewStatus: 'reviewed',
      importMode: 'paper-import-ai',
    },
    groups: {},
    questions: {},
  }

  for (const group of parseResult.readingGroups || []) {
    const analysis = analysesByGroupId?.[group.groupId]
    if (!analysis) continue
    if (analysis.paperId !== parseResult.paper.paperId) {
      throw issue('analysis_paper_mismatch', `${group.title} 解析 paperId 与拆题结果不一致。`, {
        groupId: group.groupId,
      })
    }
    if (!analysis.targetGroups?.includes(group.groupId)) {
      throw issue('analysis_group_missing', `${group.title} 解析没有包含当前题组。`, {
        groupId: group.groupId,
      })
    }
    merged.targetGroups.push(group.groupId)
    merged.groups[group.groupId] = cloneJson(analysis.groups?.[group.groupId] || {})
    for (const question of group.questions || []) {
      if (analysis.questions?.[question.id]) {
        merged.questions[question.id] = cloneJson(analysis.questions[question.id])
      }
    }
    merged.meta = { ...merged.meta, ...(analysis.meta || {}) }
  }

  return normalizeAnalysisForOfficialAnswers(merged, parseResult)
}

function normalizeGrammarFillText(text) {
  // Normalize blank numbers: two spaces before and after the number.
  return String(text || '')
    // Standardize "56." or "(56)" to bare number.
    .replace(/\b(\d{2})[.．、](?=\s)/g, '$1')
    // Add two spaces around blank numbers 56-65.
    .replace(/(^|\s)(5[6-9]|6[0-5])(\s|$)/g, '$1  $2  $3')
    // Collapse multiple spaces.
    .replace(/[ ]{3,}/g, '  ')
    // Ensure space after English punctuation.
    .replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')
    // Normalize prompt parentheses spacing: "56(wear)" → "56 (wear)".
    .replace(/(\d{2})[(（]/g, '$1 (')
    .replace(/[)）](?=\S)/g, ') ')
    // Clean trailing Chinese from answers.
    .replace(/[一-鿿]+$/, '')
    .trim()
}

export function buildPaperImportAiPackageFiles({ parseResult, analysesByGroupId, sevenChoicesGroup, sevenChoicesAnalysis, clozeGroup, clozeAnalysis, grammarFillGroup, grammarFillAnalysis, applicationGroup, continuationGroup, sourceDocx }) {
  if (!parseResult?.paper?.paperId) {
    throw issue('parse_result_missing', '缺少拆题结果，不能发布。')
  }
  const profile = resolveFormatProfile(clozeGroup, parseResult.readingGroups)
  const groups = [...(parseResult.readingGroups || [])].sort((a, b) => a.order - b.order)
  const letters = new Set(groups.map(groupLetter))
  for (const label of profile.readingLabels) {
    if (!letters.has(label)) {
      throw issue('reading_group_missing', `缺少 Reading ${label}，不能发布。`, { groupLabel: label })
    }
  }

  // Enforce four-family completeness for standard objective paper publish.
  if (!sevenChoicesGroup) {
    throw issue('seven_choices_group_missing', '缺少七选五，不能发布。')
  }
  if (!clozeGroup) {
    throw issue('cloze_group_missing', '缺少完形填空，不能发布。')
  }
  if (!grammarFillGroup) {
    throw issue('grammar_fill_group_missing', '缺少语法填空，不能发布。')
  }

  // Enforce six-family completeness for writing-importing formats (新课标/浙江)。
  // ADR-0007 决策2"永远导一整张完整卷"对 nationalLegacy 作 scoped supersession:
  // 全国老卷写作是短文改错+普通作文(PO 决策不导),故不要求 application/continuation;
  // 四题型硬门(reading A-D/七选五/完形/语法,见上)不变,仍是 parse-correctness guard。
  if (profile.requireWritingFamilies) {
    if (!applicationGroup) {
      throw issue('application_writing_missing', '缺少应用文写作，不能发布。')
    }
    if (!continuationGroup) {
      throw issue('continuation_writing_missing', '缺少读后续写，不能发布。')
    }
    // 新课标续写须给 2 段开头语;浙江早期"情节续写"(2020年7月卷)无开头语,合法,放行(profile 控制)。
    if (profile.requireContinuationStarters && (!continuationGroup.continuationStarters || continuationGroup.continuationStarters.length < 2)) {
      throw issue('continuation_starters_missing', '读后续写缺少段落开头语，不能发布。')
    }
  } else if (applicationGroup || continuationGroup) {
    // MF-1 反向断言:落到不导写作的格式却带着写作组 → 很可能是完形被误判成20的半解析新课标,不能静默放行。
    throw issue('unexpected_writing_groups', '该试卷格式不导写作，却检出写作题组(疑似完形题数误判)，不能发布。')
  }

  const paperId = parseResult.paper.paperId
  const title = titleFromFilename(parseResult.paper.sourceFilename)
  const questions = {}
  const answerEntries = {}
  const contentGroups = {}
  const blocks = [
    { type: 'partHeading', partId: `part-${examCodeFromPaperId(paperId)}-reading`, text: profile.headings.readingPart },
    { type: 'sectionHeading', sectionId: `section-${examCodeFromPaperId(paperId)}-reading-choice`, text: profile.headings.readingSection1 },
  ]

  for (const group of groups) {
    const questionIds = []
    for (let index = 0; index < group.questions.length; index += 1) {
      const question = group.questions[index]
      const questionNo = questionNoFromId(question, index + 1)
      questionIds.push(question.id)
      questions[question.id] = {
        questionId: question.id,
        questionNo,
        groupId: group.groupId,
        stem: question.stem,
        options: ['A', 'B', 'C', 'D'].map((label) => ({
          label,
          text: question.options?.[label] || '',
        })),
      }
      answerEntries[question.id] = {
        questionId: question.id,
        questionNo,
        answer: question.answerKey,
        score: profile.readingScore,
        note: 'AI 导题：答案解析版抽取',
      }
    }
    contentGroups[group.groupId] = {
      groupId: group.groupId,
      groupType: 'reading',
      title: group.title,
      questionIds,
      passage: {
        paragraphs: group.paragraphs.map((paragraph) => ({
          paragraphId: paragraph.id,
          text: paragraph.text,
        })),
      },
    }
    blocks.push({ type: 'group', groupId: group.groupId })
  }

  // Build layout tree skeleton first, then seven-choices appends to it.
  const layoutTree = {
    parts: [
      {
        partId: `part-${examCodeFromPaperId(paperId)}-reading`,
        title: '第二部分 阅读',
        sections: [
          {
            sectionId: `section-${examCodeFromPaperId(paperId)}-reading-choice`,
            title: '第一节 阅读理解',
            groups: groups.map((group) => ({ groupId: group.groupId, title: group.title })),
          },
        ],
      },
    ],
  }

  // --- Seven-choices group ---
  let scAnalysisOutput = null
  let clAnalysisOutput = null
  if (sevenChoicesGroup) {
    // Validate: every question must have an answer key.
    for (const q of sevenChoicesGroup.questions) {
      if (!compact(q.answerKey)) {
        throw issue('seven_choices_answer_missing', `${q.id} 缺少答案解析版答案，不能发布。`, { questionId: q.id })
      }
    }
    // Validate: analysis is required.
    if (!sevenChoicesAnalysis || typeof sevenChoicesAnalysis !== 'object') {
      throw issue('seven_choices_analysis_required', '检测到七选五，但缺少 AI 解析，不能发布。')
    }
    if (sevenChoicesAnalysis.paperId !== paperId) {
      throw issue('seven_choices_analysis_paper_mismatch', '七选五解析 paperId 与拆题结果不一致。')
    }
    if (!sevenChoicesAnalysis.targetGroups?.includes(sevenChoicesGroup.groupId)) {
      throw issue('seven_choices_analysis_group_missing', '七选五解析没有包含当前题组。')
    }
    // Validate answer consistency.
    for (const q of sevenChoicesGroup.questions) {
      const item = sevenChoicesAnalysis.questions?.[q.id]
      if (!item) {
        throw issue('seven_choices_analysis_question_missing', `${q.id} 缺少七选五 AI 解析。`, { questionId: q.id })
      }
      const aiLabel = compact(item.optionFit?.correctOptionLabel)
      if (aiLabel && aiLabel !== q.answerKey) {
        throw issue('seven_choices_answer_conflict', `${q.id} 七选五答案冲突：答案版 ${q.answerKey} / AI ${aiLabel}。`, {
          questionId: q.id,
          officialAnswer: q.answerKey,
          aiAnswer: aiLabel,
        })
      }
    }

    // Add seven-choices questions.
    const scQuestionIds = []
    for (const q of sevenChoicesGroup.questions) {
      const questionNo = Number(q.stem) || 36
      scQuestionIds.push(q.id)
      questions[q.id] = {
        questionId: q.id,
        questionNo,
        groupId: sevenChoicesGroup.groupId,
        stem: q.stem,
        blankId: q.blankId,
      }
      answerEntries[q.id] = {
        questionId: q.id,
        questionNo,
        answer: q.answerKey,
        score: profile.sevenScore,
        note: 'AI 导题：答案解析版抽取',
      }
    }

    contentGroups[sevenChoicesGroup.groupId] = {
      groupId: sevenChoicesGroup.groupId,
      groupType: 'sevenChoices',
      title: sevenChoicesGroup.title,
      questionIds: scQuestionIds,
      blankIds: sevenChoicesGroup.blankIds,
      optionBank: sevenChoicesGroup.optionBank.map((o) => ({
        label: o.label,
        text: o.text,
      })),
      passage: {
        paragraphs: sevenChoicesGroup.paragraphs.map((p) => ({
          paragraphId: p.id,
          text: p.text,
        })),
      },
    }

    // Add seven-choices section to layout.
    layoutTree.parts[0].sections.push({
      sectionId: `section-${examCodeFromPaperId(paperId)}-reading-seven`,
      title: '第二节 七选五',
      groups: [{ groupId: sevenChoicesGroup.groupId, title: sevenChoicesGroup.title }],
    })

    // Add seven-choices blocks.
    blocks.push({ type: 'sectionHeading', sectionId: `section-${examCodeFromPaperId(paperId)}-reading-seven`, text: profile.headings.seven })
    blocks.push({ type: 'instruction', text: '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。' })
    blocks.push({ type: 'group', groupId: sevenChoicesGroup.groupId })

    const scMeta = sevenChoicesAnalysis.meta || {}
    scAnalysisOutput = {
      schemaVersion: 'seven-choices-analysis-v1',
      paperId,
      sourceAssetVersion: 1,
      targetGroups: sevenChoicesAnalysis.targetGroups || [sevenChoicesGroup.groupId],
      meta: {
        ...scMeta,
        generatedBy: 'external-ai',
        promptVersion: 'seven-choices-analysis-v1',
        reviewStatus: 'reviewed',
        importMode: 'paper-import-ai',
      },
      groups: sevenChoicesAnalysis.groups || {},
      questions: sevenChoicesAnalysis.questions || {},
    }
  }

  // --- Cloze group ---
  if (clozeGroup) {
    for (const q of clozeGroup.questions) {
      if (!compact(q.answerKey)) {
        throw issue('cloze_answer_missing', `${q.id} 缺少答案解析版答案，不能发布。`, { questionId: q.id })
      }
    }
    // Validate: cloze analysis is required when cloze group is detected.
    if (!clozeAnalysis || typeof clozeAnalysis !== 'object') {
      throw issue('cloze_analysis_required', '检测到完形填空，但缺少 AI 解析，不能发布。')
    }
    if (clozeAnalysis.paperId !== paperId) {
      throw issue('cloze_analysis_paper_mismatch', '完形填空解析 paperId 与拆题结果不一致。')
    }
    if (!clozeAnalysis.targetGroups?.includes(clozeGroup.groupId)) {
      throw issue('cloze_analysis_group_missing', '完形填空解析没有包含当前题组。')
    }

    const clQuestionIds = []
    for (const q of clozeGroup.questions) {
      const questionNo = Number(q.stem) || 41
      clQuestionIds.push(q.id)
      questions[q.id] = {
        questionId: q.id,
        questionNo,
        groupId: clozeGroup.groupId,
        stem: q.stem,
        blankId: q.blankId,
        options: ['A', 'B', 'C', 'D'].map((label) => ({
          label,
          text: q.options?.[label] || '',
        })),
      }
      answerEntries[q.id] = {
        questionId: q.id,
        questionNo,
        answer: q.answerKey,
        score: profile.clozeScore,
        note: 'AI 导题：答案解析版抽取',
      }
    }

    contentGroups[clozeGroup.groupId] = {
      groupId: clozeGroup.groupId,
      groupType: 'cloze',
      title: clozeGroup.title,
      questionIds: clQuestionIds,
      blankIds: clozeGroup.blankIds,
      passage: {
        paragraphs: clozeGroup.paragraphs.map((p) => ({
          paragraphId: p.id,
          text: p.text,
        })),
      },
    }

    // Add cloze section to layout (under 语言运用 part).
    const langPart = layoutTree.parts.find((p) => p.partId.includes('language')) ||
      (() => {
        const part = { partId: `part-${examCodeFromPaperId(paperId)}-language`, title: '第三部分 语言运用', sections: [] }
        layoutTree.parts.push(part)
        return part
      })()
    langPart.sections.push({
      sectionId: `section-${examCodeFromPaperId(paperId)}-cloze`,
      title: '第一节 完形填空',
      groups: [{ groupId: clozeGroup.groupId, title: clozeGroup.title }],
    })

    // Add cloze blocks.
    blocks.push({ type: 'pageBreakHint' })
    blocks.push({ type: 'partHeading', partId: langPart.partId, text: profile.headings.langPart })
    blocks.push({ type: 'sectionHeading', sectionId: `section-${examCodeFromPaperId(paperId)}-cloze`, text: profile.headings.cloze })
    blocks.push({ type: 'instruction', text: '阅读下面短文，从每题所给的A、B、C、D四个选项中选出最佳选项。' })
    blocks.push({ type: 'group', groupId: clozeGroup.groupId })

    const clMeta = clozeAnalysis.meta || {}
    clAnalysisOutput = {
      schemaVersion: 'cloze-analysis-v1',
      paperId,
      sourceAssetVersion: 1,
      targetGroups: clozeAnalysis.targetGroups || [clozeGroup.groupId],
      meta: {
        ...clMeta,
        generatedBy: 'external-ai',
        promptVersion: 'cloze-analysis-v1',
        reviewStatus: 'reviewed',
        importMode: 'paper-import-ai',
      },
      groups: clozeAnalysis.groups || {},
      blanks: clozeAnalysis.blanks || {},
    }
  }

  // --- Grammar-fill group ---
  // Validate grammar-fill blank count.
  if (grammarFillGroup.questions.length !== 10) {
    throw issue('grammar_fill_blank_count_invalid', `语法填空应为 10 题，实际检测到 ${grammarFillGroup.questions.length} 题。`)
  }
  for (const q of grammarFillGroup.questions) {
    if (!compact(q.answerKey)) {
      throw issue('grammar_fill_answer_missing', `${q.id} 缺少答案解析版答案，不能发布。`, { questionId: q.id })
    }
  }

  const blanks = {}
  const gfQuestionIds = []
  for (const q of grammarFillGroup.questions) {
    const questionNo = Number(q.stem) || 56
    gfQuestionIds.push(q.id)
    questions[q.id] = {
      questionId: q.id,
      questionNo,
      groupId: grammarFillGroup.groupId,
      stem: q.stem,
      blankId: q.blankId,
    }
    answerEntries[q.id] = {
      questionId: q.id,
      questionNo,
      answer: q.answerKey,
      score: 1.5,
      note: 'AI 导题：答案解析版抽取',
    }
    // Populate content.blanks entries.
    blanks[q.blankId] = {
      blankId: q.blankId,
      groupId: grammarFillGroup.groupId,
      questionId: q.id,
      ...(q.prompt ? { prompt: q.prompt } : {}),
    }
  }

  // Normalize grammar-fill passage text.
  const gfParagraphs = grammarFillGroup.paragraphs.map((p) => ({
    paragraphId: p.id,
    text: normalizeGrammarFillText(p.text),
  }))

  contentGroups[grammarFillGroup.groupId] = {
    groupId: grammarFillGroup.groupId,
    groupType: 'grammarFill',
    title: grammarFillGroup.title,
    questionIds: gfQuestionIds,
    blankIds: grammarFillGroup.blankIds,
    passage: {
      paragraphs: gfParagraphs,
    },
  }

  // Add grammar-fill section to layout (第二节 under 语言运用).
  const langPart = layoutTree.parts.find((p) => p.partId.includes('language')) ||
    (() => {
      const part = { partId: `part-${examCodeFromPaperId(paperId)}-language`, title: '第三部分 语言运用', sections: [] }
      layoutTree.parts.push(part)
      return part
    })()
  langPart.sections.push({
    sectionId: `section-${examCodeFromPaperId(paperId)}-grammar-fill`,
    title: '第二节 语法填空',
    groups: [{ groupId: grammarFillGroup.groupId, title: grammarFillGroup.title }],
  })

  // Add grammar-fill blocks.
  blocks.push({ type: 'sectionHeading', sectionId: `section-${examCodeFromPaperId(paperId)}-grammar-fill`, text: '第二节(共10小题；每小题1.5分，满分15分)' })
  blocks.push({ type: 'instruction', text: '阅读下面短文，在空白处填入1个适当的单词或括号内单词的正确形式。' })
  blocks.push({ type: 'group', groupId: grammarFillGroup.groupId })

  // --- Grammar-fill analysis (MANDATORY, decision D) ---
  if (!grammarFillAnalysis || typeof grammarFillAnalysis !== 'object') {
    throw issue('grammar_fill_analysis_required', '检测到语法填空，但缺少 AI 解析，不能发布。')
  }
  if (grammarFillAnalysis.paperId !== paperId) {
    throw issue('grammar_fill_analysis_paper_mismatch', '语法填空解析 paperId 与拆题结果不一致。')
  }
  if (!grammarFillAnalysis.targetGroups?.includes(grammarFillGroup.groupId)) {
    throw issue('grammar_fill_analysis_group_missing', '语法填空解析没有包含当前题组。')
  }
  const gfMeta = grammarFillAnalysis.meta || {}
  const gfAnalysisOutput = {
    // D1 (grammar-facets-v2): bumped to v2 — new imports must never write v1
    // (validator.mjs's PAPER_IMPORT_SCHEMA_VERSIONS no longer accepts it).
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId,
    sourceAssetVersion: 1,
    targetGroups: grammarFillAnalysis.targetGroups || [grammarFillGroup.groupId],
    meta: {
      ...gfMeta,
      generatedBy: 'external-ai',
      promptVersion: 'grammar-fill-analysis-v2',
      reviewStatus: 'reviewed',
      importMode: 'paper-import-ai',
    },
    groups: grammarFillAnalysis.groups || {},
    // blanks carries the AI's facetKey/role/answer/evidence/... plus the
    // server-stamped tense/voice/agreementSensitive/form (analyzeGrammarFill.mjs
    // stampVerbAxes) verbatim.
    blanks: grammarFillAnalysis.blanks || {},
  }

  // --- Writing groups ---
  const writingTasks = {}
  const writingPartId = `part-${examCodeFromPaperId(paperId)}-writing`

  if (applicationGroup) {
    const appTaskId = `wt-${examCodeFromPaperId(paperId)}-application`
    applicationGroup.writingTaskId = appTaskId
    contentGroups[applicationGroup.groupId] = {
      groupId: applicationGroup.groupId,
      groupType: 'writing',
      title: applicationGroup.title,
      questionIds: [],
      writingTaskId: appTaskId,
      passage: {
        paragraphs: (applicationGroup.paragraphs || []).map((p) => ({
          paragraphId: p.id,
          text: p.text,
        })),
      },
    }

    writingTasks[appTaskId] = {
      writingTaskId: appTaskId,
      groupId: applicationGroup.groupId,
      taskType: 'application',
      title: '应用文写作',
      instruction: (applicationGroup.paragraphs || []).map((p) => p.text).join('\n'),
      wordCountTarget: 80,
      // I7: given 上下格式/title, when the splitter captured one (else omitted).
      ...(applicationGroup.applicationGiven ? { applicationGiven: applicationGroup.applicationGiven } : {}),
    }

    const appSectionId = `section-${examCodeFromPaperId(paperId)}-writing-application`
    layoutTree.parts.push({
      partId: writingPartId,
      title: '第四部分 写作',
      sections: [{
        sectionId: appSectionId,
        title: '第一节 应用文写作',
        groups: [{ groupId: applicationGroup.groupId, title: applicationGroup.title }],
      }],
    })

    blocks.push({ type: 'pageBreakHint' })
    blocks.push({ type: 'partHeading', partId: writingPartId, text: '第四部分 写作（共两节，满分40分）' })
    blocks.push({ type: 'sectionHeading', sectionId: appSectionId, text: '第一节（满分15分）' })
    blocks.push({ type: 'group', groupId: applicationGroup.groupId })
    blocks.push({ type: 'instruction', text: '注意：\n（1）写作词数应为80个左右；\n（2）请按如下格式在答题卡的相应位置作答。' })
    blocks.push({ type: 'answerBox', writingTaskId: appTaskId, label: '应用文写作答题区' })
  }

  if (continuationGroup) {
    const contTaskId = `wt-${examCodeFromPaperId(paperId)}-continuation`
    continuationGroup.writingTaskId = contTaskId
    contentGroups[continuationGroup.groupId] = {
      groupId: continuationGroup.groupId,
      groupType: 'writing',
      title: continuationGroup.title,
      questionIds: [],
      writingTaskId: contTaskId,
      passage: {
        paragraphs: (continuationGroup.paragraphs || []).map((p) => ({
          paragraphId: p.id,
          text: p.text,
        })),
      },
    }

    const starters = continuationGroup.continuationStarters || []
    const starterText = starters.length >= 2
      ? `Paragraph 1: ${starters[0]}\n\nParagraph 2: ${starters[1]}`
      : ''

    writingTasks[contTaskId] = {
      writingTaskId: contTaskId,
      groupId: continuationGroup.groupId,
      taskType: 'continuation',
      title: '读后续写',
      instruction: (continuationGroup.paragraphs || []).map((p) => p.text).join('\n'),
      continuationStarters: starters,
      materialText: (continuationGroup.paragraphs || []).map((p) => p.text).join('\n\n'),
      wordCountTarget: 150,
    }

    const contSectionId = `section-${examCodeFromPaperId(paperId)}-writing-continuation`
    const writingPart = layoutTree.parts.find((p) => p.partId === writingPartId)
    if (writingPart) {
      writingPart.sections.push({
        sectionId: contSectionId,
        title: '第二节 读后续写',
        groups: [{ groupId: continuationGroup.groupId, title: continuationGroup.title }],
      })
    } else {
      layoutTree.parts.push({
        partId: writingPartId,
        title: '第四部分 写作',
        sections: [{
          sectionId: contSectionId,
          title: '第二节 读后续写',
          groups: [{ groupId: continuationGroup.groupId, title: continuationGroup.title }],
        }],
      })
      blocks.push({ type: 'pageBreakHint' })
      blocks.push({ type: 'partHeading', partId: writingPartId, text: '第四部分 写作（共两节，满分40分）' })
    }

    blocks.push({ type: 'sectionHeading', sectionId: contSectionId, text: '第二节（满分25分）' })
    blocks.push({ type: 'instruction', text: '阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。' })
    blocks.push({ type: 'group', groupId: continuationGroup.groupId })
    blocks.push({ type: 'instruction', text: '注意：\n（1）续写词数应为150个左右；\n（2）请按如下格式在答题卡的相应位置作答。' })
    if (starterText) {
      blocks.push({ type: 'instruction', text: starterText })
    }
    blocks.push({ type: 'answerBox', writingTaskId: contTaskId, label: '读后续写答题区' })
  }

  const readingAnalysis = mergePaperImportAiAnalyses(parseResult, analysesByGroupId)
  const paperAsset = {
    schemaVersion: 'paper-asset-v1',
    paper: {
      paperId,
      title,
      subject: 'English',
      source: 'AI 导题',
      assetVersion: 1,
      status: 'draft',
    },
    sources: {
      primarySourceType: 'docx',
      docx: {
        fileName: parseResult.paper.sourceFilename,
        sha256: parseResult.paper.sourceHash,
        sourcePath: '',
        sourceNote: parseResult.paper.answerSourceFilename
          ? `答案解析版：${parseResult.paper.answerSourceFilename}`
          : '未上传答案解析版',
      },
    },
    layoutTree,
    content: {
      blocks,
      groups: contentGroups,
      questions,
      ...(Object.keys(blanks).length > 0 ? { blanks } : {}),
      ...(Object.keys(writingTasks).length > 0 ? { writingTasks } : {}),
    },
    answerKey: { answers: answerEntries },
    analysis: {
      meta: readingAnalysis.meta,
      groups: readingAnalysis.groups,
      questions: readingAnalysis.questions,
    },
  }

  const answerKey = {
    schemaVersion: 'answer-key-v1',
    paperId,
    sourceAssetVersion: 1,
    answers: answerEntries,
  }

  const importMetaGroups = Object.fromEntries(groups.map((group) => [
    group.groupId,
    {
      groupId: group.groupId,
      difficulty: '中',
      summary: readingAnalysis.groups[group.groupId]?.overview || group.title,
      tags: ['阅读理解'],
      displayTitleOverride: group.title,
    },
  ]))
  if (sevenChoicesGroup) {
    importMetaGroups[sevenChoicesGroup.groupId] = {
      groupId: sevenChoicesGroup.groupId,
      difficulty: '中',
      summary: sevenChoicesAnalysis?.groups?.[sevenChoicesGroup.groupId]?.overview || '七选五',
      tags: ['七选五'],
      displayTitleOverride: sevenChoicesGroup.title,
    }
  }

  if (clozeGroup) {
    importMetaGroups[clozeGroup.groupId] = {
      groupId: clozeGroup.groupId,
      difficulty: '中',
      summary: '完形填空',
      tags: ['完形填空'],
      displayTitleOverride: clozeGroup.title,
    }
  }

  importMetaGroups[grammarFillGroup.groupId] = {
    groupId: grammarFillGroup.groupId,
    difficulty: '中',
    summary: '语法填空',
    tags: ['语法填空'],
    displayTitleOverride: grammarFillGroup.title,
  }

  if (applicationGroup) {
    importMetaGroups[applicationGroup.groupId] = {
      groupId: applicationGroup.groupId,
      difficulty: '中',
      summary: '应用文写作',
      tags: ['应用文写作'],
      displayTitleOverride: applicationGroup.title,
    }
  }

  if (continuationGroup) {
    importMetaGroups[continuationGroup.groupId] = {
      groupId: continuationGroup.groupId,
      difficulty: '中',
      summary: '读后续写',
      tags: ['读后续写'],
      displayTitleOverride: continuationGroup.title,
    }
  }

  const importMeta = {
    schemaVersion: 'import-meta-v1',
    paperId,
    sourceFileName: parseResult.paper.sourceFilename,
    sourceFileSha256: parseResult.paper.sourceHash,
    importedBy: 'paper-import-ai',
    importedAt: new Date().toISOString(),
    paper: {
      year: yearFromTitle(title),
      region: regionFromTitle(title) || 'AI 导入',
      paperName: title,
      examCode: examCodeFromPaperId(paperId),
      subject: 'English',
      sourceType: '模拟题',
      defaultTags: ['AI导题'],
    },
    groups: importMetaGroups,
  }

  const outputFiles = [
    sourceDocx,
    { fileName: 'paper-asset.json', buffer: Buffer.from(`${JSON.stringify(paperAsset, null, 2)}\n`) },
    { fileName: 'answer-key.json', buffer: Buffer.from(`${JSON.stringify(answerKey, null, 2)}\n`) },
    { fileName: 'import-meta.json', buffer: Buffer.from(`${JSON.stringify(importMeta, null, 2)}\n`) },
    {
      fileName: 'reading-choice-analysis-v1.json',
      buffer: Buffer.from(`${JSON.stringify(readingAnalysis, null, 2)}\n`),
    },
  ]

  if (scAnalysisOutput) {
    outputFiles.push({
      fileName: 'seven-choices-analysis-v1.json',
      buffer: Buffer.from(`${JSON.stringify(scAnalysisOutput, null, 2)}\n`),
    })
  }

  if (clAnalysisOutput) {
    outputFiles.push({
      fileName: 'cloze-analysis-v1.json',
      buffer: Buffer.from(`${JSON.stringify(clAnalysisOutput, null, 2)}\n`),
    })
  }

  // grammar-fill analysis is always present (guard above ensures it)
  outputFiles.push({
    fileName: 'grammar-fill-analysis-v1.json',
    buffer: Buffer.from(`${JSON.stringify(gfAnalysisOutput, null, 2)}\n`),
  })

  return outputFiles
}
