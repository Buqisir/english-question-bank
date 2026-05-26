import path from 'node:path'

const READING_LABELS = ['A', 'B', 'C', 'D']
const DEFAULT_SCORE = 2.5

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

export function buildPaperImportAiPackageFiles({ parseResult, analysesByGroupId, sourceDocx }) {
  if (!parseResult?.paper?.paperId) {
    throw issue('parse_result_missing', '缺少拆题结果，不能发布。')
  }
  const groups = [...(parseResult.readingGroups || [])].sort((a, b) => a.order - b.order)
  const letters = new Set(groups.map(groupLetter))
  for (const label of READING_LABELS) {
    if (!letters.has(label)) {
      throw issue('reading_group_missing', `缺少 Reading ${label}，不能发布。`, { groupLabel: label })
    }
  }

  const paperId = parseResult.paper.paperId
  const title = titleFromFilename(parseResult.paper.sourceFilename)
  const questions = {}
  const answerEntries = {}
  const contentGroups = {}
  const blocks = [
    { type: 'partHeading', partId: `part-${examCodeFromPaperId(paperId)}-reading`, text: '第二部分 阅读' },
    { type: 'sectionHeading', sectionId: `section-${examCodeFromPaperId(paperId)}-reading-choice`, text: '第一节 阅读理解' },
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
        score: DEFAULT_SCORE,
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
    layoutTree: {
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
    },
    content: {
      blocks,
      groups: contentGroups,
      questions,
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
    groups: Object.fromEntries(groups.map((group) => [
      group.groupId,
      {
        groupId: group.groupId,
        difficulty: '中',
        summary: readingAnalysis.groups[group.groupId]?.overview || group.title,
        tags: ['阅读理解'],
        displayTitleOverride: group.title,
      },
    ])),
  }

  return [
    sourceDocx,
    { fileName: 'paper-asset.json', buffer: Buffer.from(`${JSON.stringify(paperAsset, null, 2)}\n`) },
    { fileName: 'answer-key.json', buffer: Buffer.from(`${JSON.stringify(answerKey, null, 2)}\n`) },
    { fileName: 'import-meta.json', buffer: Buffer.from(`${JSON.stringify(importMeta, null, 2)}\n`) },
    {
      fileName: 'reading-choice-analysis-v1.json',
      buffer: Buffer.from(`${JSON.stringify(readingAnalysis, null, 2)}\n`),
    },
  ]
}
