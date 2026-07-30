import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const qaRoot = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa',
)

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readOracle(fileName) {
  const oraclePath = path.join(qaRoot, fileName)
  return {
    path: oraclePath,
    bytes: readFileSync(oraclePath),
    value: JSON.parse(readFileSync(oraclePath, 'utf8')),
  }
}

function projectExplicitPromptFixture({ prompt, followingText }) {
  const occurrence = {
    kind: 'group',
    groupId: 'group:grammar-fill:prompt-fixture',
    familyContractId: 'grammar-fill',
    numbering: [{ questionId: 'question:grammar-fill:1', number: 56 }],
    blanks: [{
      blankId: 'blank:grammar-fill:1',
      questionId: 'question:grammar-fill:1',
      prompt,
    }],
    content: {
      blocks: [{
        kind: 'paragraph',
        nodeId: 'paragraph:grammar-fill:prompt-fixture',
        inlines: [
          {
            kind: 'blank_ref',
            nodeId: 'blank-ref:grammar-fill:1',
            blankId: 'blank:grammar-fill:1',
          },
          {
            kind: 'text',
            nodeId: 'text:grammar-fill:following',
            text: followingText,
          },
        ],
      }],
    },
    media: [],
    choices: { ownership: 'none' },
  }
  const consumption = {
    disposition: 'ready',
    paperId: 'paper:grammar-fill:prompt-fixture',
    authorityRef: canonicalAuthorityRef,
    selections: [{
      mode: 'canonical',
      familyContractId: 'grammar-fill',
      groupIds: [occurrence.groupId],
      projectedOccurrences: [occurrence],
      projectedOccurrenceDigests: [{
        groupId: occurrence.groupId,
        digest: digestJson(occurrence),
      }],
    }],
  }
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'grammar-fill',
    groupId: occurrence.groupId,
  })
}

const explicitPromptProjection = projectExplicitPromptFixture({
  prompt: 'hold',
  followingText: ' (hold) steady.',
})
assert.equal(explicitPromptProjection.paragraphs[0].nodes[0].hint, 'hold')
assert.equal(explicitPromptProjection.paragraphs[0].nodes[1].text, ' steady.')
const ordinaryParentheticalProjection = projectExplicitPromptFixture({
  prompt: null,
  followingText: ' (ordinary aside) remains source text.',
})
assert.equal(
  Object.hasOwn(ordinaryParentheticalProjection.paragraphs[0].nodes[0], 'hint'),
  false,
  'an explicit prompt-free Blank never reclassifies following prose',
)
assert.equal(
  ordinaryParentheticalProjection.paragraphs[0].nodes[1].text,
  ' (ordinary aside) remains source text.',
  'post-loader projection preserves ordinary parenthetical prose verbatim',
)

const source = readOracle('20-grammar-fill-source-oracles-v3.json')
const publicAdversaries = readOracle(
  '20-grammar-fill-public-adversaries-v2.json',
)
const golden = readOracle(
  '20-grammar-fill-golden-geometry-reference-measurements-v2.json',
)
const coverage = readOracle(
  '20-grammar-fill-observed-coverage-oracle-v3.json',
)

function collectForbiddenGeometryFields(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectForbiddenGeometryFields(entry, found))
    return found
  }
  if (!value || typeof value !== 'object') return found
  for (const [key, entry] of Object.entries(value)) {
    if (
      /(?:width|height|gap|margin|inset|offset|coordinate).*(?:px|pt)$/iu
        .test(key)
    ) found.push(key)
    collectForbiddenGeometryFields(entry, found)
  }
  return found
}

assert.deepEqual(
  collectForbiddenGeometryFields(source.value),
  [],
  'successor source oracle contains no px/pt shadow geometry',
)
assert.deepEqual(
  collectForbiddenGeometryFields(publicAdversaries.value),
  [],
  'successor public adversary contains no px/pt shadow geometry',
)

for (const binding of Object.values(source.value.sources)) {
  assert.equal(
    sha256(readFileSync(path.join(repositoryRoot, binding.path))),
    binding.sha256,
    `Grammar Fill source binding is immutable: ${binding.path}`,
  )
}
assert.equal(
  publicAdversaries.value.authorityBoundary.sourceOracle,
  path.relative(repositoryRoot, source.path),
)
assert.equal(
  publicAdversaries.value.authorityBoundary.sourceOracleSha256,
  sha256(source.bytes),
  'public adversaries bind the exact independent source-oracle bytes',
)
const publicGeometryAuthorityPath = path.join(
  repositoryRoot,
  publicAdversaries.value.authorityBoundary.geometryFixtureAuthority,
)
const publicGeometryAuthority = JSON.parse(
  readFileSync(publicGeometryAuthorityPath, 'utf8'),
)
assert.deepEqual(
  collectForbiddenGeometryFields(publicGeometryAuthority),
  [],
  'successor fixture authority contains no px/pt shadow geometry',
)
assert.equal(
  sha256(readFileSync(publicGeometryAuthorityPath)),
  publicAdversaries.value.authorityBoundary
    .geometryFixtureAuthoritySha256,
)
assert.equal(
  publicAdversaries.value.authorityBoundary.constructionBoundary,
  'canonical_consumption_and_print_blocks_before_public_producer',
)
assert.equal(
  publicAdversaries.value.authorityBoundary.renderMutation,
  'forbidden',
)
assert.equal(
  publicAdversaries.value.wrappedLineAndLineEnd.wrappedQuestionId,
  source.value.variants.wrappedLineQuestionId,
)
assert.equal(
  publicAdversaries.value.wrappedLineAndLineEnd.lineEndQuestionId,
  source.value.variants.lineEndQuestionId,
)
assert.equal(
  publicGeometryAuthority.variants[
    publicAdversaries.value.wrappedLineAndLineEnd.screenGeometryVariantId
  ].surface,
  'screen',
)
assert.equal(
  publicGeometryAuthority.variants[
    publicAdversaries.value.wrappedLineAndLineEnd
      .printHtmlGeometryVariantId
  ].surface,
  'print_html',
)
assert.equal(
  publicAdversaries.value.passageCrossPage.sourceText,
  source.value.variants.passageCrossPage.sourceText,
)
assert.equal(
  sha256(readFileSync(path.join(repositoryRoot, golden.value.reference.path))),
  golden.value.reference.sha256,
  'Grammar Fill geometry binds the exact golden page-10 digest',
)
assert.equal(
  sha256(readFileSync(path.join(repositoryRoot, golden.value.framework.path))),
  golden.value.framework.sha256,
  'Grammar Fill geometry binds the reviewed framework digest',
)
assert.deepEqual(
  grammarFillRhythm.adjacencyGraph,
  coverage.value.edges,
  'production Grammar Fill authority exactly equals the independent 32-edge oracle',
)
assert.equal(grammarFillRhythm.blankGeometry.widthEm, 3.3)
assert.equal(grammarFillRhythm.blankGeometry.trailingDot, false)
assert.equal(grammarFillRhythm.promptGeometry.attachment, 'inside_blank_unit')
assert.equal(grammarFillRhythm.promptGeometry.absentContribution, 0)
assert.equal(
  grammarFillRhythm.rendererMapping.screen.baselineStepPx,
  grammarFillRhythm.targets.screen.baselineStepPx,
)
assert.equal(
  grammarFillRhythm.rendererMapping.printPdf.baselineStepPt,
  grammarFillRhythm.targets.printPdf.baselineStepPt,
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.paperId,
  source.value.paperId,
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.sourceOracle.path,
  path.relative(repositoryRoot, source.path),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.sourceOracle.sha256,
  sha256(source.bytes),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.publicAdversaries.path,
  path.relative(repositoryRoot, publicAdversaries.path),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.publicAdversaries.sha256,
  sha256(publicAdversaries.bytes),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure
    .publicGeometryFixtures.path,
  path.relative(repositoryRoot, publicGeometryAuthorityPath),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure
    .publicGeometryFixtures.sha256,
  sha256(readFileSync(publicGeometryAuthorityPath)),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.observedCoverage.path,
  path.relative(repositoryRoot, coverage.path),
)
assert.equal(
  grammarFillRhythm.publicArtifactOracle.proofClosure.observedCoverage.sha256,
  sha256(coverage.bytes),
)
assert.deepEqual(
  grammarFillRhythm.publicArtifactOracle.grammarFill,
  source.value.publicIdentities.grammarFill,
  'production authority publishes the exact source-bound Grammar Fill identity',
)
const sourcePromptedQuestionNos = Object.entries(
  source.value.publicIdentities.grammarFill.prompts,
).flatMap(([questionId, prompt]) =>
  prompt === null ? [] : [Number(questionId.slice(-3))])
const sourceUnpromptedQuestionNos = Object.entries(
  source.value.publicIdentities.grammarFill.prompts,
).flatMap(([questionId, prompt]) =>
  prompt === null ? [Number(questionId.slice(-3))] : [])
assert.deepEqual(
  golden.value.observedGoldenVariants.prompted,
  sourcePromptedQuestionNos,
  'golden prompted variants exactly equal the immutable source prompt set',
)
assert.deepEqual(
  golden.value.observedGoldenVariants.unprompted,
  sourceUnpromptedQuestionNos,
  'golden unprompted variants exactly equal the immutable source prompt set',
)
for (const [sourceKey, binding] of Object.entries(
  grammarFillRhythm.publicArtifactOracle.sourceBindings,
)) {
  const oracleBinding = source.value.sources[sourceKey]
  if (!oracleBinding) continue
  assert.equal(binding.sha256, oracleBinding.sha256)
}
assert.equal(
  new Set(coverage.value.edges.map((edge) => edge.edgeId)).size,
  coverage.value.edges.length,
  'Grammar Fill oracle edge identities are unique',
)
assert.deepEqual(
  [...new Set(coverage.value.requiredBundles.flatMap(
    (bundle) => bundle.expectedEdgeIds,
  ))].sort(),
  coverage.value.edges.map((edge) => edge.edgeId).sort(),
  'the six public bundles close the complete Grammar Fill graph',
)

console.log('Grammar Fill golden geometry authority verification passed.')
