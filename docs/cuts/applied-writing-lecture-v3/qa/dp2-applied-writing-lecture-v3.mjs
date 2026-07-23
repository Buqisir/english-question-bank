import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('../../../../app/node_modules/playwright')

const baseUrl = process.env.AWL_V3_QA_URL ?? 'http://127.0.0.1:5173'
const failures = []

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`)
  else {
    console.error(`FAIL ${message}`)
    failures.push(message)
  }
}

async function openWritingLecture(page, paperId) {
  await page.goto(`${baseUrl}/?view=paper-browse&paperId=${paperId}&lecture=1`)
  await page.getByRole('button', { name: '应用文写作' }).click()
  await page.getByRole('button', { name: '点击查看范文讲评' }).click()
  await page.locator('.awl-stage').waitFor()
}

async function stageGeometry(page, expectedNotes, label) {
  const result = await page.evaluate(() => {
    const stage = document.querySelector('.awl-stage')?.getBoundingClientRect()
    const frame = document.querySelector('.awl-stage-frame')?.getBoundingClientRect()
    const notes = [...document.querySelectorAll('.awl-note')].map((node) => node.getBoundingClientRect())
    const overlap = notes.some((first, index) =>
      notes.some((second, otherIndex) => index < otherIndex && !(first.right <= second.left || first.left >= second.right || first.bottom <= second.top || first.top >= second.bottom)),
    )
    return {
      stage: stage ? [stage.width, stage.height] : null,
      frame: frame ? [frame.width, frame.height] : null,
      noteCount: notes.length,
      allInside: Boolean(stage) && notes.every((note) => note.left >= stage.left && note.right <= stage.right && note.top >= stage.top && note.bottom <= stage.bottom),
      overlap,
      leaders: document.querySelectorAll('.awl-leaders path[marker-end]').length,
    }
  })
  check(result.stage?.[0] === 794 && result.stage?.[1] === 472, `${label}: exact 794×472 stage`)
  check(result.frame?.[0] === 612 && result.frame?.[1] === 458, `${label}: exact 612×458 frame`)
  check(result.noteCount === expectedNotes && result.leaders === expectedNotes, `${label}: ${expectedNotes}/${expectedNotes} notes and leaders`)
  check(result.allInside && !result.overlap, `${label}: notes stay in paper without overlap`)
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 719 } })

  for (const paperId of ['paper-2022-i', 'paper-2024-i']) {
    await openWritingLecture(page, paperId)
    await stageGeometry(page, 5, `${paperId} review`)
    await page.getByRole('tab', { name: '亮点句式' }).click()
    await stageGeometry(page, 4, `${paperId} highlight`)
  }

  await page.setViewportSize({ width: 1200, height: 719 })
  await page.goto(`${baseUrl}/?view=paper-browse&paperId=paper-2024-i&lecture=1`)
  await page.getByRole('button', { name: '应用文写作' }).click()
  await page.getByRole('button', { name: '点击查看范文讲评' }).click()
  check((await page.locator('.awl-stage').count()) === 0, 'narrow canvas keeps v3 unmounted')

  await page.setViewportSize({ width: 1470, height: 719 })
  await openWritingLecture(page, 'paper-2024-i')
  await page.getByRole('button', { name: '读后续写' }).click()
  await page.keyboard.press('End')
  check((await page.locator('.awl-stage').count()) === 0, 'continuation selection tears down active application stage')

  const malformed = JSON.parse(
    await readFile(new URL('../../../../app/public/paper-assets/paper-2024-i/latest/analyses/writing-analysis-v1.json', import.meta.url)),
  )
  const firstWriting = malformed.groups[Object.keys(malformed.groups)[0]].writing
  firstWriting.reviewMarks[0].note = ' malformed '
  await page.route('**/paper-2024-i/latest/analyses/writing-analysis-v1.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(malformed) }),
  )
  await page.goto(`${baseUrl}/?view=paper-browse&paperId=paper-2024-i&lecture=1`)
  await page.getByRole('button', { name: '应用文写作' }).click()
  check(await page.getByRole('button', { name: '解析未发布' }).isVisible(), 'malformed-present payload is unavailable')
  check((await page.locator('.awl-stage').count()) === 0, 'malformed-present payload has zero stage DOM')
} finally {
  await browser.close()
}

if (failures.length) process.exitCode = 1
