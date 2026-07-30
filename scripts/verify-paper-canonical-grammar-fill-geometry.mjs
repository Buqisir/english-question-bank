import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'

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

const source = readOracle('20-grammar-fill-source-oracles-v2.json')
const publicAdversaries = readOracle(
  '20-grammar-fill-public-adversaries-v1.json',
)
const golden = readOracle(
  '20-grammar-fill-golden-geometry-reference-measurements-v2.json',
)
const coverage = readOracle(
  '20-grammar-fill-observed-coverage-oracle-v2.json',
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
