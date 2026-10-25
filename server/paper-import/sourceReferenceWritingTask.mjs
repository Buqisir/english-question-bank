// Pure task recognition shared by extraction and independent admission.
// These helpers are extracted unchanged from ocr-proofread; no CLI, I/O or
// sidecar claims participate in recognizing confirmed source headings.
import { computeLineFacts } from '../../scripts/import-pipeline/ocr-line-facts.mjs'
import { createWritingScope } from '../../scripts/import-pipeline/ocr-section-state.mjs'
import { ANSWER_EXPLANATION_START, scoredWritingRubricTask } from './sourceReferenceWritingRules.mjs'
import { matchesLineRole, firstLineRole, inlineSampleParts, bareSectionNumber,
  writingSectionText } from '../../scripts/import-pipeline/ocr-line-roles.mjs'

// OCR can keep a bare or named section on the writing-part heading's item.
export function writingSectionAfterPart(text) {
  const normalized = String(text).normalize('NFKC')
  if (!matchesLineRole('writing.part', computeLineFacts({ text: normalized }))) return null
  const rest = normalized.replace(/^第[三四]部分\s*[:：]?\s*写作\s*(?:\([^)]*\))?/u, '').trim()
  const number = bareSectionNumber(rest)
  return number ? (number === '一' ? 'application' : 'continuation')
    : firstLineRole('writing-section', computeLineFacts({ text: rest }))?.value || null
}

// A standalone key can omit both the writing-part heading and sample label.
// Admit only a complete letter immediately after its final objective answer;
// never borrow a closing/signature across another section, prompt or transcript.
function completeApplicationLetter(lines, index, lastQuestion, factsFor) {
  if (!lastQuestion || bareSectionNumber(factsFor(lines[index]).nfkc) !== '一') return false
  const previous = lines[index - 1] && factsFor(lines[index - 1])
  if (!previous || !/^\d+\s*[.．、]\s*[A-Za-z]/u.test(previous.text) || previous.hasHan) return false
  const answers = [...previous.text.matchAll(/(?:^|\s)(\d+)\s*[.．、]\s*/gu)]
  if (Number(answers.at(-1)?.[1]) !== lastQuestion) return false
  return completeSourceLetter(lines, index + 1, factsFor)
}

export function completeSourceLetter(lines, index, factsFor) {
  const salutation = lines[index] && factsFor(lines[index])
  if (!salutation || !matchesLineRole('paragraph.salutation', salutation)) return false
  const boundary = line => {
    const facts = factsFor(line)
    return line.figure || line.table || bareSectionNumber(facts.nfkc)
      || firstLineRole('writing-section', facts) || firstLineRole('scoring-section', facts)
      || firstLineRole('entry-label', facts) || matchesLineRole('writing.part-boundary', facts)
      || matchesLineRole('writing.explanations', facts, { sectionCount: 1 })
      || matchesLineRole('writing.continuation-prompt', facts)
      || matchesLineRole('paragraph.numbered', facts) || matchesLineRole('transcript.speaker', facts)
      || matchesLineRole('writing.student-script', facts) || /^\d+\s*[.．、)]/u.test(facts.trimmed)
  }
  let body = ''
  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i]
    if (boundary(line)) return false
    const facts = factsFor(line)
    if (matchesLineRole('paragraph.closing', facts)) {
      const signature = lines[i + 1]
      const complete = /[.!?]["”']?\s*$/u.test(body) && Boolean(signature)
        && !boundary(signature)
        && /^\p{Lu}[\p{Script=Latin}’'-]*\.?(?:\s+\p{Lu}[\p{Script=Latin}’'-]*\.?){0,3}$/u.test(factsFor(signature).trimmed)
        && (!lines[i + 2] || Boolean(boundary(lines[i + 2])))
      return complete ? { end: signature } : null
    }
    // A date can wrap onto its own OCR line ("May" / "30th.").
    const wrappedDate = body && /^(?:[1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b/iu.test(facts.trimmed)
    if (facts.hasHan || (!facts.startsEnglishOrQuote && !wrappedDate)
      || matchesLineRole('paragraph.salutation', facts)) return false
    body += ` ${facts.text}`
  }
  return false
}

// Recognition priority is the producer's: contextual bare section, otherwise
// a complete named/numbered task; a task rubric takes priority over both.
// Lifecycle boundaries, scoring-appendix reopening and output assembly remain
// with the caller. A writing-part heading alone does not establish a task.
export function sourceReferenceWritingTaskHeading(lines, lineIndex, {
  inWriting = false, sectionCount = 0, lastObjectiveQuestion = 0,
  answerRole = 'official_answers', factsFor = computeLineFacts,
} = {}) {
  const line = lines[lineIndex]
  const facts = factsFor(line)
  const inlineSample = inlineSampleParts(facts.text)
  const [heading, ...rest] = inlineSample || facts.text.split('\n')
  const sectionText = writingSectionText(facts, heading, rest, inWriting)
  const mergedText = rest.length === 1 ? rest[0].trim() : null
  const mergedLabel = mergedText && matchesLineRole('entry.sample-label', computeLineFacts({ text: mergedText })) ? mergedText : null
  const unlabeledApplicationLetter = answerRole === 'official_answers' && !sectionCount && !inWriting
    && completeApplicationLetter(lines, lineIndex, lastObjectiveQuestion, factsFor)
  const bare = (inWriting || mergedLabel || unlabeledApplicationLetter || (lines[lineIndex + 1]
    && matchesLineRole('entry.sample-label', factsFor(lines[lineIndex + 1]))))
    && bareSectionNumber((mergedLabel ? heading : sectionText).normalize('NFKC'))
  const started = bare ? (bare === '一' ? 'application' : 'continuation')
    : firstLineRole('writing-section', facts)?.value
  const scoringSection = firstLineRole('scoring-section', facts)?.value
  return { bare, started, scoringSection, mergedLabel, unlabeledApplicationLetter }
}

export function sourceReferenceLastObjectiveQuestion(materialization) {
  return Math.max(0, ...(materialization.groups ?? [])
    .flatMap(group => group.writingTask ? [] : (group.questions || []).map(question => question.sourceNumber))
    .filter(Number.isInteger))
}

// Replay producer task/part lifecycle for independent essay ownership. Scoring
// appendices keep their own scopes and cannot revive essays after explanations.
export function sourceReferenceEssayTaskScopes(confirmation, answerIds, materialization) {
  const result = new Map()
  const lastObjectiveQuestion = sourceReferenceLastObjectiveQuestion(materialization)
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    const sections = new Map()
    const scope = createWritingScope(sections)
    const lines = document.pages.flatMap(page => page.orderedItems)
    const answerRole = materialization.documents.find(item => item.documentId === document.documentId)?.role
    let afterListening = false, scoringAppendix = false
    for (const [index, line] of lines.entries()) {
      const facts = computeLineFacts(line)
      if (scope.ended || (sections.size && ANSWER_EXPLANATION_START.test(facts.text))) {
        scope.end()
        result.set(line.itemId, null)
        continue
      }
      const appendixTask = afterListening && scoredWritingRubricTask(line.text, lines[index + 1]?.text)
      if (afterListening && (firstLineRole('scoring-overview', facts) || appendixTask)) {
        scope.enterPart(false)
        if (appendixTask) scope.startTask(appendixTask, { reuse: true })
        afterListening = false
        scoringAppendix = true
        result.set(line.itemId, null)
        continue
      }
      if (firstLineRole('listening-boundary', facts)) {
        scope.enterPart(false)
        afterListening = true
        scoringAppendix = false
        result.set(line.itemId, null)
        continue
      }
      const { started, scoringSection } = sourceReferenceWritingTaskHeading(lines, index, {
        inWriting: scope.inWriting, sectionCount: sections.size, lastObjectiveQuestion, answerRole,
      })
      if (scoringSection || started) scope.startTask(scoringSection || started)
      else if (matchesLineRole('writing.omission', facts, { inWriting: scope.inWriting, current: scope.current })) scope.omit()
      else if (firstLineRole('part-boundary', facts)) {
        const omittedWritingPart = matchesLineRole('writing.bare-fourth-part', facts)
          && lines[index + 1] && matchesLineRole('writing.omission', computeLineFacts(lines[index + 1]), { inWriting: true })
        scope.enterPart(matchesLineRole('writing.part', facts) || omittedWritingPart, writingSectionAfterPart(line.text))
      }
      result.set(line.itemId, scoringAppendix ? null : scope.current?.taskType ?? null)
    }
  }
  return result
}
