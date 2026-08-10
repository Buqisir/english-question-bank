#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-rendered-'))
const evidenceRoot = path.join(rootDir, 'output/playwright/vocabulary-closed-loop')
mkdirSync(evidenceRoot, { recursive: true })

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  assert.ok(port > 0)
  return port
}

const vitePort = await freePort()
const origin = `http://127.0.0.1:${vitePort}`
const fixtureVisualPath = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-visual-manifest-v1.json'), 'utf8')).entries[0].path
const clippedVisualFixtures = [
  '/vocabulary-assets/wanwei-round-one-v1/visuals/koboyo-v1/wanwei-core-0216-just--hand-counting.svg',
  '/vocabulary-assets/wanwei-round-one-v1/visuals/koboyo-v1/wanwei-core-0217-keep--locker.svg',
]
const children = []
let passed = 0

function silentWav() {
  const sampleCount = 800
  const buffer = Buffer.alloc(44 + sampleCount * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(sampleCount * 2, 40)
  return buffer
}

function pass(label) {
  passed += 1
  console.log(`PASS ${label}`)
}

function startVite() {
  const child = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: path.join(rootDir, 'app'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
}

async function waitForHttp(url, timeoutMs = 25_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function entry(index) {
  const number = index + 1
  const isLongestFixture = number === 60
  const fixtureHeadword = ['about', 'advice', 'accept'][index] ?? `word${number}`
  const americanParts = isLongestFixture
    ? [
        { spelling: 'policeman', phonetic: '/pəˈliːsmən/' },
        { spelling: 'policewoman', phonetic: '/pəˈliːswʊmən/' },
        { spelling: 'policemen', phonetic: '/pəˈliːsmən/' },
        { spelling: 'policewomen', phonetic: '/pəˈliːswɪmɪn/' },
      ]
    : [{ spelling: 'word', phonetic: '/wɜːrd/' }, { spelling: String(number), phonetic: `/${number}/` }]
  const britishParts = isLongestFixture
    ? americanParts.map((part) => ({ ...part, phonetic: part.phonetic.replaceAll('r', '') }))
    : [{ spelling: 'word', phonetic: '/wɜːd/' }, { spelling: String(number), phonetic: `/${number}/` }]
  return {
    id: `fixture-${String(number).padStart(4, '0')}`,
    headword: isLongestFixture ? 'policeman / policewoman (pl. policemen / policewomen)' : fixtureHeadword,
    phonetic: `/wɜːd ${number}/`,
    phonetics: {
      american: `/wɜːd ${number}/`,
      british: `/wɜːd brɪtɪʃ ${number}/`,
    },
    partOfSpeech: 'n.',
    sourceMeanings: number === 1
      ? ['上升；升起；提高；起床', '变得更加成功（或重要、强大等）', '升起；增加；提高']
      : [`含义 ${number}`],
    teachingSense: isLongestFixture ? '姑母、姨母等女性长辈' : `第 ${number} 个教学义`,
    examFrequency: 1,
    pronunciationMode: isLongestFixture ? 'forms' : 'syllables',
    syllables: americanParts,
    pronunciationParts: { american: americanParts, british: britishParts },
    example: {
      english: isLongestFixture ? 'The wind blew the leaves to the other side of the road.' : `We remember ${fixtureHeadword} today.`,
      chinese: isLongestFixture ? '诺拉想出了一个有创意的办法来重复使用这些箱子。' : `我们今天记住第 ${number} 个词。`,
      highlight: isLongestFixture ? 'wind' : fixtureHeadword,
      reviewStatus: 'approved',
    },
    visual: {
      key: `fixture-visual-${number}`,
      version: 'koboyo-v1',
      path: clippedVisualFixtures[index] ?? fixtureVisualPath,
      alt: `第 ${number} 个单词的清晰教学场景`,
    },
    audio: {
      key: `fixture-audio-${number}`,
      version: 'eqb-british-teacher-v1',
      path: `/fixture-audio/word-${number}.mp3`,
      voice: 'eqb-british-teacher-v1',
    },
    source: {
      title: '万唯系列中考词汇一轮梳理',
      edition: '第8版',
      stage: index < 10 ? 'core' : 'basic',
      day: Math.floor(index / 10) + 1,
      sourceOrder: number,
      printedPage: Math.floor(index / 8) + 1,
      verification: 'page-checked',
    },
  }
}

const programEntries = Array.from({ length: 60 }, (_, index) => entry(index))
const publicEntries = programEntries.map(({ example: _example, source: _source, sourceMeanings: _sourceMeanings, examFrequency: _examFrequency, ...item }) => item)
const publicDictationEntries = programEntries.map((item) => ({
  id: item.id,
  answer: item.pronunciationMode === 'forms'
    ? item.pronunciationParts.american[0].spelling
    : item.headword,
  partOfSpeech: item.partOfSpeech,
  sourceMeanings: item.sourceMeanings,
  teachingSense: item.teachingSense,
  audio: item.audio,
}))
const defaultStudent = {
  id: 'student-default',
  displayName: '默认学生',
  isDefault: true,
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
}
const alternateStudent = {
  id: 'student-alternate',
  displayName: '小林',
  isDefault: false,
  createdAt: '2026-08-08T12:00:00.000Z',
  updatedAt: '2026-08-08T12:00:00.000Z',
}
const sets = [1, 15, 60].map((count) => ({
  id: `set-${count}`,
  studentId: defaultStudent.id,
  programId: 'wanwei-round-one-v1',
  reviewRunId: `run-${count}`,
  title: `固定生词组 ${count} 词`,
  entryCount: count,
  entries: programEntries.slice(0, count),
  createdAt: '2026-08-07T12:00:00.000Z',
  share: { shareId: `share-${count}`, status: 'active' },
}))

const program = {
  id: 'wanwei-round-one-v1',
  version: '2026-08-07-v1',
  title: '中考词汇一轮',
  subtitle: '1600 词闭环课程',
  sourceTitle: '万唯系列中考词汇一轮梳理',
  sourceEdition: '第8版',
  totalPlannedEntries: 1600,
  groups: Array.from({ length: 6 }, (_, index) => ({
    id: `day-${index + 1}`,
    stage: index === 0 ? 'core' : 'basic',
    week: Math.floor(index / 2) + 1,
    group: index + 1,
    sourceLabel: `Day ${index + 1}`,
    startOrder: index * 10 + 1,
    endOrder: index * 10 + 10,
  })),
  entries: programEntries,
}

async function installApiFixtures(page, {
  programFails = false,
  resumeFrozen = false,
  currentActive = false,
  continuityScope = null,
  britishReady = true,
} = {}) {
  const fixtureStudents = [defaultStudent, alternateStudent]
  let continuityRun = null
  const renamedTitles = new Map()
  await page.route('**/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/ready.json')) {
      if (!britishReady) return route.fulfill({ status: 404, body: 'Not ready' })
      return route.fulfill({ json: {
        version: 'eqb-british-cori-high-v1',
        entryCount: 1600,
        fileNamePattern: '{entryId}.mp3',
      } })
    }
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() })
  })
  await page.route('**/fixture-audio/**', (route) => route.fulfill({
    status: 200,
    contentType: 'audio/wav',
    body: silentWav(),
  }))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (pathname === '/api/auth/me') {
      await route.fulfill({ json: { authRequired: false, user: null } })
    } else if (pathname === '/api/vocabulary/students' && route.request().method() === 'POST') {
      const input = JSON.parse(route.request().postData() || '{}')
      const student = {
        id: `student-created-${fixtureStudents.length}`,
        displayName: input.displayName,
        isDefault: false,
        createdAt: '2026-08-09T12:00:00.000Z',
        updatedAt: '2026-08-09T12:00:00.000Z',
      }
      fixtureStudents.push(student)
      await route.fulfill({ status: 201, json: { student } })
    } else if (pathname === '/api/vocabulary/students') {
      await route.fulfill({ json: { students: fixtureStudents } })
    } else if (pathname === '/api/vocabulary/programs/wanwei-round-one-v1') {
      await route.fulfill(programFails
        ? { status: 503, json: { message: '完整词库暂时不可用。' } }
        : { json: { program } })
    } else if (pathname === '/api/vocabulary/progress/wanwei-round-one-v1') {
      const studentId = url.searchParams.get('studentId')
      await route.fulfill({ json: { progress: {
        studentId,
        cursor: studentId === defaultStudent.id ? 12 : 0,
        lastTarget: studentId === alternateStudent.id ? 20 : 15,
      } } })
    } else if (pathname === '/api/vocabulary/review-runs/current') {
      await route.fulfill({ json: { reviewRun: currentActive ? {
        id: 'run-current',
        studentId: defaultStudent.id,
        programId: 'wanwei-round-one-v1',
        mode: 'main',
        targetUnfamiliarCount: 15,
        cursor: 1,
        status: 'active',
        decisions: { [programEntries[0].id]: 'known' },
        decisionOrder: [programEntries[0].id],
      } : continuityRun } })
    } else if (pathname === '/api/vocabulary/review-runs' && route.request().method() === 'POST' && continuityScope) {
      const input = JSON.parse(route.request().postData() || '{}')
      assert.equal(input.mode, 'main')
      assert.equal('temporaryDay' in input, false)
      assert.equal('temporaryStage' in input, false)
      if (continuityRun) {
        await route.fulfill({ status: 201, json: { reviewRun: continuityRun } })
        return
      }
      continuityRun = {
        id: 'run-continuity',
        studentId: input.studentId,
        programId: input.programId,
        mode: 'main',
        targetUnfamiliarCount: input.targetUnfamiliarCount,
        cursor: 0,
        status: 'active',
        decisions: {},
        decisionOrder: [],
      }
      await route.fulfill({ status: 201, json: { reviewRun: continuityRun } })
    } else if (/^\/api\/vocabulary\/review-runs\/run-continuity\/decision$/.test(pathname) && route.request().method() === 'PATCH' && continuityScope) {
      const input = JSON.parse(route.request().postData() || '{}')
      assert.ok(continuityRun)
      assert.equal(input.entryId, programEntries[continuityRun.cursor].id)
      continuityRun = {
        ...continuityRun,
        cursor: continuityRun.cursor + 1,
        decisions: { ...continuityRun.decisions, [input.entryId]: input.verdict },
        decisionOrder: [...continuityRun.decisionOrder, input.entryId],
      }
      await route.fulfill({ json: { reviewRun: continuityRun } })
    } else if (/^\/api\/vocabulary\/review-runs\/run-continuity\/undo$/.test(pathname) && route.request().method() === 'POST' && continuityScope) {
      assert.ok(continuityRun)
      const removedEntryId = continuityRun.decisionOrder.at(-1)
      const nextDecisions = { ...continuityRun.decisions }
      if (removedEntryId) delete nextDecisions[removedEntryId]
      continuityRun = {
        ...continuityRun,
        cursor: Math.max(0, continuityRun.cursor - 1),
        decisions: nextDecisions,
        decisionOrder: continuityRun.decisionOrder.slice(0, -1),
      }
      await route.fulfill({ json: { reviewRun: continuityRun } })
    } else if (pathname.startsWith('/api/vocabulary/review-runs/') && route.request().method() === 'DELETE') {
      await route.fulfill({ json: { ok: true } })
    } else if (pathname === '/api/vocabulary/sets' && route.request().method() === 'POST') {
      const input = JSON.parse(route.request().postData() || '{}')
      assert.equal(fixtureStudents.some((student) => student.id === input.studentId), true)
      const selectedEntries = input.entryIds.map((entryId) => programEntries.find((item) => item.id === entryId))
      assert.equal(selectedEntries.every(Boolean), true)
      await route.fulfill({ status: 201, json: { vocabularySet: {
        id: 'set-input',
        studentId: input.studentId,
        programId: 'wanwei-round-one-v1',
        reviewRunId: null,
        title: `输入词表 · ${selectedEntries.length}词`,
        entryCount: selectedEntries.length,
        entries: selectedEntries,
        createdAt: '2026-08-09T12:00:00.000Z',
        share: null,
      } } })
    } else if (/^\/api\/vocabulary\/sets\/set-(1|15|60)$/.test(pathname) && route.request().method() === 'PATCH') {
      const count = Number(pathname.match(/set-(\d+)/)?.[1])
      const input = JSON.parse(route.request().postData() || '{}')
      renamedTitles.set(count, input.title)
      const original = sets.find((item) => item.entryCount === count)
      await route.fulfill({ json: { vocabularySet: { ...original, title: input.title } } })
    } else if (/^\/api\/vocabulary\/sets\/set-(1|15|60)\/pdf$/.test(pathname)) {
      const count = Number(pathname.match(/set-(\d+)/)?.[1])
      const accent = url.searchParams.get('accent')
      const kind = url.searchParams.get('kind') ?? 'cards'
      assert.ok(['american', 'british'].includes(accent))
      assert.ok(['cards', 'dictation', 'answer'].includes(kind))
      const rawTitle = renamedTitles.get(count) ?? `固定生词组 ${count} 词`
      const exportTitle = rawTitle.replace(new RegExp(`[·\\s-]*${count}\\s*词$`, 'u'), '').trim() || rawTitle
      const fileName = kind === 'dictation'
        ? `${exportTitle}-听写纸-${count}词-${accent === 'american' ? '美式' : '英式'}.pdf`
        : kind === 'answer'
          ? `${exportTitle}-教师答案-${count}词.pdf`
          : `${rawTitle}${renamedTitles.has(count) ? `-${count}词` : ''}-${accent === 'american' ? '美式' : '英式'}.pdf`
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'x-file-name': encodeURIComponent(fileName) },
        body: Buffer.from('%PDF-1.4\n%%EOF\n'),
      })
    } else if (/^\/api\/vocabulary\/sets\/set-(1|15|60)$/.test(pathname)) {
      const count = Number(pathname.match(/set-(\d+)/)?.[1])
      await route.fulfill({ json: { vocabularySet: sets.find((item) => item.entryCount === count) } })
    } else if (pathname === '/api/vocabulary/sets') {
      const studentId = url.searchParams.get('studentId')
      await route.fulfill({ json: { vocabularySets: studentId === defaultStudent.id ? sets : [] } })
    } else if (resumeFrozen && pathname === '/api/vocabulary/review-runs/run-15') {
      await route.fulfill({ json: {
        reviewRun: {
          id: 'run-15',
          studentId: defaultStudent.id,
          programId: 'wanwei-round-one-v1',
          mode: 'main',
          targetUnfamiliarCount: 15,
          cursor: 15,
          status: 'frozen',
          decisions: Object.fromEntries(programEntries.slice(0, 15).map((item) => [item.id, 'unfamiliar'])),
          decisionOrder: programEntries.slice(0, 15).map((item) => item.id),
        },
        vocabularySet: sets.find((item) => item.reviewRunId === 'run-15'),
      } })
    } else if (pathname === '/api/question-groups') {
      await route.fulfill({ json: { questionGroups: [] } })
    } else if (pathname.startsWith('/api/public/vocabulary/dictation/')) {
      const shareId = pathname.split('/').at(-1)
      if (shareId === 'revoked') {
        await route.fulfill({ status: 410, json: { message: '这份听写练习已停止分享。' } })
      } else if (shareId === 'missing') {
        await route.fulfill({ status: 404, json: { message: '没有找到这份听写练习。' } })
      } else {
        const count = Number(shareId?.replace('share-', ''))
        assert.ok([1, 15, 60].includes(count), `Unexpected public dictation fixture share: ${shareId}`)
        await route.fulfill({ json: { vocabularySet: {
          title: `固定生词组 ${count} 词`,
          entryCount: count,
          entries: publicDictationEntries.slice(0, count),
          createdAt: '2026-08-07T12:00:00.000Z',
        } } })
      }
    } else if (pathname.startsWith('/api/public/vocabulary/listen/')) {
      const shareId = pathname.split('/').at(-1)
      if (shareId === 'revoked') {
        await route.fulfill({ status: 410, json: { message: '这份听写单已停止分享。' } })
      } else if (shareId === 'missing') {
        await route.fulfill({ status: 404, json: { message: '没有找到这份听写单。' } })
      } else {
        const count = Number(shareId?.replace('share-', ''))
        assert.ok([1, 15, 60].includes(count), `Unexpected public fixture share: ${shareId}`)
        await route.fulfill({ json: { vocabularySet: {
          title: `固定生词组 ${count} 词`,
          entryCount: count,
          entries: publicEntries.slice(0, count),
          createdAt: '2026-08-07T12:00:00.000Z',
        } } })
      }
    } else {
      await route.fulfill({ json: {} })
    }
  })
}

async function verifyScopePreviewAndReviewKeys(page) {
  await page.addInitScript(() => {
    window.__reviewAudioLog = []
    HTMLMediaElement.prototype.play = function play() {
      window.__reviewAudioLog.push({ type: 'play', src: this.getAttribute('src'), at: performance.now() })
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function pause() {
      window.__reviewAudioLog.push({ type: 'pause', src: this.getAttribute('src'), at: performance.now() })
    }
  })
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })

  await page.getByLabel('目标生词数').waitFor()
  assert.equal(await page.getByLabel('从哪里开始').count(), 0)
  assert.equal(await page.locator('.vocabulary-scope-preview').count(), 0)
  assert.equal(await page.getByLabel('目标生词数').count(), 1)
  assert.match(await page.locator('.vocabulary-recent-sets li').filter({ hasText: '固定生词组 15 词' }).innerText(), /about、advice、accept/)
  await page.screenshot({ path: path.join(evidenceRoot, 'review-unified-progress-desktop.png'), fullPage: true })
  pass('开始页只保留一个主进度入口，最近生词组直接显示实际词目')

  assert.equal(await page.getByRole('button', { name: '美音' }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: '英音' }).click()
  assert.equal(await page.evaluate(() => window.localStorage.getItem('eqb-vocabulary-review-accent-wanwei-round-one-v1')), 'british')
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.getByRole('button', { name: '英音' }).getAttribute('aria-pressed'), 'true')
  pass('开始过词处可选美音或英音，并在刷新后记住上次选择')

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileLayout = await page.locator('.vocabulary-run-setup').evaluate((node) => ({
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(mobileLayout.left >= 0)
  assert.ok(mobileLayout.right <= mobileLayout.viewportWidth)
  assert.equal(mobileLayout.scrollWidth, mobileLayout.viewportWidth)
  await page.screenshot({ path: path.join(evidenceRoot, 'review-unified-progress-mobile-390x844.png'), fullPage: true })
  pass('390px 下统一进度入口与小型音色选择自然换行且无横向溢出')
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.evaluate(() => { window.__reviewAudioLog.length = 0 })
  await page.getByRole('button', { name: '开始过词' }).click()
  await page.getByRole('heading', { name: 'about', exact: true }).waitFor()
  assert.equal(await page.getByText('Day 1', { exact: true }).count(), 1)
  await page.getByRole('button', { name: /^看提示/ }).click()
  assert.equal(await page.getByText('上升；升起；提高；起床；变得更加成功（或重要、强大等）；升起；增加；提高', { exact: true }).count(), 1)
  await page.screenshot({ path: path.join(evidenceRoot, 'review-core-meanings-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: '暂停并返回' }).click()
  await page.getByRole('button', { name: '继续过词' }).waitFor()
  assert.equal(await page.getByLabel('目标生词数').isDisabled(), true)
  assert.equal(await page.evaluate(() => window.localStorage.getItem('eqb-vocabulary-review-paused-wanwei-round-one-v1:student-default')), 'run-continuity')
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '继续过词' }).waitFor()
  await page.getByRole('button', { name: '继续过词' }).click()
  await page.getByRole('heading', { name: 'about', exact: true }).waitFor()
  pass('暂停返回不丢轮次，重新进入会继续同一服务端主进度')
  await page.waitForFunction(() => window.__reviewAudioLog.some((item) => item.type === 'play'))
  const playSources = () => page.evaluate(() => window.__reviewAudioLog.filter((item) => item.type === 'play').map((item) => item.src))
  assert.equal((await playSources()).at(-1), '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0001.mp3')

  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'advice', exact: true }).waitFor()
  assert.equal((await playSources()).at(-1), '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0002.mp3')
  const beforeReplay = (await playSources()).length
  await page.keyboard.press('Space')
  assert.equal((await playSources()).length, beforeReplay + 1)
  assert.equal((await playSources()).at(-1), '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0002.mp3')

  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(50)
  assert.equal(await page.getByRole('heading', { name: 'advice', exact: true }).count(), 1)
  await page.keyboard.down('Shift')
  await page.keyboard.up('Shift')
  await page.getByRole('heading', { name: 'accept', exact: true }).waitFor()
  assert.equal((await playSources()).at(-1), '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0003.mp3')

  await page.keyboard.press('Delete')
  await page.getByRole('heading', { name: 'advice', exact: true }).waitFor()
  assert.equal((await playSources()).at(-1), '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0002.mp3')
  await page.screenshot({ path: path.join(evidenceRoot, 'review-keyboard-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  await page.screenshot({ path: path.join(evidenceRoot, 'review-keyboard-mobile-390x844.png'), fullPage: true })
  pass('新词自动发音，空格重播，Enter 认识，Shift 收生词，Delete 撤销且旧方向键不再误判')
}

async function verifyDirectSetCreation(page) {
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
  const input = page.getByLabel('用中文逗号隔开')
  await input.fill('about，advice，about，advicee')
  await page.getByText('可生成 2 词', { exact: true }).waitFor()
  assert.equal(await page.getByText('已去重 1', { exact: true }).count(), 1)
  assert.equal(await page.getByText('未收录 1', { exact: true }).count(), 1)
  assert.equal(await page.getByText('未收录：advicee', { exact: true }).count(), 1)
  await page.screenshot({ path: path.join(evidenceRoot, 'direct-input-desktop.png'), fullPage: true })
  const rejectedTerms = Array.from({ length: 9 }, (_, index) => `bad${index + 1}`)
  await input.fill(['about', ...rejectedTerms].join('，'))
  await page.getByText('未收录 9', { exact: true }).waitFor()
  assert.equal(await page.getByText(`未收录：${rejectedTerms.join('，')}`, { exact: true }).count(), 1)
  await input.fill('about，advice，about，advicee')
  await page.getByText('可生成 2 词', { exact: true }).waitFor()
  await page.getByRole('button', { name: '生成固定词组' }).click()
  await page.getByRole('heading', { name: '输入词表 · 2词' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '生成扫码听写' }).count(), 1)
  assert.equal(await page.getByRole('button', { name: '下载', exact: true }).isEnabled(), true)
  await page.getByRole('button', { name: '下载', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /^听写纸/ }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /^教师答案/ }).count(), 1)
  await page.screenshot({ path: path.join(evidenceRoot, 'download-menu-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: /^听写纸/ }).click()
  await page.getByText('这份文件需要扫码播放录音', { exact: true }).waitFor()
  assert.match(await page.locator('.vocabulary-share-download-confirmation').innerText(), /匿名公开听写链接.*随时撤销/s)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(
    await page.locator('.vocabulary-print-entry .vocabulary-print-word-heading h2').allTextContents(),
    ['about', 'advice'],
  )
  await page.screenshot({ path: path.join(evidenceRoot, 'direct-set-desktop.png'), fullPage: true })
  pass('中文逗号输入会按首次出现顺序去重、剔除未收录词，并复用固定词组与扫码下载闭环')
}

async function verifyDirectSetMobileLayout(page) {
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
  await page.getByLabel('用中文逗号隔开').fill('about，advice，advicee')
  const layout = await page.locator('.vocabulary-direct-set').evaluate((node) => ({
    viewportWidth: window.innerWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(layout.left >= 0)
  assert.ok(layout.right <= layout.viewportWidth)
  assert.equal(layout.scrollWidth, layout.viewportWidth)
  await page.screenshot({ path: path.join(evidenceRoot, 'direct-set-mobile.png'), fullPage: true })
  pass('390px 下已有单词输入区自然换行且无横向溢出')
}

async function verifyStudentProfiles(page) {
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
  const switcher = page.getByLabel('切换当前学生')
  await switcher.waitFor()
  assert.equal(await switcher.inputValue(), defaultStudent.id)
  await page.getByText('默认学生 · 已过 12 / 60', { exact: true }).waitFor()
  assert.equal(await page.locator('.vocabulary-recent-sets li').count(), 3)

  await switcher.selectOption(alternateStudent.id)
  await page.getByText('小林 · 已过 0 / 60', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('目标生词数').inputValue(), '20')
  assert.equal(await page.locator('.vocabulary-recent-sets li').count(), 0)

  await page.getByRole('button', { name: '新建学生' }).click()
  await page.getByLabel('学生姓名').fill('小周')
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByText('小周 · 已过 0 / 60', { exact: true }).waitFor()
  assert.equal(await switcher.locator('option').allTextContents().then((items) => items.includes('小周')), true)
  assert.equal(await page.locator('.vocabulary-recent-sets li').count(), 0)
  await page.screenshot({ path: path.join(evidenceRoot, 'student-profiles-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  const layout = await page.locator('.vocabulary-heading-actions').evaluate((node) => ({
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(layout.left >= 0)
  assert.ok(layout.right <= layout.viewportWidth)
  assert.equal(layout.scrollWidth, layout.viewportWidth)
  await page.screenshot({ path: path.join(evidenceRoot, 'student-profiles-mobile.png'), fullPage: true })
  pass('教师可创建并切换学生，进度与最近生词组独立，桌面和 390px 均无溢出')
}

async function verifyPrint(page, count, expectedPages, expectedLastPageCount, accent = 'american') {
  await page.emulateMedia({ media: 'screen' })
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: new RegExp(`固定生词组 ${count} 词`) }).click()
  await page.getByRole('heading', { name: `固定生词组 ${count} 词` }).waitFor()
  const expectedTitle = count === 1 ? '会林第1周生词' : `固定生词组 ${count} 词`
  if (count === 1) await page.getByLabel('单词纸名称').fill(expectedTitle)
  await page.getByLabel('下载读音').selectOption(accent)
  assert.equal(await page.getByRole('button', { name: '下载', exact: true }).isEnabled(), true)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await page.getByRole('button', { name: /^单词纸/ }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), `${expectedTitle}${count === 1 ? `-${count}词` : ''}-${accent === 'american' ? '美式' : '英式'}.pdf`)
  const downloadedPath = path.join(tempRoot, `downloaded-vocabulary-${count}.pdf`)
  await download.saveAs(downloadedPath)
  assert.equal(readFileSync(downloadedPath).subarray(0, 5).toString(), '%PDF-')
  await page.emulateMedia({ media: 'print' })

  const layout = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.vocabulary-print-page')]
    return pages.map((pageNode) => {
      const grid = pageNode.querySelector('.vocabulary-print-grid')
      const cards = [...pageNode.querySelectorAll('.vocabulary-print-entry')]
      const gridStyle = getComputedStyle(grid)
      const gridRect = grid.getBoundingClientRect()
      return {
        words: cards.map((card) => card.querySelector('.vocabulary-print-word-heading h2')?.textContent?.trim()),
        columns: gridStyle.gridTemplateColumns.split(' ').length,
        rows: gridStyle.gridTemplateRows.split(' ').length,
        overflowingCards: cards.filter((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1).length,
        overflowDetails: cards.filter((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1).map((card) => ({
          word: card.querySelector('.vocabulary-print-word-heading h2')?.textContent?.trim(),
          clientWidth: card.clientWidth,
          scrollWidth: card.scrollWidth,
          clientHeight: card.clientHeight,
          scrollHeight: card.scrollHeight,
        })),
        imagesLoaded: cards.every((card) => {
          const image = card.querySelector('img')
          return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && getComputedStyle(image).objectFit === 'contain'
        }),
        imageWidthsMm: cards.map((card) => {
          const visual = card.querySelector('.vocabulary-visual-compact')
          return {
            longHeadword: card.classList.contains('has-long-headword'),
            widthMm: visual.getBoundingClientRect().width / (96 / 25.4),
            paddingMm: Number.parseFloat(getComputedStyle(visual).paddingTop) / (96 / 25.4),
          }
        }),
        contentOrderCorrect: cards.every((card) => {
          const selectors = [
            '.vocabulary-print-word-heading h2',
            '.vocabulary-print-phonetic',
            '.vocabulary-print-meaning',
            '.vocabulary-breakdown-compact',
          ]
          const tops = selectors.map((selector) => card.querySelector(selector)?.getBoundingClientRect().top)
          return tops.every((top) => Number.isFinite(top))
            && tops.every((top, index) => index === 0 || top > tops[index - 1] + 0.5)
        }),
        splitPronunciationComplete: cards.every((card) => {
          const groups = [...card.querySelectorAll('.vocabulary-breakdown-group')]
          return groups.length > 0
            && groups.every((group) => group.querySelector('small')?.textContent?.trim())
        }),
        phonetics: cards.map((card) => ({
          whole: card.querySelector('.vocabulary-print-phonetic')?.textContent?.trim(),
          firstPart: card.querySelector('.vocabulary-breakdown-part small')?.textContent?.trim(),
        })),
        cardCells: cards.map((card) => {
          const rect = card.getBoundingClientRect()
          return {
            col: Math.round((rect.left - gridRect.left) / (gridRect.width / 2)),
            row: Math.round((rect.top - gridRect.top) / (gridRect.height / 3)),
          }
        }),
      }
    })
  })
  assert.equal(layout.length, expectedPages)
  assert.equal(layout.at(-1).words.length, expectedLastPageCount)
  assert.deepEqual(layout.flatMap((pageLayout) => pageLayout.words), programEntries.slice(0, count).map((item) => item.headword))
  assert.deepEqual(
    layout.flatMap((pageLayout) => pageLayout.phonetics),
    programEntries.slice(0, count).map((item) => ({
      whole: item.phonetics[accent],
      firstPart: item.pronunciationParts[accent][0].phonetic,
    })),
  )
  assert.equal(await page.getByText(`${accent === 'american' ? '美式' : '英式'}整词与分节一致`, { exact: false }).count(), expectedPages)
  assert.equal(await page.locator('.vocabulary-print-page').first().locator('h1').textContent(), expectedTitle)
  if (count >= 1) assert.match(await page.locator('.vocabulary-print-meaning strong').first().innerText(), /上升；升起；提高；起床；变得更加成功/)
  for (const pageLayout of layout) {
    assert.equal(pageLayout.columns, 2)
    assert.equal(pageLayout.rows, 3)
    assert.equal(pageLayout.overflowingCards, 0, JSON.stringify(pageLayout.overflowDetails))
    assert.equal(pageLayout.imagesLoaded, true)
    assert.equal(pageLayout.imageWidthsMm.every(({ longHeadword, widthMm }) => widthMm >= (longHeadword ? 33.5 : 41.5)), true)
    assert.equal(pageLayout.imageWidthsMm.every(({ paddingMm }) => paddingMm >= 3.4), true)
    assert.equal(pageLayout.contentOrderCorrect, true)
    assert.equal(pageLayout.splitPronunciationComplete, true)
    assert.deepEqual(pageLayout.cardCells, pageLayout.cardCells.map((_, index) => ({ col: index % 2, row: Math.floor(index / 2) })))
  }
  assert.equal(await page.locator('.vocabulary-print-qr').count(), 1)
  const qr = await page.locator('.vocabulary-print-qr').evaluate((node) => {
    const rect = node.querySelector('svg').getBoundingClientRect()
    const footer = node.closest('.vocabulary-print-footer')
    return {
      page: [...document.querySelectorAll('.vocabulary-print-page')].indexOf(node.closest('.vocabulary-print-page')),
      widthMm: rect.width / (96 / 25.4),
      footerMinHeight: getComputedStyle(footer).minHeight,
      svgTitle: node.querySelector('svg title')?.textContent,
    }
  })
  assert.equal(qr.page, 0)
  assert.ok(qr.widthMm >= 18.5 && qr.widthMm <= 19.5, `QR width was ${qr.widthMm}mm`)
  assert.ok(Math.abs(Number.parseFloat(qr.footerMinHeight) / (96 / 25.4) - 22) < 0.1, `Footer min-height was ${qr.footerMinHeight}`)
  assert.equal(qr.svgTitle, '扫码听写')

  const pdfPath = path.join(tempRoot, `vocabulary-${count}.pdf`)
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  assert.equal(info.status, 0, info.stderr)
  assert.match(info.stdout, new RegExp(`Pages:\\s+${expectedPages}\\b`))
  assert.match(info.stdout, /Page size:\s+59[45]\.\d+ x 841\.\d+ pts \(A4\)/)
  const rasterPrefix = path.join(tempRoot, `vocabulary-${count}`)
  const raster = spawnSync('pdftoppm', ['-png', '-r', '120', pdfPath, rasterPrefix], { encoding: 'utf8' })
  assert.equal(raster.status, 0, raster.stderr)
  const rasterPages = readdirSync(tempRoot)
    .filter((name) => name.startsWith(`vocabulary-${count}-`) && name.endsWith('.png'))
    .map((name) => path.join(tempRoot, name))
  assert.equal(rasterPages.length, expectedPages)
  assert.equal(rasterPages.every((pagePath) => readFileSync(pagePath).length > 10_000), true)
  if (count === 15) {
    copyFileSync(pdfPath, path.join(evidenceRoot, 'vocabulary-paper-current-15.pdf'))
    rasterPages.forEach((pagePath, index) => {
      copyFileSync(pagePath, path.join(evidenceRoot, `vocabulary-paper-current-15-page-${index + 1}.png`))
    })
  }

  const ppmPrefix = path.join(tempRoot, `vocabulary-${count}-pixels`)
  const ppm = spawnSync('pdftoppm', ['-r', '72', pdfPath, ppmPrefix], { encoding: 'utf8' })
  assert.equal(ppm.status, 0, ppm.stderr)
  const ppmPages = readdirSync(tempRoot)
    .filter((name) => name.startsWith(`vocabulary-${count}-pixels-`) && name.endsWith('.ppm'))
    .map((name) => path.join(tempRoot, name))
  assert.equal(ppmPages.length, expectedPages)
  for (const ppmPath of ppmPages) {
    const bytes = readFileSync(ppmPath)
    const header = bytes.subarray(0, 100).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/)
    assert.ok(header, `Invalid PPM raster: ${ppmPath}`)
    const pixelOffset = header[0].length
    const pixelCount = (bytes.length - pixelOffset) / 3
    let nonWhitePixels = 0
    let inkPixels = 0
    for (let offset = pixelOffset; offset < bytes.length; offset += 3) {
      const red = bytes[offset]
      const green = bytes[offset + 1]
      const blue = bytes[offset + 2]
      if (red < 248 || green < 248 || blue < 248) nonWhitePixels += 1
      if ((red + green + blue) / 3 < 120) inkPixels += 1
    }
    assert.ok(nonWhitePixels / pixelCount > 0.005, `Raster page is effectively blank: ${ppmPath}`)
    assert.ok(inkPixels / pixelCount > 0.001, `Raster page has no readable ink: ${ppmPath}`)
  }
  pass(`${count} 词${accent === 'american' ? '美式' : '英式'}可直接下载 PDF，且为 ${expectedPages} 页 A4，2×3、单词→音标→意思→拆分、极端长内容、图片与首页二维码正确`)
}

async function verifyEmbeddedPrintMode(page) {
  await page.goto(`${origin}/?view=vocabulary-review&vocabularyPrintSetId=set-15&printAccent=british`, { waitUntil: 'networkidle' })
  await page.locator('[data-vocabulary-print-state="ready"]').waitFor()
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('.vocabulary-print-page').count(), 3)
  assert.equal(await page.locator('.vocabulary-print-entry').count(), 15)
  assert.equal(await page.locator('.vocabulary-print-qr').count(), 1)
  assert.equal(await page.getByText('英式整词与分节一致', { exact: false }).count(), 3)
  pass('服务端导出模式按固定 Set 与英美音标参数加载同一份 2×3 单词纸 DOM')
}

async function verifyDictationDownloads(page) {
  await page.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /固定生词组 15 词/ }).click()
  await page.getByRole('heading', { name: '固定生词组 15 词' }).waitFor()
  await page.getByLabel('下载读音').selectOption('british')

  let downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await page.getByRole('button', { name: /^听写纸/ }).click()
  let download = await downloadPromise
  assert.equal(download.suggestedFilename(), '固定生词组-听写纸-15词-英式.pdf')

  downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await page.getByRole('button', { name: /^教师答案/ }).click()
  download = await downloadPromise
  assert.equal(download.suggestedFilename(), '固定生词组-教师答案-15词.pdf')
  pass('下载菜单可分别导出听写纸与教师答案，文件名包含名称、用途、题数和听写音色')
}

async function verifyDictationPrint(page, count, expectedPages, accent = 'american') {
  for (const kind of ['dictation', 'answer']) {
    await page.emulateMedia({ media: 'screen' })
    await page.goto(`${origin}/?view=vocabulary-review&vocabularyPrintSetId=set-${count}&printAccent=${accent}&vocabularyPrintMode=${kind}`, { waitUntil: 'networkidle' })
    await page.locator('[data-vocabulary-print-state="ready"]').waitFor()
    await page.emulateMedia({ media: 'print' })

    const pages = page.locator('.vocabulary-print-page')
    const rows = page.locator('.vocabulary-dictation-print-row')
    assert.equal(await pages.count(), expectedPages)
    assert.equal(await rows.count(), count)
    assert.deepEqual(await rows.locator('span').allTextContents(), Array.from({ length: count }, (_, index) => String(index + 1)))
    assert.equal(await page.getByText('英文单词', { exact: true }).count(), expectedPages)
    assert.equal(await page.getByText('词性', { exact: true }).count(), expectedPages)
    assert.equal(await page.getByText('中文意思', { exact: true }).count(), expectedPages)
    assert.equal(await page.locator('.vocabulary-print-sheet').getByText('美式', { exact: true }).count(), 0)
    assert.equal(await page.locator('.vocabulary-print-sheet').getByText('英式', { exact: true }).count(), 0)

    const tableTracks = await page.locator('.vocabulary-dictation-print-table').evaluateAll((tables) => tables.map((table) => ({
      rows: getComputedStyle(table).gridTemplateRows.split(' ').length,
      overflow: table.scrollHeight > table.clientHeight + 1 || table.scrollWidth > table.clientWidth + 1,
    })))
    assert.equal(tableTracks.every((table) => table.rows === 16 && !table.overflow), true)

    if (kind === 'dictation') {
      assert.equal(await rows.locator('strong').allTextContents().then((values) => values.every((value) => !value.trim())), true)
      assert.equal(await rows.locator('i').allTextContents().then((values) => values.every((value) => !value.trim())), true)
      assert.equal(await rows.locator('p').allTextContents().then((values) => values.every((value) => !value.trim())), true)
      assert.equal(await page.locator('.vocabulary-print-qr').count(), 1)
      assert.equal(await pages.first().locator('.vocabulary-print-qr').count(), 1)
      const qrTitle = await page.locator('.vocabulary-print-qr svg title').textContent()
      assert.equal(qrTitle, '扫码自动听写')
    } else {
      assert.equal(await page.locator('.vocabulary-print-qr').count(), 0)
      assert.deepEqual(await rows.locator('strong').allTextContents(), publicDictationEntries.slice(0, count).map((entry) => entry.answer))
      assert.deepEqual(await rows.locator('i').allTextContents(), publicDictationEntries.slice(0, count).map((entry) => entry.partOfSpeech))
      assert.deepEqual(await rows.locator('p').allTextContents(), publicDictationEntries.slice(0, count).map((entry) => entry.sourceMeanings.join('；')))
    }

    const pdfPath = path.join(tempRoot, `${kind}-${count}-${accent}.pdf`)
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
    const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
    assert.equal(info.status, 0, info.stderr)
    assert.match(info.stdout, new RegExp(`Pages:\\s+${expectedPages}\\b`))
    assert.match(info.stdout, /Page size:\s+59[45]\.\d+ x 841\.\d+ pts \(A4\)/)
    if (count === 15) copyFileSync(pdfPath, path.join(evidenceRoot, `${kind}-paper-current-15-${accent}.pdf`))
  }
  pass(`${count} 词听写纸与教师答案均为 A4 单栏、每页最多 15 题；学生留空、教师全义、二维码仅在听写纸首页`)
}

async function verifyDictationPlayer(page) {
  await page.addInitScript(() => {
    window.__dictationAudioLog = []
    HTMLMediaElement.prototype.play = function play() {
      window.__dictationAudioLog.push({ type: 'play', src: this.getAttribute('src'), at: performance.now() })
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function pause() {
      window.__dictationAudioLog.push({ type: 'pause', src: this.getAttribute('src'), at: performance.now() })
    }
    HTMLMediaElement.prototype.load = function load() {}
  })
  await page.goto(`${origin}/vocabulary/dictation/share-1?accent=british`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '固定生词组 1 词' }).waitFor()
  assert.equal(await page.locator('audio').count(), 1)
  assert.equal(await page.getByText('about', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '2遍' }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByRole('button', { name: '5秒' }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByRole('slider', { name: '播放音量' }).count(), 1)
  await page.screenshot({ path: path.join(evidenceRoot, 'dictation-player-mobile-390x844.png'), fullPage: true })

  await page.getByRole('button', { name: '开始听写' }).click()
  await page.getByText('3 秒后开始', { exact: true }).waitFor()
  await page.waitForFunction(() => window.__dictationAudioLog.some((item) => item.type === 'play'), undefined, { timeout: 4_500 })
  const audio = page.locator('audio')
  let plays = await page.evaluate(() => window.__dictationAudioLog.filter((item) => item.type === 'play'))
  assert.equal(plays.at(-1).src, '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0001.mp3')
  const firstEndAt = await audio.evaluate((node) => {
    const at = performance.now()
    node.dispatchEvent(new Event('ended'))
    return at
  })
  await page.waitForTimeout(650)
  assert.equal(await page.evaluate(() => window.__dictationAudioLog.filter((item) => item.type === 'play').length), 1)
  await page.waitForFunction(() => window.__dictationAudioLog.filter((item) => item.type === 'play').length === 2, undefined, { timeout: 1_500 })
  plays = await page.evaluate(() => window.__dictationAudioLog.filter((item) => item.type === 'play'))
  assert.ok(plays.at(-1).at - firstEndAt >= 780)
  assert.ok(plays.at(-1).at - firstEndAt <= 1_100)
  await audio.evaluate((node) => node.dispatchEvent(new Event('ended')))
  await page.waitForTimeout(4_700)
  assert.equal(await page.getByRole('heading', { name: '本组听写完成' }).count(), 0)
  await page.getByRole('heading', { name: '本组听写完成' }).waitFor({ timeout: 1_000 })

  await page.getByRole('button', { name: '查看答案' }).click()
  assert.equal(await page.getByText('about', { exact: true }).count(), 0)
  await page.getByRole('button', { name: '确认查看' }).click()
  assert.equal(await page.getByText('about', { exact: true }).count(), 1)
  assert.equal(await page.getByText('上升；升起；提高；起床；变得更加成功（或重要、强大等）；升起；增加；提高', { exact: true }).count(), 1)

  await page.getByRole('button', { name: '3遍' }).click()
  const customGapInput = page.getByLabel('自定义词间书写时间，3到15秒')
  await customGapInput.click()
  await customGapInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await customGapInput.press('Backspace')
  assert.equal(await customGapInput.inputValue(), '', '自定义间隔必须允许先清空旧值')
  await customGapInput.type('7')
  assert.equal(await customGapInput.inputValue(), '7', '清空后输入 7 不得被拼成 37 再压成 15')
  assert.deepEqual(await page.evaluate(() => JSON.parse(window.localStorage.getItem('eqb-vocabulary-dictation-settings-v1'))), { repeatCount: 3, gapSeconds: 7 })
  pass('扫码页隐藏答案，3秒倒计时后按锁定英音播放，0.8秒重复、5秒书写，末题等待完成后才允许确认看答案')
}

async function verifyPlayer(page) {
  await page.addInitScript(() => {
    window.__audioLog = []
    window.__deferNextPlayReject = false
    window.__deferredPlayReject = null
    HTMLMediaElement.prototype.play = function play() {
      window.__audioLog.push({ type: 'play', src: this.getAttribute('src'), at: performance.now() })
      if (window.__deferNextPlayReject) {
        window.__deferNextPlayReject = false
        return new Promise((_resolve, reject) => { window.__deferredPlayReject = reject })
      }
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function pause() {
      window.__audioLog.push({ type: 'pause', src: this.getAttribute('src'), at: performance.now() })
    }
    HTMLMediaElement.prototype.load = function load() {}
    window.__scrollIntoViewCalls = []
    Element.prototype.scrollIntoView = function scrollIntoView() {
      window.__scrollIntoViewCalls.push({ tagName: this.tagName, at: performance.now() })
    }
  })
  await page.goto(`${origin}/vocabulary/listen/share-15`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'about' }).waitFor()
  assert.equal(await page.locator('audio').count(), 1)
  assert.equal(await page.getByRole('button', { name: '2遍' }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByRole('slider', { name: '播放音量' }).count(), 1)
  pass('公开听写页只有一个 audio，真实语义控件与默认 2 遍正确')

  const audio = page.locator('audio')
  const controls = page.locator('.vocabulary-listen-controls')
  const log = () => page.evaluate(() => window.__audioLog)
  const clearLog = () => page.evaluate(() => { window.__audioLog.length = 0 })
  const end = () => audio.evaluate((node) => {
    const at = performance.now()
    node.dispatchEvent(new Event('ended'))
    return at
  })
  const fail = () => audio.evaluate((node) => node.dispatchEvent(new Event('error')))

  await page.getByRole('button', { name: '美音' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '美音' }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByText('/wɜːd 1/', { exact: true }).count(), 1)
  await controls.getByRole('button', { name: '开始播放' }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-1.mp3')
  await page.getByRole('button', { name: '英音' }).click()
  assert.equal((await log()).at(-1).type, 'pause')
  assert.equal(await page.getByText('/wɜːd brɪtɪʃ 1/', { exact: true }).count(), 1)
  assert.equal(await page.getByText('准备开始').count(), 1)
  await page.screenshot({ path: path.join(evidenceRoot, 'mobile-listen-accent-british-390x844.png'), fullPage: true })
  await clearLog()
  await controls.getByRole('button', { name: '开始播放' }).click()
  assert.equal(
    (await log()).filter((item) => item.type === 'play').at(-1).src,
    '/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/fixture-0001.mp3',
  )
  await controls.getByRole('button', { name: '暂停播放' }).click()
  await page.getByRole('button', { name: '美音' }).click()
  await clearLog()
  pass('同一二维码可切换美音/英音，音标同步且切换立即取消旧音频')

  await controls.getByRole('button', { name: '开始播放' }).click()
  assert.equal((await log()).at(-1).src, '/fixture-audio/word-1.mp3')
  const firstEndAt = await end()
  await page.waitForTimeout(650)
  assert.equal((await log()).filter((item) => item.type === 'play').length, 1)
  await page.waitForFunction(() => window.__audioLog.filter((item) => item.type === 'play').length === 2, undefined, { timeout: 1500 })
  const repeatedWord = (await log()).filter((item) => item.type === 'play').at(-1)
  assert.ok(repeatedWord.at - firstEndAt >= 780, `Repeat gap was ${repeatedWord.at - firstEndAt}ms`)
  assert.ok(repeatedWord.at - firstEndAt <= 1100, `Repeat gap was ${repeatedWord.at - firstEndAt}ms`)
  const secondEndAt = await end()
  await page.waitForTimeout(1800)
  assert.equal((await log()).some((item) => item.type === 'play' && item.src === '/fixture-audio/word-2.mp3'), false)
  await page.waitForFunction(() => window.__audioLog.some((item) => item.type === 'play' && item.src === '/fixture-audio/word-2.mp3'), undefined, { timeout: 3000 })
  const nextWord = (await log()).filter((item) => item.type === 'play').at(-1)
  assert.equal(nextWord.src, '/fixture-audio/word-2.mp3')
  assert.ok(nextWord.at - secondEndAt >= 1980, `Word gap was ${nextWord.at - secondEndAt}ms`)
  assert.ok(nextWord.at - secondEndAt <= 2300, `Word gap was ${nextWord.at - secondEndAt}ms`)
  pass('同词 0.8 秒、词间 2 秒节奏与当前词同步')
  assert.equal(await page.evaluate(() => window.__scrollIntoViewCalls.length), 0)
  pass('自动播放只更新当前词卡与列表高亮，不把页面滚向下方词表')

  const playsBeforeLiveSelection = (await log()).filter((item) => item.type === 'play').length
  await page.getByRole('button', { name: /accept/ }).click()
  const playsAfterLiveSelection = (await log()).filter((item) => item.type === 'play')
  assert.equal(playsAfterLiveSelection.length, playsBeforeLiveSelection + 1)
  assert.equal(playsAfterLiveSelection.at(-1).src, '/fixture-audio/word-3.mp3')
  pass('播放中手动切词会取消旧任务并立即从所选词继续')

  await controls.getByRole('button', { name: '暂停播放' }).click()
  await page.evaluate(() => { window.__deferNextPlayReject = true })
  await controls.getByRole('button', { name: '继续播放' }).click()
  await page.getByRole('button', { name: /word5/ }).click()
  await page.evaluate(() => {
    window.__deferredPlayReject?.(new DOMException('Interrupted', 'AbortError'))
    window.__deferredPlayReject = null
  })
  await page.waitForTimeout(50)
  assert.equal(await page.getByRole('heading', { name: 'word5' }).count(), 1)
  assert.equal(await page.getByText('音频加载失败').count(), 0)
  assert.equal(await controls.getByRole('button', { name: '暂停播放' }).count(), 1)
  pass('旧 play Promise 延迟拒绝不会污染已经切换的新词')

  await clearLog()
  await end()
  await page.waitForTimeout(100)
  await controls.getByRole('button', { name: '暂停播放' }).click()
  assert.equal((await log()).at(-1).type, 'pause')
  await page.waitForTimeout(800)
  assert.equal((await log()).filter((item) => item.type === 'play').length, 0)
  await clearLog()
  await page.getByRole('button', { name: /word4/ }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').length, 0)
  await controls.getByRole('button', { name: '继续播放' }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-4.mp3')
  pass('重复间隔内暂停立即取消等待，选词不发声且继续跟随新词')

  await end()
  await page.waitForFunction(() => window.__audioLog.filter((item) => item.type === 'play' && item.src === '/fixture-audio/word-4.mp3').length === 2)
  await end()
  await page.waitForTimeout(100)
  await controls.getByRole('button', { name: '暂停播放' }).click()
  const playsBeforeWordGapWait = (await log()).filter((item) => item.type === 'play').length
  await page.waitForTimeout(1950)
  assert.equal((await log()).filter((item) => item.type === 'play').length, playsBeforeWordGapWait)
  await page.getByRole('button', { name: /word6/ }).click()
  await controls.getByRole('button', { name: '继续播放' }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-6.mp3')
  pass('词间隔内暂停不会推进，恢复从教师新选的词开始')

  await fail()
  await page.getByText('音频加载失败').waitFor()
  await controls.getByRole('button', { name: '重试当前单词音频' }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-6.mp3')
  await fail()
  await clearLog()
  await page.getByRole('button', { name: /word7/ }).click()
  await page.getByText('准备开始').waitFor()
  assert.equal((await log()).filter((item) => item.type === 'play').length, 0)
  await controls.getByRole('button', { name: '开始播放' }).click()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-7.mp3')
  pass('音频失败停留原词可重试，改选新词会清除旧错误且不自动发声')

  await controls.getByRole('button', { name: '暂停播放' }).click()
  await page.getByRole('button', { name: /word15/ }).click()
  await controls.getByRole('button', { name: '继续播放' }).click()
  await end()
  await page.waitForTimeout(850)
  await end()
  await page.getByText('本组听完').waitFor()
  assert.equal(await page.getByRole('heading', { name: 'word15' }).count(), 1)
  await controls.getByRole('button', { name: '从头播放' }).click()
  await page.getByRole('heading', { name: 'about' }).waitFor()
  assert.equal((await log()).filter((item) => item.type === 'play').at(-1).src, '/fixture-audio/word-1.mp3')
  pass('末词听完停留末词，从头播放真正回到第一词')
}

async function verifyPlayerSize(page, count) {
  await page.goto(`${origin}/vocabulary/listen/share-${count}`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'about' }).waitFor()
  assert.equal(await page.locator('.vocabulary-listen-list li').count(), count)
  assert.equal(await page.getByRole('button', { name: new RegExp(publicEntries[count - 1].headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).count(), 1)
  assert.equal(await page.locator('audio').count(), 1)
  if (count === 60) {
    await page.screenshot({ path: path.join(evidenceRoot, 'desktop-listen-accent-1440x1000.png'), fullPage: false })
  }
  pass(`${count} 词公开听写页完整渲染且只有一个 audio`)
}

async function verifyAmericanOnlyBeforeBritishRelease(page) {
  await page.goto(`${origin}/vocabulary/listen/share-1`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'about' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '美音' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '英音' }).count(), 0)
  assert.equal(await page.getByText('/wɜːd 1/', { exact: true }).count(), 1)
  pass('英音 1600 词未发布 ready 标记前不暴露残缺切换入口')
}

async function main() {
  startVite()
  await waitForHttp(origin)
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const reviewPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(reviewPage)
    for (const [count, pages, lastCount, accent] of [[1, 1, 1, 'british'], [15, 3, 3, 'american'], [60, 10, 6, 'american']]) {
      await verifyPrint(reviewPage, count, pages, lastCount, accent)
    }
    await reviewPage.close()

    const embeddedPrintPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(embeddedPrintPage)
    await verifyEmbeddedPrintMode(embeddedPrintPage)
    await embeddedPrintPage.close()

    const dictationDownloadPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(dictationDownloadPage)
    await verifyDictationDownloads(dictationDownloadPage)
    await dictationDownloadPage.close()

    const dictationPrintPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(dictationPrintPage)
    for (const [count, pages, accent] of [[1, 1, 'british'], [15, 1, 'american'], [60, 4, 'british']]) {
      await verifyDictationPrint(dictationPrintPage, count, pages, accent)
    }
    await dictationPrintPage.close()

    const directSetPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(directSetPage)
    await verifyDirectSetCreation(directSetPage)
    await directSetPage.close()

    const directSetMobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installApiFixtures(directSetMobilePage)
    await verifyDirectSetMobileLayout(directSetMobilePage)
    await directSetMobilePage.close()

    const studentProfilesPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(studentProfilesPage)
    await verifyStudentProfiles(studentProfilesPage)
    await studentProfilesPage.close()

    const unifiedProgressPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(unifiedProgressPage, { continuityScope: 'main' })
    await verifyScopePreviewAndReviewKeys(unifiedProgressPage)
    await unifiedProgressPage.close()

    const playerPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installApiFixtures(playerPage)
    await verifyPlayer(playerPage)
    await playerPage.close()

    const dictationPlayerPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installApiFixtures(dictationPlayerPage)
    await verifyDictationPlayer(dictationPlayerPage)
    await dictationPlayerPage.close()

    const oneWordPlayer = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installApiFixtures(oneWordPlayer)
    await verifyPlayerSize(oneWordPlayer, 1)
    await oneWordPlayer.close()

    const sixtyWordPlayer = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await installApiFixtures(sixtyWordPlayer)
    await verifyPlayerSize(sixtyWordPlayer, 60)
    await sixtyWordPlayer.close()

    const americanOnlyPlayer = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installApiFixtures(americanOnlyPlayer, { britishReady: false })
    await verifyAmericanOnlyBeforeBritishRelease(americanOnlyPlayer)
    await americanOnlyPlayer.close()

    const revokedPage = await browser.newPage()
    await installApiFixtures(revokedPage)
    await revokedPage.goto(`${origin}/vocabulary/listen/revoked`, { waitUntil: 'networkidle' })
    await revokedPage.getByRole('heading', { name: '这份听写单已停止分享' }).waitFor()
    await revokedPage.goto(`${origin}/vocabulary/listen/missing`, { waitUntil: 'networkidle' })
    await revokedPage.getByRole('heading', { name: '没有找到这份听写单' }).waitFor()
    await revokedPage.goto(`${origin}/vocabulary/dictation/revoked?accent=american`, { waitUntil: 'networkidle' })
    await revokedPage.getByRole('heading', { name: '这份听写练习已停止分享' }).waitFor()
    await revokedPage.goto(`${origin}/vocabulary/dictation/missing?accent=american`, { waitUntil: 'networkidle' })
    await revokedPage.getByRole('heading', { name: '没有找到这份听写练习' }).waitFor()
    pass('撤销与不存在的公开播放、自动听写链接均显示克制失效页')
    await revokedPage.close()

    const programFailurePage = await browser.newPage()
    await installApiFixtures(programFailurePage, { programFails: true })
    await programFailurePage.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
    await programFailurePage.getByRole('heading', { name: '完整词库没有加载成功' }).waitFor()
    const failureHeading = await programFailurePage.locator('.vocabulary-review-heading').textContent()
    assert.match(failureHeading, /完整1600词/)
    assert.doesNotMatch(failureHeading, /30词校准样本|已过\s*0\s*\/\s*30/)
    assert.equal(await programFailurePage.locator('.vocabulary-overall-progress').count(), 0)
    assert.equal(await programFailurePage.getByRole('button', { name: '开始过词' }).count(), 0)
    assert.equal(await programFailurePage.getByRole('button', { name: '重新加载完整词库' }).count(), 1)
    pass('完整词库加载失败时 fail closed，不退回 30 词校准样本继续过词')
    await programFailurePage.close()

    const frozenResumePage = await browser.newPage()
    await frozenResumePage.addInitScript(() => {
      window.localStorage.setItem('eqb-vocabulary-review-run-wanwei-round-one-v1', 'run-15')
    })
    await installApiFixtures(frozenResumePage, { resumeFrozen: true })
    await frozenResumePage.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
    await frozenResumePage.getByRole('heading', { name: '固定生词组 15 词' }).waitFor()
    assert.equal(await frozenResumePage.getByRole('button', { name: '下载', exact: true }).isEnabled(), true)
    assert.equal(await frozenResumePage.getByRole('button', { name: '复制听写链接' }).count(), 1)
    assert.equal(await frozenResumePage.getByRole('button', { name: '生成固定生词组' }).count(), 0)
    assert.equal(await frozenResumePage.evaluate(() => window.localStorage.getItem('eqb-vocabulary-review-run-wanwei-round-one-v1')), null)
    assert.equal(await frozenResumePage.evaluate(() => window.localStorage.getItem('eqb-vocabulary-review-run-wanwei-round-one-v1:student-default')), 'run-15')
    await frozenResumePage.getByRole('button', { name: '返回', exact: true }).click()
    await frozenResumePage.getByRole('button', { name: '开始过词' }).waitFor()
    assert.equal(await frozenResumePage.getByLabel('目标生词数').isEnabled(), true)
    assert.equal(await frozenResumePage.evaluate(() => window.localStorage.getItem('eqb-vocabulary-review-run-wanwei-round-one-v1:student-default')), null)
    pass('旧版默认学生 Run 会迁入学生专属缓存，并恢复 Set、分享和下载入口')
    await frozenResumePage.close()

    const authoritativeResumePage = await browser.newPage()
    await authoritativeResumePage.addInitScript(() => {
      window.localStorage.setItem('eqb-vocabulary-review-run-wanwei-round-one-v1:student-default', 'run-15')
    })
    await installApiFixtures(authoritativeResumePage, { resumeFrozen: true, currentActive: true })
    await authoritativeResumePage.goto(`${origin}/?view=vocabulary-review`, { waitUntil: 'networkidle' })
    await authoritativeResumePage.getByRole('heading', { name: 'advice' }).waitFor()
    assert.equal(await authoritativeResumePage.getByRole('heading', { name: '固定生词组 15 词' }).count(), 0)
    pass('服务端未完成轮次优先于旧浏览器里的已冻结 Set 缓存')
    await authoritativeResumePage.close()
  } finally {
    await browser.close()
  }
}

main()
  .then(() => console.log(`\nVocabulary rendered behavior passed: ${passed} checks`))
  .catch((error) => {
    console.error(`\nVocabulary rendered behavior FAILED\n${error.stack || error.message || error}`)
    process.exitCode = 1
  })
  .finally(() => {
    for (const child of children) child.kill('SIGTERM')
    rmSync(tempRoot, { recursive: true, force: true })
  })
