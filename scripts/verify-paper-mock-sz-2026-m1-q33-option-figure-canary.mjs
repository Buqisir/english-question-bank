#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { sha256, stableStringify } from '../shared/paper-canonical/stable.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  materializeQ33OptionFigureCanary,
} from './materialize-paper-mock-sz-2026-m1-q33-option-figure-canary.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const groupId = 'group-mock-sz-2026-m1-reading-d'
const questionId = 'q-mock-sz-2026-m1-033'
const labels = ['A', 'B', 'C', 'D']
const evidenceRoot = path.join(
  repoRoot,
  'scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33',
)
const canaryRoot = path.join(evidenceRoot, 'canary')
const artifactRoot = path.join(
  repoRoot,
  'output/playwright/source-faithful-visual-import-q33',
)
const pdfRoot = path.join(repoRoot, 'output/pdf')
const pdfPath = path.join(pdfRoot, 'shenzhen-q33-source-crop-student.pdf')
mkdirSync(artifactRoot, { recursive: true })
mkdirSync(pdfRoot, { recursive: true })

const generatedPaths = [
  path.join(canaryRoot, 'asset-framing-policy-v1.json'),
  path.join(canaryRoot, 'canonical-question-group-v2.json'),
  path.join(canaryRoot, 'print-consumption-v1.json'),
  path.join(canaryRoot, 'q33-option-figure-canary-v1.json'),
  path.join(
    repoRoot,
    'app/public/qa/paper-mock-sz-2026-m1-q33-screen-consumption.json',
  ),
]
const beforeMaterialization = new Map(
  generatedPaths.map((filePath) => [filePath, readFileSync(filePath)]),
)
const canary = await materializeQ33OptionFigureCanary()
for (const filePath of generatedPaths) {
  assert.deepEqual(
    readFileSync(filePath),
    beforeMaterialization.get(filePath),
    `${path.relative(repoRoot, filePath)} materializes byte-idempotently`,
  )
}

assert.equal(canary.confirmedSelection.status, 'confirmed')
assert.equal(canary.confirmedSelection.unresolvedIssues.length, 0)
assert.deepEqual(
  canary.confirmedSelection.confirmedSelections.map((selection) => selection.method),
  ['source_crop', 'source_crop', 'source_crop', 'source_crop'],
)
assert.equal(canary.canonicalGroup.contractRef.familyContractVersion, '2')
assert.equal(canary.canonicalGroup.contractRef.manifestVersion, '46')
assert.equal(canary.canonicalGroup.media.length, 4)
assert.equal(stableStringify(canary.canonicalGroup).includes('[Fig.]'), false)
assert.equal(stableStringify(canary.canonicalGroup).includes('reading-d-q33.png'), false)

const canonicalQuestion = canary.canonicalGroup.variant.questions.find(
  (question) => question.questionId === questionId,
)
const canonicalSet = canary.canonicalGroup.variant.choiceOwnership.sets.find(
  (set) => set.questionId === questionId,
)
assert.ok(canonicalQuestion)
assert.ok(canonicalSet)
assert.equal(canonicalQuestion.correctOptionId, `option:${questionId}:D`)
assert.deepEqual(canonicalSet.options.map((option) => option.label), labels)
assert.deepEqual(
  canonicalSet.options.map((option) => Object.keys(option).sort()),
  labels.map(() => ['figure', 'label', 'optionId']),
)
assert.deepEqual(
  canonicalSet.options.map((option) => option.figure.mediaId),
  canary.canonicalGroup.media.map((media) => media.mediaId),
)
for (const [index, label] of labels.entries()) {
  const option = canonicalSet.options[index]
  const media = canary.canonicalGroup.media[index]
  const selection = canary.confirmedSelection.confirmedSelections.find(
    (candidate) => candidate.owner.optionId === option.optionId,
  )
  assert.ok(selection)
  assert.equal(media.sha256, selection.artifact.sha256)
  assert.equal(media.pixelWidth, selection.artifact.pixelWidth)
  assert.equal(media.pixelHeight, selection.artifact.pixelHeight)
  const optionEntry = canary.canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'option' && entry.target.id === option.optionId,
  )
  const mediaEntry = canary.canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'media' && entry.target.id === media.mediaId,
  )
  assert.deepEqual(
    optionEntry?.sourceSpanRefs,
    [`source-span:observation:paper-mock-sz-2026-m1:q33:option:${label}`],
  )
  assert.deepEqual(mediaEntry?.sourceSpanRefs, optionEntry.sourceSpanRefs)
}

assert.equal(
  canary.policy.principle,
  'The asset owns complete source-authored figure pixels; the renderer owns every placement decision.',
)
assert.equal(canary.policy.contentEnvelope.kind, 'exact_pdf_embedded_image_extent')
assert.equal(canary.policy.contentEnvelope.excludes.includes('A-D option labels'), true)
assert.equal(canary.policy.contentEnvelope.excludes.includes('page margins'), true)
assert.equal(canary.policy.contentEnvelope.noAutomaticTrim.includes('not an authority'), true)
assert.equal(canary.policy.contentEnvelope.noTransparencyRewrite.includes('question meaning'), true)
assert.equal(canary.policy.rendererOwnership.invariant.includes('contain'), true)
assert.equal(canary.policy.placementProofIntent.length, 3)

function project(consumption) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId,
  })
}

function figureQuestion(group) {
  const question = group.questions.find((candidate) => candidate.questionId === questionId)
  assert.equal(question?.optionMode, 'figure')
  return question
}

function dataUrlSources(html, className) {
  return [...html.matchAll(new RegExp(
    `<img class="${className}" src="(data:image\\/png;base64,[^"]+)"`,
    'g',
  ))].map((match) => match[1])
}

function bytesFromDataUrl(source) {
  return new Uint8Array(Buffer.from(source.split(',')[1], 'base64'))
}

function extractPdfImageDataUrls(pdfFile) {
  const extractionRoot = mkdtempSync(path.join(tmpdir(), 'eqb-q33-pdfimages-'))
  try {
    execFileSync('pdfimages', [
      '-png',
      pdfFile,
      path.join(extractionRoot, 'q33-image'),
    ])
    const imageFiles = readdirSync(extractionRoot)
      .filter((name) => /^q33-image-\d+\.png$/.test(name))
      .sort()
    assert.equal(imageFiles.length, 4, 'PDF contains exactly four decoded image streams')
    return imageFiles.map((name) =>
      `data:image/png;base64,${readFileSync(path.join(extractionRoot, name)).toString('base64')}`)
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true })
  }
}

async function decodedRgbaIdentities(page, sources) {
  const decoded = await page.evaluate(async (imageSources) => Promise.all(
    imageSources.map(async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
        willReadFrequently: true,
      })
      context.drawImage(image, 0, 0)
      const rgba = context.getImageData(
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        { colorSpace: 'srgb' },
      ).data
      return {
        pixelWidth: image.naturalWidth,
        pixelHeight: image.naturalHeight,
        rgba: [...rgba],
      }
    }),
  ), sources)
  return decoded.map(({ rgba, ...identity }) => ({
    ...identity,
    rgbaSha256: sha256(Uint8Array.from(rgba)),
  }))
}

function syntheticPrintItem(group) {
  return {
    detail: {
      id: group.groupId,
      paperId: group.paperId,
      title: '2026 Shenzhen First Mock - Reading D',
      source: 'Owner-confirmed local Q33 canary',
      groupType: 'reading',
      passage: {
        title: 'POISONED LEGACY TITLE',
        materialText: 'POISONED LEGACY PASSAGE [Fig.]',
      },
      questions: group.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: question.questionId === questionId
          ? 'WRONG-LEGACY-ANSWER'
          : 'A',
        explanation: question.questionId === questionId
          ? 'Official answer identity retained from the admitted answer source.'
          : '',
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 2.5,
    sectionTitle: 'Reading',
    note: '',
  }
}

const screenGroup = project(canary.screenConsumption)
const printGroup = project(canary.printConsumption)
const screenQuestion = figureQuestion(screenGroup)
const printQuestion = figureQuestion(printGroup)
assert.equal(Object.hasOwn(screenQuestion, 'correctOptionId'), false)
assert.equal(printQuestion.correctOptionId, `option:${questionId}:D`)
const selectedArtifactDigests = canary.confirmedSelection.confirmedSelections
  .sort((left, right) => left.owner.optionId.localeCompare(right.owner.optionId))
  .map((selection) => selection.artifact.sha256)
assert.deepEqual(
  screenQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
  selectedArtifactDigests,
)
assert.deepEqual(
  printQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
  selectedArtifactDigests,
)
const surface = buildCanonicalReadingConsumptionSurfaceData({
  consumption: canary.screenConsumption,
  groupId,
})
const surfaceQuestion = surface.surfaceData.questions.find(
  (question) => question.id === questionId,
)
assert.ok(surfaceQuestion?.figurePlacement)
assert.equal(surfaceQuestion.figurePlacement.objectFit, 'contain')
assert.equal(surfaceQuestion.figurePlacement.objectPosition, 'center')
assert.deepEqual(
  surfaceQuestion.options.map((option) => option.figure.sha256),
  selectedArtifactDigests,
)

const blocks = [{
  type: 'question_group',
  questionGroupId: groupId,
  score: 2.5,
}]
const item = syntheticPrintItem(printGroup)
const printCases = new Map()
for (const versionType of ['student', 'teacher']) {
  const html = buildPrintHtml({
    title: '2026 Shenzhen First Mock - Reading D Q33 canary',
    versionType,
    items: [item],
    blocks,
    questionNumberStart: 32,
    printStyle: 'exam',
    canonicalConsumption: canary.printConsumption,
  })
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.equal(html.includes('[Fig.]'), false)
  assert.equal(html.includes('Which of the following best illustrates'), true)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher')
  assert.equal(html.includes('<strong>【答案】</strong>D'), versionType === 'teacher')
  assert.equal(html.includes('WRONG-LEGACY-ANSWER'), false)
  const sources = dataUrlSources(html, 'canonical-figure-option-image')
  assert.equal(sources.length, 4)
  assert.deepEqual(
    sources.map((source) => sha256(bytesFromDataUrl(source))),
    selectedArtifactDigests,
  )
  const outputPath = path.join(artifactRoot, `q33-${versionType}-print.html`)
  writeFileSync(outputPath, html)
  printCases.set(versionType, { html, sources })
}
assert.deepEqual(
  printCases.get('student').sources,
  printCases.get('teacher').sources,
)

function placementProofHtml(sources) {
  const proofs = canary.policy.placementProofIntent.map((intent) => `
    <section>
      <h2>${intent.name} - ${intent.widthPt} x ${intent.heightPt} pt</h2>
      <div class="row" style="--box-width:${intent.widthPt}pt;--box-height:${intent.heightPt}pt">
        ${sources.map((source, index) => `<figure><figcaption>${labels[index]}.</figcaption><div class="box"><img src="${source}" alt="Option ${labels[index]}"></div></figure>`).join('')}
      </div>
    </section>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Q33 portable source crop placement proof</title>
<style>
  *{box-sizing:border-box} body{margin:0;padding:28px;font-family:Georgia,serif;color:#171717;background:#f5f5f4}
  main{max-width:1000px;margin:auto;padding:28px;background:#fff;border:1px solid #d6d3d1}
  h1{font-size:24px;margin:0 0 8px} p{max-width:760px;line-height:1.5;color:#57534e}
  section{margin-top:28px} h2{font:600 13px/1.4 system-ui,sans-serif;color:#57534e}
  .row{display:flex;align-items:flex-start;gap:28px;flex-wrap:wrap}
  figure{margin:0} figcaption{font-size:10.5pt;line-height:18pt}
  .box{display:grid;place-items:center;width:var(--box-width);height:var(--box-height);overflow:hidden;outline:1px dashed #a8a29e;background:#fff}
  img{display:block;min-width:0;min-height:0;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center}
</style></head><body><main><h1>Q33 layout-neutral asset proof</h1>
<p>The exact same four confirmed PNG bytes are placed in three renderer-owned boxes. Dashed outlines belong to this proof page, not to the assets.</p>
${proofs}</main></body></html>`
}

const proofHtml = placementProofHtml(printCases.get('student').sources)
const proofHtmlPath = path.join(artifactRoot, 'q33-portable-placement-proof.html')
writeFileSync(proofHtmlPath, proofHtml)

function pdfImageDimensions(pdfFile) {
  const listing = execFileSync('pdfimages', ['-list', pdfFile], { encoding: 'utf8' })
  return {
    listing,
    dimensions: [...listing.matchAll(
      /^\s+\d+\s+\d+\s+image\s+(\d+)\s+(\d+)/gm,
    )].map((match) => [Number(match[1]), Number(match[2])]),
  }
}

let pdfImagePixelIdentityEvidence = null

async function verifyRenderedArtifacts() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve(repoRoot, 'app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({
    headless: true,
    channel: 'chromium',
  })
  try {
    const screenPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const screenUrl = new URL('canonical-reading-qa.html', appUrl)
    screenUrl.searchParams.set('groupId', groupId)
    screenUrl.searchParams.set('fixture', 'q33-source-crop')
    await screenPage.goto(screenUrl.href)
    const bank = screenPage.locator('[data-canonical-layout-id="reading-option-figure-layout"]')
    await bank.waitFor()
    assert.equal(await screenPage.locator('.ps-option--figure').count(), 4)
    assert.deepEqual(
      await screenPage.locator('.ps-option-label--figure').allTextContents(),
      ['A.', 'B.', 'C.', 'D.'],
    )
    assert.deepEqual(
      await screenPage.locator('.ps-option-figure-image').evaluateAll(
        (images) => images.map((image) => ({
          src: image.getAttribute('src'),
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          objectFit: getComputedStyle(image).objectFit,
          objectPosition: getComputedStyle(image).objectPosition,
        })),
      ),
      surfaceQuestion.options.map((option) => ({
        src: `data:image/png;base64,${option.figure.encodedBytes}`,
        naturalWidth: option.figure.pixelWidth,
        naturalHeight: option.figure.pixelHeight,
        objectFit: 'contain',
        objectPosition: '50% 50%',
      })),
    )
    assert.equal(await screenPage.locator('text=[Fig.]').count(), 0)
    assert.equal(await screenPage.locator('[data-canonical-correct-option-id]').count(), 0)
    await screenPage.screenshot({
      path: path.join(artifactRoot, 'q33-screen.png'),
      fullPage: true,
    })
    writeFileSync(
      path.join(artifactRoot, 'q33-screen-url.txt'),
      `${screenUrl.href}\n`,
    )
    await screenPage.close()

    for (const [versionType, printCase] of printCases) {
      const page = await browser.newPage({ viewport: { width: 900, height: 1100 } })
      await page.setContent(printCase.html, { waitUntil: 'load' })
      await page.locator('.canonical-figure-options').waitFor()
      assert.equal(await page.locator('.canonical-figure-option-image').count(), 4)
      assert.deepEqual(
        await page.locator('.canonical-figure-option-image').evaluateAll(
          (images) => images.map((image) => getComputedStyle(image).objectFit),
        ),
        ['contain', 'contain', 'contain', 'contain'],
      )
      await page.screenshot({
        path: path.join(artifactRoot, `q33-${versionType}-print.png`),
        fullPage: true,
      })
      await page.close()
    }

    const proofPage = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
    await proofPage.setContent(proofHtml, { waitUntil: 'load' })
    const proofImages = await proofPage.locator('img').evaluateAll(
      (images) => images.map((image) => ({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        objectPosition: getComputedStyle(image).objectPosition,
      })),
    )
    assert.equal(proofImages.length, 12)
    for (const [index, image] of proofImages.entries()) {
      const expected = surfaceQuestion.options[index % 4].figure
      assert.equal(image.naturalWidth, expected.pixelWidth)
      assert.equal(image.naturalHeight, expected.pixelHeight)
      assert.equal(image.objectFit, 'contain')
      assert.equal(image.objectPosition, '50% 50%')
    }
    await proofPage.screenshot({
      path: path.join(artifactRoot, 'q33-portable-placement-proof.png'),
      fullPage: true,
    })
    await proofPage.close()

    const pdfPage = await browser.newPage()
    await pdfPage.setContent(printCases.get('student').html, { waitUntil: 'load' })
    const pdfBytes = await pdfPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
    const confirmedSources = printCases.get('student').sources
    const extractedPdfSources = extractPdfImageDataUrls(pdfPath)
    const confirmedPixelIdentities = await decodedRgbaIdentities(
      pdfPage,
      confirmedSources,
    )
    const pdfPixelIdentities = await decodedRgbaIdentities(
      pdfPage,
      extractedPdfSources,
    )
    assert.deepEqual(
      pdfPixelIdentities,
      confirmedPixelIdentities,
      'PDF decoded RGBA pixels retain the four confirmed source images in A-D order',
    )
    pdfImagePixelIdentityEvidence = labels.map((label, index) => ({
      label,
      confirmedArtifactSha256: selectedArtifactDigests[index],
      ...confirmedPixelIdentities[index],
      pdfRgbaSha256: pdfPixelIdentities[index].rgbaSha256,
    }))
    await pdfPage.close()
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await verifyRenderedArtifacts()

const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
assert.match(pdfInfo, /Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/)
const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
assert.equal(pdfText.includes('Which of the following best illustrates'), true)
assert.equal(pdfText.includes('[Fig.]'), false)
for (const label of labels) assert.equal(pdfText.includes(`${label}.`), true)
const pdfImages = pdfImageDimensions(pdfPath)
assert.deepEqual(
  pdfImages.dimensions,
  surfaceQuestion.options.map((option) => [
    option.figure.pixelWidth,
    option.figure.pixelHeight,
  ]),
)
assert.ok(pdfImagePixelIdentityEvidence)
writeFileSync(path.join(artifactRoot, 'q33-student.pdfinfo.txt'), pdfInfo)
writeFileSync(path.join(artifactRoot, 'q33-student.pdfimages.txt'), pdfImages.listing)
writeFileSync(path.join(artifactRoot, 'q33-student.txt'), pdfText)
execFileSync('pdftoppm', [
  '-png',
  '-r',
  '140',
  pdfPath,
  path.join(artifactRoot, 'q33-student-page'),
])
const rasterFiles = readdirSync(artifactRoot)
  .filter((name) => /^q33-student-page-\d+\.png$/.test(name))
  .sort()
assert.ok(rasterFiles.length > 0)
writeFileSync(
  path.join(artifactRoot, 'evidence.json'),
  `${JSON.stringify({
    canaryDigest: canary.canaryManifest.canaryDigest,
    confirmationDigest: canary.confirmedSelection.confirmationDigest,
    selectedArtifactDigests,
    placementPolicy: canary.policy.rendererOwnership,
    screenPlacementSignature: surfaceQuestion.figurePlacement.signature,
    pdfPath: path.relative(repoRoot, pdfPath),
    rasterFiles,
    pdfImageDimensions: pdfImages.dimensions,
    pdfImagePixelIdentities: pdfImagePixelIdentityEvidence,
  }, null, 2)}\n`,
)

console.log(JSON.stringify({
  status: 'PASS',
  canaryDigest: canary.canaryManifest.canaryDigest,
  selectedMethods: canary.confirmedSelection.confirmedSelections.map(
    (selection) => selection.method,
  ),
  artifactRoot,
  pdfPath,
  rasterFiles,
}, null, 2))
