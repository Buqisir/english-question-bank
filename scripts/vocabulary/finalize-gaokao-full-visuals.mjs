#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['learning', 'selection', 'manifest', 'bindings']) if (!args[key]) throw new Error(`Missing --${key}`)
  return args
}

const args = parseArgs(process.argv.slice(2))
const rootDir = path.resolve(import.meta.dirname, '../..')
const learning = JSON.parse(readFileSync(path.resolve(args.learning), 'utf8')).entries
const selection = JSON.parse(readFileSync(path.resolve(args.selection), 'utf8')).entries
const learningById = new Map(learning.map((entry) => [entry.entryId, entry]))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function extractInlineChildSvgs(svg) {
  const tags = /<\/?svg\b[^>]*>/gu
  const children = []
  let depth = 0
  let start = -1
  let match
  while ((match = tags.exec(svg)) != null) {
    if (match[0][1] === '/') {
      if (depth === 2 && start >= 0) children.push(Buffer.from(svg.slice(start, tags.lastIndex)))
      depth -= 1
    } else {
      depth += 1
      if (depth === 2) start = match.index
    }
  }
  return children
}

if (learning.length !== 3_000 || selection.length !== 3_000) throw new Error('Full visual finalization requires exactly 3000 learning and selection entries')
if (new Set(selection.map((entry) => entry.entryId)).size !== 3_000) throw new Error('Visual selection contains duplicate entryId values')

const manifests = []
const bindings = []
for (const selected of selection) {
  const content = learningById.get(selected.entryId)
  if (!content || content.headword !== selected.headword) throw new Error(`Visual learning identity mismatch for ${selected.entryId}`)
  if (!selected.asset || selected.qa?.status !== 'subagent_visual_qa_pass_pending_owner' || selected.qa?.verdict !== 'pass') {
    throw new Error(`Visual is not Subagent-approved for ${selected.entryId}`)
  }
  if (!['direct-sense', 'sentence-scene'].includes(selected.visualMode)) throw new Error(`Invalid visual mode for ${selected.entryId}`)
  const filePath = path.join(rootDir, 'app/public', selected.asset.path.replace(/^\//u, ''))
  if (!existsSync(filePath)) throw new Error(`Missing visual file for ${selected.entryId}`)
  const bytes = readFileSync(filePath)
  if (sha256(bytes) !== selected.asset.sha256) throw new Error(`Visual hash mismatch for ${selected.entryId}`)
  let finalizedAsset = selected.asset
  if (selected.asset.version === 'koboyo-composed-originals-v1') {
    const svg = bytes.toString('utf8')
    const embeddedImages = [...svg.matchAll(/<image\b[^>]*\bhref="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"[^>]*>/gu)]
      .map((match) => Buffer.from(match[1], 'base64'))
    const embeddedComponents = [...embeddedImages, ...extractInlineChildSvgs(svg)]
    if (![2, 3].includes(selected.asset.componentReceipts?.length) || embeddedComponents.length < selected.asset.componentReceipts.length) {
      throw new Error(`Composition receipt count mismatch for ${selected.entryId}`)
    }
    finalizedAsset = {
      ...selected.asset,
      embeddedComponentSha256s: embeddedComponents.map((component) => sha256(component)),
    }
  }

  let embeddedBinding
  let detailedBinding
  if (selected.visualMode === 'direct-sense') {
    if (selected.visualSentenceId != null || selected.sentence != null) throw new Error(`Direct visual has sentence data for ${selected.entryId}`)
    embeddedBinding = { mode: 'direct-sense', displayContract: 'image_may_appear_with_headword_only' }
    detailedBinding = {
      visualMode: 'direct-sense',
      teachingSense: selected.teachingSense,
      visualSentenceId: null,
      visualSentenceTextSha256: null,
      displayContract: 'image_may_appear_with_headword_only',
    }
  } else {
    const candidateId = selected.visualSentenceId?.match(/^candidate-([abc])$/u)?.[1]
    const sentence = content.examples.find((example) => example.candidateId === candidateId)
    if (!sentence || selected.sentence?.english !== sentence.english || selected.teachingSense !== sentence.teachingSense) {
      throw new Error(`Sentence-scene binding drift for ${selected.entryId}`)
    }
    const sentenceTextSha256 = sha256(sentence.english)
    embeddedBinding = {
      mode: 'sentence-scene',
      sentenceId: selected.visualSentenceId,
      sentenceTextSha256,
      displayContract: 'image_and_exact_sentence_with_target_highlight',
    }
    detailedBinding = {
      visualMode: 'sentence-scene',
      teachingSense: sentence.teachingSense,
      visualSentenceId: selected.visualSentenceId,
      visualSentenceTextSha256: sentenceTextSha256,
      displayContract: 'image_and_exact_sentence_with_target_highlight',
    }
  }

  manifests.push({
    entryId: selected.entryId,
    headword: selected.headword,
    visualKey: selected.entryId,
    slug: selected.asset.slug,
    width: selected.asset.width,
    height: selected.asset.height,
    sha256: selected.asset.sha256,
    path: selected.asset.path,
    alt: selected.asset.alt,
    version: selected.asset.version,
    binding: embeddedBinding,
  })
  bindings.push({
    bindingId: `${selected.entryId}:visual-binding-v1`,
    entryId: selected.entryId,
    headword: selected.headword,
    ...detailedBinding,
    bindingRationale: selected.bindingRationale,
    asset: finalizedAsset,
    qa: {
      status: 'subagent_visual_qa_pass',
      reviewer: selected.qa.reviewer,
      verdict: 'pass',
      reviewUnit: selected.visualMode === 'sentence-scene' ? 'image_plus_exact_sentence_plus_highlight' : 'image_plus_teaching_sense',
    },
  })
}

const summary = {
  entries: bindings.length,
  directSense: bindings.filter((entry) => entry.visualMode === 'direct-sense').length,
  sentenceScene: bindings.filter((entry) => entry.visualMode === 'sentence-scene').length,
  composedOriginals: bindings.filter((entry) => entry.asset.version === 'koboyo-composed-originals-v1').length,
  visualGap: 0,
}
writeFileSync(path.resolve(args.manifest), `${JSON.stringify({
  schemaVersion: 1,
  version: 'gaokao-frequency-koboyo-subagent-v1',
  publicBasePath: '/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-full-v1',
  status: 'subagent_visual_qa_pass',
  summary,
  entries: manifests,
}, null, 2)}\n`)
writeFileSync(path.resolve(args.bindings), `${JSON.stringify({
  schemaVersion: 1,
  version: 'gaokao-frequency-visual-bindings-v1',
  status: 'subagent_visual_qa_pass',
  policy: 'docs/cuts/gaokao-vocabulary-3000/visual-binding-policy-v2.md',
  summary,
  entries: bindings,
}, null, 2)}\n`)
console.log(JSON.stringify(summary))
