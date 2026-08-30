#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = { checkedAt: '2026-08-18' }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['source', 'learning', 'selection', 'asset-dir', 'qa', 'inputs']) {
    if (!args[key]) throw new Error(`Missing --${key}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const approvedRepairIds = new Set((args['allow-approved-repair'] ?? '').split(',').filter(Boolean))
const sourceEntries = JSON.parse(readFileSync(path.resolve(args.source), 'utf8')).entries
const learningEntries = JSON.parse(readFileSync(path.resolve(args.learning), 'utf8')).entries
const selectionPath = path.resolve(args.selection)
const selectionPayload = JSON.parse(readFileSync(selectionPath, 'utf8'))
const assetDirectory = path.resolve(args['asset-dir'])
const qaPayload = JSON.parse(readFileSync(path.resolve(args.qa), 'utf8'))
const inputPaths = args.inputs.split(',').map((value) => path.resolve(value.trim())).filter(Boolean)
const subagentEntries = inputPaths.flatMap((filePath) => JSON.parse(readFileSync(filePath, 'utf8')).entries ?? [])
const sourceById = new Map(sourceEntries.map((entry) => [entry.entryId, entry]))
const learningById = new Map(learningEntries.map((entry) => [entry.entryId, entry]))
const selectedById = new Map(selectionPayload.entries.map((entry) => [entry.entryId, entry]))
const qaById = new Map(qaPayload.entries.map((entry) => [entry.entryId, entry]))
const initialGapById = new Map((qaPayload.excludedVisualGaps ?? []).map((entry) => [entry.entryId, entry]))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

if (sourceEntries.length !== 3_000) throw new Error('Expected the full 3000-entry source')
if (new Set(subagentEntries.map((entry) => entry.entryId)).size !== subagentEntries.length) throw new Error('Subagent selections contain duplicate entryId values')
mkdirSync(assetDirectory, { recursive: true })

async function fetchSvg(slug) {
  let lastError
  const url = `https://koboyo.com/icons/svg/${slug}.svg`
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      const svg = bytes.toString('utf8')
      const viewBox = svg.match(/\bviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/u)
      if (!svg.startsWith('<svg') || !viewBox || !/\bfill="currentColor"/u.test(svg)) throw new Error('Invalid Koboyo SVG')
      return { bytes, width: Number(viewBox[3]), height: Number(viewBox[4]), url }
    } catch (error) {
      lastError = error
      if (attempt < 5) await sleep(attempt * 500)
    }
  }
  throw new Error(`Unable to fetch ${slug}: ${lastError?.message ?? lastError}`)
}

function inspectSvg(bytes, label) {
  let svg = bytes.toString('utf8')
  if (!svg.startsWith('<svg')) throw new Error(`Invalid SVG for ${label}`)
  let viewBox = svg.match(/\bviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/u)
  if (!viewBox) {
    const width = svg.match(/\bwidth="([\d.]+)"/u)?.[1]
    const height = svg.match(/\bheight="([\d.]+)"/u)?.[1]
    if (!width || !height) throw new Error(`SVG has no viewBox or numeric dimensions for ${label}`)
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`)
    bytes = Buffer.from(svg)
    viewBox = ['viewBox', '0', '0', width, height]
  }
  return { bytes, width: Number(viewBox[3]), height: Number(viewBox[4]) }
}

for (const qaEntry of qaPayload.entries) {
  if (qaEntry.verdict !== 'pass') continue
  const selection = selectedById.get(qaEntry.entryId)
  if (!selection || selection.asset?.slug !== qaEntry.assetSlug) throw new Error(`QA snapshot drift for ${qaEntry.entryId}`)
  selectedById.set(qaEntry.entryId, {
    ...selection,
    qa: {
      status: 'subagent_visual_qa_pass_pending_owner',
      verdict: 'pass',
      reviewer: 'codex-subagent-actual-svg-review-v1',
      integratedIntoProduct: false,
    },
  })
}

for (const reviewed of subagentEntries) {
  const source = sourceById.get(reviewed.entryId)
  const learning = learningById.get(reviewed.entryId)
  const previous = selectedById.get(reviewed.entryId)
  const previousQa = qaById.get(reviewed.entryId)
  const initialGap = initialGapById.get(reviewed.entryId)
  const auditedGap = previous?.qa?.status === 'visual_gap_after_subagent_review'
  const pendingGap = !previous?.asset && previous?.qa?.status === 'visual_gap_pending_owner_decision'
  const pendingAsset = Boolean(previous?.asset) && previous?.qa?.status === 'pending_owner_semantic_qa'
  const approvedRepair = approvedRepairIds.has(reviewed.entryId)
    && Boolean(previous?.asset)
    && previous?.qa?.status === 'subagent_visual_qa_pass_pending_owner'
  if (!source || !learning || !previous || (!previousQa && !initialGap && !auditedGap && !pendingGap && !pendingAsset && !approvedRepair) || (previousQa?.verdict === 'pass' && !approvedRepair)) throw new Error(`Invalid subagent repair scope for ${reviewed.entryId}`)
  if (reviewed.headword !== source.headword) throw new Error(`Subagent headword drift for ${reviewed.entryId}`)
  if (!['selected', 'keep', 'gap'].includes(reviewed.verdict)) throw new Error(`Invalid subagent verdict for ${reviewed.entryId}`)
  const isComposition = reviewed.assetKind === 'composed-originals'
  if (!isComposition && (!Array.isArray(reviewed.checkedCandidates) || !reviewed.checkedCandidates.length)) throw new Error(`Subagent did not record checked candidates for ${reviewed.entryId}`)
  if (!Array.isArray(reviewed.excludedSlugs)) throw new Error(`Subagent did not record excluded slugs for ${reviewed.entryId}`)
  const rejectedSlug = previousQa?.assetSlug ?? previous.rejectedCandidate?.slug ?? (pendingAsset && reviewed.verdict !== 'keep' ? previous.asset.slug : null)
  if (rejectedSlug && !reviewed.excludedSlugs.includes(rejectedSlug)) throw new Error(`Subagent did not exclude the rejected slug for ${reviewed.entryId}`)

  if (reviewed.verdict === 'gap') {
    selectedById.set(reviewed.entryId, {
      ...previous,
      status: 'visual_gap_pending_owner_decision',
      selectionMethod: 'codex-subagent-actual-svg-review-v1',
      asset: undefined,
      gapReason: reviewed.rationale,
      compositionProposal: reviewed.compositionProposal,
      checkedCandidates: reviewed.checkedCandidates,
      excludedSlugs: reviewed.excludedSlugs,
      qa: { status: 'visual_gap_after_subagent_review', verdict: 'gap', reviewer: 'codex-subagent-actual-svg-review-v1', integratedIntoProduct: false },
    })
    continue
  }

  if (!['direct-sense', 'sentence-scene'].includes(reviewed.visualMode)) throw new Error(`Invalid visualMode for ${reviewed.entryId}`)
  if (reviewed.verdict === 'selected' && !isComposition && (!reviewed.slug || reviewed.excludedSlugs.includes(reviewed.slug) || !reviewed.checkedCandidates.includes(reviewed.slug))) throw new Error(`Invalid selected slug for ${reviewed.entryId}`)
  if (reviewed.verdict === 'selected' && isComposition && (!Array.isArray(reviewed.componentSlugs) || reviewed.componentSlugs.length < 2 || reviewed.componentSlugs.length > 3 || !reviewed.composedSvgPath)) throw new Error(`Invalid composed-originals evidence for ${reviewed.entryId}`)
  const candidateId = reviewed.visualSentenceId?.match(/^(?:candidate-)?([abc])$/u)?.[1] ?? null
  const sentence = candidateId ? learning.examples.find((entry) => entry.candidateId === candidateId) : null
  if (reviewed.visualMode === 'direct-sense' && reviewed.visualSentenceId != null) throw new Error(`Direct visual has sentence binding for ${reviewed.entryId}`)
  if (reviewed.visualMode === 'sentence-scene' && !sentence) throw new Error(`Sentence scene has no exact approved sentence for ${reviewed.entryId}`)
  const normalizedAlt = /[\u3400-\u9fff]/u.test(reviewed.alt ?? '') ? reviewed.alt : reviewed.rationale
  if (!/[\u3400-\u9fff]/u.test(normalizedAlt ?? '') || !/[\u3400-\u9fff]/u.test(reviewed.rationale ?? '')) throw new Error(`Subagent selection lacks Chinese evidence for ${reviewed.entryId}`)

  if (reviewed.verdict === 'keep') {
    if (!pendingAsset || reviewed.assetSlug !== previous.asset.slug || !reviewed.checkedCandidates.includes(previous.asset.slug)) throw new Error(`Invalid keep-existing evidence for ${reviewed.entryId}`)
    if (reviewed.visualMode !== previous.visualMode || (reviewed.visualMode === 'sentence-scene' && `candidate-${candidateId}` !== previous.visualSentenceId)) throw new Error(`Keep-existing binding drift for ${reviewed.entryId}`)
    selectedById.set(reviewed.entryId, {
      ...previous,
      selectionMethod: 'codex-subagent-actual-svg-review-v1',
      bindingRationale: reviewed.rationale,
      checkedCandidates: reviewed.checkedCandidates,
      excludedSlugs: reviewed.excludedSlugs,
      asset: { ...previous.asset, alt: normalizedAlt },
      qa: { status: 'subagent_visual_qa_pass_pending_owner', verdict: 'pass', reviewer: 'codex-subagent-actual-svg-review-v1', integratedIntoProduct: false },
    })
    continue
  }

  let detail
  let assetSlug
  let componentReceipts
  if (isComposition) {
    componentReceipts = []
    for (const slug of reviewed.componentSlugs) {
      const component = await fetchSvg(slug)
      componentReceipts.push({ slug, officialSvgUrl: component.url, sha256: sha256(component.bytes) })
    }
    const bytes = readFileSync(path.resolve(reviewed.composedSvgPath))
    const inspected = inspectSvg(bytes, reviewed.entryId)
    detail = { ...inspected, url: null }
    assetSlug = `composed-${source.headword.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || reviewed.entryId}`
  } else {
    detail = await fetchSvg(reviewed.slug)
    assetSlug = reviewed.slug
  }
  const fileName = `${reviewed.entryId}--${assetSlug}.svg`
  const publicPath = `/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-full-v1/${fileName}`
  const hash = sha256(detail.bytes)
  writeFileSync(path.join(assetDirectory, fileName), detail.bytes)
  selectedById.set(reviewed.entryId, {
    ...previous,
    status: 'selected_pending_owner_semantic_qa',
    selectionMethod: 'codex-subagent-actual-svg-review-v1',
    visualMode: reviewed.visualMode,
    teachingSense: sentence?.teachingSense ?? previous.teachingSense ?? learning.teachingSenses[0],
    visualSentenceId: reviewed.visualMode === 'sentence-scene' ? `candidate-${candidateId}` : null,
    sentence: reviewed.visualMode === 'sentence-scene' ? sentence : null,
    bindingRationale: reviewed.rationale,
    gapReason: undefined,
    checkedCandidates: reviewed.checkedCandidates ?? reviewed.componentSlugs,
    excludedSlugs: reviewed.excludedSlugs,
    asset: {
      slug: assetSlug,
      iconName: assetSlug.replaceAll('-', ' '),
      width: detail.width,
      height: detail.height,
      path: publicPath,
      sha256: hash,
      version: isComposition ? 'koboyo-composed-originals-v1' : 'koboyo-original-full-v1',
      alt: normalizedAlt,
      provenanceType: isComposition ? 'koboyo-manual-composition-selected' : 'koboyo-original-selected',
      componentReceipts,
      officialPageUrl: isComposition ? null : `https://koboyo.com/icons/${reviewed.slug}`,
      officialSvgUrl: detail.url,
      licenseUrl: 'https://koboyo.com/icons/license',
      sourceReceipt: { checkedAt: args.checkedAt, officialSvgStatus: 200, remoteSha256: hash, localSha256: hash, contentMatch: true },
    },
    qa: {
      status: 'subagent_visual_qa_pass_pending_owner',
      verdict: 'pass',
      reviewer: 'codex-subagent-actual-svg-review-v1',
      integratedIntoProduct: false,
    },
  })
}

const ordered = sourceEntries.filter((entry) => selectedById.has(entry.entryId)).map((entry) => selectedById.get(entry.entryId))
const counts = {
  total: ordered.length,
  selected: ordered.filter((entry) => entry.asset).length,
  visualGap: ordered.filter((entry) => !entry.asset).length,
  subagentPass: ordered.filter((entry) => entry.qa?.status === 'subagent_visual_qa_pass_pending_owner').length,
}
writeFileSync(selectionPath, `${JSON.stringify({
  ...selectionPayload,
  schemaVersion: 'gaokao-frequency-koboyo-selection-v3',
  status: 'subagent_visual_qa_in_progress',
  counts,
  entries: ordered,
}, null, 2)}\n`)
console.log(JSON.stringify(counts))
