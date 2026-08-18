#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const sample = readJson('data/vocabulary/gaokao-frequency-golden-sample-v1.json').entries
const learning = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json').entries
const selection = readJson('data/vocabulary/gaokao-frequency-golden-visual-selection-v1.json').entries
const manifestPayload = readJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json')
const manifest = manifestPayload.entries
const bindingsPayload = readJson('data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json')
const bindings = bindingsPayload.entries
const emojiPattern = /\p{Extended_Pictographic}/u

assert.equal(sample.length, 90, 'golden sample must contain exactly 90 entries')
assert.equal(learning.length, 90, 'reviewed learning data must contain exactly 90 entries')
assert.equal(selection.length, 90, 'visual selection must contain exactly 90 entries')
assert.equal(manifest.length, 90, 'visual manifest must contain exactly 90 entries')
assert.equal(bindings.length, 90, 'visual bindings must contain exactly 90 entries')
assert.equal(manifestPayload.version, 'koboyo-original-v1', 'visual manifest version changed')
assert.equal(bindingsPayload.status, 'generated_pending_owner_semantic_qa', 'visual binding QA state changed')
assert.deepEqual(bindingsPayload.summary, { entries: 90, directSense: 79, sentenceScene: 11, visualGap: 0, replacements: 14 }, 'visual binding summary changed')

for (const [label, entries, key] of [
  ['visual selection', selection, 'entryId'],
  ['visual manifest', manifest, 'entryId'],
  ['visual manifest', manifest, 'visualKey'],
  ['visual manifest', manifest, 'path'],
  ['visual binding', bindings, 'entryId'],
  ['visual binding', bindings, 'bindingId'],
]) {
  assert.equal(new Set(entries.map((entry) => entry[key])).size, 90, `${label} ${key} values must be unique`)
}

const sampleById = new Map(sample.map((entry) => [entry.entryId, entry]))
const learningById = new Map(learning.map((entry) => [entry.entryId, entry]))
const selectedById = new Map(selection.map((entry) => [entry.entryId, entry]))
const manifestById = new Map(manifest.map((entry) => [entry.entryId, entry]))
const bindingById = new Map(bindings.map((entry) => [entry.entryId, entry]))

for (const source of sample) {
  const content = learningById.get(source.entryId)
  const selected = selectedById.get(source.entryId)
  const entry = manifestById.get(source.entryId)
  const binding = bindingById.get(source.entryId)
  assert.ok(content && selected && entry && binding, `missing visual binding data for ${source.entryId}`)
  assert.equal(selected.headword, source.headword, `visual selection headword changed for ${source.entryId}`)
  assert.equal(entry.headword, source.headword, `visual manifest headword changed for ${source.entryId}`)
  assert.equal(binding.headword, source.headword, `visual binding headword changed for ${source.entryId}`)
  assert.equal(entry.visualKey, source.entryId, `visual key changed for ${source.entryId}`)
  assert.equal(entry.slug, selected.slug, `selected icon changed between manifests for ${source.entryId}`)
  assert.equal(entry.width, selected.width, `visual width changed for ${source.entryId}`)
  assert.equal(entry.height, selected.height, `visual height changed for ${source.entryId}`)
  assert.equal(entry.path, selected.path, `visual path changed between manifests for ${source.entryId}`)
  assert.match(entry.alt, /[\u3400-\u9fff]/u, `visual alt must be Chinese for ${source.entryId}`)
  assert.equal(emojiPattern.test(entry.alt), false, `visual alt contains emoji for ${source.entryId}`)
  assert.match(entry.path, /^\/vocabulary-assets\/gaokao-frequency-v1\/visuals\/koboyo-v1\/[A-Za-z0-9._-]+\.svg$/u, `unsafe visual path for ${source.entryId}`)

  const filePath = path.join(rootDir, 'app/public', entry.path.slice(1))
  const bytes = readFileSync(filePath)
  assert.equal(sha256(bytes), entry.sha256, `visual hash mismatch for ${source.entryId}`)
  const svg = bytes.toString('utf8')
  assert.match(svg, /^<svg\b/u, `visual is not an SVG for ${source.entryId}`)
  assert.match(svg, /\bfill="currentColor"/u, `visual cannot inherit product color for ${source.entryId}`)
  const viewBox = svg.match(/\bviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/u)
  assert.ok(viewBox, `visual has no numeric viewBox for ${source.entryId}`)
  assert.ok(Math.abs(Number(viewBox[3]) - entry.width) < 1, `visual viewBox width changed for ${source.entryId}`)
  assert.ok(Math.abs(Number(viewBox[4]) - entry.height) < 1, `visual viewBox height changed for ${source.entryId}`)
  assert.doesNotMatch(svg, /<(?:script|foreignObject)\b/iu, `visual contains executable or foreign content for ${source.entryId}`)
  assert.doesNotMatch(svg, /\b(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/iu, `visual contains an external resource for ${source.entryId}`)

  assert.equal(binding.asset.slug, entry.slug, `binding asset slug mismatch for ${source.entryId}`)
  assert.equal(binding.asset.path, entry.path, `binding asset path mismatch for ${source.entryId}`)
  assert.equal(binding.asset.sha256, entry.sha256, `binding asset hash mismatch for ${source.entryId}`)
  assert.equal(binding.asset.alt, entry.alt, `binding asset alt mismatch for ${source.entryId}`)
  assert.equal(binding.asset.version, 'koboyo-original-v1', `binding asset version mismatch for ${source.entryId}`)
  assert.equal(binding.asset.officialPageUrl, `https://koboyo.com/icons/${entry.slug}`, `official page URL mismatch for ${source.entryId}`)
  assert.equal(binding.asset.officialSvgUrl, `https://koboyo.com/icons/svg/${entry.slug}.svg`, `official SVG URL mismatch for ${source.entryId}`)
  assert.equal(binding.asset.licenseUrl, 'https://koboyo.com/icons/license', `license URL mismatch for ${source.entryId}`)
  assert.equal(binding.asset.sourceReceipt.checkedAt, '2026-08-11', `asset receipt date mismatch for ${source.entryId}`)
  assert.equal(binding.asset.sourceReceipt.officialSvgStatus, 200, `asset receipt status mismatch for ${source.entryId}`)
  assert.equal(binding.asset.sourceReceipt.localSha256, entry.sha256, `asset receipt local hash mismatch for ${source.entryId}`)
  assert.equal(binding.asset.sourceReceipt.contentMatchAfterTrailingWhitespaceNormalization, true, `asset receipt content mismatch for ${source.entryId}`)
  assert.equal(binding.qa.status, 'pending_owner_semantic_qa', `visual QA must remain pending for ${source.entryId}`)
  assert.equal(binding.qa.verdict, 'pending', `visual QA verdict must remain pending for ${source.entryId}`)
  assert.equal(binding.qa.integratedIntoProduct, false, `unapproved visual cannot enter product for ${source.entryId}`)
  assert.ok(content.teachingSenses.includes(binding.teachingSense), `binding sense is not frozen learning content for ${source.entryId}`)

  if (binding.visualMode === 'direct-sense') {
    assert.equal(binding.visualSentenceId, null, `direct visual has a sentence ID for ${source.entryId}`)
    assert.equal(binding.visualSentenceTextSha256, null, `direct visual has a sentence hash for ${source.entryId}`)
    assert.equal(binding.sceneQuery, null, `direct visual has a scene query for ${source.entryId}`)
    assert.equal(binding.displayContract, 'image_may_appear_with_headword_only', `direct visual display contract changed for ${source.entryId}`)
    assert.equal(binding.qa.reviewUnit, 'image_plus_teaching_sense', `direct visual QA unit changed for ${source.entryId}`)
  } else if (binding.visualMode === 'sentence-scene') {
    assert.match(binding.visualSentenceId, /^candidate-[abc]$/u, `sentence visual has an invalid sentence ID for ${source.entryId}`)
    const candidateId = binding.visualSentenceId.slice(-1)
    const example = content.examples.find((item) => item.candidateId === candidateId)
    assert.ok(example, `sentence visual cannot resolve its example for ${source.entryId}`)
    assert.equal(binding.visualSentenceTextSha256, sha256(example.english), `sentence visual text hash mismatch for ${source.entryId}`)
    assert.equal(binding.teachingSense, example.teachingSense, `sentence visual sense mismatch for ${source.entryId}`)
    assert.ok(binding.sceneQuery && typeof binding.sceneQuery === 'object', `sentence visual has no scene query for ${source.entryId}`)
    assert.equal(binding.displayContract, 'image_and_exact_sentence_with_target_highlight', `sentence visual display contract changed for ${source.entryId}`)
    assert.equal(binding.qa.reviewUnit, 'image_plus_exact_sentence_plus_highlight', `sentence visual QA unit changed for ${source.entryId}`)
  } else {
    assert.fail(`unsupported visual mode ${binding.visualMode} for ${source.entryId}`)
  }
}

const bindingsBySlug = Map.groupBy(bindings, (entry) => entry.asset.slug)
for (const [slug, grouped] of bindingsBySlug) {
  if (grouped.length === 1) continue
  assert.equal(grouped.length, 2, `unexpected repeated Koboyo asset ${slug}`)
  const reused = grouped.find((entry) => entry.asset.provenanceType === 'koboyo-original-semantic-reuse')
  const source = grouped.find((entry) => entry !== reused)
  assert.ok(reused && source, `repeated asset ${slug} is missing a semantic reuse receipt`)
  assert.equal(reused.asset.sourceEntryId, source.entryId, `repeated asset ${slug} source entry mismatch`)
  assert.equal(reused.teachingSense, source.teachingSense, `repeated asset ${slug} does not share an exact teaching sense`)
  assert.equal(reused.asset.sourceReceipt.localNormalizedSha256, source.asset.sourceReceipt.localNormalizedSha256, `repeated asset ${slug} does not reuse identical normalized SVG content`)
}

assert.equal(new Set(sampleById.keys()).size, 90, 'sample identity changed')
console.log('PASS gaokao golden visuals: 90 source-verified Koboyo bindings (79 direct, 11 sentence-scene); Owner semantic QA pending')
