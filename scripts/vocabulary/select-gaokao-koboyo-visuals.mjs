#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    batchSize: 8,
    concurrency: 4,
    model: 'deepseek-chat',
    selectionAttempts: 3,
    selectionTimeoutMs: 60_000,
    'checked-at': '2026-08-11',
  }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['source', 'learning', 'concepts', 'output', 'asset-dir']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.concurrency = Number(args.concurrency)
  args.batchSize = Number(args.batchSize)
  args.selectionAttempts = Number(args.selectionAttempts)
  args.selectionTimeoutMs = Number(args.selectionTimeoutMs)
  args.subagentOnly = args.subagentOnly === 'true'
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 12) throw new Error('batchSize must be 1–12')
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) throw new Error('concurrency must be 1–12')
  if (!Number.isInteger(args.selectionAttempts) || args.selectionAttempts < 1 || args.selectionAttempts > 4) throw new Error('selectionAttempts must be 1–4')
  if (!Number.isInteger(args.selectionTimeoutMs) || args.selectionTimeoutMs < 10_000 || args.selectionTimeoutMs > 180_000) throw new Error('selectionTimeoutMs must be 10000–180000')
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(args['checked-at'])) throw new Error('checked-at must be YYYY-MM-DD')
  return args
}

const rootDir = path.resolve(import.meta.dirname, '../..')
const args = parseArgs(process.argv.slice(2))
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required')
const sourceEntries = JSON.parse(readFileSync(path.resolve(args.source), 'utf8')).entries
const learningPath = path.resolve(args.learning)
const conceptsPath = path.resolve(args.concepts)
const outputPath = path.resolve(args.output)
const assetDirectory = path.resolve(args['asset-dir'])
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
// This stage only proposes candidates. Preserve every existing entry because
// a later Codex subagent may already have visually approved it or rejected it
// as a gap; restarting proposal generation must never overwrite that judgment.
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))
const goldenBindingsPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json')
const goldenBindings = new Map(JSON.parse(readFileSync(goldenBindingsPath, 'utf8')).entries.map((entry) => [entry.entryId, entry]))
const goldenAssetDirectory = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-v1')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const fetchWithRetry = async (url) => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok && [429, 500, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < 5) await sleep(attempt * 600)
    }
  }
  throw new Error(`Fetch failed after 5 attempts for ${url}: ${lastError?.message ?? lastError}`)
}
const readWithRetry = async (url, reader) => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok && [429, 500, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}`)
      return { ok: response.ok, status: response.status, value: await reader(response) }
    } catch (error) {
      lastError = error
      if (attempt < 5) await sleep(attempt * 600)
    }
  }
  throw new Error(`Fetch body failed after 5 attempts for ${url}: ${lastError?.message ?? lastError}`)
}
mkdirSync(assetDirectory, { recursive: true })

const readCheckpoint = async (filePath) => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')).entries
    } catch (error) {
      lastError = error
      await sleep(300)
    }
  }
  throw new Error(`Unable to read checkpoint ${filePath}: ${lastError?.message ?? lastError}`)
}

const searchCache = new Map()
async function searchRows(query) {
  const normalized = query.toLocaleLowerCase().replace(/[^a-z0-9 ]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (!normalized || normalized.length < 2) return []
  if (searchCache.has(normalized)) return searchCache.get(normalized)
  const promise = (async () => {
    let prefix = normalized.slice(0, 2)
    let payload
    while (prefix.length <= normalized.length) {
      const response = await readWithRetry(`https://koboyo.com/icons/data/search/v1/${prefix}.json`, (value) => value.json())
      if (!response.ok) return []
      payload = response.value
      const nextPrefix = normalized.slice(0, prefix.length + 1)
      if (payload.split?.includes(nextPrefix)) {
        prefix = nextPrefix
        continue
      }
      break
    }
    return payload?.entries ?? []
  })()
  searchCache.set(normalized, promise)
  return promise
}

const tokens = (value) => String(value ?? '').toLocaleLowerCase().match(/[a-z0-9]+/gu) ?? []
const rankRows = (rows, query, concept) => {
  const queryTokens = tokens(query)
  const conceptTokens = tokens(concept)
  return rows.map((row) => {
    const [slug, name, keywords, normalizedName, generality, group, subgroup, style] = row
    const haystack = `${slug} ${name} ${keywords} ${normalizedName}`.toLocaleLowerCase()
    const exactQuery = haystack.includes(query.toLocaleLowerCase()) ? 20 : 0
    const queryCoverage = queryTokens.filter((token) => haystack.includes(token)).length
    const conceptCoverage = conceptTokens.filter((token) => haystack.includes(token)).length
    const cartoonPenalty = slug.startsWith('cartoon-') ? -2 : 0
    return { slug, name, keywords, width: null, height: null, group, subgroup, style, score: exactQuery + queryCoverage * 8 + conceptCoverage * 2 + Number(generality ?? 0) + cartoonPenalty }
  }).sort((left, right) => right.score - left.score || left.slug.localeCompare(right.slug))
}

const selectionPrompt = `You choose exact Koboyo illustrations for high-school English vocabulary teaching. Return JSON only: {"entries":[]}.
For every input return entryId, selectedSlug, verdict, reason and alt. selectedSlug must be one of candidateIcons[].slug or null.
There are only two acceptable semantics:
1. direct-sense: the naked image itself has a stable, common and direct correspondence to teachingSense. Reject loose association, decoration, wordplay, or an object that needs an invented story.
2. sentence-scene: the image will always appear with the exact bound sentence and highlighted target, but the image must still accurately depict the sentence's visible people, action, object and necessary condition without contradiction. Reject an icon that matches only one incidental noun or does not help the target relation become visible.
Never select merely to fill coverage. If none is accurate, selectedSlug is null and verdict is visual-gap. reason and alt are concise Chinese. alt describes only visible facts in the selected icon.`

async function chooseBatch(entries) {
  let lastError
  for (let attempt = 1; attempt <= args.selectionAttempts; attempt += 1) {
    try {
      const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: args.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: selectionPrompt }, { role: 'user', content: JSON.stringify({ entries }) }],
        }),
        signal: AbortSignal.timeout(args.selectionTimeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 400)}`)
      const payload = await response.json()
      const generated = JSON.parse(payload.choices?.[0]?.message?.content ?? '').entries
      if (!Array.isArray(generated) || generated.length !== entries.length) throw new Error('Semantic selection batch size mismatch')
      const byId = new Map(generated.map((entry) => [entry.entryId, entry]))
      return entries.map((input) => {
        const selected = byId.get(input.entryId)
        if (!selected) throw new Error(`Missing semantic selection for ${input.entryId}`)
        const slug = selected.selectedSlug == null ? null : String(selected.selectedSlug).trim()
        if (slug != null && !input.candidateIcons.some((candidate) => candidate.slug === slug)) throw new Error(`Unknown selected slug for ${input.entryId}`)
        if (!/[\u3400-\u9fff]/u.test(selected.reason ?? '')) throw new Error(`Missing Chinese semantic reason for ${input.entryId}`)
        const alt = slug == null ? null : String(selected.alt ?? '').trim()
        if (slug != null && !/[\u3400-\u9fff]/u.test(alt)) throw new Error(`Missing Chinese alt for ${input.entryId}`)
        return { entryId: input.entryId, slug, reason: selected.reason.trim(), alt }
      })
    } catch (error) {
      lastError = error
      if (attempt < args.selectionAttempts) await sleep(attempt * 1_000)
    }
  }
  return entries.map((entry) => ({
    entryId: entry.entryId,
    slug: null,
    reason: `语义选图服务连续 ${args.selectionAttempts} 次未返回可核验结果；安全保留为视觉缺口。`,
    alt: null,
    serviceError: lastError?.message ?? String(lastError),
  }))
}

async function iconDetail(slug) {
  const response = await readWithRetry(`https://koboyo.com/icons/svg/${slug}.svg`, (value) => value.arrayBuffer())
  if (!response.ok) throw new Error(`Koboyo SVG HTTP ${response.status} for ${slug}`)
  const bytes = Buffer.from(response.value)
  const svg = bytes.toString('utf8')
  const viewBox = svg.match(/\bviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/u)
  if (!viewBox || !svg.startsWith('<svg') || !/\bfill="currentColor"/u.test(svg)) throw new Error(`Invalid Koboyo SVG for ${slug}`)
  return { bytes, width: Number(viewBox[3]), height: Number(viewBox[4]), hash: sha256(bytes) }
}

const writeCheckpoint = () => {
  // Subagent QA can land while proposal workers are still running. Reload and
  // retain those stronger judgments before serializing the next checkpoint.
  if (existsSync(outputPath)) {
    const latest = JSON.parse(readFileSync(outputPath, 'utf8')).entries ?? []
    for (const entry of latest) {
      if (entry.selectionMethod === 'codex-subagent-actual-svg-review-v1'
        || ['subagent_visual_qa_pass_pending_owner', 'visual_gap_after_subagent_review'].includes(entry.qa?.status)) {
        completed.set(entry.entryId, entry)
      }
    }
  }
  const ordered = sourceEntries.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
  const counts = {
    total: ordered.length,
    selected: ordered.filter((entry) => entry.status === 'selected_pending_owner_semantic_qa').length,
    visualGap: ordered.filter((entry) => entry.status === 'visual_gap_pending_owner_decision').length,
  }
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'gaokao-frequency-koboyo-selection-v2', version: 'koboyo-original-full-v1', status: 'generated_pending_owner_semantic_qa', counts, entries: ordered }, null, 2)}\n`)
  return ordered.length
}

const initialLearningById = new Map((await readCheckpoint(learningPath)).map((entry) => [entry.entryId, entry]))
for (const [entryId, binding] of goldenBindings) {
  if (completed.has(entryId)) continue
  const learning = initialLearningById.get(entryId)
  if (!learning) throw new Error(`Golden visual has no reviewed full-course learning entry: ${entryId}`)
  const visualCandidateId = binding.visualSentenceId?.match(/^candidate-([abc])$/u)?.[1] ?? null
  const visualSentence = visualCandidateId ? learning.examples.find((entry) => entry.candidateId === visualCandidateId) : null
  if (binding.visualMode === 'sentence-scene' && (!visualSentence || sha256(visualSentence.english) !== binding.visualSentenceTextSha256)) {
    throw new Error(`Golden sentence binding drift for ${entryId}`)
  }
  const sourceFile = path.join(goldenAssetDirectory, path.basename(binding.asset.path))
  const targetFile = path.join(assetDirectory, path.basename(binding.asset.path))
  if (!existsSync(targetFile)) writeFileSync(targetFile, readFileSync(sourceFile))
  completed.set(entryId, {
    entryId,
    headword: binding.headword,
    status: 'selected_pending_owner_semantic_qa',
    selectionMethod: 'golden-owner-candidate-v1',
    visualMode: binding.visualMode,
    teachingSense: binding.teachingSense,
    visualSentenceId: binding.visualSentenceId,
    sentence: visualSentence,
    searchQuery: null,
    bindingRationale: binding.bindingRationale,
    selectionConfidence: 'golden-owner-qa-candidate',
    asset: { ...binding.asset, path: `/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-full-v1/${path.basename(binding.asset.path)}` },
    qa: { status: 'pending_owner_semantic_qa', verdict: 'pending', integratedIntoProduct: false },
  })
}
writeCheckpoint()

async function buildSelectionInput(source, concept) {
  const queryCandidates = [...new Set([
    concept.searchQuery,
    source.headword,
    ...tokens(concept.searchQuery).filter((token) => token.length >= 3),
  ].filter(Boolean))]
  const rows = (await Promise.all(queryCandidates.map((query) => searchRows(query)))).flat()
  const uniqueRows = [...new Map(rows.map((row) => [row[0], row])).values()]
  const candidateIcons = rankRows(uniqueRows, concept.searchQuery, concept.concept).slice(0, 16)
  return {
    entryId: source.entryId,
    headword: source.headword,
    teachingSense: concept.teachingSense,
    visualMode: concept.preferredMode,
    sentence: concept.sentence,
    sceneQuery: concept.sceneQuery,
    concept: concept.concept,
    candidateIcons,
  }
}

function gapSelection(source, concept, reason) {
  return {
    entryId: source.entryId,
    headword: source.headword,
    status: 'visual_gap_pending_owner_decision',
    selectionMethod: 'deepseek-semantic-koboyo-v1',
    visualMode: concept.preferredMode,
    teachingSense: concept.teachingSense,
    visualSentenceId: concept.visualSentenceId,
    sentence: concept.sentence,
    searchQuery: concept.searchQuery,
    sceneQuery: concept.sceneQuery,
    bindingRationale: concept.rationale,
    gapReason: reason,
    searchedAt: args['checked-at'],
    qa: { status: 'visual_gap_pending_owner_decision', verdict: 'pending', integratedIntoProduct: false },
  }
}

async function materializeSelection(source, concept, input, selected) {
  if (!selected.slug) return gapSelection(source, concept, selected.reason)
  const candidate = input.candidateIcons.find((entry) => entry.slug === selected.slug)
  if (!candidate) throw new Error(`Selected candidate disappeared for ${source.entryId}`)
  const detail = await iconDetail(candidate.slug)
  const fileName = `${source.entryId}--${candidate.slug}.svg`
  const publicPath = `/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-full-v1/${fileName}`
  writeFileSync(path.join(assetDirectory, fileName), detail.bytes)
  return {
    entryId: source.entryId,
    headword: source.headword,
    status: 'selected_pending_owner_semantic_qa',
    selectionMethod: 'deepseek-semantic-koboyo-v1',
    visualMode: concept.preferredMode,
    teachingSense: concept.teachingSense,
    visualSentenceId: concept.visualSentenceId,
    sentence: concept.sentence,
    sceneQuery: concept.sceneQuery,
    searchQuery: concept.searchQuery,
    bindingRationale: selected.reason,
    selectionConfidence: 'semantic-candidate',
    searchScore: candidate.score,
    asset: {
      slug: candidate.slug,
      iconName: candidate.name,
      width: detail.width,
      height: detail.height,
      path: publicPath,
      sha256: detail.hash,
      version: 'koboyo-original-full-v1',
      alt: selected.alt,
      officialPageUrl: `https://koboyo.com/icons/${candidate.slug}`,
      officialSvgUrl: `https://koboyo.com/icons/svg/${candidate.slug}.svg`,
      licenseUrl: 'https://koboyo.com/icons/license',
      sourceReceipt: { checkedAt: args['checked-at'], officialSvgStatus: 200, remoteSha256: detail.hash, localSha256: detail.hash, contentMatch: true },
    },
    qa: { status: 'pending_owner_semantic_qa', verdict: 'pending', integratedIntoProduct: false },
  }
}

const pending = sourceEntries.filter((entry) => !completed.has(entry.entryId))
const batches = []
for (let start = 0; start < pending.length; start += args.batchSize) batches.push(pending.slice(start, start + args.batchSize))
let nextBatch = 0
async function selectionWorker() {
  while (nextBatch < batches.length) {
    const sourceBatch = batches[nextBatch]
    nextBatch += 1
    let conceptById
    while (true) {
      const concepts = await readCheckpoint(conceptsPath)
      conceptById = new Map(concepts.map((entry) => [entry.entryId, entry]))
      if (sourceBatch.every((source) => conceptById.has(source.entryId))) break
      await sleep(3_000)
    }
    if (args.subagentOnly) {
      for (const source of sourceBatch) {
        const concept = conceptById.get(source.entryId)
        completed.set(source.entryId, gapSelection(source, concept, '自动阶段不拍板；留给 Codex Subagent 实际检索、渲染和语义选图。'))
      }
      console.log(`visual subagent queue ${writeCheckpoint()}/${sourceEntries.length}`)
      continue
    }
    const inputs = await Promise.all(sourceBatch.map((source) => buildSelectionInput(source, conceptById.get(source.entryId))))
    const selectable = inputs.filter((input) => input.candidateIcons.length)
    const selectedById = new Map((selectable.length ? await chooseBatch(selectable) : []).map((entry) => [entry.entryId, entry]))
    for (let index = 0; index < sourceBatch.length; index += 1) {
      const source = sourceBatch[index]
      const concept = conceptById.get(source.entryId)
      const input = inputs[index]
      const selected = selectedById.get(source.entryId)
      completed.set(source.entryId, selected
        ? await materializeSelection(source, concept, input, selected)
        : gapSelection(source, concept, 'Koboyo 检索没有返回可核验候选；未强行补图。'))
    }
    console.log(`visual semantic selection ${writeCheckpoint()}/${sourceEntries.length}`)
  }
}

await Promise.all(Array.from({ length: Math.min(args.concurrency, batches.length) }, () => selectionWorker()))
console.log(`complete ${writeCheckpoint()}/${sourceEntries.length}`)
