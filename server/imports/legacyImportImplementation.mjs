// Legacy DOCX import-draft / answer-alignment pipeline implementation.
// Extracted VERBATIM (indent 0, no re-indent) out of server/api.mjs
// (cut H5-F, refactor-roadmap-2026-06). Deterministic — ZERO AI/provider calls.
//
// This is the splitter grammar + OOXML text extraction + batch-IO state machine + draft
// assembly + answer-alignment write-back. The 78 moved functions are byte-identical to their
// pre-cut form; they are kept at module indent 0 so the Chinese-string heuristics and regexes
// are preserved exactly.
//
// The 8 PUBLIC seam functions the factory RETURNS are consumed via context.* by the already
// extracted ./legacyImportRoutes.mjs: generateImportBundleDraft (async), generateAnswerAlignmentDraft,
// applyAnswerAlignment, createImportFile, runImportBatch, getImportFileParse, parseImportFile,
// deleteImportFile (the latter 7 sync). The other 70 helpers stay FILE-PRIVATE.
//
// Every free identifier is INJECTED by the factory (deps below) so this module never imports
// back from api.mjs (no cycle). node builtins (path/fs/randomUUID) are imported DIRECTLY.
// NOTE: deleteImportFile references `unlinkSync`, which is NOT imported here and was NOT imported
// in api.mjs either — preserving the pre-existing latent behavior (the reference throws and is
// swallowed by the surrounding catch). Do NOT "fix" this; importing it would change behavior.
//
// PRESERVED VERBATIM (contract-sensitive, writes questions.answer): the parseCompactAnswerEntries
// questionNo === 57 hack and the shouldUpdateExplanation = false design in applyAnswerAlignment.

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

let openDatabase
let rootDir
let importDir
let timestampPrefix
let requiredString
let optionalString
let requiredEnum
let cleanDraftText
let normalizeAnswerValue
let normalizeExamTitle
let extractDeclaredExamTitleFromText
let normalizeDraftText
let groupTypeLabels
let inferImportFileType
let sanitizeFileName
let getImportBatch
let updateImportBatchStats
let rowToImportFile
let rowToImportFileParse

export function createLegacyImportImplementation(deps) {
  ;({
    openDatabase,
    rootDir,
    importDir,
    timestampPrefix,
    requiredString,
    optionalString,
    requiredEnum,
    cleanDraftText,
    normalizeAnswerValue,
    normalizeExamTitle,
    extractDeclaredExamTitleFromText,
    normalizeDraftText,
    groupTypeLabels,
    inferImportFileType,
    sanitizeFileName,
    getImportBatch,
    updateImportBatchStats,
    rowToImportFile,
    rowToImportFileParse,
  } = deps)
  return {
    generateImportBundleDraft,
    generateAnswerAlignmentDraft,
    applyAnswerAlignment,
    createImportFile,
    runImportBatch,
    getImportFileParse,
    parseImportFile,
    deleteImportFile,
  }
}

function buildDraftSourceQualityWarnings(title, files) {
  const warnings = []
  const normalizedTitle = normalizeExamTitle(title)

  files.forEach((file) => {
    if (!['question', 'question_with_analysis'].includes(file.content_role)) return

    const declaredTitle = extractDeclaredExamTitleFromText(file.extracted_text)
    if (!declaredTitle) return

    const normalizedDeclaredTitle = normalizeExamTitle(declaredTitle)
    const isSameTitle =
      normalizedTitle &&
      normalizedDeclaredTitle &&
      (normalizedTitle.includes(normalizedDeclaredTitle) || normalizedDeclaredTitle.includes(normalizedTitle))

    if (!isSameTitle) {
      warnings.push(`来源口径提示：${file.original_name} 内文开头疑似为「${declaredTitle}」，已按文件名为准。`)
    }
  })

  return warnings.slice(0, 4)
}

function findSectionHeadings(text) {
  const headings = []
  const headingPattern = /(^|\n)((?:第[一二三四五六七八九十]+(?:部分|节)|[一二三四五六七八九十]+、|语法填空|完形填空|七选五|阅读理解(?: [A-E])?)[^\n]{0,120})/g
  let match = headingPattern.exec(text)

  while (match) {
    headings.push({
      index: match.index + match[1].length,
      title: cleanDraftText(match[2]),
    })
    match = headingPattern.exec(text)
  }

  return headings
}

function findSectionTitle(headings, offset) {
  let current = ''

  for (const heading of headings) {
    if (heading.index > offset) break
    current = heading.title
  }

  return current
}

function stripChineseSectionPrefix(sectionTitle) {
  return String(sectionTitle || '').replace(/^[一二三四五六七八九十]+、/, '').trim()
}

function findItemBlocks(text) {
  const matches = []
  const itemPattern = /(^|\n)(\d{1,2})\.\(([\d.]+)分\)/g
  let match = itemPattern.exec(text)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: itemPattern.lastIndex,
      itemNo: match[2],
      score: Number(match[3]) || 0,
    })
    match = itemPattern.exec(text)
  }

  if (matches.length === 0) {
    const structuredBlocks = findStructuredExamItemBlocks(text)
    if (structuredBlocks.length > 0) return structuredBlocks

    const numberedItemPattern = /(^|\n)(\d{1,2})[.．]\s*/g
    match = numberedItemPattern.exec(text)

    while (match) {
      matches.push({
        start: match.index + match[1].length,
        markerEnd: numberedItemPattern.lastIndex,
        itemNo: match[2],
        score: 0,
      })
      match = numberedItemPattern.exec(text)
    }
  }

  return matches.map((item, index) => ({
    ...item,
    rawText: cleanItemBlockText(text.slice(item.markerEnd, matches[index + 1]?.start ?? text.length)),
  }))
}

function patternIndex(text, pattern, start = 0) {
  const offsetText = String(text || '').slice(start)
  const match = pattern.exec(offsetText)
  return match ? start + match.index + (match[1]?.length || 0) : -1
}

function nextPositiveIndex(...values) {
  const positive = values.filter((value) => Number.isInteger(value) && value >= 0)
  return positive.length > 0 ? Math.min(...positive) : -1
}

function pushSectionItemBlock(blocks, text, start, end, itemNo) {
  if (start < 0) return
  const safeEnd = end >= 0 ? end : text.length
  if (safeEnd <= start) return

  blocks.push({
    start,
    markerEnd: start,
    itemNo,
    score: 0,
    rawText: cleanItemBlockText(text.slice(start, safeEnd)),
  })
}

function findStructuredExamItemBlocks(text) {
  const blocks = []
  const readingStart = patternIndex(text, /(^|\n)第一节[^\n]*(?:(?:37\.5|30分|满分30分)[\s\S]{0,120}?阅读(?:下面|下列|上面)短文|阅读(?:下面|下列|上面)短文)/)
  const sevenStart = patternIndex(text, /(^|\n)第二节[^\n]*(?:短文后的选项|(?:\n\s*)+(?:阅读下面短文[，,])?[^\n]{0,80}短文后的选项)/)
  const languageStart = patternIndex(text, /(^|\n)第[二三]部分\s*(?:语言(?:知识)?|英语知识)运用/)
  const writingStart = patternIndex(text, /(^|\n)第[三四]部分\s*写作/)
  const readingEnd = nextPositiveIndex(sevenStart, languageStart, writingStart)

  if (readingStart >= 0 && readingEnd > readingStart) {
    const readingText = text.slice(readingStart, readingEnd)
    const letterMatches = []
    const letterPattern = /(^|\n)([A-D])\s*(?=\n)/g
    let match = letterPattern.exec(readingText)

    while (match) {
      letterMatches.push({
        start: readingStart + match.index + match[1].length,
        markerEnd: readingStart + letterPattern.lastIndex,
        letter: match[2],
      })
      match = letterPattern.exec(readingText)
    }

    const readingItems = letterMatches.length > 0 ? letterMatches : []
    if (readingItems.length === 0) {
      const numberedPattern = /(^|\n)(\d{1,2})[.．]\s+/g
      match = numberedPattern.exec(readingText)
      while (match) {
        readingItems.push({
          start: readingStart + match.index + match[1].length,
          markerEnd: readingStart + numberedPattern.lastIndex,
          letter: '',
          itemNo: match[2],
        })
        match = numberedPattern.exec(readingText)
      }
    }

    for (const [index, item] of readingItems.entries()) {
      blocks.push({
        start: item.start,
        markerEnd: item.markerEnd,
        itemNo: item.itemNo || String(item.letter.charCodeAt(0) - 64),
        score: 0,
        rawText: cleanItemBlockText(text.slice(item.markerEnd, readingItems[index + 1]?.start ?? readingEnd)),
      })
    }
  }

  pushSectionItemBlock(blocks, text, sevenStart, nextPositiveIndex(languageStart, writingStart), '5')

  if (languageStart >= 0) {
    const clozeStart = patternIndex(text, /(^|\n)第一节[^\n]*(?:15小题|每题1分|满分15分|满分30分)/, languageStart)
    const grammarStart = patternIndex(text, /(^|\n)第二节[^\n]*(?:10小题|每小题1\.5|满分15分|语法填空)/, languageStart)
    pushSectionItemBlock(blocks, text, clozeStart, nextPositiveIndex(grammarStart, writingStart), '6')
    pushSectionItemBlock(blocks, text, grammarStart, writingStart, '7')
  }

  if (writingStart >= 0) {
    const writingEnd = nextPositiveIndex()
    pushSectionItemBlock(blocks, text, writingStart, writingEnd, '8')
  }

  if (blocks.length === 0) {
    const grammarMatch = patternIndex(text, /(^|\n)语法填空/)
    const clozeMatch = patternIndex(text, /(^|\n)完形填空/)
    const sevenMatch = patternIndex(text, /(^|\n)七选五/)
    const writingFallback = patternIndex(text, /(^|\n)(?:第四部分\s*)?(?:写作|书面表达|应用文)/)
    const allStarts = [grammarMatch, clozeMatch, sevenMatch, writingStart, writingFallback].filter((s) => s >= 0).sort((a, b) => a - b)
    if (allStarts.length > 0) {
      for (let i = 0; i < allStarts.length; i++) {
        blocks.push({
          start: allStarts[i],
          markerEnd: allStarts[i],
          itemNo: String(i + 1),
          score: 0,
          rawText: cleanItemBlockText(text.slice(allStarts[i], allStarts[i + 1] ?? text.length)),
        })
      }
    }
  }

  return blocks.sort((a, b) => a.start - b.start)
}

function cleanItemBlockText(text) {
  let result = cleanDraftText(text)
  let previous = ''

  while (result && result !== previous) {
    previous = result
    result = result.replace(/\n(?:[A-D]|第[一二三四五六七八九十]+(?:部分|节)[^\n]*|[一二三四五六七八九十]+、[^\n]*)\s*$/, '').trim()
  }

  return result
}

function findOptionMarkers(text) {
  const markers = []
  const optionPattern = /(^|\s)([A-G])(?:[．.、]|\s+(?=[A-Za-z]))\s*/g
  let match = optionPattern.exec(text)

  while (match) {
    markers.push({
      label: match[2],
      start: match.index + match[1].length,
      end: optionPattern.lastIndex,
    })
    match = optionPattern.exec(text)
  }

  return markers
}

function findLineOptionMarkers(text) {
  const markers = []
  const optionPattern = /(^|\n)(\s*)([A-G])[．.、]\s*/g
  let match = optionPattern.exec(text)

  while (match) {
    markers.push({
      label: match[3],
      start: match.index + match[1].length + match[2].length,
      end: optionPattern.lastIndex,
    })
    match = optionPattern.exec(text)
  }

  return markers
}

function extractOptionsFromMarkers(text, markers) {
  const rawOptions = markers
    .map((marker, index) => ({
      label: marker.label,
      content: cleanDraftText(text.slice(marker.end, markers[index + 1]?.start ?? text.length)),
    }))
    .filter((option) => option.content)

  return splitEmbeddedOptionMarkers(rawOptions)
}

function splitEmbeddedOptionMarkers(options) {
  const output = []
  const labelOrder = (label) => String(label || '').toUpperCase().charCodeAt(0)

  options.forEach((option) => {
    let currentLabel = option.label
    let content = option.content
    const embeddedPattern = /([^\s])([A-G])[．.、]\s*/g
    let match = embeddedPattern.exec(content)

    while (match) {
      const nextLabel = match[2]
      const markerStart = match.index + match[1].length
      if (labelOrder(nextLabel) <= labelOrder(currentLabel)) {
        match = embeddedPattern.exec(content)
        continue
      }

      const currentContent = cleanDraftText(content.slice(0, markerStart))
      if (currentContent) {
        output.push({ label: currentLabel, content: currentContent })
      }

      currentLabel = nextLabel
      content = content.slice(embeddedPattern.lastIndex)
      embeddedPattern.lastIndex = 0
      match = embeddedPattern.exec(content)
    }

    const finalContent = cleanDraftText(content)
    if (finalContent) {
      output.push({ label: currentLabel, content: finalContent })
    }
  })

  return output
}

function extractOptions(text) {
  return extractOptionsFromMarkers(text, findOptionMarkers(text))
}

function extractLineOptions(text) {
  return extractOptionsFromMarkers(text, findLineOptionMarkers(text))
}

function stripBracketAnswerBlocks(text) {
  return cleanDraftText(text)
    .replace(/【答案】[\s\S]*?(?=(?:\n\s*[（(]\d{1,2}[）)]|\n\s*[A-G][．.、]|\n\s*$|$))/g, '')
    .trim()
}

function extractBracketAnswerValue(text) {
  const choiceMatch = String(text || '').match(/【答案】\s*([A-G])(?:\s|$)/)
  if (choiceMatch) return normalizeAnswerValue(choiceMatch[1])

  const match = String(text || '').match(/【答案】\s*([^\n]+)/)
  return match ? normalizeAnswerValue(match[1]) : ''
}

function countLineStartQuestionMarkers(text) {
  const value = String(text || '')
  const parenthesizedCount = [...value.matchAll(/(^|\n)[（(]\d{1,2}[）)]\s*/g)].length
  const numberedCount = [...value.matchAll(/(^|\n)\d{1,2}[.．]\s+/g)].length
  return parenthesizedCount + numberedCount
}

function countParenthesizedQuestionMarkers(text) {
  return [...String(text || '').matchAll(/(^|\n)[（(]\d{1,2}[）)]\s*/g)].length
}

function buildAnswerMapFromBracketAnswers(blockText) {
  const answerMap = new Map()
  const text = cleanDraftText(blockText)
  const explicitPattern = /(^|\n)[（(](\d{1,2})[）)]\s*(?:\n|\s)*【答案】\s*([^\n]+)/g
  let match = explicitPattern.exec(text)

  while (match) {
    answerMap.set(match[2], normalizeAnswerValue(match[3]))
    match = explicitPattern.exec(text)
  }

  const listMatch = text.match(/【答案】\s*\[\[([\s\S]*?)\]\]/)
  if (listMatch) {
    const values = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((item) => normalizeAnswerValue(item[1]))
    const questionNos = [...new Set([...text.matchAll(/[（(](\d{1,2})[）)]/g)].map((item) => item[1]))]

    values.forEach((value, index) => {
      if (questionNos[index] && !answerMap.has(questionNos[index])) answerMap.set(questionNos[index], value)
    })
  }

  const plainListMatch = text.match(/【答案】\s*([^\n]+)/)
  if (plainListMatch && !plainListMatch[1].includes('[[')) {
    const values = plainListMatch[1]
      .split(/[；;、，,]\s*/)
      .map(normalizeAnswerValue)
      .filter(Boolean)
    const questionNos = [...new Set([...text.matchAll(/[（(](\d{1,2})[）)]/g)].map((item) => item[1]))]

    if (values.length > 1) {
      values.forEach((value, index) => {
        if (questionNos[index] && !answerMap.has(questionNos[index])) answerMap.set(questionNos[index], value)
      })
    }
  }

  return answerMap
}

function defaultScoreForGroup(groupType) {
  if (groupType === 'cloze' || groupType === 'grammar_cloze') return 1.5
  if (groupType === 'writing') return 25
  return 2
}

function inferTotalScoreFromSectionTitle(sectionTitle) {
  return Number(String(sectionTitle || '').match(/满分\s*([\d.]+)\s*分/)?.[1]) || 0
}

function inferPerQuestionScoreFromSectionTitle(sectionTitle) {
  const score = Number(String(sectionTitle || '').match(/每小题\s*([\d.]+)\s*分/)?.[1]) || 0
  return score > 0 && score <= 5 ? score : 0
}

function readingPassageLetter(itemNo) {
  const index = Number(itemNo) - 1
  if (!Number.isInteger(index) || index < 0 || index > 25) return String(itemNo || '').trim()
  return String.fromCharCode(65 + index)
}

function isListeningItem(sectionTitle, rawText) {
  const signalText = cleanDraftText(`${sectionTitle}\n${String(rawText || '').slice(0, 220)}`)
  return /听力|听下面|对话|独白|听完|录音/.test(signalText)
}

function inferDraftGroupName(groupType, sectionTitle, itemNo) {
  const sectionName = stripChineseSectionPrefix(sectionTitle)

  if (groupType === 'reading') return `阅读理解 ${readingPassageLetter(itemNo)}`
  if (groupType === 'seven_choices') return '七选五'
  if (groupType === 'cloze') return '完形填空'
  if (groupType === 'grammar_cloze') return '语法填空'
  if (groupType === 'writing' && sectionName.includes('短文改错')) return '短文改错'
  if (groupType === 'writing' && sectionName.includes('书面表达')) return '书面表达'
  if (groupType === 'writing') return '写作'

  const fallback = groupTypeLabels[groupType] || sectionName || '题组'
  return itemNo ? `${fallback} ${itemNo}` : fallback
}

function buildDraftGroupTitle(bundleTitle, groupType, sectionTitle, itemNo) {
  return cleanDraftText(`${bundleTitle} ${inferDraftGroupName(groupType, sectionTitle, itemNo)}`)
}

function questionContext(text, index, size = 120) {
  const start = Math.max(0, index - size)
  const end = Math.min(text.length, index + size)
  return cleanDraftText(text.slice(start, end))
}

function inferQuestionStem(stem, questionNo, groupType) {
  if (stem) return stem
  if (groupType === 'cloze') return `第 ${questionNo} 空`
  if (groupType === 'seven_choices') return `第 ${questionNo} 空`
  if (groupType === 'grammar_cloze') return `第 ${questionNo} 空`
  return `第 ${questionNo} 题`
}

function parseScoredQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /[（(](\d{1,2})[）)]\s*[（(]([\d.]+)分[）)]/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[1],
      score: Number(match[2]) || 0,
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'grammar_cloze' ? '语法填空' : '',
      stem,
      answer,
      explanation: '',
      score: item.score,
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 || stemText.trim() ? 0.82 : 0.58,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}

function parseParenthesizedChoiceQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /(^|\n)[（(](\d{1,2})[）)]\s*/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[2],
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'reading' ? '阅读选择' : '',
      stem,
      answer,
      explanation: '',
      score: defaultScoreForGroup(groupType),
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 ? 0.8 : 0.62,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}

function parseLineNumberedChoiceQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /(^|\n)(\d{1,2})[.．]\s*/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[2],
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'reading' ? '阅读选择' : '',
      stem,
      answer,
      explanation: '',
      score: defaultScoreForGroup(groupType),
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 ? 0.8 : 0.62,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}

function parseGapQuestions(blockText, groupType) {
  const answerMap = buildAnswerMapFromBracketAnswers(blockText)
  const textWithoutAnswers = stripBracketAnswerBlocks(blockText).replace(/(^|\n)[（(]\d{1,2}[）)]\s*(?=\n|$)/g, '\n')
  const optionMarkers =
    groupType === 'seven_choices' ? findLineOptionMarkers(textWithoutAnswers)
    : groupType === 'grammar_cloze' ? []
    : findOptionMarkers(textWithoutAnswers)
  const materialText = cleanDraftText(
    optionMarkers.length > 0 ? textWithoutAnswers.slice(0, optionMarkers[0].start) : textWithoutAnswers,
  )
  const commonOptions =
    groupType === 'seven_choices' ? extractOptionsFromMarkers(textWithoutAnswers, optionMarkers) : []
  const gapPattern = /[（(](\d{1,2})[）)]|_{2,}\s*(\d{1,2})\s*_{2,}|(?<!\d)(\d{1,2})[.．]\s*_{2,}/g
  const seen = new Set()
  const questions = []
  let match = gapPattern.exec(materialText)

  while (match) {
    const questionNo = match[1] || match[2] || match[3]
    if (!seen.has(questionNo)) {
      seen.add(questionNo)
      questions.push({
        questionNo,
        questionType: groupType === 'seven_choices' ? '句子还原' : '语法填空',
        stem: inferQuestionStem('', questionNo, groupType),
        answer: answerMap.get(questionNo) || '',
        explanation: '',
        score: defaultScoreForGroup(groupType),
        options: commonOptions,
        rawText: questionContext(materialText, match.index),
        confidence:
          groupType === 'seven_choices' && commonOptions.length >= 5 && answerMap.has(questionNo)
            ? 0.84
            : groupType === 'seven_choices' && commonOptions.length >= 5
              ? 0.78
              : answerMap.has(questionNo)
                ? 0.74
                : 0.68,
      })
    }
    match = gapPattern.exec(materialText)
  }

  return { materialText, questions }
}

function inferGroupType(sectionTitle, blockText, itemNo = '') {
  const sectionName = stripChineseSectionPrefix(sectionTitle)
  const compactText = cleanDraftText(blockText)
  const signalText = cleanDraftText(`${sectionName}\n${compactText}`)

  if (sectionName.includes('完形')) return 'cloze'
  if (sectionName.includes('语法')) return 'grammar_cloze'
  if (sectionName.includes('七选五') || sectionName.includes('短文七')) return 'seven_choices'
  if (sectionName.includes('书信') || sectionName.includes('写作')) return 'writing'
  if (/短文后的选项|多余选项|七选五/.test(signalText)) return 'seven_choices'
  if (/在空白处|括号内单词|语法填空/.test(signalText)) return 'grammar_cloze'
  if (/完形/.test(signalText)) return 'cloze'
  if (/短文改错|修改作文|书面表达|写封邮件/.test(signalText)) return 'writing'

  const hasScoredQuestionMarkers = /\(\d{1,2}\)\s*\(([\d.]+)分\)/.test(compactText)
  const scoredQuestionMarkerCount = [...compactText.matchAll(/[（(]\d{1,2}[）)]\s*[（(][\d.]+分[）)]/g)].length
  const optionCount = extractOptions(stripBracketAnswerBlocks(compactText)).length
  const blankCount = new Set([...compactText.matchAll(/[（(](\d{1,2})[）)]/g)].map((match) => match[1])).size
  const lineOptions = extractLineOptions(stripBracketAnswerBlocks(compactText))
  const uniqueLineOptionLabels = new Set(lineOptions.map((option) => option.label))
  const lineStartQuestionCount = countLineStartQuestionMarkers(compactText)

  if (blankCount >= 5 && uniqueLineOptionLabels.size >= 7) return 'seven_choices'
  if (scoredQuestionMarkerCount >= 15 || (lineStartQuestionCount >= 15 && hasScoredQuestionMarkers)) return 'cloze'
  if (/续写|段落开头语|写一篇|写篇|演讲稿|投稿|报道|邮件|短文参赛|书面表达|应用文/.test(signalText)) return 'writing'
  if (sectionName.includes('阅读')) return 'reading'
  if (lineStartQuestionCount >= 15 && optionCount >= lineStartQuestionCount * 3) return 'cloze'
  if (lineStartQuestionCount >= 1 && optionCount >= lineStartQuestionCount * 3) return 'reading'
  if (['5'].includes(String(itemNo)) && optionCount >= 7 && blankCount >= 5) return 'seven_choices'

  return 'other'
}

function inferSourceMetadata(bundleTitle) {
  const title = String(bundleTitle || '')
  const year = Number(title.match(/(20\d{2})/)?.[1]) || new Date().getFullYear()
  const region = title.match(/年([^卷]+?)卷/)?.[1] || ''

  return {
    sourceType: 'real_exam',
    year,
    region,
    paperName: title,
  }
}

function buildDraftGroup({ bundleTitle, item, sectionTitle }) {
  const groupType = item.groupType || inferGroupType(sectionTitle, item.rawText, item.itemNo)
  const sectionName = stripChineseSectionPrefix(sectionTitle) || groupTypeLabels[groupType]
  const inferredScore = item.score || (groupType === 'reading' ? 0 : inferTotalScoreFromSectionTitle(sectionTitle))
  const inferredQuestionScore = inferPerQuestionScoreFromSectionTitle(sectionTitle)
  const titleItemNo = item.titleItemNo || item.itemNo
  const scored = parseScoredQuestions(item.rawText, groupType)
  const parsed =
    scored.questions.length > 0
      ? scored
      : ['reading', 'cloze'].includes(groupType) && countLineStartQuestionMarkers(item.rawText) > 0
        ? countParenthesizedQuestionMarkers(item.rawText) > 0
          ? parseParenthesizedChoiceQuestions(item.rawText, groupType)
          : parseLineNumberedChoiceQuestions(item.rawText, groupType)
      : groupType === 'writing'
        ? {
            materialText: '',
            questions: [
              {
                questionNo: item.itemNo,
                questionType: '写作任务',
                stem: item.rawText,
                answer: '',
                explanation: '',
                score: inferredScore || defaultScoreForGroup(groupType),
                options: [],
                rawText: item.rawText,
                confidence: 0.74,
              },
            ],
          }
        : parseGapQuestions(item.rawText, groupType)
  const normalizedQuestionScore =
    inferredQuestionScore ||
    (inferredScore > 0 && parsed.questions.length > 0 ? inferredScore / parsed.questions.length : 0)
  const normalizedParsed =
    normalizedQuestionScore > 0 && ['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(groupType)
      ? {
          ...parsed,
          questions: parsed.questions.map((question) => ({
            ...question,
            score: normalizedQuestionScore,
          })),
        }
      : parsed
  const warnings = []

  if (normalizedParsed.questions.length === 0) warnings.push('未识别到小题，请人工检查原文格式。')
  if (groupType === 'reading' && normalizedParsed.questions.some((question) => question.options.length === 0)) {
    warnings.push('存在无选项题，可能是阅读回答问题或选项识别不完整。')
  }
  if (groupType === 'grammar_cloze' && normalizedParsed.questions.some((question) => !question.answer)) {
    warnings.push('语法填空存在未识别答案，需人工或解析文件补齐。')
  }
  if (groupType === 'seven_choices') {
    const optionLabels = normalizedParsed.questions[0]?.options?.map((option) => option.label) || []
    const duplicateLabels = [...new Set(optionLabels.filter((label, index) => optionLabels.indexOf(label) !== index))]
    const missingLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((label) => !optionLabels.includes(label))

    if (optionLabels.length !== 7 || duplicateLabels.length > 0 || missingLabels.length > 0) {
      const details = [
        missingLabels.length > 0 ? `缺少 ${missingLabels.join('、')}` : '',
        duplicateLabels.length > 0 ? `重复 ${duplicateLabels.join('、')}` : '',
        optionLabels.length !== 7 ? `识别到 ${optionLabels.length} 个选项` : '',
      ]
        .filter(Boolean)
        .join('，')
      warnings.push(`七选五选项标签疑似异常：${details}，请人工核对原文。`)
    }
  }

  return {
    id: `draft-${item.itemNo}`,
    sourceItemNo: item.itemNo,
    sectionTitle,
    groupType,
    title: buildDraftGroupTitle(bundleTitle, groupType, sectionTitle, titleItemNo),
    instruction: sectionName,
    materialText: normalizedParsed.materialText,
    questionCount: normalizedParsed.questions.length,
    totalScore: normalizedParsed.questions.reduce((sum, question) => sum + (question.score || 0), 0) || inferredScore,
    confidence:
      normalizedParsed.questions.length === 0
        ? 0.35
        : Math.min(...normalizedParsed.questions.map((question) => question.confidence ?? 0.6)),
    warnings,
    questions: normalizedParsed.questions,
  }
}

function getParsedImportFilesForBundle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    return db
      .prepare(
        `
        SELECT
          f.id,
          f.original_name,
          f.content_role,
          f.bundle_id,
          f.bundle_title,
          f.created_at,
          t.parser,
          t.extracted_text,
          t.line_count,
          t.char_count
        FROM import_files f
        JOIN import_file_texts t ON t.import_file_id = f.id
        WHERE (f.bundle_id = ? OR f.id = ?) AND t.status = 'succeeded'
        ORDER BY f.created_at ASC
        `,
      )
      .all(bundleId, fallbackFileId)
  } finally {
    db.close()
  }
}

async function generateImportBundleDraft(bundleId) {
  const files = getParsedImportFilesForBundle(bundleId)
  if (files.length === 0) return null

  const primaryFiles = files.filter((file) => ['question', 'question_with_analysis'].includes(file.content_role))
  const sourceFiles = primaryFiles.length > 0 ? primaryFiles : files
  const answerFiles = files.filter((file) => ['answer_analysis', 'question_with_analysis'].includes(file.content_role))
  const title = sourceFiles.find((file) => file.bundle_title)?.bundle_title || sourceFiles[0].original_name.replace(/\.[^.]+$/, '')
  const text = normalizeDraftText(sourceFiles.map((file) => file.extracted_text).join('\n\n'))
  const headings = findSectionHeadings(text)
  const itemBlocks = findItemBlocks(text)
    .map((item) => ({
      ...item,
      sectionTitle: findSectionTitle(headings, item.start),
    }))
    .filter((item) => !isListeningItem(item.sectionTitle, item.rawText))
  const source = inferSourceMetadata(title)
  let readingIndex = 0
  const parsedGroups = itemBlocks.map((item) => {
    const groupType = inferGroupType(item.sectionTitle, item.rawText, item.itemNo)
    const titleItemNo = groupType === 'reading' ? String(++readingIndex) : item.itemNo

    return buildDraftGroup({
      bundleTitle: title,
      item: {
        ...item,
        groupType,
        titleItemNo,
      },
      sectionTitle: item.sectionTitle,
    })
  })
  const answerIndex = answerFiles.length > 0 ? buildStructuredAnswerEntryIndex(answerFiles, title) : null
  const answerMerge = answerIndex ? mergeAnswerEntriesIntoDraftGroups(parsedGroups, answerIndex) : null
  const groups = answerMerge?.groups || parsedGroups
  const warnings = []

  if (groups.length === 0) warnings.push('未识别到题组编号，如 1.(15分)，请检查 DOCX 抽取文本。')
  if (answerFiles.length === 0) {
    warnings.push('当前资料组缺少解析文件，草稿暂不含答案和解析。')
  }
  if (answerIndex) {
    warnings.push(...answerIndex.warnings)
    if (answerIndex.structuredEntryCount === 0 && answerIndex.global.length === 0) {
      warnings.push('解析文件中未识别到可并入草稿的答案条目，请人工检查格式。')
    } else if ((answerMerge?.matchedQuestionCount || 0) === 0) {
      warnings.push('解析文件已有答案条目，但暂未匹配到草稿题号，请人工核对题号或题组边界。')
    }
  }
  warnings.push(...buildDraftSourceQualityWarnings(title, sourceFiles))

  const draft = {
    id: `draft-${bundleId}`,
    bundleId,
    title,
    source,
    generatedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    answerFiles: answerFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    answerMatchedQuestionCount: answerMerge?.matchedQuestionCount || 0,
    groupCount: groups.length,
    questionCount: groups.reduce((sum, group) => sum + group.questionCount, 0),
    warnings,
    groups,
  }

  return draft
}

function getImportBundleTitle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    const row = db
      .prepare(
        `
        SELECT bundle_title, original_name
        FROM import_files
        WHERE bundle_id = ? OR id = ?
        ORDER BY created_at ASC
        LIMIT 1
        `,
      )
      .get(bundleId, fallbackFileId)

    return row?.bundle_title || row?.original_name?.replace(/\.[^.]+$/, '') || ''
  } finally {
    db.close()
  }
}

function getParsedAnswerFilesForBundle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    return db
      .prepare(
        `
        SELECT
          f.id,
          f.original_name,
          f.content_role,
          f.bundle_id,
          f.bundle_title,
          f.created_at,
          t.parser,
          t.extracted_text,
          t.line_count,
          t.char_count
        FROM import_files f
        JOIN import_file_texts t ON t.import_file_id = f.id
        WHERE
          (f.bundle_id = ? OR f.id = ?)
          AND f.content_role IN ('answer_analysis', 'question_with_analysis')
          AND t.status = 'succeeded'
        ORDER BY f.created_at ASC
        `,
      )
      .all(bundleId, fallbackFileId)
  } finally {
    db.close()
  }
}

function parseQuestionNoFromTitle(title) {
  const readingMatch = String(title || '').match(/阅读理解\s*([A-D])/i)
  if (readingMatch) return readingMatch[1].toUpperCase()

  return String(title || '').match(/(\d{1,2})\s*$/)?.[1] || ''
}

function listFormalGroupsForBundleTitle(bundleTitle) {
  const db = openDatabase()
  const title = String(bundleTitle || '').trim()

  try {
    const rows = db
      .prepare(
        `
        SELECT
          qg.id AS group_id,
          qg.title,
          qg.group_type,
          qg.default_score,
          s.paper_name,
          s.region,
          q.id AS question_id,
          q.question_no,
          q.stem,
          q.answer,
          q.explanation,
          q.display_order
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        JOIN sources s ON s.id = p.source_id
        LEFT JOIN questions q ON q.group_id = qg.id
        WHERE s.paper_name = ? OR qg.title LIKE ?
        ORDER BY qg.title ASC, q.display_order ASC
        `,
      )
      .all(title, `${title}%`)
    const groups = new Map()

    for (const row of rows) {
      if (!groups.has(row.group_id)) {
        groups.set(row.group_id, {
          id: row.group_id,
          title: row.title,
          sourceItemNo: parseQuestionNoFromTitle(row.title),
          groupType: row.group_type,
          defaultScore: row.default_score || 0,
          paperName: row.paper_name || '',
          region: row.region || '',
          questions: [],
        })
      }

      if (row.question_id) {
        groups.get(row.group_id).questions.push({
          id: row.question_id,
          questionNo: row.question_no,
          stem: row.stem || '',
          answer: row.answer || '',
          explanation: row.explanation || '',
        })
      }
    }

    return Array.from(groups.values())
  } finally {
    db.close()
  }
}

function isAnswerEntryStart(text) {
  return /^\s*[A-G]\b/.test(text)
}

function findAnswerItemBlocks(text) {
  const matches = []
  const itemPattern = /(^|\n)(\d{1,2})[.、．]\s*([^\n]{0,80})/g
  let match = itemPattern.exec(text)

  while (match) {
    if (!isAnswerEntryStart(match[3]) && /(答案|解析|完形|语法|阅读|七选五|写作)/.test(match[3])) {
      matches.push({
        start: match.index + match[1].length,
        markerEnd: itemPattern.lastIndex,
        itemNo: match[2],
      })
    }
    match = itemPattern.exec(text)
  }

  return matches.map((item, index) => ({
    ...item,
    rawText: cleanDraftText(text.slice(item.markerEnd, matches[index + 1]?.start ?? text.length)),
  }))
}

function cleanAnswerExplanation(text) {
  return cleanDraftText(text)
    .replace(/^答案\s*[:：]?\s*/i, '')
    .replace(/^解析\s*[:：]?\s*/i, '')
    .replace(/^[。．.、，,;；\s]+/, '')
    .trim()
}

function parseAnswerEntries(text) {
  const entries = []
  const normalized = cleanDraftText(text)
  const entryPattern =
    /(?:^|\n|\s)(?:[（(](\d{1,2})[）)]|(\d{1,2})[.、．])\s*([A-G])(?:\s*[。．.、，,;；]?\s*)([\s\S]*?)(?=(?:\n|\s)(?:[（(]\d{1,2}[）)]|\d{1,2}[.、．])\s*[A-G](?:\s|[。．.、，,;；])|$)/g
  let match = entryPattern.exec(normalized)

  while (match) {
    const explanation = cleanAnswerExplanation(match[4])
    entries.push({
      questionNo: match[1] || match[2],
      answer: match[3],
      explanation,
      rawText: cleanDraftText(match[0]),
      confidence: explanation ? 0.78 : 0.62,
    })
    match = entryPattern.exec(normalized)
  }

  return entries
}

function parseCompactAnswerEntries(text) {
  const normalized = cleanDraftText(text).replace(/([A-G])(?=\d{1,2}\s*[-－—]\s*\d{1,2})/g, '$1 ')
  const entries = []
  const rangePattern = /(?:^|\n|\s)(\d{1,2})\s*[-－—]\s*(\d{1,2})\s*([A-G]{2,})(?=\s|$)/g
  let match = rangePattern.exec(normalized)

  while (match) {
    const start = Number(match[1])
    const end = Number(match[2])
    const values = match[3].split('')
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start && end - start + 1 === values.length) {
      values.forEach((answer, index) => {
        const questionNo = String(start + index)
        entries.push({
          questionNo,
          answer,
          explanation: '',
          rawText: cleanDraftText(match[0]),
          confidence: 0.76,
        })
      })
    }
    match = rangePattern.exec(normalized)
  }

  const grammarStart = normalized.search(/语法填空/)
  if (grammarStart >= 0) {
    const afterGrammar = normalized.slice(grammarStart)
    const writingOffset = afterGrammar.search(/第四部分|写作/)
    const rawGrammarText = writingOffset >= 0 ? afterGrammar.slice(0, writingOffset) : afterGrammar
    const grammarText = cleanDraftText(rawGrammarText)
      .replace(/^语法填空[^\n]*(?:\n|$)/, '')
      .replace(/([A-Za-z)）/])(\d{1,2}[.、．])/g, '$1 $2')
    const grammarMarkers = []
    const grammarPattern = /(?:^|\s)(\d{1,2})[.、．]\s*/g
    match = grammarPattern.exec(grammarText)

    while (match) {
      grammarMarkers.push({
        questionNo: Number(match[1]),
        start: match.index,
        end: grammarPattern.lastIndex,
      })
      match = grammarPattern.exec(grammarText)
    }

    const pushGrammarEntry = (questionNo, rawAnswer, rawText = rawAnswer) => {
      const answer = normalizeAnswerValue(String(rawAnswer || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' '))
      if (answer && !/^[A-G]$/.test(answer)) {
        entries.push({
          questionNo: String(questionNo),
          answer,
          explanation: '',
          rawText: cleanDraftText(rawText),
          confidence: 0.72,
        })
      }
    }
    const splitGrammarAnswerLines = (rawAnswer) =>
      String(rawAnswer || '')
        .split(/\n+/)
        .map((part) => normalizeAnswerValue(part))
        .filter(Boolean)

    const firstGrammarMarker = grammarMarkers[0]
    if (firstGrammarMarker?.questionNo === 57) {
      pushGrammarEntry(56, grammarText.slice(0, firstGrammarMarker.start))
    }

    grammarMarkers.forEach((marker, index) => {
      const nextMarker = grammarMarkers[index + 1]
      const rawAnswer = grammarText.slice(marker.end, nextMarker?.start ?? grammarText.length)
      const gapSize = nextMarker ? nextMarker.questionNo - marker.questionNo : 1

      if (gapSize > 1) {
        const answerLines = splitGrammarAnswerLines(rawAnswer)
        if (answerLines.length >= gapSize) {
          answerLines.slice(0, gapSize).forEach((answer, answerIndex) => {
            pushGrammarEntry(marker.questionNo + answerIndex, answer, answer)
          })
          return
        }
      }

      pushGrammarEntry(marker.questionNo, rawAnswer)
    })
  }

  return entries
}

function parseDetailedAnswerEntries(text, fallbackEntries = []) {
  const normalized = cleanDraftText(text)
  const fallbackByNo = new Map(fallbackEntries.map((entry) => [String(entry.questionNo), entry]))
  const entries = []
  const entryPattern = /(^|\n)第(\d{1,2})题[.．、:：]?\s*([\s\S]*?)(?=(?:\n第\d{1,2}题[.．、:：]?\s*)|$)/g
  let match = entryPattern.exec(normalized)

  while (match) {
    const questionNo = match[2]
    const rawText = cleanDraftText(`第${questionNo}题.${match[3]}`)
    const explanationStart = rawText.search(/解析\s*[:：]/)

    if (explanationStart < 0) {
      match = entryPattern.exec(normalized)
      continue
    }

    const fallback = fallbackByNo.get(questionNo)
    const leadingText = cleanDraftText(
      rawText
        .replace(new RegExp(`^第${questionNo}题[.．、:：]?\\s*`), '')
        .slice(0, explanationStart),
    )
    const choiceAnswer = normalizeAnswerValue(leadingText.match(/^([A-G])(?:\s|[.．、]|$)/)?.[1] || '')
    const answer = fallback?.answer || choiceAnswer
    const explanation = limitedExplanation(rawText.slice(explanationStart).replace(/^解析\s*[:：]\s*/, ''))

    entries.push({
      questionNo,
      answer,
      explanation,
      rawText,
      confidence: answer && explanation ? 0.92 : explanation ? 0.76 : 0.48,
    })
    match = entryPattern.exec(normalized)
  }

  return entries
}

function normalizeGroupTitleKey(title) {
  return cleanDraftText(title).replace(/\s+/g, ' ')
}

function limitedExplanation(text, maxLength = 1000) {
  const cleaned = cleanAnswerExplanation(text)
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength).trim()}...`
}

function mergeAnswerEntries(existingEntries, incomingEntries) {
  const byNo = new Map(existingEntries.map((entry) => [String(entry.questionNo), entry]))

  for (const entry of incomingEntries) {
    const key = String(entry.questionNo)
    const existing = byNo.get(key)
    if (!existing) {
      byNo.set(key, entry)
      continue
    }

    byNo.set(key, {
      ...existing,
      answer: entry.answer || existing.answer,
      explanation: entry.explanation || existing.explanation,
      rawText: entry.rawText || existing.rawText,
      confidence: Math.max(existing.confidence || 0, entry.confidence || 0),
    })
  }

  return Array.from(byNo.values()).sort((a, b) => Number(a.questionNo) - Number(b.questionNo))
}

function addAnswerEntriesForGroup(index, groupTitle, entries) {
  const normalizedTitle = normalizeGroupTitleKey(groupTitle)
  if (!normalizedTitle || entries.length === 0) return

  const existing = index.byGroupTitle.get(normalizedTitle) || []
  index.byGroupTitle.set(normalizedTitle, mergeAnswerEntries(existing, entries))
}

function answerEntriesFromDraftQuestions(questions) {
  return questions
    .filter((question) => question.answer)
    .map((question) => ({
      questionNo: question.questionNo,
      answer: question.answer || '',
      explanation: '',
      rawText: cleanDraftText(question.rawText || question.stem || ''),
      confidence: Math.max(question.confidence || 0.72, 0.74),
    }))
}

function addQuestionWithAnalysisEntries(index, file, bundleTitle) {
  const text = normalizeDraftText(file.extracted_text)
  const headings = findSectionHeadings(text)
  const itemBlocks = findItemBlocks(text)
    .map((item) => ({
      ...item,
      sectionTitle: findSectionTitle(headings, item.start),
    }))
    .filter((item) => !isListeningItem(item.sectionTitle, item.rawText))

  let readingIndex = 0
  let groupEntryCount = 0

  for (const item of itemBlocks) {
    const groupType = inferGroupType(item.sectionTitle, item.rawText, item.itemNo)
    if (!['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(groupType)) continue

    const titleItemNo = groupType === 'reading' ? String(++readingIndex) : item.itemNo
    const group = buildDraftGroup({
      bundleTitle,
      item: {
        ...item,
        groupType,
        titleItemNo,
      },
      sectionTitle: item.sectionTitle,
    })
    const entries = answerEntriesFromDraftQuestions(group.questions)
    addAnswerEntriesForGroup(index, group.title, entries)
    groupEntryCount += entries.length
  }

  if (groupEntryCount === 0) {
    index.warnings.push(`${file.original_name} 未按题组识别出可写回的答案。`)
  }
}

function parseReadingAnalysisEntries(sectionText) {
  const text = cleanDraftText(sectionText)
  const matches = []
  const questionPattern = /(^|\n)第(\d{1,2})题[^\n]*/g
  let match = questionPattern.exec(text)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      questionNo: match[2],
    })
    match = questionPattern.exec(text)
  }

  return matches
    .map((item, index) => {
      const rawText = cleanDraftText(text.slice(item.start, matches[index + 1]?.start ?? text.length))
      const answer = normalizeAnswerValue(
        rawText.match(/答案\s*[:：]\s*([A-G])(?:\s|[.．、]|$)/)?.[1] ||
          rawText.match(/^第\d{1,2}题\s*[.．、:：]?\s*([A-G])(?:\s|[.．、]|$)/)?.[1] ||
          '',
      )
      const explanationStart = rawText.search(/解析\s*[:：]/)
      const explanation =
        explanationStart >= 0
          ? limitedExplanation(rawText.slice(explanationStart).replace(/^解析\s*[:：]\s*/, ''))
          : limitedExplanation(
              rawText
                .replace(/^第\d{1,2}题\s*[.．、:：]?\s*[A-G]\s*/, '')
                .replace(/答案\s*[:：]\s*[A-G][^\n]*/, ''),
            )

      return {
        questionNo: item.questionNo,
        answer,
        explanation,
        rawText,
        confidence: answer && explanation ? 0.94 : answer ? 0.82 : 0.48,
      }
    })
    .filter((entry) => entry.answer)
}

function addReadingAnalysisEntries(index, file, bundleTitle) {
  const text = cleanDraftText(file.extracted_text)
  const sections = []
  const sectionPattern = /(^|\n)([A-D])篇[^\n]*/g
  let match = sectionPattern.exec(text)

  while (match) {
    sections.push({
      start: match.index + match[1].length,
      letter: match[2],
    })
    match = sectionPattern.exec(text)
  }

  for (const [indexInList, section] of sections.entries()) {
    const rawSection = text.slice(section.start, sections[indexInList + 1]?.start ?? text.length)
    const entries = parseReadingAnalysisEntries(rawSection)
    addAnswerEntriesForGroup(index, `${bundleTitle} 阅读理解 ${section.letter}`, entries)
  }

  return sections.length
}

function buildStructuredAnswerEntryIndex(answerFiles, bundleTitle) {
  const answerText = answerFiles.map((file) => file.extracted_text).join('\n\n')
  const plainEntries = parseAnswerEntries(answerText)
  const compactEntries = parseCompactAnswerEntries(answerText)
  const globalEntries = mergeAnswerEntries(
    mergeAnswerEntries(plainEntries, compactEntries),
    parseDetailedAnswerEntries(answerText, mergeAnswerEntries(plainEntries, compactEntries)),
  )
  const index = {
    byGroupTitle: new Map(),
    global: globalEntries,
    warnings: [],
  }

  for (const file of answerFiles) {
    if (file.content_role === 'question_with_analysis') {
      addQuestionWithAnalysisEntries(index, file, bundleTitle)
      continue
    }

    if (file.content_role === 'answer_analysis') {
      const readingSectionCount = addReadingAnalysisEntries(index, file, bundleTitle)
      if (readingSectionCount === 0) {
        index.warnings.push(`${file.original_name} 未识别到“A篇/B篇/C篇/D篇”式阅读解析边界。`)
      }
    }
  }

  index.structuredEntryCount = Array.from(index.byGroupTitle.values()).reduce((sum, entries) => sum + entries.length, 0)
  return index
}

function canUseGlobalAnswerEntries(formalGroups) {
  const seen = new Set()
  let count = 0

  for (const group of formalGroups) {
    for (const question of group.questions) {
      const key = String(question.questionNo || '').trim()
      if (!key) return false
      if (seen.has(key)) return false
      seen.add(key)
      count += 1
    }
  }

  return count > 0
}

function getGlobalAnswerEntriesForGroup(answerIndex, formalGroup) {
  const questionNos = new Set(formalGroup.questions.map((question) => String(question.questionNo)))
  return answerIndex.global.filter((entry) => questionNos.has(String(entry.questionNo)))
}

function pickAnswerEntriesForGroup(answerIndex, formalGroups, formalGroup) {
  const entries = answerIndex.byGroupTitle.get(normalizeGroupTitleKey(formalGroup.title))
  if (entries?.length) {
    return mergeAnswerEntries(getGlobalAnswerEntriesForGroup(answerIndex, formalGroup), entries)
  }

  if (formalGroups.length === 1 && answerIndex.global.length > 0) {
    return answerIndex.global
  }

  if (canUseGlobalAnswerEntries(formalGroups) && answerIndex.global.length > 0) {
    return getGlobalAnswerEntriesForGroup(answerIndex, formalGroup)
  }

  return []
}

function mergeAnswerEntriesIntoDraftGroups(groups, answerIndex) {
  const answerableGroups = groups.filter((group) =>
    ['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(group.groupType),
  )
  const groupsForGlobalMatching = answerableGroups.length > 0 ? answerableGroups : groups
  let matchedQuestionCount = 0

  const mergedGroups = groups.map((group) => {
    if (!['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(group.groupType)) return group

    const entries = pickAnswerEntriesForGroup(answerIndex, groupsForGlobalMatching, group)
    const entriesByNo = new Map(entries.map((entry) => [String(entry.questionNo), entry]))
    let groupMatchedQuestionCount = 0
    const questions = group.questions.map((question) => {
      const entry = entriesByNo.get(String(question.questionNo))
      if (!entry) return question

      groupMatchedQuestionCount += 1
      matchedQuestionCount += 1
      return {
        ...question,
        answer: question.answer || entry.answer || '',
        explanation: question.explanation || '',
        confidence: Math.max(question.confidence || 0, entry.confidence || 0),
      }
    })
    const warnings = group.warnings.filter(
      (warning) =>
        !(
          group.groupType === 'grammar_cloze' &&
          warning.startsWith('语法填空存在未识别答案') &&
          questions.every((question) => question.answer)
        ),
    )

    if (entries.length > 0 && groupMatchedQuestionCount < group.questions.length) {
      warnings.push(`${group.questions.length - groupMatchedQuestionCount} 道小题尚未从解析文件匹配到答案。`)
    }

    return {
      ...group,
      warnings,
      questions,
    }
  })

  return {
    groups: mergedGroups,
    matchedQuestionCount,
  }
}

function generateAnswerAlignmentDraft(bundleId) {
  const title = getImportBundleTitle(bundleId)
  if (!title) return null

  const answerFiles = getParsedAnswerFilesForBundle(bundleId)
  const formalGroups = listFormalGroupsForBundleTitle(title)
  const warnings = []

  if (formalGroups.length === 0) {
    warnings.push('题库中还没有可对齐的正式题组，请先从拆题草稿入库题目。')
  }
  if (answerFiles.length === 0) {
    warnings.push('当前资料组没有已解析的答案解析文件，请先导入并解析“答案解析文件”。')
  }

  const answerIndex = buildStructuredAnswerEntryIndex(answerFiles, title)
  warnings.push(...answerIndex.warnings)
  if (answerFiles.length > 0 && answerIndex.structuredEntryCount === 0 && answerIndex.global.length === 0) {
    warnings.push('解析文件中未识别到可按题组写回的答案条目，请人工检查格式。')
  }
  if (
    answerFiles.length > 0 &&
    formalGroups.length > 1 &&
    answerIndex.structuredEntryCount === 0 &&
    answerIndex.global.length > 0 &&
    !canUseGlobalAnswerEntries(formalGroups)
  ) {
    warnings.push('解析文件缺少可靠题组边界，已暂停跨题组自动匹配，避免错贴答案。')
  }

  const groups = formalGroups.map((group) => {
    const entries = pickAnswerEntriesForGroup(answerIndex, formalGroups, group)
    const entriesByNo = new Map(entries.map((entry) => [String(entry.questionNo), entry]))
    const matches = group.questions.map((question) => {
      const entry = entriesByNo.get(String(question.questionNo))
      const answerDiffers = Boolean(
        entry?.answer &&
          question.answer &&
          normalizeAnswerValue(entry.answer) !== normalizeAnswerValue(question.answer),
      )
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        stem: question.stem,
        currentAnswer: question.answer,
        currentExplanation: question.explanation,
        proposedAnswer: entry?.answer || '',
        proposedExplanation: '',
        rawText: entry?.rawText || '',
        confidence: entry ? entry.confidence : 0,
        answerDiffers,
        status: entry ? 'matched' : 'missing',
      }
    })
    const matchedCount = matches.filter((match) => match.status === 'matched').length
    const mismatchCount = matches.filter((match) => match.answerDiffers).length
    const groupWarnings = []
    if (matchedCount !== group.questions.length) {
      groupWarnings.push(`${group.questions.length - matchedCount} 道小题尚未匹配到答案解析。`)
    }
    if (mismatchCount > 0) {
      groupWarnings.push(`${mismatchCount} 道小题的解析答案与题库现有答案不一致，写回前需人工核对。`)
    }

    return {
      id: `answer-align-${group.id}`,
      questionGroupId: group.id,
      title: group.title,
      sourceItemNo: group.sourceItemNo,
      groupType: group.groupType,
      questionCount: group.questions.length,
      matchedCount,
      confidence: matches.length > 0 ? matchedCount / matches.length : 0,
      warnings: groupWarnings,
      matches,
    }
  })

  return {
    id: `answer-align-${bundleId}`,
    bundleId,
    title,
    generatedAt: new Date().toISOString(),
    sourceFiles: answerFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    targetGroupCount: formalGroups.length,
    matchedGroupCount: groups.filter((group) => group.matchedCount > 0).length,
    matchedQuestionCount: groups.reduce((sum, group) => sum + group.matchedCount, 0),
    warnings,
    groups,
  }
}

function applyAnswerAlignment(bundleId, input = {}) {
  const alignment = generateAnswerAlignmentDraft(bundleId)
  if (!alignment) return null

  const questionGroupId = optionalString(input.questionGroupId)
  const overwrite = Boolean(input.overwrite)
  const targetGroups = questionGroupId
    ? alignment.groups.filter((group) => group.questionGroupId === questionGroupId)
    : alignment.groups

  if (targetGroups.length === 0) {
    throw new Error('No matching question group found in answer alignment')
  }

  const db = openDatabase({ readOnly: false })
  const updateQuestion = db.prepare(
    `
    UPDATE questions
    SET answer = ?, explanation = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
  const result = {
    bundleId,
    questionGroupId,
    overwrite,
    targetGroupCount: targetGroups.length,
    matchedQuestionCount: 0,
    updatedQuestionCount: 0,
    updatedAnswerCount: 0,
    updatedExplanationCount: 0,
    skippedExistingCount: 0,
    missingQuestionCount: 0,
  }

  try {
    db.exec('BEGIN')

    for (const group of targetGroups) {
      for (const match of group.matches) {
        if (match.status !== 'matched') {
          result.missingQuestionCount += 1
          continue
        }

        result.matchedQuestionCount += 1
        const shouldUpdateAnswer = Boolean(match.proposedAnswer) && (overwrite || !match.currentAnswer)
        const shouldUpdateExplanation = false

        if (!shouldUpdateAnswer && !shouldUpdateExplanation) {
          result.skippedExistingCount += 1
          continue
        }

        updateQuestion.run(
          shouldUpdateAnswer ? match.proposedAnswer : match.currentAnswer,
          match.currentExplanation,
          match.questionId,
        )
        result.updatedQuestionCount += 1
        if (shouldUpdateAnswer) result.updatedAnswerCount += 1
        if (shouldUpdateExplanation) result.updatedExplanationCount += 1
      }
    }

    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failures so the original error can be reported.
    }
    throw error
  } finally {
    db.close()
  }
}

function findExistingImportBundleId(db, bundleTitle) {
  const title = optionalString(bundleTitle)
  if (!title) return ''

  const row = db
    .prepare(
      `
      SELECT bundle_id
      FROM import_files
      WHERE bundle_title = ? AND bundle_id <> ''
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      `,
    )
    .get(title)

  return row?.bundle_id || ''
}

function findExistingImportFileForBatchItem(input) {
  const db = openDatabase()

  try {
    const row = db
      .prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE original_name = ?
          AND content_role = ?
          AND bundle_title = ?
        ORDER BY
          CASE status WHEN 'parsed' THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
        LIMIT 1
        `,
      )
      .get(input.fileName, input.contentRole, input.bundleTitle)

    return row ? rowToImportFile(row) : null
  } finally {
    db.close()
  }
}

function createImportFile(input) {
  const originalName = sanitizeFileName(requiredString(input.fileName, 'fileName'))
  const fileType = inferImportFileType(originalName, input.mimeType)
  const contentRole = requiredEnum(
    input.contentRole || 'question',
    ['question', 'answer_analysis', 'question_with_analysis', 'other'],
    'contentRole',
  )
  const dataBase64 = requiredString(input.dataBase64, 'dataBase64')
  const bundleTitle = optionalString(input.bundleTitle) || originalName.replace(/\.[^.]+$/, '')
  const requestedBundleId = optionalString(input.bundleId)

  if (!['docx', 'pdf'].includes(fileType)) {
    throw new Error('Only DOCX and PDF files are supported for now')
  }

  const body = Buffer.from(dataBase64, 'base64')
  if (body.length === 0) {
    throw new Error('file content is empty')
  }
  if (body.length > 25_000_000) {
    throw new Error('file is too large; current limit is 25MB')
  }

  mkdirSync(importDir, { recursive: true })
  const fileId = `import-${randomUUID()}`
  const safeStoredName = `${timestampPrefix()}-${fileId}-${originalName}`
  const outputPath = path.join(importDir, safeStoredName)
  const storedPath = path.relative(rootDir, outputPath)
  writeFileSync(outputPath, body)

  const db = openDatabase({ readOnly: false })

  try {
    const bundleId = requestedBundleId || findExistingImportBundleId(db, bundleTitle) || `bundle-${randomUUID()}`

    db.prepare(
      `
      INSERT INTO import_files (id, original_name, stored_path, file_type, content_role, bundle_id, bundle_title, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?)
      `,
    ).run(fileId, originalName, storedPath, fileType, contentRole, bundleId, bundleTitle, optionalString(input.note))

    return rowToImportFile(
      db.prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE id = ?
        `,
      ).get(fileId),
    )
  } finally {
    db.close()
  }
}

function createImportFileFromLocalPath(input) {
  const sourcePath = requiredString(input.filePath, 'filePath')
  const originalName = sanitizeFileName(optionalString(input.fileName) || path.basename(sourcePath))
  const fileType = inferImportFileType(originalName)
  const contentRole = requiredEnum(
    input.contentRole || 'question_with_analysis',
    ['question', 'answer_analysis', 'question_with_analysis', 'other'],
    'contentRole',
  )
  const bundleTitle = optionalString(input.bundleTitle) || originalName.replace(/\.[^.]+$/, '')
  const requestedBundleId = optionalString(input.bundleId)

  if (!['docx', 'pdf'].includes(fileType)) {
    throw new Error('Only DOCX and PDF files are supported for batch import')
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`source file not found: ${sourcePath}`)
  }

  const stats = statSync(sourcePath)
  if (!stats.isFile()) {
    throw new Error(`source path is not a file: ${sourcePath}`)
  }
  if (stats.size === 0) {
    throw new Error('file content is empty')
  }
  if (stats.size > 25_000_000) {
    throw new Error('file is too large; current limit is 25MB')
  }

  mkdirSync(importDir, { recursive: true })
  const fileId = `import-${randomUUID()}`
  const safeStoredName = `${timestampPrefix()}-${fileId}-${originalName}`
  const outputPath = path.join(importDir, safeStoredName)
  const storedPath = path.relative(rootDir, outputPath)
  copyFileSync(sourcePath, outputPath)

  const db = openDatabase({ readOnly: false })

  try {
    const bundleId = requestedBundleId || findExistingImportBundleId(db, bundleTitle) || `bundle-${randomUUID()}`

    db.prepare(
      `
      INSERT INTO import_files (id, original_name, stored_path, file_type, content_role, bundle_id, bundle_title, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?)
      `,
    ).run(
      fileId,
      originalName,
      storedPath,
      fileType,
      contentRole,
      bundleId,
      bundleTitle,
      optionalString(input.note) || `批量导入来源：${sourcePath}`,
    )

    return rowToImportFile(
      db.prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE id = ?
        `,
      ).get(fileId),
    )
  } finally {
    db.close()
  }
}

function updateImportBatchItemStatus(itemId, fields) {
  const db = openDatabase({ readOnly: false })

  try {
    db.prepare(
      `
      UPDATE import_batch_items
      SET
        status = ?,
        import_file_id = ?,
        bundle_id = ?,
        error_message = ?,
        updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(fields.status, fields.importFileId || '', fields.bundleId || '', fields.errorMessage || '', itemId)
  } finally {
    db.close()
  }
}

function runImportBatch(batchId, input = {}) {
  const parseDocx = input.parseDocx === undefined ? true : Boolean(input.parseDocx)
  const rawLimit = input.limit
  const importLimit =
    rawLimit === undefined || rawLimit === null || rawLimit === 'all' || rawLimit === ''
      ? 0
      : Number(rawLimit)

  if (importLimit < 0 || !Number.isFinite(importLimit) || !Number.isInteger(importLimit)) {
    throw new Error('limit must be a positive integer or omitted')
  }

  const db = openDatabase({ readOnly: false })
  const batch = getImportBatch(db, batchId)

  if (!batch) {
    db.close()
    return null
  }

  const allQueuedItems = batch.items.filter((item) => item.status === 'queued')
  const queuedItems = importLimit > 0 ? allQueuedItems.slice(0, importLimit) : allQueuedItems
  db.prepare("UPDATE import_batches SET status = 'importing', error_message = '', updated_at = datetime('now') WHERE id = ?").run(batchId)
  db.close()

  let imported = 0
  let parsed = 0
  let failed = 0

  for (const item of queuedItems) {
    try {
      const existingImportFile = findExistingImportFileForBatchItem(item)

      if (existingImportFile) {
        if (parseDocx && item.fileType === 'docx' && existingImportFile.status !== 'parsed') {
          parseImportFile(existingImportFile.id)
          parsed += 1
          updateImportBatchItemStatus(item.id, {
            status: 'parsed',
            importFileId: existingImportFile.id,
            bundleId: existingImportFile.bundleId,
          })
        } else {
          updateImportBatchItemStatus(item.id, {
            status: 'skipped',
            importFileId: existingImportFile.id,
            bundleId: existingImportFile.bundleId,
            errorMessage: '已存在同名资料，跳过重复导入。',
          })
        }
        continue
      }

      const importFile = createImportFileFromLocalPath({
        filePath: item.filePath,
        fileName: item.fileName,
        contentRole: item.contentRole,
        bundleTitle: item.bundleTitle,
        bundleId: item.bundleId,
        note: `批量导入 ${batch.title}：${item.filePath}`,
      })
      imported += 1
      updateImportBatchItemStatus(item.id, {
        status: 'imported',
        importFileId: importFile.id,
        bundleId: importFile.bundleId,
      })

      if (parseDocx && item.fileType === 'docx') {
        parseImportFile(importFile.id)
        parsed += 1
        updateImportBatchItemStatus(item.id, {
          status: 'parsed',
          importFileId: importFile.id,
          bundleId: importFile.bundleId,
        })
      }
    } catch (error) {
      failed += 1
      updateImportBatchItemStatus(item.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const finalDb = openDatabase({ readOnly: false })

  try {
    const finalStatus = failed > 0 ? 'partial' : ''
    updateImportBatchStats(finalDb, batchId, finalStatus)
    return getImportBatch(finalDb, batchId)
  } finally {
    finalDb.close()
  }
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function extractDocxTextWithOoxml(filePath) {
  const documentXml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], { encoding: 'utf8' })

  let normalStyleIndent = false
  try {
    const stylesXml = execFileSync('unzip', ['-p', filePath, 'word/styles.xml'], { encoding: 'utf8' })
    const normalStyleMatch = stylesXml.match(/<w:style[^>]*w:styleId="1"[^>]*>[\s\S]*?<w:ind[^>]*\/>/)
    if (normalStyleMatch) {
      normalStyleIndent = /w:firstLine(?:Chars)?="[1-9]/.test(normalStyleMatch[0])
    }
  } catch {
    // styles.xml may not exist.
  }

  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map(([paragraphXml]) => {
      const textContent =
        paragraphXml
          .replace(/<w:(?:tab|cr|br)\b[^>]*\/>/g, '\n')
          .match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)
          ?.map((textNode) => decodeXmlEntities(textNode.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '')))
          .join('') || ''
      const trimmed = textContent.replace(/\u00a0/g, ' ').trim()
      if (!trimmed) return ''

      const pPrMatch = paragraphXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
      let shouldIndent = false
      if (pPrMatch) {
        const indMatch = pPrMatch[0].match(/<w:ind[^>]*>/)
        if (indMatch) {
          const firstLineMatch = indMatch[0].match(/w:firstLine(?:Chars)?="(\d+)"/)
          if (firstLineMatch && Number(firstLineMatch[1]) > 0) {
            shouldIndent = true
          }
        } else if (normalStyleIndent) {
          const styleRef = pPrMatch[0].match(/<w:pStyle[^>]*w:val="(\d+)"/)
          if (!styleRef || styleRef[1] === '1') {
            shouldIndent = true
          }
        }
      } else if (normalStyleIndent) {
        shouldIndent = true
      }

      if (shouldIndent && trimmed.length > 15 && !/^[A-H][.．、]|^\d{1,2}[.．、]|^第[一二三四五六七八九十]|^[一二三四五六七八九十][、．]/.test(trimmed)) {
        return `\u3000\u3000${trimmed}`
      }

      return trimmed
    })
    .filter(Boolean)

  return paragraphs.join('\n')
}

function extractDocxText(filePath) {
  const ooxmlText = extractDocxTextWithOoxml(filePath)
  if (ooxmlText) {
    return {
      parser: 'ooxml-document-xml',
      text: ooxmlText,
    }
  }

  try {
    const text = execFileSync('pandoc', [filePath, '--to=plain', '--wrap=none'], {
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    })
      .replace(/\r\n?/g, '\n')
      .trim()

    if (text) {
      return {
        parser: 'pandoc-docx-plain',
        text,
      }
    }
  } catch {
    // Fall through.
  }

  return {
    parser: 'pandoc-docx-plain',
    text: '',
  }
}

function countTextLines(text) {
  return String(text || '').split('\n').filter((line) => line.trim()).length
}

function upsertImportFileParse(db, importFileId, parse) {
  const existing = db.prepare('SELECT id FROM import_file_texts WHERE import_file_id = ?').get(importFileId)
  const parseId = existing?.id || `import-text-${randomUUID()}`

  db.prepare(
    `
    INSERT INTO import_file_texts (
      id,
      import_file_id,
      parser,
      extracted_text,
      line_count,
      char_count,
      status,
      error_message,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(import_file_id) DO UPDATE SET
      parser = excluded.parser,
      extracted_text = excluded.extracted_text,
      line_count = excluded.line_count,
      char_count = excluded.char_count,
      status = excluded.status,
      error_message = excluded.error_message,
      updated_at = datetime('now')
    `,
  ).run(
    parseId,
    importFileId,
    parse.parser,
    parse.extractedText,
    parse.lineCount,
    parse.charCount,
    parse.status,
    parse.errorMessage,
  )

  return db.prepare('SELECT * FROM import_file_texts WHERE import_file_id = ?').get(importFileId)
}

function getImportFileParse(id) {
  const db = openDatabase()

  try {
    return rowToImportFileParse(db.prepare('SELECT * FROM import_file_texts WHERE import_file_id = ?').get(id))
  } finally {
    db.close()
  }
}

function parseImportFile(id) {
  const db = openDatabase({ readOnly: false })

  try {
    const importFile = db.prepare('SELECT * FROM import_files WHERE id = ?').get(id)
    if (!importFile) return null

    const filePath = path.join(rootDir, importFile.stored_path)
    if (!existsSync(filePath)) {
      throw new Error(`Imported file missing at ${importFile.stored_path}`)
    }
    if (importFile.file_type !== 'docx') {
      throw new Error('Only DOCX text extraction is supported in this step')
    }

    const extracted = extractDocxText(filePath)
    const text = extracted.text.trim()
    const parse = {
      parser: extracted.parser,
      extractedText: text,
      lineCount: countTextLines(text),
      charCount: text.length,
      status: 'succeeded',
      errorMessage: '',
    }

    db.exec('BEGIN')
    const row = upsertImportFileParse(db, id, parse)
    db.prepare("UPDATE import_files SET status = 'parsed' WHERE id = ?").run(id)
    db.exec('COMMIT')
    return rowToImportFileParse(row)
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failures so the original error can be reported.
    }
    throw error
  } finally {
    db.close()
  }
}

function deleteImportFile(id) {
  const db = openDatabase({ readOnly: false })

  try {
    const importFile = db.prepare('SELECT * FROM import_files WHERE id = ?').get(id)
    if (!importFile) return null

    db.exec('BEGIN')
    db.prepare('DELETE FROM import_file_texts WHERE import_file_id = ?').run(id)
    db.prepare('DELETE FROM import_batch_items WHERE import_file_id = ?').run(id)
    db.prepare('DELETE FROM import_files WHERE id = ?').run(id)
    db.exec('COMMIT')

    const filePath = path.join(rootDir, importFile.stored_path)
    try {
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch {
      // File may already be gone.
    }

    return { id }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw error
  } finally {
    db.close()
  }
}
