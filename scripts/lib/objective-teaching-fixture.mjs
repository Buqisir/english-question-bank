import {
  answerCompletedSentence,
  selectedSentenceAnswer,
} from '../../server/paper-import-ai/analyzerProviderShell.mjs'

const FIXTURE_PREFIX = 'Fixture context '
const FIXTURE_TRANSLATION = '用于验证教学标注的合成译文。'

function codePointLength(value) {
  return Array.from(value).length
}

function codePointIndexOf(value, quote) {
  return codePointLength(value.slice(0, value.indexOf(quote)))
}

function sourceParagraphForQuestion(group, question) {
  const marker = `__${question.stem}__`
  return group.paragraphs.find(({ id }) => id === `objective-fixture:${question.blankId}`)
    || group.paragraphs.find(({ text }) => text.includes(marker))
}

export function addObjectiveTeachingFixtureParagraphs(group) {
  const existingIds = new Set(group.paragraphs.map(({ id }) => id))
  for (const question of group.questions) {
    if (!question.blankId) continue
    const id = `objective-fixture:${question.blankId}`
    if (!existingIds.has(id)) {
      group.paragraphs.push({
        id,
        text: `${FIXTURE_PREFIX}__${question.stem}__ fixture end.`,
      })
    }
  }
  return group
}

/** Builds complete synthetic provider output without weakening production admission. */
export function buildObjectiveTeachingFixture(group, {
  sourceAssetVersion = 1,
  translation = FIXTURE_TRANSLATION,
} = {}) {
  const sourceTextId = `source:${group.groupId}`
  const translationTextId = `translation:${group.groupId}`
  const translationParagraphId = `translation-paragraph:${group.groupId}`
  const questionIds = group.questions.map(({ id }) => id)
  const blankQuestions = group.questions.filter(({ blankId }) => blankId)
  const insertionByQuestionId = new Map()
  const completedSourceTexts = blankQuestions.map((question) => {
    const paragraph = sourceParagraphForQuestion(group, question)
    return {
      textId: `completed:${question.blankId}`,
      paragraphId: paragraph.id,
      text: answerCompletedSentence(paragraph.text, group, {
        onInsertion: (insertion) => insertionByQuestionId.set(insertion.questionId, insertion),
      }),
    }
  })
  const evidenceAnnotations = group.questions.map((question) => {
    const paragraph = question.blankId
      ? sourceParagraphForQuestion(group, question)
      : group.paragraphs[0]
    const quote = question.blankId ? `__${question.stem}__` : paragraph.text.slice(0, 1)
    const start = codePointIndexOf(paragraph.text, quote)
    return {
      annotationId: `evidence:${question.id}`,
      kind: 'answer-evidence',
      questionIds: [question.id],
      sourceRanges: [{
        textId: sourceTextId,
        paragraphId: paragraph.id,
        start,
        end: start + codePointLength(quote),
        quote,
      }],
      translationRanges: [{
        textId: translationTextId,
        paragraphId: translationParagraphId,
        start: 0,
        end: codePointLength(translation),
        quote: translation,
      }],
    }
  })
  const insertionAnnotations = blankQuestions.map((question) => {
    const completed = completedSourceTexts.find(({ textId }) =>
      textId === `completed:${question.blankId}`)
    const insertion = insertionByQuestionId.get(question.id)
    const quote = insertion.quote
    const start = insertion.start
    return {
      annotationId: `insertion:${question.id}`,
      kind: 'answer-insertion',
      questionIds: [question.id],
      blankId: question.blankId,
      sourceRanges: [{
        textId: completed.textId,
        paragraphId: completed.paragraphId,
        start,
        end: start + codePointLength(quote),
        quote,
      }],
      translationRanges: [{
        textId: translationTextId,
        paragraphId: translationParagraphId,
        start: 0,
        end: codePointLength(translation),
        quote: translation,
      }],
    }
  })
  const selectedParagraph = blankQuestions.length > 0
    ? sourceParagraphForQuestion(group, blankQuestions[0])
    : group.paragraphs[0]
  const selectedDisplayText = answerCompletedSentence(selectedParagraph.text, group)
  const selectedUnderline = blankQuestions.length > 0
    ? selectedSentenceAnswer(blankQuestions[0], group)
    : selectedDisplayText.slice(0, 1)
  const underlineStart = codePointIndexOf(selectedDisplayText, selectedUnderline)
  const sentenceId = `sentence:${group.groupId}`
  const structureTextId = blankQuestions.length > 0
    ? `completed:${blankQuestions[0].blankId}`
    : sourceTextId

  return {
    fullTranslationZh: translation,
    selectedLongSentences: [{
      sentenceId,
      paragraphId: selectedParagraph.id,
      sourceText: selectedParagraph.text,
      displayText: selectedDisplayText,
      relatedQuestionIds: questionIds,
      translationZh: translation,
      analysisZh: '合成夹具用于验证长难句结构关系。',
      underlineRanges: [{
        start: underlineStart,
        end: underlineStart + codePointLength(selectedUnderline),
        quote: selectedUnderline,
      }],
    }],
    teachingContent: {
      schemaVersion: 'objective-teaching-content-v1',
      sourceTextId,
      sourceAssetVersion,
      translation: {
        textId: translationTextId,
        legacyField: 'fullTranslationZh',
        paragraphs: [{
          paragraphId: translationParagraphId,
          sourceParagraphIds: group.paragraphs.map(({ id }) => id),
          start: 0,
          end: codePointLength(translation),
          quote: translation,
        }],
      },
      completedSourceTexts,
      annotations: [
        ...evidenceAnnotations,
        ...insertionAnnotations,
        {
          annotationId: `structure:${group.groupId}`,
          kind: 'sentence-structure',
          questionIds,
          selectedSentenceId: sentenceId,
          sourceRanges: [{
            textId: structureTextId,
            paragraphId: selectedParagraph.id,
            start: 0,
            end: codePointLength(selectedDisplayText),
            quote: selectedDisplayText,
          }],
          translationRanges: [{
            textId: translationTextId,
            paragraphId: translationParagraphId,
            start: 0,
            end: codePointLength(translation),
            quote: translation,
          }],
        },
      ],
    },
  }
}
