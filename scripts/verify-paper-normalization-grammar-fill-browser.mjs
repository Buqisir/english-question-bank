#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

import {
  buildCanonicalPaperGroupSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'

const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium } = requireFromApp('playwright')
const { createElement } = requireFromApp('react')
const { renderToStaticMarkup } = requireFromApp('react-dom/server')

const paperSurfaceCss = await readFile(
  new URL('../app/src/shared-ui/papersurface/PaperSurface.css', import.meta.url),
  'utf8',
)

const proofs = [
  {
    paperId: 'paper-2026-i',
    groupId: 'group-2026-i-grammar-fill',
    assetPath: '../app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
    analysisPath:
      '../app/public/paper-assets/paper-2026-i/latest/analyses/grammar-fill-analysis-v1.json',
  },
  {
    paperId: 'paper-960d0f8d',
    groupId: 'group-960d0f8d-grammar-fill',
    assetPath: '../app/public/paper-assets/paper-960d0f8d/latest/paper-asset.json',
    analysisPath:
      '../app/public/paper-assets/paper-960d0f8d/latest/analyses/grammar-fill-analysis-v1.json',
  },
]

for (const proof of proofs) {
  proof.asset = JSON.parse(await readFile(new URL(proof.assetPath, import.meta.url), 'utf8'))
  proof.analysis = JSON.parse(
    await readFile(new URL(proof.analysisPath, import.meta.url), 'utf8'),
  )
  const canonical = buildCanonicalPaperGroupSurfaceData({
    asset: proof.asset,
    groupId: proof.groupId,
  })
  assert.equal(canonical.status, 'ready')
  proof.semanticDigest = canonical.semanticDigest
  proof.blanks = canonical.surfaceData.semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentence) => sentence.nodes)
    .filter((node) => node.type === 'blank')
}

const vite = await createServer({
  root: new URL('../app', import.meta.url).pathname,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

let browser
try {
  const { PaperSurface } = await vite.ssrLoadModule(
    '/src/shared-ui/papersurface/PaperSurface.tsx',
  )
  const { buildGrammarFillPaperView } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  )
  const { buildGrammarFillAnalysisSurfaceModel } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts',
  )
  const { buildClozePaperView } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/clozePaperViewAdapter.ts',
  )
  const { buildSevenChoicesSurfaceModel } = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts',
  )

  function renderSurface(surfaceData, props = {}) {
    return renderToStaticMarkup(
      createElement(PaperSurface, {
        ...surfaceData,
        annotations: [],
        mode: 'lecture',
        lectureFocus: null,
        readingFocusBySection: {},
        onFocusIntent() {},
        ...props,
      }),
    )
  }

  const grammarCases = proofs.flatMap((proof) => {
    const plainModel = buildGrammarFillPaperView({
      asset: proof.asset,
      groupId: proof.groupId,
    })
    const analysisModel = buildGrammarFillAnalysisSurfaceModel({
      asset: proof.asset,
      analysis: proof.analysis,
      groupId: proof.groupId,
    })
    assert.equal(plainModel.normalization.semanticDigest, proof.semanticDigest)
    assert.equal(analysisModel.normalization.semanticDigest, proof.semanticDigest)

    return [
      {
        label: `${proof.paperId} plain`,
        markup: renderSurface(plainModel.surfaceData),
        blanks: proof.blanks,
      },
      {
        label: `${proof.paperId} lecture`,
        markup: renderSurface(analysisModel.surfaceData, {
          blankFocusMode: 'in-passage',
          lectureFocus: {
            kind: 'question',
            questionId: proof.blanks[0].questionId,
          },
        }),
        blanks: proof.blanks,
      },
    ]
  })

  const paper2026 = proofs[0]
  const clozeModel = buildClozePaperView({
    asset: paper2026.asset,
    groupId: 'group-2026-i-cloze',
  })
  const sevenChoicesAnalysis = JSON.parse(
    await readFile(
      new URL(
        '../app/public/paper-assets/paper-2026-i/latest/analyses/seven-choices-analysis-v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const sevenChoicesGroupId = Object.values(paper2026.asset.content.groups)
    .find((group) => group.groupType === 'sevenChoices').groupId
  const sevenChoicesModel = buildSevenChoicesSurfaceModel({
    asset: paper2026.asset,
    analysis: sevenChoicesAnalysis,
    groupId: sevenChoicesGroupId,
  })

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage()

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1004, height: 800 },
  ]) {
    await page.setViewportSize(viewport)
    for (const grammarCase of grammarCases) {
      await page.setContent(`<style>${paperSurfaceCss}</style>${grammarCase.markup}`)
      const measurements = await page.evaluate((blanks) => {
        function textRangeRect(element) {
          const range = document.createRange()
          range.selectNodeContents(element)
          return range.getBoundingClientRect()
        }

        function adjacentGlyphGap(blank, direction) {
          const sibling = direction === 'before'
            ? blank.previousElementSibling
            : blank.nextElementSibling
          if (!sibling || sibling.classList.contains('ps-paper-blank-hint')) return null
          const text = sibling.textContent ?? ''
          const match = direction === 'before' ? text.match(/\S(?=\s*$)/) : text.match(/\S/)
          if (!match || !sibling.firstChild) return null
          const offset = direction === 'before'
            ? match.index
            : match.index
          const range = document.createRange()
          range.setStart(sibling.firstChild, offset)
          range.setEnd(sibling.firstChild, offset + 1)
          const glyph = range.getBoundingClientRect()
          const blankRect = blank.getBoundingClientRect()
          return direction === 'before'
            ? blankRect.left - glyph.right
            : glyph.left - blankRect.right
        }

        return blanks.map(({ blankId, hint }) => {
          const blank = document.querySelector(`[data-paper-blank-id="${blankId}"]`)
          if (!(blank instanceof HTMLElement)) throw new Error(`Missing blank ${blankId}`)
          const blankRect = blank.getBoundingClientRect()
          const blankStyle = getComputedStyle(blank)
          const atomicBlank = blank.closest('.ps-paper-blank-unit') || blank
          const result = {
            blankId,
            hint,
            fontSizePx: Number.parseFloat(blankStyle.fontSize),
            blankWidthEm: blankRect.width / Number.parseFloat(blankStyle.fontSize),
            hintTextIndent: null,
            hintFontSizePx: null,
            glyphGap: null,
            hasUnit: blank.parentElement?.classList.contains('ps-paper-blank-unit') ?? false,
            previousText: atomicBlank.previousElementSibling?.textContent ?? '',
            nextText: atomicBlank.nextElementSibling?.textContent ?? '',
            previousGlyphGap: adjacentGlyphGap(atomicBlank, 'before'),
            nextGlyphGap: adjacentGlyphGap(atomicBlank, 'after'),
          }
          if (hint) {
            const unit = blank.closest('.ps-paper-blank-unit')
            const hintElement = unit?.querySelector('.ps-paper-blank-hint')
            if (!(unit instanceof HTMLElement)) throw new Error(`Missing unit ${blankId}`)
            if (!(hintElement instanceof HTMLElement)) throw new Error(`Missing hint ${blankId}`)
            const hintStyle = getComputedStyle(hintElement)
            result.hintTextIndent = hintStyle.textIndent
            result.hintFontSizePx = Number.parseFloat(hintStyle.fontSize)
            result.glyphGap = textRangeRect(hintElement).left - blankRect.right
          }
          return result
        })
      }, grammarCase.blanks)

      for (const measurement of measurements) {
        assert.ok(
          Math.abs(measurement.blankWidthEm - 3.3) < 0.02,
          `${grammarCase.label} ${viewport.width}px ${measurement.blankId}: `
            + `blank width ${measurement.blankWidthEm}em`,
        )
        if (measurement.hint) {
          assert.equal(
            measurement.hintTextIndent,
            '0px',
            `${grammarCase.label} ${viewport.width}px ${measurement.blankId}: `
              + `hint text-indent ${measurement.hintTextIndent}`,
          )
          assert.ok(
            Math.abs(
              measurement.glyphGap
              - measurement.hintFontSizePx * grammarFillRhythm.promptGeometry.gapEm,
            ) <= 0.1,
            `${grammarCase.label} ${viewport.width}px ${measurement.blankId}: `
              + `blank-to-hint glyph gap ${measurement.glyphGap}px consumes `
              + `${grammarFillRhythm.promptGeometry.gapEm}em`,
          )
          assert.equal(measurement.hasUnit, true)
        } else {
          assert.equal(
            measurement.hasUnit,
            true,
            `${grammarCase.label} ${viewport.width}px ${measurement.blankId}: `
              + 'prompt-free Grammar Fill blank retains the canonical atomic unit',
          )
          assert.equal(measurement.glyphGap, null)
        }
      }

      if (grammarCase.label.startsWith('paper-960d0f8d')) {
        const q56 = measurements.find(({ blankId }) => blankId === 'blank-960d0f8d-056')
        assert.ok(q56)
        assert.ok(/\s$/.test(q56.previousText), `${grammarCase.label}: q56 leading word space`)
        assert.ok(/^\s/.test(q56.nextText), `${grammarCase.label}: q56 trailing word space`)
        assert.ok(q56.previousGlyphGap >= 0 && q56.previousGlyphGap < 20)
        assert.ok(q56.nextGlyphGap >= 0 && q56.nextGlyphGap < 20)
      }
    }
  }

  await page.setContent(
    `<style>${paperSurfaceCss}</style>${renderSurface(clozeModel.surfaceData)}`,
  )
  const clozeWidthEm = await page.locator('[data-paper-blank-id]').first().evaluate((blank) => {
    const style = getComputedStyle(blank)
    return blank.getBoundingClientRect().width / Number.parseFloat(style.fontSize)
  })
  assert.ok(Math.abs(clozeWidthEm - 3.3) < 0.02, `cloze width ${clozeWidthEm}em`)

  await page.setContent(
    `<style>${paperSurfaceCss}</style>${renderSurface(sevenChoicesModel.surfaceData, {
      optionBank: sevenChoicesModel.options,
    })}`,
  )
  const sevenChoicesWidthEm = await page.locator('.ps-paper-blank').first().evaluate((blank) => {
    const style = getComputedStyle(blank)
    return blank.getBoundingClientRect().width / Number.parseFloat(style.fontSize)
  })
  assert.ok(
    Math.abs(sevenChoicesWidthEm - 4.6) < 0.02,
    `sevenChoices width ${sevenChoicesWidthEm}em`,
  )
} finally {
  await browser?.close()
  await vite.close()
}

console.log('verify-paper-normalization-grammar-fill-browser: ok')
