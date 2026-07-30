import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

import {
  buildCanonicalPaperGroupSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

const proofs = [
  {
    paperId: 'paper-2026-i',
    groupId: 'group-2026-i-grammar-fill',
    assetPath: '../app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
    analysisPath:
      '../app/public/paper-assets/paper-2026-i/latest/analyses/grammar-fill-analysis-v1.json',
    hintedQuestionId: 'q-2026-i-056',
    hintedBlankId: 'blank-2026-i-056',
    hintedQuestionNo: '56',
    hint: 'hold',
    nullHintBlankId: 'blank-2026-i-058',
    protectedText: [],
  },
  {
    paperId: 'paper-960d0f8d',
    groupId: 'group-960d0f8d-grammar-fill',
    assetPath: '../app/public/paper-assets/paper-960d0f8d/latest/paper-asset.json',
    analysisPath:
      '../app/public/paper-assets/paper-960d0f8d/latest/analyses/grammar-fill-analysis-v1.json',
    hintedQuestionId: 'q-960d0f8d-057',
    hintedBlankId: 'blank-960d0f8d-057',
    hintedQuestionNo: '57',
    hint: 'absorb',
    nullHintBlankId: 'blank-960d0f8d-056',
    protectedText: ['2026', '25-30g', '800g', '30g', '10g', '3-5g'],
  },
]

for (const proof of proofs) {
  proof.asset = JSON.parse(
    await readFile(new URL(proof.assetPath, import.meta.url), 'utf8'),
  )
  proof.analysis = JSON.parse(
    await readFile(new URL(proof.analysisPath, import.meta.url), 'utf8'),
  )

  const canonical = buildCanonicalPaperGroupSurfaceData({
    asset: proof.asset,
    groupId: proof.groupId,
  })
  assert.equal(canonical.status, 'ready')
  assert.match(canonical.semanticDigest, /^[a-f0-9]{64}$/)
  assert.equal(canonical.surfaceData.questions.length, 10)
  assert.equal(canonical.surfaceData.semanticParagraphs[0].groupType, 'grammarFill')

  const semanticBlanks = canonical.surfaceData.semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentence) => sentence.nodes)
    .filter((node) => node.type === 'blank')
  assert.equal(semanticBlanks.length, 10)
  assert.deepEqual(
    semanticBlanks.map(({ blankId, questionId }) => ({ blankId, questionId })),
    canonical.surfaceData.questions.map((question) => ({
      blankId: proof.asset.content.questions[question.id].blankId,
      questionId: question.id,
    })),
  )

  const textMapVisibleText = canonical.surfaceData.textMap.paragraphs
    .flatMap((paragraph) => paragraph.sentences)
    .map((sentence) => sentence.text)
    .join(' ')
  const semanticVisibleText = canonical.surfaceData.semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .map((sentence) =>
      sentence.nodes
        .map((node) =>
          node.type === 'text'
            ? node.text
            : `${node.questionNo}${node.hint ? `(${node.hint})` : ''}`,
        )
        .join(''),
    )
    .join(' ')
  assert.equal(semanticVisibleText, textMapVisibleText)
  assert.equal(textMapVisibleText.includes('__56__'), false)
  assert.equal(textMapVisibleText.includes('56._____'), false)
  for (const protectedText of proof.protectedText) {
    assert.ok(textMapVisibleText.includes(protectedText), `missing ${protectedText}`)
  }
}

const malformedAsset = structuredClone(proofs[0].asset)
malformedAsset.content.groups[proofs[0].groupId].passage.paragraphs[0].text =
  malformedAsset.content.groups[proofs[0].groupId].passage.paragraphs[0].text.replace(
    '__56__ (hold)',
    '56',
  )
const failedProof = buildCanonicalPaperGroupSurfaceData({
  asset: malformedAsset,
  groupId: proofs[0].groupId,
})
assert.equal(failedProof.status, 'needs_review')
assert.equal(failedProof.diagnostic.code, 'CANONICAL_NORMALIZATION_NEEDS_REVIEW')
assert.equal(failedProof.issues.some((issue) => issue.code === 'MISSING_MARKER'), true)

const vite = await createServer({
  root: new URL('../app', import.meta.url).pathname,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

const hintedBlankStructures = []

try {
  const { buildGrammarFillPaperView } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  )
  const { buildGrammarFillAnalysisSurfaceModel } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts',
  )
  const {
    applyPaperSurfaceFocusIntent,
    shouldClearLectureSelectionForActiveGroup,
  } = await vite.ssrLoadModule(
    '/src/features/paper-browse/paperBrowseFocusIntent.ts',
  )
  assert.equal(
    shouldClearLectureSelectionForActiveGroup({
      activeGroupId: 'group-before',
      selectedGroupId: proofs[1].groupId,
      selectedGroupVisible: true,
    }),
    false,
  )
  assert.equal(
    shouldClearLectureSelectionForActiveGroup({
      activeGroupId: 'group-before',
      selectedGroupId: proofs[1].groupId,
      selectedGroupVisible: false,
    }),
    true,
  )
  const { PaperSurface } = await vite.ssrLoadModule(
    '/src/shared-ui/papersurface/PaperSurface.tsx',
  )
  const { QuestionGroupPaperSurface } = await vite.ssrLoadModule(
    '/src/features/question-detail/QuestionGroupDetailView.tsx',
  )
  const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
  const { createElement } = requireFromApp('react')
  const { renderToStaticMarkup } = requireFromApp('react-dom/server')

  for (const proof of proofs) {
    const canonical = buildCanonicalPaperGroupSurfaceData({
      asset: proof.asset,
      groupId: proof.groupId,
    })
    assert.equal(canonical.status, 'ready')

    const plainModel = buildGrammarFillPaperView({
      asset: proof.asset,
      groupId: proof.groupId,
    })
    const analysisModel = buildGrammarFillAnalysisSurfaceModel({
      asset: proof.asset,
      analysis: proof.analysis,
      groupId: proof.groupId,
    })
    assert.deepEqual(plainModel.normalization, {
      status: 'ready',
      semanticDigest: canonical.semanticDigest,
    })
    assert.deepEqual(analysisModel.normalization, plainModel.normalization)
    assert.deepEqual(
      analysisModel.surfaceData.semanticParagraphs,
      plainModel.surfaceData.semanticParagraphs,
    )
    assert.deepEqual(analysisModel.surfaceData.textMap, plainModel.surfaceData.textMap)
    assert.deepEqual(analysisModel.surfaceData.questions, plainModel.surfaceData.questions)

    const sentencesById = new Map(
      analysisModel.surfaceData.textMap.paragraphs
        .flatMap((paragraph) => paragraph.sentences)
        .map((sentence) => [sentence.id, sentence]),
    )
    assert.ok(analysisModel.surfaceData.evidence.length > 0)
    for (const evidence of analysisModel.surfaceData.evidence) {
      const sentence = sentencesById.get(evidence.range.sentenceId)
      assert.ok(sentence, `missing sentence anchor for ${evidence.id}`)
      assert.ok(evidence.range.start >= 0)
      assert.ok(evidence.range.end > evidence.range.start)
      assert.ok(evidence.range.end <= sentence.text.length)
    }

    const focus = {
      kind: 'question',
      questionId: proof.hintedQuestionId,
      activeEvidenceId: `${proof.hintedQuestionId}-evidence-1`,
    }
    const markup = renderToStaticMarkup(
      createElement(PaperSurface, {
        ...analysisModel.surfaceData,
        annotations: [],
        mode: 'lecture',
        lectureFocus: focus,
        readingFocusBySection: {},
        blankFocusMode: 'in-passage',
        onFocusIntent() {},
      }),
    )
    const detailMarkup = renderToStaticMarkup(
      createElement(QuestionGroupPaperSurface, {
        entry: { kind: 'grammarFill', model: plainModel, chips: [] },
      }),
    )
    assert.equal(markup.includes('__56__'), false)
    assert.equal(markup.includes('56._____'), false)
    assert.equal(markup.includes('57._____'), false)
    assert.equal((markup.match(/data-paper-blank-id=/g) ?? []).length, 10)
    assert.equal(
      (detailMarkup.match(/data-paper-blank-id=/g) ?? []).length,
      10,
      'QuestionGroupDetailView plain surface must consume canonical semantic blanks',
    )
    assert.match(
      markup,
      new RegExp(
        `class="[^"]*ps-paper-blank--active[^"]*"[^>]*`
        + `data-paper-blank-id="${proof.hintedBlankId}"[^>]*>`
        + `${proof.hintedQuestionNo}</button>`
        + `<span class="ps-paper-blank-hint"[^>]*>\\(${proof.hint}\\)</span>`,
      ),
    )
    assert.equal(
      (markup.match(new RegExp(`\\(${proof.hint}\\)`, 'g')) ?? []).length,
      1,
    )
    const hintedBlankStructure = markup.match(
      new RegExp(
        `<span class="ps-paper-blank-unit"[^>]*><button[^>]*`
        + `data-paper-blank-id="${proof.hintedBlankId}"[^>]*>`
        + `${proof.hintedQuestionNo}</button>`
        + `<span class="ps-paper-blank-hint"[^>]*>\\(${proof.hint}\\)</span></span>`,
      ),
    )?.[0]
    assert.ok(hintedBlankStructure)
    hintedBlankStructures.push(
      hintedBlankStructure
        .replaceAll(proof.hintedBlankId, '<blank-id>')
        .replaceAll(proof.hintedQuestionId, '<question-id>')
        .replaceAll(proof.hintedQuestionNo, '<question-no>')
        .replaceAll(proof.hint, '<hint>'),
    )
    assert.match(
      markup,
      new RegExp(
        `<(?:span|button)[^>]*data-paper-blank-id="${proof.nullHintBlankId}"[^>]*>`
        + '\\d+</(?:span|button)>',
      ),
    )
    assert.match(
      markup,
      new RegExp(
        `ps-paper-blank-unit"[^>]*data-canonical-grammar-fill-unit=""[^>]*>`
        + `<(?:span|button)[^>]*data-paper-blank-id="${proof.nullHintBlankId}"`,
      ),
    )

    let activeGroupId = null
    let selectedQuestionId = null
    const handled = applyPaperSurfaceFocusIntent({
      groupId: proof.groupId,
      intent: {
        kind: 'request-lecture-focus',
        questionId: proof.hintedQuestionId,
      },
      suppressScrollspyClear(durationMs) {
        assert.equal(durationMs, undefined)
      },
      activateGroup(groupId) {
        activeGroupId = groupId
      },
      selectLectureQuestion(_groupId, questionId) {
        selectedQuestionId = questionId
      },
    })
    assert.equal(handled, true)
    assert.equal(activeGroupId, proof.groupId)
    assert.equal(selectedQuestionId, proof.hintedQuestionId)

    const unresolvedAnalysis = structuredClone(proof.analysis)
    unresolvedAnalysis.blanks[proof.hintedQuestionId].evidence[0].signalText =
      'definitely-not-in-the-canonical-visible-text'
    assert.throws(
      () =>
        buildGrammarFillAnalysisSurfaceModel({
          asset: proof.asset,
          analysis: unresolvedAnalysis,
          groupId: proof.groupId,
        }),
      /GRAMMAR_FILL_EVIDENCE_UNRESOLVED/,
    )
  }

  assert.equal(hintedBlankStructures.length, 2)
  assert.equal(hintedBlankStructures[0], hintedBlankStructures[1])

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    const legacyModel = buildGrammarFillPaperView({
      asset: malformedAsset,
      groupId: proofs[0].groupId,
    })
    assert.equal(legacyModel.normalization.status, 'legacy')
    assert.equal(legacyModel.surfaceData.semanticParagraphs, undefined)
    assert.equal(warnings.length, 1)
    assert.equal(
      warnings[0][1].code,
      'CANONICAL_NORMALIZATION_NEEDS_REVIEW',
    )
  } finally {
    console.warn = originalWarn
  }
} finally {
  await vite.close()
}

console.log('verify-paper-normalization-grammar-fill-surface: ok')
