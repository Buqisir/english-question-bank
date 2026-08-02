import {
  extractDocxDocumentText,
} from '../../../server/paper-canonical/docxSourceAdapter.mjs'
import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { buildGroups } from '../../../scripts/import-pipeline/lib.mjs'
import {
  makeReadyCanonicalFixture,
} from '../../paper-canonical/foundationFixture.mjs'

const PAPER_ID = 'paper-2025-i'

function contentText(nodeId, text) {
  return [{ kind: 'text', nodeId, text: String(text || '') }]
}

function markerNumber(question) {
  return String(question.questionNo || question.stem || '')
}

function paragraphBlocks(rawGroup, blankIds = []) {
  const blankIdByNumber = new Map((rawGroup.questions || []).map((question, index) => [
    markerNumber(question),
    blankIds[index],
  ]))
  const markerPattern = rawGroup.groupType === 'sevenChoices'
    ? new RegExp(`(?<!\\d)(${(rawGroup.questions || []).map(markerNumber).join('|')})(?!\\d)`, 'g')
    : /__(\d+)__/g
  return (rawGroup.paragraphs || []).map((paragraph, index) => {
    const inlines = []
    const text = String(paragraph.text || '')
    let cursor = 0
    let match
    while ((match = markerPattern.exec(text)) !== null) {
      if (match.index > cursor) {
        inlines.push({
          kind: 'text',
          nodeId: `text:${paragraph.id || rawGroup.groupId}:${cursor}`,
          text: text.slice(cursor, match.index),
        })
      }
      const blankId = blankIdByNumber.get(match[1])
      inlines.push(blankId
        ? { kind: 'blank_ref', nodeId: `blank-ref:${blankId}`, blankId }
        : {
            kind: 'text',
            nodeId: `text:${paragraph.id || rawGroup.groupId}:${match.index}`,
            text: match[0],
          })
      cursor = match.index + match[0].length
    }
    if (cursor < text.length || inlines.length === 0) {
      inlines.push({
        kind: 'text',
        nodeId: `text:${paragraph.id || rawGroup.groupId}:${cursor || index}`,
        text: text.slice(cursor),
      })
    }
    return {
      kind: 'paragraph',
      nodeId: paragraph.id || `paragraph:${rawGroup.groupId}:${index + 1}`,
      inlines,
    }
  })
}

function replaceIdentity(value, replacements) {
  if (Array.isArray(value)) return value.map((item) => replaceIdentity(item, replacements))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      replaceIdentity(item, replacements),
    ]))
  }
  if (typeof value !== 'string') return value
  return replacements.reduce(
    (result, [before, after]) => result.replaceAll(before, after),
    value,
  )
}

function wordTarget(rawText, label) {
  const match = new RegExp(`${label}词数应为\\s*(\\d+)\\s*个左右`).exec(rawText)
  if (!match) throw new Error(`DOCX source lacks ${label} word-count instruction`)
  return Number(match[1])
}

function hydrateSevenChoiceBank(parsed, rawText) {
  const title = parsed.seven.paragraphs[0]?.text
  const start = typeof title === 'string' ? rawText.indexOf(title) : -1
  const answerStart = start >= 0 ? rawText.indexOf('【答案】[[', start) : -1
  if (start < 0 || answerStart < 0) {
    throw new Error('DOCX source lacks a bounded seven-choices option bank')
  }
  const options = [...rawText.slice(start, answerStart).matchAll(
    /(?:^|\n)[ \t　]*([A-G])[．.]\s*([^\n]+)/g,
  )].map((match) => ({ label: match[1], text: match[2].trim() }))
  if (
    options.length !== 7
    || options.map((option) => option.label).join('') !== 'ABCDEFG'
  ) {
    throw new Error('DOCX source seven-choices bank is incomplete')
  }
  parsed.seven.optionBank = options
}

function inactiveListeningProof(rawText, source) {
  const listeningStart = rawText.indexOf('一、听力选择题')
  const readingStart = rawText.indexOf('二、阅读理解')
  if (listeningStart < 0 || readingStart <= listeningStart) {
    throw new Error('DOCX source lacks a bounded NCK1 listening section')
  }
  const answers = [...rawText.slice(listeningStart, readingStart).matchAll(
    /【答案】\s*([ABC])/g,
  )].map((match) => match[1])
  if (answers.length !== 20) {
    throw new Error(`DOCX source listening answer count is ${answers.length}, expected 20`)
  }
  const closures = source.inactiveSourceClosures.map((closure) => ({
    slotId: closure.slotId,
    questionCount: closure.questionCount,
    officialAnswerCount: closure.officialAnswerCount,
    optionLabels: closure.optionLabels.join(''),
  }))
  const expected = [
    {
      slotId: 'listening.short-dialogue',
      questionCount: 5,
      officialAnswerCount: answers.slice(0, 5).length,
      optionLabels: 'ABC',
    },
    {
      slotId: 'listening.long-form',
      questionCount: 15,
      officialAnswerCount: answers.slice(5).length,
      optionLabels: 'ABC',
    },
  ]
  if (JSON.stringify(closures) !== JSON.stringify(expected)) {
    throw new Error('DOCX source inactive listening closure does not match raw answer evidence')
  }
  return expected
}

function rawGroupsBySlot(parsed) {
  return new Map([
    ...parsed.readingGroups.map((group, index) => [`reading.${'abcd'[index]}`, group]),
    ['reading.seven-choices', parsed.seven],
    ['language.cloze', parsed.cloze],
    ['language.grammar-fill', parsed.grammar],
    ['writing.application', parsed.application],
    ['writing.continuation', parsed.continuation],
  ])
}

function optionContent(groupId, questionId, options) {
  return Object.entries(options || {}).map(([label, text]) => ({
    optionId: `option:${questionId}:${label}`,
    label,
    content: contentText(`text:${groupId}:${questionId}:option:${label}`, text),
  }))
}

function exactSourceFromParsedDocx(parsed, rawText) {
  const fixture = makeReadyCanonicalFixture()
  const bySlot = rawGroupsBySlot(parsed)
  const replacements = [[fixture.source.paperId, PAPER_ID]]
  for (const sourceGroup of fixture.source.groups) {
    const rawGroup = bySlot.get(sourceGroup.slotId)
    if (!rawGroup || sourceGroup.questionIds.length !== rawGroup.questions.length) {
      throw new Error(`DOCX source does not satisfy ${sourceGroup.slotId} cardinality`)
    }
    replacements.push([sourceGroup.groupId, rawGroup.groupId])
    sourceGroup.questionIds.forEach((questionId, index) => {
      replacements.push([questionId, rawGroup.questions[index].id])
    })
    if ((sourceGroup.blankIds || []).length !== (rawGroup.blankIds || []).length) {
      throw new Error(`DOCX source does not satisfy ${sourceGroup.slotId} blank cardinality`)
    }
    sourceGroup.blankIds.forEach((blankId, index) => {
      replacements.push([blankId, rawGroup.blankIds[index]])
    })
    if (sourceGroup.variant.writingTaskId) {
      replacements.push([
        sourceGroup.variant.writingTaskId,
        `writing-task:${rawGroup.groupId}`,
      ])
    }
  }
  replacements.sort(([left], [right]) => right.length - left.length)
  const source = replaceIdentity(fixture.source, replacements)
  for (const closure of source.inactiveSourceClosures) {
    const { closureDigest: _closureDigest, ...closureBase } = closure
    closure.closureDigest = digestJson(closureBase)
  }
  for (const sourceGroup of source.groups) {
    const rawGroup = bySlot.get(sourceGroup.slotId)
    if (sourceGroup.family === 'reading') {
      sourceGroup.content = { blocks: paragraphBlocks(rawGroup) }
      sourceGroup.variant.questions = rawGroup.questions.map((question) => ({
        questionId: question.id,
        stem: contentText(`text:${question.id}:stem`, question.stem),
        correctOptionId: `option:${question.id}:${question.answerKey}`,
      }))
      sourceGroup.variant.choiceOwnership = {
        ownership: 'per_question',
        sets: rawGroup.questions.map((question) => ({
          questionId: question.id,
          options: optionContent(rawGroup.groupId, question.id, question.options),
        })),
      }
    } else if (sourceGroup.family === 'seven-choices') {
      sourceGroup.content = {
        blocks: paragraphBlocks(rawGroup, sourceGroup.blankIds),
      }
      sourceGroup.variant.choiceOwnership = {
        ownership: 'shared_bank',
        bankId: `bank:${sourceGroup.groupId}`,
        options: rawGroup.optionBank.map((option) => ({
          optionId: `option:${option.label}`,
          label: option.label,
          content: contentText(
            `text:${sourceGroup.groupId}:option:${option.label}`,
            option.text,
          ),
        })),
      }
      sourceGroup.variant.members = rawGroup.questions.map((question, index) => ({
        questionId: question.id,
        blankId: sourceGroup.blankIds[index],
        answer: {
          optionId: `option:${question.answerKey}`,
          authorityAssertionRef: `answer:${question.id}`,
        },
      }))
    } else if (sourceGroup.family === 'cloze') {
      sourceGroup.content = {
        blocks: paragraphBlocks(rawGroup, sourceGroup.blankIds),
      }
      sourceGroup.variant.choiceOwnership = {
        ownership: 'per_question',
        sets: rawGroup.questions.map((question) => ({
          questionId: question.id,
          options: optionContent(rawGroup.groupId, question.id, question.options),
        })),
      }
    } else if (sourceGroup.family === 'grammar-fill') {
      sourceGroup.content = {
        blocks: paragraphBlocks(rawGroup, sourceGroup.blankIds),
      }
      sourceGroup.variant.promptBindings = sourceGroup.blankIds.map((blankId) => ({
        blankId,
        provision: 'source_proven_none',
        authorityObservationRef: `observation:grammar-fill-prompt:${blankId}`,
      }))
    } else if (sourceGroup.family === 'application-writing') {
      const instruction = rawGroup.paragraphs
        .map((paragraph) => paragraph.text)
        .join('\n')
      sourceGroup.content.blocks[0].inlines = contentText(
        sourceGroup.content.blocks[0].inlines[0].nodeId,
        instruction,
      )
      sourceGroup.variant.wordCountRuling.target = wordTarget(rawText, '写作')
    } else if (sourceGroup.family === 'continuation-writing') {
      const [material, ...starters] = sourceGroup.content.blocks
      material.inlines = contentText(
        material.inlines[0].nodeId,
        rawGroup.paragraphs.map((paragraph) => paragraph.text).join('\n'),
      )
      starters.forEach((starter, index) => {
        starter.inlines = contentText(
          starter.inlines[0].nodeId,
          rawGroup.continuationStarters[index],
        )
      })
      sourceGroup.variant.wordCountRuling.target = wordTarget(rawText, '续写')
    }
  }
  for (const assertion of source.assertions) {
    const rawQuestion = [
      ...parsed.readingGroups.flatMap((group) => group.questions),
      ...parsed.seven.questions,
      ...parsed.cloze.questions,
      ...parsed.grammar.questions,
    ].find((question) => question.id === assertion.questionId)
    if (!rawQuestion?.answerKey) {
      throw new Error(`DOCX source lacks official answer for ${assertion.questionId}`)
    }
    assertion.answer = rawQuestion.answerKey
  }
  return source
}

/**
 * Derive the NCK1 proof source exclusively from the raw answer-edition DOCX.
 * The compiler receives only its raw DOCX and the generic source envelope.
 */
export function makePaper2025IDocxSourceProof(docxBytes) {
  const rawText = extractDocxDocumentText(docxBytes)
  const parsed = buildGroups(rawText, PAPER_ID)
  hydrateSevenChoiceBank(parsed, rawText)
  const source = exactSourceFromParsedDocx(parsed, rawText)
  const inactiveListening = inactiveListeningProof(rawText, source)
  const digest = sha256(docxBytes)
  source.profileInstructionSourceDigest = digest
  for (const observation of source.observations) {
    observation.documentInputKey = 'source_docx'
    observation.span = { start: 0, end: docxBytes.byteLength }
    observation.extraction = {
      adapterId: 'docx-source-envelope',
      version: '1',
    }
  }
  return {
    source,
    rawTextDigest: sha256(new TextEncoder().encode(rawText)),
    familyCounts: {
      reading: parsed.readingGroups.length,
      'seven-choices': 1,
      cloze: 1,
      'grammar-fill': 1,
      'application-writing': 1,
      'continuation-writing': 1,
    },
    inactiveListening,
    officialAnswerCount: [
      ...parsed.readingGroups.flatMap((group) => group.questions),
      ...parsed.seven.questions,
      ...parsed.cloze.questions,
      ...parsed.grammar.questions,
    ].length,
  }
}
