#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { admitCanonicalPaperImport } from '../server/paper-canonical/publication.mjs'
import {
  makeReadingOptionFigureFixture,
  readingOptionFigureFixtureOracle,
} from '../test-fixtures/paper-canonical/readingOptionFigureFixture.mjs'

const persistActualArtifacts = process.argv.includes('--actual-artifacts')
const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const artifactRoot = persistActualArtifacts
  ? path.resolve('.scratch/source-faithful-visual-import-ticket-03', exactHead)
  : mkdtempSync(path.join(tmpdir(), 'eqb-reading-option-figure-rendered-'))
mkdirSync(artifactRoot, { recursive: true })

function project(consumption) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId: readingOptionFigureFixtureOracle.groupId,
  })
}

function figureQuestion(group) {
  const question = group.questions.find(
    (candidate) => candidate.optionMode === 'figure',
  )
  assert.ok(question, 'fixture contains one Figure Option question')
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

function syntheticPrintItem(group) {
  return {
    detail: {
      id: group.groupId,
      paperId: group.paperId,
      title: 'Generic Figure Option QA',
      source: 'Generic Figure Option QA',
      groupType: 'reading',
      passage: {
        title: 'POISONED LEGACY TITLE',
        materialText: 'POISONED LEGACY PASSAGE [Fig.]',
      },
      questions: group.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: 'B',
        explanation: 'teacher explanation supplement',
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 2.5,
    sectionTitle: 'Reading',
    note: '',
  }
}

function pdfPages(pdfPath) {
  const bbox = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-'], {
    encoding: 'utf8',
  })
  return [...bbox.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(
    (match) => match[1]
      .replace(/&#x([0-9a-f]+);/gi, (_value, codePoint) =>
        String.fromCodePoint(Number.parseInt(codePoint, 16)))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function assertA4(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const pageSize = /Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)/.exec(info)
  assert.ok(pageSize, 'PDF declares A4')
  assert.ok(Math.abs(Number(pageSize[1]) - 595.276) <= 0.5)
  assert.ok(Math.abs(Number(pageSize[2]) - 841.89) <= 0.5)
  return info
}

function assertAtomicBoundary(pdfPath, questionNo) {
  const pages = pdfPages(pdfPath)
  const markerPage = pages.findIndex((page) => page.includes('BOUNDARY-MARKER'))
  const questionPage = pages.findIndex((page) => page.includes(`${questionNo}.`))
  assert.notEqual(markerPage, -1, 'forced boundary marker is extractable')
  assert.equal(
    questionPage,
    markerPage + 1,
    'Figure question moves atomically to the next A4 page',
  )
  for (const label of ['A.', 'B.', 'C.', 'D.']) {
    assert.equal(
      pages[questionPage].includes(label),
      true,
      `Figure stem and ${label} bank remain on one PDF page`,
    )
  }
  return { markerPage: markerPage + 1, questionPage: questionPage + 1 }
}

async function figureGeometry(page, surface) {
  const root = surface === 'screen'
    ? page.locator('.ps-option-list--figure')
    : page.locator('.canonical-figure-options')
  const itemSelector = surface === 'screen'
    ? '.ps-option--figure'
    : '.canonical-figure-option'
  const boxSelector = surface === 'screen'
    ? '.ps-option-figure-box'
    : '.canonical-figure-option-box'
  const imageSelector = surface === 'screen'
    ? '.ps-option-figure-image'
    : '.canonical-figure-option-image'
  const labelSelector = surface === 'screen'
    ? '.ps-option-label--figure'
    : '.canonical-figure-option-label'
  return root.evaluate((element, selectors) => {
    const rect = (target) => {
      const value = target.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        right: value.right,
        bottom: value.bottom,
      }
    }
    const viewport = selectors.screen
      ? element.parentElement
      : element
    return {
      list: rect(element),
      viewport: rect(viewport),
      paper: rect(element.closest(selectors.screen ? '.ps-page' : 'body')),
      question: rect(element.closest(
        selectors.screen ? '.ps-question' : '.question',
      )),
      clientWidth: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      items: [...element.querySelectorAll(selectors.itemSelector)].map(rect),
      labels: [...element.querySelectorAll(selectors.labelSelector)].map(rect),
      boxes: [...element.querySelectorAll(selectors.boxSelector)].map(rect),
      images: [...element.querySelectorAll(selectors.imageSelector)].map(
        (image) => ({
          ...rect(image),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          objectFit: getComputedStyle(image).objectFit,
          objectPosition: getComputedStyle(image).objectPosition,
          alt: image.alt,
        }),
      ),
    }
  }, {
    itemSelector,
    labelSelector,
    boxSelector,
    imageSelector,
    screen: surface === 'screen',
  })
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y))
  return width * height
}

function assertEqualTracks(geometry, label) {
  assert.equal(geometry.items.length, 4, `${label} has four tracks`)
  assert.equal(geometry.boxes.length, 4, `${label} has four contain boxes`)
  assert.equal(geometry.images.length, 4, `${label} has four images`)
  const trackWidth = geometry.items[0].width
  for (const item of geometry.items) {
    assert.ok(Math.abs(item.width - trackWidth) <= 0.25, `${label} tracks are equal`)
  }
  for (const image of geometry.images) {
    assert.equal(image.complete, true, `${label} image loads`)
    assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0)
    assert.equal(image.objectFit, 'contain')
    assert.equal(image.objectPosition, '50% 50%')
  }
  assert.deepEqual(
    geometry.images.map((image) => image.alt),
    ['Option A', 'Option B', 'Option C', 'Option D'],
    `${label} uses neutral option identity alt text`,
  )
}

const fixture = makeReadingOptionFigureFixture()
const admission = admitCanonicalPaperImport({
  request: fixture.request,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
  visualConfirmation: {
    candidatePackage: fixture.candidatePackage,
    teacherConfirmation: fixture.teacherConfirmation,
  },
})
assert.equal(admission.ok, true)

const screenConsumption = admission.consumers.screen
const printConsumption = admission.consumers.print_pdf
const screenGroup = project(screenConsumption)
const printGroup = project(printConsumption)
const screenQuestion = figureQuestion(screenGroup)
const printQuestion = figureQuestion(printGroup)
assert.equal(Object.hasOwn(screenQuestion, 'correctOptionId'), false)
assert.equal(
  printQuestion.correctOptionId,
  readingOptionFigureFixtureOracle.optionIds[0],
)
const surfacePayload = buildCanonicalReadingConsumptionSurfaceData({
  consumption: screenConsumption,
  groupId: screenGroup.groupId,
})
const surfaceQuestion = surfacePayload.surfaceData.questions.find(
  (question) => question.id === screenQuestion.questionId,
)
assert.ok(surfaceQuestion?.figurePlacement)
assert.deepEqual(
  screenQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
  printQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
)
assert.deepEqual(
  surfaceQuestion.options.map((option) => ({
    label: option.label,
    kind: option.kind,
    mediaId: option.figure.mediaId,
    sha256: option.figure.sha256,
    alt: option.figure.neutralAlt,
  })),
  screenQuestion.options.map((option) => ({
    label: option.label,
    kind: option.kind,
    mediaId: option.figure.mediaId,
    sha256: option.figure.mediaArtifact.sha256,
    alt: `Option ${option.label}`,
  })),
)

const blocks = [{
  type: 'question_group',
  questionGroupId: printGroup.groupId,
  score: 2.5,
}]
const item = syntheticPrintItem(printGroup)
const printCases = new Map()
for (const versionType of ['student', 'teacher']) {
  const html = buildPrintHtml({
    title: 'Generic Figure Option QA',
    versionType,
    items: [item],
    blocks,
    questionNumberStart: 3,
    printStyle: 'exam',
    canonicalConsumption: printConsumption,
  })
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.equal(html.includes('[Fig.]'), false)
  assert.equal(html.includes('<figcaption'), false)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher')
  assert.equal(html.includes('<strong>【答案】</strong>A'), versionType === 'teacher')
  assert.equal(html.includes('<strong>【答案】</strong>B'), false)
  const sources = dataUrlSources(html, 'canonical-figure-option-image')
  assert.equal(sources.length, 4)
  assert.deepEqual(
    sources.map((source) => sha256(bytesFromDataUrl(source))),
    printQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
    `${versionType} Print HTML retains exact Figure Option PNG bytes`,
  )
  writeFileSync(path.join(artifactRoot, `figure-${versionType}.html`), html)
  printCases.set(versionType, { html, sources })
}
assert.deepEqual(
  printCases.get('student').sources,
  printCases.get('teacher').sources,
  'Student and Teacher Print HTML use the same four image bytes',
)

async function verifyActualSurfaces() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
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
    for (const viewport of [
      { name: 'desktop', width: 1280, height: 900 },
      { name: 'fit-down', width: 640, height: 900 },
      { name: 'extreme-overflow', width: 260, height: 900 },
    ]) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      })
      await page.route('**/qa/canonical-reading-consumption.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(screenConsumption),
        }))
      const url = new URL('canonical-reading-qa.html', appUrl)
      url.searchParams.set('groupId', screenGroup.groupId)
      await page.goto(url.href)
      const list = page.locator('[data-canonical-layout-id="reading-option-figure-layout"]')
      const scrollViewport = page.locator('.ps-option-figure-scroll')
      await list.waitFor()
      assert.equal(await page.locator('[data-canonical-correct-option-id]').count(), 0)
      assert.equal(await page.locator('.ps-option-list--figure').count(), 1)
      assert.equal(await page.locator('.ps-option--figure').count(), 4)
      assert.deepEqual(
        await page.locator('.ps-option-label--figure').allTextContents(),
        ['A.', 'B.', 'C.', 'D.'],
      )
      assert.equal(await scrollViewport.getAttribute('role'), 'group')
      assert.equal(await scrollViewport.getAttribute('aria-label'), 'Figure options A to D')
      assert.equal(await scrollViewport.getAttribute('tabindex'), '0')
      assert.deepEqual(
        await page.locator('.ps-option-figure-image').evaluateAll(
          (images) => images.map((image) => image.getAttribute('src')),
        ),
        printCases.get('student').sources,
        'Screen and Print HTML use the same four source image bytes',
      )
      const geometry = await figureGeometry(page, 'screen')
      assertEqualTracks(geometry, `Screen ${viewport.name}`)
      if (viewport.name === 'desktop') {
        const pxPerPt = 96 / 72
        assert.ok(Math.abs(geometry.list.width - 438.2 * pxPerPt) <= 0.75)
        for (const itemGeometry of geometry.items) {
          assert.ok(Math.abs(itemGeometry.width - 109.55 * pxPerPt) <= 0.5)
        }
        for (const box of geometry.boxes) {
          assert.ok(Math.abs(box.width - 96 * pxPerPt) <= 0.5)
          assert.ok(Math.abs(box.height - 60 * pxPerPt) <= 0.5)
        }
      } else if (viewport.name === 'fit-down') {
        assert.ok(geometry.items[0].width < 109.55 * (96 / 72))
        assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1)
      } else {
        assert.ok(geometry.items[0].width >= 48 * (96 / 72) - 0.5)
        assert.ok(geometry.clientWidth > 0, 'extreme scroll viewport has visible width')
        assert.ok(geometry.scrollWidth > geometry.clientWidth)
        assert.ok(
          intersectionArea(geometry.viewport, geometry.paper) > 0,
          'extreme scroll viewport intersects the visible paper',
        )
        assert.ok(
          intersectionArea(geometry.viewport, geometry.question) > 0,
          'extreme scroll viewport intersects the Figure question',
        )
        assert.ok(
          intersectionArea(geometry.viewport, geometry.items[0]) > 0,
          'extreme viewport exposes the first Option track',
        )
        assert.ok(
          intersectionArea(geometry.viewport, geometry.labels[0]) > 0,
          'extreme viewport exposes the real A. label',
        )
        await scrollViewport.focus()
        assert.equal(
          await scrollViewport.evaluate((element) => document.activeElement === element),
          true,
          'extreme horizontal viewport is keyboard focusable',
        )
        const beforeKeyboardScroll = await scrollViewport.evaluate(
          (element) => element.scrollLeft,
        )
        await page.keyboard.press('ArrowRight')
        await page.waitForFunction(
          () => {
            const viewport = document.querySelector('.ps-option-figure-scroll')
            return viewport && viewport.scrollLeft >= Math.min(
              16,
              viewport.scrollWidth - viewport.clientWidth,
            )
          },
        )
        const afterArrowRight = await scrollViewport.evaluate(
          (element) => element.scrollLeft,
        )
        assert.ok(afterArrowRight > beforeKeyboardScroll)
        await page.keyboard.press('ArrowLeft')
        await page.waitForFunction(
          () => document.querySelector('.ps-option-figure-scroll')?.scrollLeft === 0,
        )
        const afterArrowLeft = await scrollViewport.evaluate(
          (element) => element.scrollLeft,
        )
        assert.equal(afterArrowLeft, 0, 'ArrowLeft returns keyboard scroll to Option A')
        await scrollViewport.evaluate((element) => element.blur())
        if (persistActualArtifacts) {
          writeFileSync(
            path.join(artifactRoot, 'screen-extreme-overflow-geometry.json'),
            `${JSON.stringify({
              viewportWidth: geometry.clientWidth,
              scrollWidth: geometry.scrollWidth,
              questionWidth: geometry.question.width,
              visibleFirstTrackWidth: geometry.items[0].width,
              visibleFirstLabel: 'A.',
              keyboardScroll: {
                before: beforeKeyboardScroll,
                afterArrowRight,
                afterArrowLeft,
              },
            }, null, 2)}\n`,
          )
        }
      }
      if (persistActualArtifacts) {
        await page.screenshot({
          path: path.join(artifactRoot, `screen-${viewport.name}.png`),
          fullPage: true,
        })
      }
      await page.close()
    }

    for (const [versionType, printCase] of printCases) {
      const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
      await page.setContent(printCase.html, { waitUntil: 'load' })
      const geometry = await figureGeometry(page, 'print')
      assertEqualTracks(geometry, `Print ${versionType}`)
      const pxPerPt = 96 / 72
      assert.ok(Math.abs(geometry.list.width - 438.2 * pxPerPt) <= 0.75)
      for (const itemGeometry of geometry.items) {
        assert.ok(Math.abs(itemGeometry.width - 109.55 * pxPerPt) <= 0.5)
      }
      for (const box of geometry.boxes) {
        assert.ok(Math.abs(box.width - 96 * pxPerPt) <= 0.5)
        assert.ok(Math.abs(box.height - 60 * pxPerPt) <= 0.5)
      }
      if (persistActualArtifacts) {
        await page.screenshot({
          path: path.join(artifactRoot, `print-${versionType}.png`),
          fullPage: true,
        })
      }
      await page.close()
    }

    const boundaryQuestionSelector =
      `<div class="question question--canonical-figure" data-canonical-question-id="${printQuestion.questionId}"`
    assert.equal(printCases.get('student').html.includes(boundaryQuestionSelector), true)
    const boundaryHtml = printCases.get('student').html
      .replace(
        '</style>',
        '.qa-boundary-filler{break-before:page;height:650pt;font-size:8pt}</style>',
      )
      .replace(
        boundaryQuestionSelector,
        `<div class="qa-boundary-filler">BOUNDARY-MARKER</div>${boundaryQuestionSelector}`,
      )
    writeFileSync(path.join(artifactRoot, 'figure-student-a4-boundary.html'), boundaryHtml)
    const boundaryPage = await browser.newPage()
    await boundaryPage.setContent(boundaryHtml, { waitUntil: 'load' })
    const pdfPath = path.join(artifactRoot, 'figure-student-a4-boundary.pdf')
    const pdfBytes = await boundaryPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
    const pdfInfo = assertA4(pdfPath)
    const boundary = assertAtomicBoundary(pdfPath, printQuestion.questionNo)
    execFileSync('pdftoppm', [
      '-png',
      '-r',
      '120',
      pdfPath,
      path.join(artifactRoot, 'figure-student-a4-boundary-page'),
    ])
    const rasterFiles = readdirSync(artifactRoot)
      .filter((name) => /^figure-student-a4-boundary-page-\d+\.png$/.test(name))
      .sort()
    assert.equal(rasterFiles.length >= boundary.questionPage, true)
    const pdfImageList = execFileSync('pdfimages', ['-list', pdfPath], {
      encoding: 'utf8',
    })
    const pdfImageDimensions = [...pdfImageList.matchAll(
      /^\s+\d+\s+\d+\s+image\s+(\d+)\s+(\d+)/gm,
    )].map((match) => [Number(match[1]), Number(match[2])])
    assert.deepEqual(
      pdfImageDimensions,
      printQuestion.options.map((option) => [
        option.figure.mediaArtifact.pixelWidth,
        option.figure.mediaArtifact.pixelHeight,
      ]),
      'PDF preserves four projected media identities and intrinsic dimensions in A-D order',
    )
    writeFileSync(path.join(artifactRoot, 'figure-student-a4-boundary.pdfinfo.txt'), pdfInfo)
    writeFileSync(
      path.join(artifactRoot, 'figure-student-a4-boundary.pdfimages.txt'),
      `${pdfImageList}\nPDF image streams are browser-encoded; this evidence does not claim source PNG byte identity.\n`,
    )
    writeFileSync(
      path.join(artifactRoot, 'evidence.json'),
      `${JSON.stringify({
        fixture: 'generic-reading-option-figure',
        sourceAspectRatios: screenQuestion.options.map((option) => ({
          label: option.label,
          width: option.figure.mediaArtifact.pixelWidth,
          height: option.figure.mediaArtifact.pixelHeight,
          sha256: option.figure.mediaArtifact.sha256,
        })),
        placementSignature: surfaceQuestion.figurePlacement.signature,
        boundary,
        rasterFiles,
        pdfByteClaim: 'Browser PDF image streams may be re-encoded; source PNG byte identity is asserted only through Screen and Student/Teacher Print HTML data URLs.',
      }, null, 2)}\n`,
    )
    await boundaryPage.close()
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await verifyActualSurfaces()

if (persistActualArtifacts) {
  console.log(`ACTUAL_ARTIFACTS ${artifactRoot}`)
} else {
  rmSync(artifactRoot, { recursive: true, force: true })
}
console.log('PASS Reading Option Figure rendered behavior')
