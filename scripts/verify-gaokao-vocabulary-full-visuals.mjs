#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const learning = readJson('data/vocabulary/gaokao-frequency-learning-reviewed-v1.json').entries
const manifestPayload = readJson('data/vocabulary/gaokao-frequency-visual-manifest-v1.json')
const bindingsPayload = readJson('data/vocabulary/gaokao-frequency-visual-bindings-v1.json')
const manifest = manifestPayload.entries
const bindings = bindingsPayload.entries

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

assert.equal(learning.length, 3_000, 'reviewed learning data must contain 3000 entries')
assert.equal(manifest.length, 3_000, 'visual manifest must contain 3000 entries')
assert.equal(bindings.length, 3_000, 'visual bindings must contain 3000 entries')
assert.equal(manifestPayload.status, 'subagent_visual_qa_pass', 'visual manifest is not fully approved')
assert.equal(bindingsPayload.status, 'subagent_visual_qa_pass', 'visual bindings are not fully approved')
assert.equal(manifestPayload.summary.visualGap, 0, 'visual manifest still has gaps')
assert.equal(bindingsPayload.summary.visualGap, 0, 'visual bindings still have gaps')

for (const [label, entries, key] of [
  ['manifest', manifest, 'entryId'],
  ['manifest', manifest, 'visualKey'],
  ['manifest', manifest, 'path'],
  ['binding', bindings, 'entryId'],
  ['binding', bindings, 'bindingId'],
]) assert.equal(new Set(entries.map((entry) => entry[key])).size, 3_000, `${label} ${key} must be unique`)

const learningById = new Map(learning.map((entry) => [entry.entryId, entry]))
const manifestById = new Map(manifest.map((entry) => [entry.entryId, entry]))
for (const binding of bindings) {
  const content = learningById.get(binding.entryId)
  const asset = manifestById.get(binding.entryId)
  assert.ok(content && asset, `missing visual data for ${binding.entryId}`)
  assert.equal(binding.headword, content.headword, `binding headword drift for ${binding.entryId}`)
  assert.equal(asset.headword, content.headword, `manifest headword drift for ${binding.entryId}`)
  assert.equal(asset.visualKey, binding.entryId, `visual key drift for ${binding.entryId}`)
  assert.match(asset.path, /^\/vocabulary-assets\/gaokao-frequency-v1\/visuals\/koboyo-full-v1\/[A-Za-z0-9._-]+\.svg$/u, `unsafe visual path for ${binding.entryId}`)
  assert.match(asset.alt, /[\u3400-\u9fff]/u, `visual alt must be Chinese for ${binding.entryId}`)
  assert.equal(binding.qa?.status, 'subagent_visual_qa_pass', `visual QA missing for ${binding.entryId}`)
  assert.equal(binding.qa?.verdict, 'pass', `visual verdict changed for ${binding.entryId}`)
  assert.equal(binding.asset.path, asset.path, `asset path drift for ${binding.entryId}`)
  assert.equal(binding.asset.sha256, asset.sha256, `asset hash drift for ${binding.entryId}`)
  assert.equal(binding.asset.alt, asset.alt, `asset alt drift for ${binding.entryId}`)

  const bytes = readFileSync(path.join(rootDir, 'app/public', asset.path.slice(1)))
  assert.equal(sha256(bytes), asset.sha256, `visual hash mismatch for ${binding.entryId}`)
  const svg = bytes.toString('utf8')
  assert.match(svg, /^<svg\b/u, `visual is not SVG for ${binding.entryId}`)
  assert.match(svg, /\bviewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/u, `visual has no numeric viewBox for ${binding.entryId}`)
  assert.doesNotMatch(svg, /<(?:script|foreignObject)\b/iu, `visual contains executable content for ${binding.entryId}`)
  assert.doesNotMatch(svg, /\b(?:href|src)\s*=\s*["'](?:https?:|\/\/)/iu, `visual contains external resources for ${binding.entryId}`)

  if (binding.asset.version === 'koboyo-composed-originals-v1') {
    assert.ok([2, 3].includes(binding.asset.componentReceipts?.length), `composition receipt count changed for ${binding.entryId}`)
    const embeddedImages = [...svg.matchAll(/<image\b[^>]*>/gu)].flatMap((match) => {
      const encoded = match[0].match(/\bhref="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/u)?.[1]
      if (!encoded) return []
      return [Buffer.from(encoded, 'base64')]
    })
    const embeddedComponents = [...embeddedImages, ...extractInlineChildSvgs(svg)]
    assert.ok(embeddedComponents.length >= binding.asset.componentReceipts.length, `embedded component count changed for ${binding.entryId}`)
    assert.deepEqual(embeddedComponents.map((component) => sha256(component)), binding.asset.embeddedComponentSha256s, `embedded component bytes changed for ${binding.entryId}`)
    for (const component of embeddedComponents) {
      const embeddedSvg = component.toString('utf8')
      assert.match(embeddedSvg, /^<svg\b/u, `embedded component is not SVG for ${binding.entryId}`)
      assert.doesNotMatch(embeddedSvg, /<(?:script|foreignObject)\b/iu, `embedded component contains executable content for ${binding.entryId}`)
      assert.doesNotMatch(embeddedSvg, /\b(?:href|src)\s*=\s*["'](?:https?:|\/\/)/iu, `embedded component contains external resources for ${binding.entryId}`)
    }
    for (const receipt of binding.asset.componentReceipts) {
      assert.match(receipt.officialSvgUrl, new RegExp(`^https://koboyo\\.com/icons/svg/${receipt.slug}\\.svg$`, 'u'), `invalid component receipt for ${binding.entryId}`)
      assert.match(receipt.sha256, /^[a-f0-9]{64}$/u, `invalid component hash for ${binding.entryId}`)
    }
  } else {
    assert.ok(['koboyo-original-v1', 'koboyo-original-full-v1'].includes(binding.asset.version), `unsupported visual version for ${binding.entryId}`)
    assert.doesNotMatch(svg, /\b(?:href|src)\s*=\s*["']data:/iu, `original visual contains embedded data for ${binding.entryId}`)
    assert.equal(binding.asset.officialSvgUrl, `https://koboyo.com/icons/svg/${asset.slug}.svg`, `official SVG URL mismatch for ${binding.entryId}`)
  }

  if (binding.visualMode === 'direct-sense') {
    assert.equal(binding.visualSentenceId, null, `direct visual has sentence ID for ${binding.entryId}`)
    assert.equal(binding.visualSentenceTextSha256, null, `direct visual has sentence hash for ${binding.entryId}`)
    assert.deepEqual(asset.binding, { mode: 'direct-sense', displayContract: 'image_may_appear_with_headword_only' }, `direct display contract changed for ${binding.entryId}`)
    assert.ok(content.teachingSenses.includes(binding.teachingSense), `direct teaching sense drift for ${binding.entryId}`)
  } else {
    assert.equal(binding.visualMode, 'sentence-scene', `unsupported visual mode for ${binding.entryId}`)
    const candidateId = binding.visualSentenceId?.match(/^candidate-([abc])$/u)?.[1]
    const sentence = content.examples.find((example) => example.candidateId === candidateId)
    assert.ok(sentence, `sentence binding cannot resolve for ${binding.entryId}`)
    assert.equal(binding.visualSentenceTextSha256, sha256(sentence.english), `sentence hash mismatch for ${binding.entryId}`)
    assert.equal(binding.teachingSense, sentence.teachingSense, `sentence teaching sense drift for ${binding.entryId}`)
    assert.deepEqual(asset.binding, {
      mode: 'sentence-scene',
      sentenceId: binding.visualSentenceId,
      sentenceTextSha256: binding.visualSentenceTextSha256,
      displayContract: 'image_and_exact_sentence_with_target_highlight',
    }, `sentence display contract changed for ${binding.entryId}`)
  }
}

assert.deepEqual(manifestPayload.summary, bindingsPayload.summary, 'visual summaries diverged')
assert.equal(bindings.filter((entry) => entry.visualMode === 'direct-sense').length, bindingsPayload.summary.directSense, 'direct count drift')
assert.equal(bindings.filter((entry) => entry.visualMode === 'sentence-scene').length, bindingsPayload.summary.sentenceScene, 'sentence count drift')
assert.equal(bindings.filter((entry) => entry.asset.version === 'koboyo-composed-originals-v1').length, bindingsPayload.summary.composedOriginals, 'composition count drift')
console.log(`PASS gaokao full visuals: ${bindings.length} Subagent-approved bindings; ${bindingsPayload.summary.directSense} direct, ${bindingsPayload.summary.sentenceScene} sentence-scene, ${bindingsPayload.summary.composedOriginals} manual compositions`)
