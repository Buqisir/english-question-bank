import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

import {
  buildCanonicalClozeSurfaceData,
} from '../shared/paper-normalization/canonicalClozeSurfaceAdapter.mjs'
import {
  paperBlankRuling,
} from '../shared/papersurface/blankRuling.mjs'
import { paperSurfaceTokens } from '../shared/papersurface/tokens.mjs'

const asset = JSON.parse(
  await readFile(
    new URL('../app/public/paper-assets/paper-2026-i/latest/paper-asset.json', import.meta.url),
    'utf8',
  ),
)

const proof = buildCanonicalClozeSurfaceData({
  asset,
  groupId: 'group-2026-i-cloze',
})

assert.equal(proof.status, 'ready')
assert.match(proof.semanticDigest, /^[a-f0-9]{64}$/)
assert.equal(proof.surfaceData.questions.length, 15)
assert.equal(proof.surfaceData.questions[0].id, 'q-2026-i-041')
assert.equal(proof.surfaceData.questions[0].stem, '')

const semanticBlanks = proof.surfaceData.semanticParagraphs
  .flatMap((paragraph) => paragraph.sentences)
  .flatMap((sentence) => sentence.nodes)
  .filter((node) => node.type === 'blank')

assert.equal(semanticBlanks.length, 15)
assert.deepEqual(
  semanticBlanks.map((blank) => blank.questionNo),
  Array.from({ length: 15 }, (_, index) => String(41 + index)),
)
assert.deepEqual(
  semanticBlanks.map((blank) => blank.questionId),
  proof.surfaceData.questions.map((question) => question.id),
)

const textMapVisibleText = proof.surfaceData.textMap.paragraphs
  .flatMap((paragraph) => paragraph.sentences)
  .map((sentence) => sentence.text)
  .join(' ')

assert.equal(textMapVisibleText.includes('__41__'), false)
assert.equal(textMapVisibleText.includes('41'), true)
assert.equal(
  proof.surfaceData.semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .map((sentence) =>
      sentence.nodes
        .map((node) => node.type === 'text' ? node.text : node.questionNo)
        .join(''),
    )
    .join(' '),
  textMapVisibleText,
)

const outsideCompatibility = buildCanonicalClozeSurfaceData({
  asset: {
    ...asset,
    paper: { ...asset.paper, paperId: 'paper-not-enabled' },
  },
  groupId: 'group-2026-i-cloze',
})
assert.deepEqual(outsideCompatibility, {
  status: 'not_enabled',
  diagnostic: {
    code: 'CANONICAL_COMPATIBILITY_NOT_ENABLED',
    paperId: 'paper-not-enabled',
    groupId: 'group-2026-i-cloze',
  },
})

const malformedAsset = structuredClone(asset)
malformedAsset.content.groups['group-2026-i-cloze'].passage.paragraphs[0].text =
  malformedAsset.content.groups['group-2026-i-cloze'].passage.paragraphs[0].text.replace(
    '__41__',
    '41',
  )
const failedProof = buildCanonicalClozeSurfaceData({
  asset: malformedAsset,
  groupId: 'group-2026-i-cloze',
})
assert.equal(failedProof.status, 'needs_review')
assert.equal(failedProof.diagnostic.code, 'CANONICAL_NORMALIZATION_NEEDS_REVIEW')
assert.equal(failedProof.issues.some((issue) => issue.code === 'MISSING_MARKER'), true)

assert.deepEqual(paperBlankRuling.cloze, {
  width: '3.3em',
  numberSuffix: '',
  numberAlignment: 'center',
  lineStyle: 'single-thin',
  whiteSpace: 'nowrap',
  hintPlacement: 'immediately-after',
})
assert.deepEqual(paperBlankRuling.grammarFill, paperBlankRuling.cloze)
assert.equal(paperBlankRuling.sevenChoices.width, '4.6em')
assert.equal(paperSurfaceTokens.paperBlankWidth, paperBlankRuling.sevenChoices.width)

const canonicalRendererSource = await readFile(
  new URL(
    '../app/src/shared-ui/papersurface/CanonicalPaperSentenceContent.tsx',
    import.meta.url,
  ),
  'utf8',
)
const paperSurfaceSource = await readFile(
  new URL('../app/src/shared-ui/papersurface/PaperSurface.tsx', import.meta.url),
  'utf8',
)
assert.equal(canonicalRendererSource.includes('blankPattern'), false)
assert.equal(canonicalRendererSource.includes('grammarFillBlank'), false)
assert.equal(paperSurfaceSource.includes('paperBlankPattern'), false)
assert.equal(paperSurfaceSource.includes('grammarFillBlankPattern'), false)

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
  const { PaperSurface } = await vite.ssrLoadModule(
    '/src/shared-ui/papersurface/PaperSurface.tsx',
  )
  const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
  const { createElement } = requireFromApp('react')
  const { renderToStaticMarkup } = requireFromApp('react-dom/server')

  const model = buildClozePaperView({
    asset,
    groupId: 'group-2026-i-cloze',
  })
  assert.equal(model.normalization.status, 'ready')
  assert.equal(model.normalization.semanticDigest, proof.semanticDigest)
  assert.equal(model.surfaceData.semanticParagraphs.length, 4)

  const markup = renderToStaticMarkup(
    createElement(PaperSurface, {
      ...model.surfaceData,
      annotations: [],
      mode: 'lecture',
      lectureFocus: null,
      readingFocusBySection: {},
      onFocusIntent() {},
    }),
  )
  assert.equal(markup.includes('__41__'), false)
  assert.equal(markup.includes('41. 41'), false)
  assert.equal((markup.match(/data-paper-blank-id=/g) ?? []).length, 15)
  assert.equal((markup.match(/class="ps-question-no"/g) ?? []).length, 15)
  assert.match(markup, /data-paper-blank-id="blank-2026-i-041"[^>]*>41<\/span>/)
} finally {
  await vite.close()
}

console.log('verify-paper-normalization-cloze-surface: ok')
