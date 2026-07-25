const CANONICAL_SCHEMA_VERSION = 'canonical-paper-group-v1'

function issue(code, path, message) {
  return { code, path, message }
}

function needsReview(issues) {
  return { status: 'needs_review', issues }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers are not supported')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${entries.join(',')}}`
  }
  throw new TypeError(`Unsupported value type: ${typeof value}`)
}

// Browser-safe SHA-256 keeps this pure module usable by both Node and Vite.
function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const constants = []
  const initial = []
  for (let candidate = 2; constants.length < 64; candidate++) {
    let prime = true
    for (let factor = 2; factor * factor <= candidate; factor++) {
      if (candidate % factor === 0) {
        prime = false
        break
      }
    }
    if (!prime) continue
    if (initial.length < 8) {
      initial.push((Math.sqrt(candidate) % 1) * 0x100000000 >>> 0)
    }
    constants.push((Math.cbrt(candidate) % 1) * 0x100000000 >>> 0)
  }

  const hash = initial
  const words = new Uint32Array(64)
  const rotateRight = (word, bits) => (word >>> bits) | (word << (32 - bits))

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index++) {
      const word15 = words[index - 15]
      const word2 = words[index - 2]
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3)
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choose + constants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}

function scanClozeParagraph(paragraph, paragraphIndex) {
  const sourcePath = `group.passage.paragraphs[${paragraphIndex}].text`
  const issues = []
  const markers = []
  const longDialectSpans = []
  const shortDialectSpans = []
  const longDialectPattern = /(?=(_____(\d+)_____))/g
  const shortDialectPattern = /(?=(__(\d+)__))/g
  let dialectMatch
  while ((dialectMatch = longDialectPattern.exec(paragraph.text)) !== null) {
    longDialectSpans.push({
      questionNo: Number(dialectMatch[2]),
      start: dialectMatch.index,
      end: dialectMatch.index + dialectMatch[1].length,
    })
    longDialectPattern.lastIndex = dialectMatch.index + 1
  }
  while ((dialectMatch = shortDialectPattern.exec(paragraph.text)) !== null) {
    shortDialectSpans.push({
      questionNo: Number(dialectMatch[2]),
      start: dialectMatch.index,
      end: dialectMatch.index + dialectMatch[1].length,
    })
    shortDialectPattern.lastIndex = dialectMatch.index + 1
  }
  const dialectSpans = [
    ...longDialectSpans,
    ...shortDialectSpans.filter(
      (shortSpan) =>
        !longDialectSpans.some(
          (longSpan) =>
            shortSpan.questionNo === longSpan.questionNo &&
            shortSpan.start >= longSpan.start &&
            shortSpan.end <= longSpan.end,
        ),
    ),
  ].sort((left, right) => left.start - right.start || right.end - left.end)
  for (let index = 1; index < dialectSpans.length; index++) {
    const previous = dialectSpans[index - 1]
    const current = dialectSpans[index]
    if (current.start < previous.end) {
      issues.push(
        issue(
          'OVERLAPPING_SOURCE_SPAN',
          sourcePath,
          `Cloze marker spans overlap at ${current.start}-${previous.end}`,
        ),
      )
      issues.push(
        issue(
          'AMBIGUOUS_MARKER',
          sourcePath,
          `Cloze marker text has more than one overlapping interpretation`,
        ),
      )
    }
  }

  const candidatePattern = /_+\s*\d+\s*_+/g
  let candidate

  while ((candidate = candidatePattern.exec(paragraph.text)) !== null) {
    const raw = candidate[0]
    const shortMatch = /^__([1-9]\d{0,2})__$/.exec(raw)
    const longMatch = /^_____([1-9]\d{0,2})_____$/.exec(raw)
    const supportedMatch = shortMatch || longMatch
    if (!supportedMatch) {
      issues.push(
        issue(
          'UNSUPPORTED_MARKER',
          sourcePath,
          `Unsupported cloze marker ${JSON.stringify(raw)} at ${candidate.index}`,
        ),
      )
      continue
    }
    markers.push({
      questionNo: Number(supportedMatch[1]),
      raw,
      sourcePath,
      start: candidate.index,
      end: candidate.index + raw.length,
      paragraphId: paragraph.paragraphId,
      paragraphIndex,
    })
  }

  const underscoreRunPattern = /_{2,}/g
  let underscoreRun
  while ((underscoreRun = underscoreRunPattern.exec(paragraph.text)) !== null) {
    const runStart = underscoreRun.index
    const runEnd = runStart + underscoreRun[0].length
    const belongsToSupportedMarker = markers.some(
      (marker) => marker.start <= runStart && marker.end >= runEnd,
    )
    if (!belongsToSupportedMarker) {
      issues.push(
        issue(
          'UNSUPPORTED_MARKER',
          sourcePath,
          `Unsupported underscore marker run at ${runStart}-${runEnd}`,
        ),
      )
    }
  }

  return { issues, markers }
}

function validateInput(input) {
  const issues = []
  if (!isRecord(input)) {
    return [issue('INVALID_INPUT', '$', 'Input must be an object')]
  }
  if (typeof input.paperId !== 'string' || input.paperId.length === 0) {
    issues.push(issue('INVALID_INPUT', 'paperId', 'paperId must be a non-empty string'))
  }
  if (
    (typeof input.sourceAssetVersion !== 'string' &&
      typeof input.sourceAssetVersion !== 'number') ||
    input.sourceAssetVersion === '' ||
    (typeof input.sourceAssetVersion === 'number' &&
      !Number.isFinite(input.sourceAssetVersion))
  ) {
    issues.push(
      issue(
        'INVALID_INPUT',
        'sourceAssetVersion',
        'sourceAssetVersion must be a non-empty string or a number',
      ),
    )
  }
  if (!isRecord(input.group)) {
    issues.push(issue('INVALID_INPUT', 'group', 'group must be an object'))
  }
  if (!isRecord(input.questions)) {
    issues.push(issue('INVALID_INPUT', 'questions', 'questions must be an object'))
  }
  if (input.blanks !== undefined && !isRecord(input.blanks)) {
    issues.push(issue('INVALID_INPUT', 'blanks', 'blanks must be an object when present'))
  }
  return issues
}

function validateCanonicalGroup(group) {
  const issues = []
  const questionsById = new Map(group.questions.map((question) => [question.questionId, question]))
  const blankNodes = group.paragraphs
    .flatMap((paragraph) => paragraph.nodes)
    .filter((node) => node.type === 'blank')
  const seenBlankIds = new Set()
  const seenQuestionNos = new Set()

  if (
    group.schemaVersion !== CANONICAL_SCHEMA_VERSION ||
    group.groupType !== 'cloze' ||
    questionsById.size !== group.questions.length
  ) {
    issues.push(
      issue(
        'CANONICAL_VALIDATION_FAILED',
        'group',
        'Canonical schema, group type, and question identities must be valid',
      ),
    )
  }

  for (const question of group.questions) {
    if (
      question.groupId !== group.groupId ||
      seenQuestionNos.has(question.questionNo)
    ) {
      issues.push(
        issue(
          'CANONICAL_VALIDATION_FAILED',
          `group.questions.${question.questionId}`,
          'Canonical question group and number identities must be unique',
        ),
      )
    }
    seenQuestionNos.add(question.questionNo)
  }

  const seenParagraphIds = new Set()
  for (const paragraph of group.paragraphs) {
    if (seenParagraphIds.has(paragraph.paragraphId)) {
      issues.push(
        issue(
          'CANONICAL_VALIDATION_FAILED',
          paragraph.sourceSpan.sourcePath,
          `Canonical paragraph ${paragraph.paragraphId} is duplicated`,
        ),
      )
    }
    seenParagraphIds.add(paragraph.paragraphId)
    let cursor = paragraph.sourceSpan.start
    for (const node of paragraph.nodes) {
      const span = node.sourceSpan
      const validTextLength =
        node.type !== 'text' || node.text.length === span.end - span.start
      if (
        span.sourcePath !== paragraph.sourceSpan.sourcePath ||
        span.start !== cursor ||
        span.end < span.start ||
        span.end > paragraph.sourceSpan.end ||
        !validTextLength
      ) {
        issues.push(
          issue(
            'CANONICAL_VALIDATION_FAILED',
            paragraph.sourceSpan.sourcePath,
            `Canonical nodes for ${paragraph.paragraphId} must form ordered non-overlapping spans`,
          ),
        )
      }
      cursor = span.end
    }
    if (cursor !== paragraph.sourceSpan.end) {
      issues.push(
        issue(
          'CANONICAL_VALIDATION_FAILED',
          paragraph.sourceSpan.sourcePath,
          `Canonical nodes for ${paragraph.paragraphId} must cover the source paragraph`,
        ),
      )
    }
  }

  for (const node of blankNodes) {
    const question = questionsById.get(node.questionId)
    if (!question || question.blankId !== node.blankId || seenBlankIds.has(node.blankId)) {
      issues.push(
        issue(
          'CANONICAL_VALIDATION_FAILED',
          node.sourceSpan.sourcePath,
          `Canonical blank ${node.blankId} does not resolve one-to-one to ${node.questionId}`,
        ),
      )
    }
    seenBlankIds.add(node.blankId)
  }

  if (seenBlankIds.size !== group.questions.length) {
    issues.push(
      issue(
        'CANONICAL_VALIDATION_FAILED',
        'group.questions',
        'Canonical questions and blank nodes must have equal cardinality',
      ),
    )
  }
  return issues
}

function withoutSourceSpans(value) {
  if (Array.isArray(value)) return value.map(withoutSourceSpans)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'sourceSpan')
      .map(([key, child]) => [key, withoutSourceSpans(child)]),
  )
}

export function normalizePaperGroup(input) {
  const inputIssues = validateInput(input)
  if (inputIssues.length > 0) return needsReview(inputIssues)

  const { group, questions, blanks = {} } = input
  const issues = []
  if (group.groupType !== 'cloze') {
    issues.push(
      issue(
        'UNSUPPORTED_GROUP_TYPE',
        'group.groupType',
        `Ticket 01 supports cloze, received ${JSON.stringify(group.groupType)}`,
      ),
    )
  }
  if (
    typeof group.groupId !== 'string' ||
    group.groupId.length === 0 ||
    typeof group.title !== 'string' ||
    !Array.isArray(group.questionIds) ||
    group.questionIds.length === 0 ||
    group.questionIds.some(
      (questionId) => typeof questionId !== 'string' || questionId.length === 0,
    ) ||
    !Array.isArray(group.blankIds) ||
    group.blankIds.some((blankId) => typeof blankId !== 'string' || blankId.length === 0) ||
    !Array.isArray(group.passage?.paragraphs)
  ) {
    issues.push(issue('INVALID_GROUP', 'group', 'Cloze group shape is incomplete'))
  }
  if (issues.length > 0) return needsReview(issues)

  const seenQuestionIds = new Set()
  const seenQuestionNos = new Set()
  const seenBlankIds = new Set()
  const questionSliceIds = Object.keys(questions)
  const expectedQuestionIds = new Set(group.questionIds)
  if (
    questionSliceIds.length !== expectedQuestionIds.size ||
    questionSliceIds.some((questionId) => !expectedQuestionIds.has(questionId))
  ) {
    issues.push(
      issue(
        'QUESTION_SLICE_MISMATCH',
        'questions',
        'questions must be the exact slice named by group.questionIds',
      ),
    )
  }
  const unexpectedBlankId = Object.keys(blanks).find(
    (blankId) => !group.blankIds.includes(blankId),
  )
  if (unexpectedBlankId) {
    issues.push(
      issue(
        'BLANK_ID_CONFLICT',
        `blanks.${unexpectedBlankId}`,
        `${unexpectedBlankId} is outside group.blankIds`,
      ),
    )
  }
  for (const [index, questionId] of group.questionIds.entries()) {
    const blankId = group.blankIds[index]
    const question = questions[questionId]
    if (seenQuestionIds.has(questionId)) {
      issues.push(
        issue(
          'DUPLICATE_QUESTION_ID',
          `group.questionIds[${index}]`,
          `${questionId} is duplicated`,
        ),
      )
    }
    seenQuestionIds.add(questionId)
    if (typeof blankId !== 'string' || seenBlankIds.has(blankId)) {
      issues.push(
        issue(
          'DUPLICATE_BLANK_ID',
          `group.blankIds[${index}]`,
          `${String(blankId)} is invalid or duplicated`,
        ),
      )
    }
    seenBlankIds.add(blankId)
    if (!isRecord(question)) {
      issues.push(issue('MISSING_QUESTION', `questions.${questionId}`, `${questionId} is missing`))
      continue
    }
    if (question.questionId !== questionId || question.groupId !== group.groupId) {
      issues.push(
        issue(
          'QUESTION_ID_MISMATCH',
          `questions.${questionId}`,
          `${questionId} identity does not match group ${group.groupId}`,
        ),
      )
    }
    if (
      typeof question.stem !== 'string' ||
      !Array.isArray(question.options) ||
      question.options.some(
        (option) =>
          !isRecord(option) ||
          typeof option.label !== 'string' ||
          typeof option.text !== 'string',
      )
    ) {
      issues.push(
        issue(
          'INVALID_QUESTION',
          `questions.${questionId}`,
          `${questionId} requires a string stem and string label/text options`,
        ),
      )
    }
    if (!Number.isInteger(question.questionNo)) {
      issues.push(
        issue(
          'INVALID_QUESTION',
          `questions.${questionId}.questionNo`,
          `${String(question.questionNo)} must be an integer`,
        ),
      )
    } else if (seenQuestionNos.has(question.questionNo)) {
      issues.push(
        issue(
          'DUPLICATE_QUESTION_NO',
          `questions.${questionId}.questionNo`,
          `${String(question.questionNo)} is duplicated`,
        ),
      )
    }
    seenQuestionNos.add(question.questionNo)
    if (question.blankId !== blankId) {
      issues.push(
        issue(
          'BLANK_ID_CONFLICT',
          `questions.${questionId}.blankId`,
          `${String(question.blankId)} does not match group.blankIds[${index}] ${String(blankId)}`,
        ),
      )
    }

    const blank = blanks[blankId]
    if (
      blank !== undefined &&
      (!isRecord(blank) ||
        blank.blankId !== blankId ||
        blank.groupId !== group.groupId ||
        blank.questionId !== questionId)
    ) {
      issues.push(
        issue(
          'BLANK_ID_CONFLICT',
          `blanks.${blankId}`,
          `${blankId} record does not match group/question identity`,
        ),
      )
    }
  }

  if (group.questionIds.length !== group.blankIds.length) {
    issues.push(
      issue(
        'BLANK_COUNT_MISMATCH',
        'group.blankIds',
        `Expected ${group.questionIds.length} blankIds, received ${group.blankIds.length}`,
      ),
    )
  }

  const seenParagraphIds = new Set()
  const parsedParagraphs = group.passage.paragraphs.map((paragraph, index) => {
    if (
      !isRecord(paragraph) ||
      typeof paragraph.paragraphId !== 'string' ||
      typeof paragraph.text !== 'string'
    ) {
      issues.push(
        issue(
          'INVALID_PARAGRAPH',
          `group.passage.paragraphs[${index}]`,
          'Paragraph requires paragraphId and text',
        ),
      )
      return { paragraph, index, markers: [] }
    }
    if (seenParagraphIds.has(paragraph.paragraphId)) {
      issues.push(
        issue(
          'ANCHOR_UNRESOLVED',
          `group.passage.paragraphs[${index}].paragraphId`,
          `${paragraph.paragraphId} is duplicated`,
        ),
      )
    }
    seenParagraphIds.add(paragraph.paragraphId)
    const parsed = scanClozeParagraph(paragraph, index)
    issues.push(...parsed.issues)
    return { paragraph, index, markers: parsed.markers }
  })
  const markers = parsedParagraphs.flatMap(({ markers: paragraphMarkers }) => paragraphMarkers)

  if (markers.length < group.questionIds.length) {
    issues.push(
      issue(
        'MISSING_MARKER',
        'group.passage.paragraphs',
        `Expected ${group.questionIds.length} supported markers, received ${markers.length}`,
      ),
    )
  }
  if (markers.length !== group.questionIds.length) {
    issues.push(
      issue(
        'MARKER_COUNT_MISMATCH',
        'group.passage.paragraphs',
        `Expected ${group.questionIds.length} supported markers, received ${markers.length}`,
      ),
    )
  }

  const markerNos = new Set()
  for (const [index, marker] of markers.entries()) {
    const questionId = group.questionIds[index]
    const question = questions[questionId]
    if (markerNos.has(marker.questionNo)) {
      issues.push(
        issue(
          'DUPLICATE_MARKER',
          marker.sourcePath,
          `Marker ${marker.questionNo} is duplicated`,
        ),
      )
    }
    markerNos.add(marker.questionNo)
    if (question && marker.questionNo !== question.questionNo) {
      issues.push(
        issue(
          'MARKER_NUMBER_MISMATCH',
          marker.sourcePath,
          `Marker ${marker.questionNo} does not match source-order question ${question.questionNo}`,
        ),
      )
    }
  }

  if (issues.length > 0) return needsReview(issues)

  const markerByParagraph = new Map()
  for (const marker of markers) {
    const paragraphMarkers = markerByParagraph.get(marker.paragraphIndex) ?? []
    paragraphMarkers.push(marker)
    markerByParagraph.set(marker.paragraphIndex, paragraphMarkers)
  }

  const canonicalParagraphs = parsedParagraphs.map(({ paragraph, index }) => {
    const paragraphMarkers = markerByParagraph.get(index) ?? []
    const nodes = []
    let cursor = 0
    for (const marker of paragraphMarkers) {
      if (marker.start > cursor) {
        nodes.push({
          type: 'text',
          text: paragraph.text.slice(cursor, marker.start),
          sourceSpan: {
            sourcePath: marker.sourcePath,
            start: cursor,
            end: marker.start,
          },
        })
      }
      const markerIndex = markers.indexOf(marker)
      const questionId = group.questionIds[markerIndex]
      nodes.push({
        type: 'blank',
        questionId,
        blankId: group.blankIds[markerIndex],
        hint: null,
        sourceSpan: {
          sourcePath: marker.sourcePath,
          start: marker.start,
          end: marker.end,
        },
      })
      cursor = marker.end
    }
    if (cursor < paragraph.text.length) {
      nodes.push({
        type: 'text',
        text: paragraph.text.slice(cursor),
        sourceSpan: {
          sourcePath: `group.passage.paragraphs[${index}].text`,
          start: cursor,
          end: paragraph.text.length,
        },
      })
    }
    return {
      paragraphId: paragraph.paragraphId,
      nodes,
      sourceSpan: {
        sourcePath: `group.passage.paragraphs[${index}].text`,
        start: 0,
        end: paragraph.text.length,
      },
    }
  })

  const canonicalQuestions = group.questionIds.map((questionId, index) => {
    const question = questions[questionId]
    const presentationOnlyStem =
      /^\d+$/.test(question.stem.trim()) &&
      question.stem.trim() === String(question.questionNo) &&
      typeof question.blankId === 'string' &&
      markers[index]?.questionNo === question.questionNo
    return {
      questionId,
      questionNo: question.questionNo,
      groupId: group.groupId,
      blankId: group.blankIds[index],
      stem: presentationOnlyStem ? null : question.stem,
      options:
        question.options?.map((option) => ({
          label: option.label,
          text: option.text,
        })) ?? [],
    }
  })

  const canonicalGroup = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    groupId: group.groupId,
    groupType: group.groupType,
    title: group.title,
    paragraphs: canonicalParagraphs,
    questions: canonicalQuestions,
  }
  const canonicalIssues = validateCanonicalGroup(canonicalGroup)
  if (canonicalIssues.length > 0) return needsReview(canonicalIssues)

  const sourceMap = {
    group: { sourcePath: 'group' },
    paragraphs: Object.fromEntries(
      canonicalParagraphs.map((paragraph) => [paragraph.paragraphId, paragraph.sourceSpan]),
    ),
    questions: Object.fromEntries(
      group.questionIds.map((questionId) => [
        questionId,
        { sourcePath: `questions.${questionId}` },
      ]),
    ),
    blanks: Object.fromEntries(
      canonicalParagraphs
        .flatMap((paragraph) => paragraph.nodes)
        .filter((node) => node.type === 'blank')
        .map((node) => [node.blankId, node.sourceSpan]),
    ),
  }

  let sourceFingerprint
  let semanticDigest
  try {
    sourceFingerprint = sha256(stableStringify(input))
    semanticDigest = sha256(stableStringify(withoutSourceSpans(canonicalGroup)))
  } catch (error) {
    return needsReview([
      issue(
        'SOURCE_FINGERPRINT_UNRESOLVED',
        '$',
        `Source slice cannot be fingerprinted: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    ])
  }

  return {
    status: 'ready',
    group: canonicalGroup,
    sourceMap,
    sourceFingerprint,
    semanticDigest,
  }
}
