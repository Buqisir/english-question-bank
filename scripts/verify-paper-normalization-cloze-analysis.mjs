import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

const asset = JSON.parse(
  await readFile(
    new URL('../app/public/paper-assets/paper-2026-i/latest/paper-asset.json', import.meta.url),
    'utf8',
  ),
)
const analysis = JSON.parse(
  await readFile(
    new URL(
      '../app/public/paper-assets/paper-2026-i/latest/analyses/cloze-analysis-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const groupId = 'group-2026-i-cloze'

const vite = await createServer({
  root: new URL('../app', import.meta.url).pathname,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { buildClozePaperView } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/clozePaperViewAdapter.ts',
  )
  const { buildClozeAnalysisSurfaceModel } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts',
  )
  const { PaperSurface } = await vite.ssrLoadModule(
    '/src/shared-ui/papersurface/PaperSurface.tsx',
  )
  const { applyPaperSurfaceFocusIntent } = await vite.ssrLoadModule(
    '/src/features/paper-browse/paperBrowseFocusIntent.ts',
  )
  const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
  const { createElement } = requireFromApp('react')
  const { renderToStaticMarkup } = requireFromApp('react-dom/server')

  const plainModel = buildClozePaperView({ asset, groupId })
  const analysisModel = buildClozeAnalysisSurfaceModel({ asset, analysis, groupId })

  assert.equal(plainModel.normalization.status, 'ready')
  assert.equal(analysisModel.normalization.status, 'ready')
  assert.equal(
    analysisModel.normalization.semanticDigest,
    plainModel.normalization.semanticDigest,
  )
  assert.deepEqual(
    analysisModel.surfaceData.semanticParagraphs,
    plainModel.surfaceData.semanticParagraphs,
  )
  assert.deepEqual(analysisModel.surfaceData.textMap, plainModel.surfaceData.textMap)
  assert.deepEqual(analysisModel.surfaceData.questions, plainModel.surfaceData.questions)

  const renderSurface = (lectureFocus) =>
    renderToStaticMarkup(
      createElement(PaperSurface, {
        ...analysisModel.surfaceData,
        annotations: [],
        mode: 'lecture',
        lectureFocus,
        readingFocusBySection: {},
        blankFocusMode: 'paper-blank',
        onFocusIntent() {},
      }),
    )

  const semanticBlanks = analysisModel.surfaceData.semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentence) => sentence.nodes)
    .filter((node) => node.type === 'blank')
  assert.deepEqual(
    semanticBlanks.map(({ blankId, questionId }) => ({ blankId, questionId })),
    Array.from({ length: 15 }, (_, index) => {
      const questionNo = String(41 + index).padStart(3, '0')
      return {
        blankId: `blank-2026-i-${questionNo}`,
        questionId: `q-2026-i-${questionNo}`,
      }
    }),
  )

  let lectureOpen = true
  let selectedQuestionId = null
  const dispatchFocus = (questionId) => {
    const trace = []
    const handled = lectureOpen
      ? applyPaperSurfaceFocusIntent({
          groupId,
          intent: { kind: 'request-lecture-focus', questionId },
          suppressScrollspyClear: (durationMs) => trace.push(`suppress-scrollspy-clear:${durationMs}`),
          activateGroup: (selectedGroupId) => trace.push(`activate:${selectedGroupId}`),
          selectLectureQuestion: (selectedGroupId, selectedId) => {
            trace.push(`select:${selectedGroupId}:${selectedId}`)
            selectedQuestionId = selectedId
          },
        })
      : false
    return { handled, trace }
  }
  for (const blank of semanticBlanks) {
    const result = dispatchFocus(blank.questionId)
    assert.equal(result.handled, true)
    assert.deepEqual(result.trace, [
      'suppress-scrollspy-clear:undefined',
      `activate:${groupId}`,
      `select:${groupId}:${blank.questionId}`,
    ])
    assert.equal(selectedQuestionId, blank.questionId)
  }
  const q47OptionQuestion = analysisModel.surfaceData.questions.find(
    (question) => question.id === 'q-2026-i-047',
  )
  assert.ok(q47OptionQuestion)
  assert.equal(dispatchFocus(q47OptionQuestion.id).handled, true)
  assert.equal(selectedQuestionId, 'q-2026-i-047')
  lectureOpen = false
  selectedQuestionId = null
  assert.equal(dispatchFocus('q-2026-i-041').handled, false)
  assert.equal(selectedQuestionId, null)
  lectureOpen = true
  assert.equal(dispatchFocus('q-2026-i-041').handled, true)
  assert.equal(selectedQuestionId, 'q-2026-i-041')

  const sentencesById = new Map(
    analysisModel.surfaceData.textMap.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .map((sentence) => [sentence.id, sentence]),
  )
  assert.equal(analysisModel.surfaceData.evidence.length, 30)
  for (const evidence of analysisModel.surfaceData.evidence) {
    const sentence = sentencesById.get(evidence.range.sentenceId)
    assert.ok(sentence, `missing sentence anchor for ${evidence.id}`)
    assert.ok(evidence.range.start >= 0, `negative range for ${evidence.id}`)
    assert.ok(evidence.range.end <= sentence.text.length, `range overflow for ${evidence.id}`)
    assert.ok(evidence.range.end > evidence.range.start, `empty range for ${evidence.id}`)
    const evidenceIndex = Number(evidence.id.match(/-evidence-(\d+)$/)?.[1]) - 1
    assert.equal(
      sentence.text.slice(evidence.range.start, evidence.range.end),
      analysis.blanks[evidence.questionId].evidence[evidenceIndex].signalText.trim(),
    )
  }

  const q41EvidenceId = 'q-2026-i-041-evidence-1'
  const q41Focus = {
    kind: 'question',
    questionId: 'q-2026-i-041',
    activeEvidenceId: q41EvidenceId,
  }
  const q41Markup = renderSurface(q41Focus)
  const q47Markup = renderSurface({
    kind: 'question',
    questionId: 'q-2026-i-047',
    activeEvidenceId: 'q-2026-i-047-evidence-1',
  })
  const closedMarkup = renderSurface(null)
  const reopenedQ41Markup = renderSurface(q41Focus)

  for (const markup of [q41Markup, q47Markup, closedMarkup, reopenedQ41Markup]) {
    assert.equal(markup.includes('__41__'), false)
    assert.equal(markup.includes('41. 41'), false)
    assert.equal((markup.match(/data-paper-blank-id=/g) ?? []).length, 15)
    assert.equal((markup.match(/class="ps-question-no"/g) ?? []).length, 15)
    for (const option of asset.content.questions['q-2026-i-041'].options) {
      assert.ok(markup.includes(option.text), `q41 option ${option.label} drifted`)
    }
  }
  assert.match(
    q41Markup,
    /ps-paper-blank--active[^>]*data-paper-blank-id="blank-2026-i-041"/,
  )
  assert.match(
    q47Markup,
    /ps-paper-blank--active[^>]*data-paper-blank-id="blank-2026-i-047"/,
  )
  assert.equal(closedMarkup.includes('ps-paper-blank--active'), false)
  assert.equal(reopenedQ41Markup, q41Markup)

  assert.match(
    q41Markup,
    new RegExp(
      `<mark[^>]*data-paper-evidence-id="${q41EvidenceId}"[^>]*>`
      + `[^<]*${analysis.blanks['q-2026-i-041'].evidence[0].signalText}`,
    ),
  )
  assert.match(
    q47Markup,
    new RegExp(
      '<mark[^>]*data-paper-evidence-id="q-2026-i-047-evidence-1"[^>]*>'
      + `[^<]*${analysis.blanks['q-2026-i-047'].evidence[0].signalText}`,
    ),
  )

  const unresolvedAnalysis = structuredClone(analysis)
  unresolvedAnalysis.blanks['q-2026-i-041'].evidence[0].signalText =
    'definitely-not-in-the-canonical-visible-text'
  const unresolvedModel = buildClozeAnalysisSurfaceModel({
    asset,
    analysis: unresolvedAnalysis,
    groupId,
  })
  assert.equal(unresolvedModel.normalization.status, 'ready')
  assert.equal(
    unresolvedModel.surfaceData.evidence.some((item) => item.id === 'q-2026-i-041-evidence-1'),
    false,
  )
  assert.equal(
    unresolvedModel.surfaceData.evidence.some((item) => item.id === 'q-2026-i-047-evidence-1'),
    true,
  )
  assert.ok(unresolvedModel.analysisByQuestionId['q-2026-i-041'])

  const missingBlankAnchorAnalysis = structuredClone(analysis)
  missingBlankAnchorAnalysis.blanks['q-2026-i-041'].blankId = 'blank-does-not-exist'
  assert.throws(
    () =>
      buildClozeAnalysisSurfaceModel({
        asset,
        analysis: missingBlankAnchorAnalysis,
        groupId,
    }),
    /CLOZE_ANALYSIS_ANCHOR_MISMATCH.*q-2026-i-041/,
  )

  const legacyAsset = structuredClone(asset)
  legacyAsset.paper.paperId = 'paper-outside-canonical-proof'
  const legacyAnalysis = structuredClone(analysis)
  legacyAnalysis.paperId = legacyAsset.paper.paperId
  assert.throws(
    () =>
      buildClozeAnalysisSurfaceModel({
        asset: legacyAsset,
        analysis: legacyAnalysis,
        groupId,
      }),
    /CLOZE_CANONICAL_SURFACE_UNAVAILABLE.*paper-outside-canonical-proof/,
  )
} finally {
  await vite.close()
}

console.log('verify-paper-normalization-cloze-analysis: ok')
