#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const writeJson = (relativePath, value) => writeFileSync(path.join(rootDir, relativePath), `${JSON.stringify(value, null, 2)}\n`)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const normalizedSvg = (value) => Buffer.from(value).toString('utf8').trimEnd()

const samplePayload = readJson('data/vocabulary/gaokao-frequency-golden-sample-v1.json')
const learningPayload = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json')
const selectionPayload = readJson('data/vocabulary/gaokao-frequency-golden-visual-selection-v1.json')
const manifestPayload = readJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json')
const visualDirectory = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-v1')
const checkedAt = '2026-08-11'

const replacements = {
  'gaokao-frequency-0026-as': { slug: 'teenager-studying', width: 156, height: 210, alt: '一名学生坐在桌前认真学习' },
  'gaokao-frequency-0031-about': { slug: 'two-people-planning-board', width: 262, height: 176, alt: '两个人对着计划板讨论方案' },
  'gaokao-frequency-0074-may': { slug: 'raincloud-drops', width: 168, height: 166, alt: '一朵正在落雨的云' },
  'gaokao-frequency-0468-p-m-pm': { slug: 'solid-day-night-clock', width: 251, height: 251, alt: '一个同时标出白天与夜晚的时钟' },
  'gaokao-frequency-0564-species': { slug: 'biodiversity-net', width: 210, height: 162, alt: '多种生物共同组成的生物多样性网络' },
  'gaokao-frequency-0623-involve': { slug: 'family-recipe-card', width: 185, height: 132, alt: '一张列出制作步骤的食谱卡' },
  'gaokao-frequency-1203-uk-u-k': { slug: 'big-ben-style-clock', width: 62, height: 232, alt: '英国大本钟风格的钟楼' },
  'gaokao-frequency-1242-appointment': { slug: 'appointment-diary', width: 261, height: 179, alt: '一本记录预约时间的日程簿' },
  'gaokao-frequency-1296-display': { slug: 'shop-window-display', width: 228, height: 193, alt: '商店橱窗里陈列着商品' },
  'gaokao-frequency-2006-metal': { slug: 'batch-steel', width: 206, height: 158, alt: '一批堆放整齐的钢材' },
  'gaokao-frequency-2284-arrangement': { slug: 'cartoon-schedule', width: 277, height: 277, alt: '一张已经规划好的日程安排表' },
  'gaokao-frequency-2342-b-c': { slug: 'pyramid-2', width: 172, height: 155, alt: '一座古代金字塔' },
  'gaokao-frequency-2409-guideline': { slug: 'policy-handbook', width: 150, height: 198, alt: '一本写有规则和指导方针的手册' },
  'gaokao-frequency-2739-ad-a-d': { slug: 'colosseum-style-arena', width: 224, height: 192, alt: '一座罗马斗兽场风格的古代建筑' },
}

const sentenceBindings = {
  'gaokao-frequency-0026-as': {
    candidateId: 'a',
    sceneQuery: { subject: 'student', action: 'studying', object: 'book', condition: 'in the role of a student' },
    rationale: '图呈现学生认真学习的具体身份场景，例句中的 as 表达“作为学生”。',
  },
  'gaokao-frequency-0031-about': {
    candidateId: 'a',
    sceneQuery: { subject: 'two people', action: 'discussing', object: 'a plan board', condition: 'the plan is their topic' },
    rationale: '图呈现两人围绕计划板讨论，例句中的 about 标出谈论的主题。',
  },
  'gaokao-frequency-0074-may': {
    candidateId: 'a',
    sceneQuery: { subject: 'rain cloud', action: 'raining', object: null, condition: 'possible weather tomorrow' },
    rationale: '雨云把明天可能出现的天气变成可见场景，例句中的 may 表达不确定的可能性。',
  },
  'gaokao-frequency-0498-miss': {
    candidateId: 'a',
    sceneQuery: { subject: 'person', action: 'arriving too late', object: 'bus stop', condition: 'the bus has been missed' },
    rationale: '图呈现人赶到车站却错过公交车的结果，与候选 A 的 miss 场景一致。',
  },
  'gaokao-frequency-0623-involve': {
    candidateId: 'a',
    sceneQuery: { subject: 'recipe card', action: 'listing', object: 'three steps', condition: 'all steps are included in the recipe' },
    rationale: '食谱卡把组成流程的步骤具体化，例句中的 involves 表达“包含三个步骤”。',
  },
  'gaokao-frequency-1296-display': {
    candidateId: 'b',
    sceneQuery: { subject: 'shop', action: 'displaying', object: 'products', condition: 'in the front window' },
    rationale: '原图准确呈现橱窗中的商品陈列，与候选 B 的 displayed 场景一致。',
  },
  'gaokao-frequency-1378-manner': {
    candidateId: 'a',
    sceneQuery: { subject: 'person', action: 'holding a door politely', object: 'door', condition: 'polite behaviour' },
    rationale: '图中的礼貌举止为例句的 polite manner 提供具体场景。',
  },
  'gaokao-frequency-2018-flexible': {
    candidateId: 'b',
    sceneQuery: { subject: 'rubber band', action: 'stretching', object: null, condition: 'returns while remaining elastic' },
    rationale: '原图直接呈现可拉伸的橡皮筋，与候选 B 中 flexible 的“有弹性的”义项一致。',
  },
  'gaokao-frequency-2087-conservation': {
    candidateId: 'c',
    sceneQuery: { subject: 'person', action: 'turning off', object: 'water tap', condition: 'saving water' },
    rationale: '图呈现关掉水龙头节约用水，与候选 C 的 water conservation 场景一致。',
  },
  'gaokao-frequency-2342-b-c': {
    candidateId: 'a',
    sceneQuery: { subject: 'ancient pyramid', action: 'standing', object: null, condition: 'ancient construction before the common era' },
    rationale: '古代金字塔提供公元前历史的可见锚点，与候选 A 的古城年代共同解释 B.C.。',
  },
  'gaokao-frequency-2739-ad-a-d': {
    candidateId: 'a',
    sceneQuery: { subject: 'Roman arena', action: 'standing', object: null, condition: 'Roman Empire period in the common era' },
    rationale: '罗马建筑为候选 A 的罗马帝国年代提供可见历史场景，AD 标出公元纪年。',
  },
}

const sourceById = new Map(samplePayload.entries.map((entry) => [entry.entryId, entry]))
const learningById = new Map(learningPayload.entries.map((entry) => [entry.entryId, entry]))
const selectionById = new Map(selectionPayload.entries.map((entry) => [entry.entryId, entry]))
const manifestById = new Map(manifestPayload.entries.map((entry) => [entry.entryId, entry]))

const fetchSvg = async (slug) => {
  const url = `https://koboyo.com/icons/svg/${slug}.svg`
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!bytes.toString('utf8').startsWith('<svg')) throw new Error('response is not an SVG')
      return { bytes, status: response.status, url }
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 400))
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message}`)
}

mkdirSync(visualDirectory, { recursive: true })
const remoteBySlug = new Map()
const slugs = [...new Set(samplePayload.entries.map((entry) => replacements[entry.entryId]?.slug ?? selectionById.get(entry.entryId)?.slug))]
let nextSlug = 0
const workers = Array.from({ length: 8 }, async () => {
  while (nextSlug < slugs.length) {
    const slug = slugs[nextSlug]
    nextSlug += 1
    remoteBySlug.set(slug, await fetchSvg(slug))
  }
})
await Promise.all(workers)

const selections = []
const manifests = []
const bindings = []
for (const source of samplePayload.entries) {
  const content = learningById.get(source.entryId)
  const previousSelection = selectionById.get(source.entryId)
  const previousManifest = manifestById.get(source.entryId)
  if (!content || !previousSelection || !previousManifest) throw new Error(`Missing visual source record for ${source.entryId}`)

  const replacement = replacements[source.entryId]
  const chosen = replacement ?? {
    slug: previousSelection.slug,
    width: previousSelection.width,
    height: previousSelection.height,
    alt: previousManifest.alt,
  }
  const remote = remoteBySlug.get(chosen.slug)
  const fileName = `${source.entryId}--${chosen.slug}.svg`
  const publicPath = `/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-v1/${fileName}`
  const filePath = path.join(visualDirectory, fileName)
  if (replacement) writeFileSync(filePath, remote.bytes)
  const localBytes = readFileSync(filePath)
  const remoteHash = sha256(remote.bytes)
  const localHash = sha256(localBytes)
  const normalizedContentMatch = normalizedSvg(remote.bytes) === normalizedSvg(localBytes)
  if (!normalizedContentMatch) throw new Error(`Local asset differs from current Koboyo original for ${source.entryId}`)

  const selected = {
    entryId: source.entryId,
    headword: source.headword,
    visualKey: source.entryId,
    slug: chosen.slug,
    iconName: previousSelection.iconName,
    width: chosen.width,
    height: chosen.height,
    path: publicPath,
    teachingSenses: content.teachingSenses,
  }
  selections.push(selected)

  const manifest = {
    entryId: source.entryId,
    headword: source.headword,
    visualKey: source.entryId,
    slug: chosen.slug,
    width: chosen.width,
    height: chosen.height,
    sha256: localHash,
    path: publicPath,
    alt: chosen.alt,
    version: 'koboyo-original-v1',
  }
  manifests.push(manifest)

  const sentenceBinding = sentenceBindings[source.entryId]
  const example = sentenceBinding ? content.examples.find((item) => item.candidateId === sentenceBinding.candidateId) : null
  if (sentenceBinding && !example) throw new Error(`Missing sentence candidate ${sentenceBinding.candidateId} for ${source.entryId}`)
  const teachingSense = sentenceBinding?.candidateId ? example.teachingSense : content.teachingSenses[0]
  const teachingSenseIndex = content.teachingSenses.indexOf(teachingSense)
  bindings.push({
    bindingId: `${source.entryId}:visual-binding-v1`,
    entryId: source.entryId,
    headword: source.headword,
    visualMode: sentenceBinding ? 'sentence-scene' : 'direct-sense',
    teachingSenseId: `${source.entryId}:sense-${Math.max(0, teachingSenseIndex) + 1}`,
    teachingSense,
    visualSentenceId: sentenceBinding ? `candidate-${example.candidateId}` : null,
    visualSentenceTextSha256: sentenceBinding ? sha256(example.english) : null,
    sceneQuery: sentenceBinding?.sceneQuery ?? null,
    bindingRationale: sentenceBinding?.rationale ?? `原图直接呈现教学义“${teachingSense}”或其稳定常见视觉符号。`,
    displayContract: sentenceBinding ? 'image_and_exact_sentence_with_target_highlight' : 'image_may_appear_with_headword_only',
    asset: {
      slug: chosen.slug,
      width: chosen.width,
      height: chosen.height,
      path: publicPath,
      sha256: localHash,
      version: 'koboyo-original-v1',
      alt: chosen.alt,
      provenanceType: source.entryId === 'gaokao-frequency-1203-uk-u-k' ? 'koboyo-original-semantic-reuse' : 'koboyo-original-selected',
      sourceEntryId: source.entryId === 'gaokao-frequency-1203-uk-u-k' ? 'gaokao-frequency-1106-britain' : null,
      officialPageUrl: `https://koboyo.com/icons/${chosen.slug}`,
      officialSvgUrl: remote.url,
      licenseUrl: 'https://koboyo.com/icons/license',
      sourceReceipt: {
        checkedAt,
        officialSvgStatus: remote.status,
        remoteSha256: remoteHash,
        localSha256: localHash,
        remoteNormalizedSha256: sha256(normalizedSvg(remote.bytes)),
        localNormalizedSha256: sha256(normalizedSvg(localBytes)),
        contentMatchAfterTrailingWhitespaceNormalization: true,
      },
    },
    qa: {
      status: 'pending_owner_semantic_qa',
      reviewUnit: sentenceBinding ? 'image_plus_exact_sentence_plus_highlight' : 'image_plus_teaching_sense',
      verdict: 'pending',
      integratedIntoProduct: false,
    },
  })
}

writeJson('data/vocabulary/gaokao-frequency-golden-visual-selection-v1.json', {
  ...selectionPayload,
  generatedAt: new Date().toISOString(),
  entries: selections,
})
writeJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json', {
  ...manifestPayload,
  version: 'koboyo-original-v1',
  generatedAt: new Date().toISOString(),
  entries: manifests,
})
writeJson('data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json', {
  schemaVersion: 1,
  version: 'gaokao-frequency-golden-visual-bindings-v1',
  status: 'generated_pending_owner_semantic_qa',
  policy: 'docs/cuts/gaokao-vocabulary-3000/visual-binding-policy-v1.md',
  generatedAt: new Date().toISOString(),
  summary: {
    entries: bindings.length,
    directSense: bindings.filter((entry) => entry.visualMode === 'direct-sense').length,
    sentenceScene: bindings.filter((entry) => entry.visualMode === 'sentence-scene').length,
    visualGap: bindings.filter((entry) => entry.visualMode === 'visual-gap').length,
    replacements: Object.keys(replacements).length,
  },
  entries: bindings,
})

console.log(`Finalized ${bindings.length} visual bindings: ${bindings.filter((entry) => entry.visualMode === 'direct-sense').length} direct, ${bindings.filter((entry) => entry.visualMode === 'sentence-scene').length} sentence-scene, ${Object.keys(replacements).length} replaced`)
