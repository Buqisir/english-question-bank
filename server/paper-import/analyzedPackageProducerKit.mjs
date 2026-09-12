import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { TOPIC_LABEL_TAXONOMY } from '../../shared/topics/topicTaxonomy.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const esbuildBinary = path.resolve(path.dirname(require.resolve('esbuild')), '../bin/esbuild')
const trackedFiles = [
  'schemas/paper-import/analyzed-package-v1.schema.json',
  'schemas/paper-canonical/nck1-analyzed-package-v1.schema.json',
  'schemas/paper-canonical/nck1-analyzed-package-input-v1.schema.json',
  'schemas/paper-import/objective-teaching-content-v1.schema.json',
  'schemas/paper-import/reading-choice-analysis-v1.schema.json',
  'schemas/paper-import/writing-analysis-v1.schema.json',
  'schemas/paper-import/continuation-analysis-v2.schema.json',
  'schemas/paper-import/listening-analysis-v1.schema.json',
  'prompts/reading-choice-analysis-v1.md',
  'prompts/seven-choices-analysis-v1.md',
  'prompts/cloze-analysis-v1.md',
  'prompts/grammar-fill-analysis-v1.md',
  'prompts/application-writing-model-answer-v3.md',
  'prompts/application-writing-staged-analysis-v1.md',
  'prompts/continuation-analysis-v2.md',
  'prompts/continuation-writing-staged-analysis-v2.md',
  'prompts/listening-analysis-v1.md',
  '.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md',
  'shared/paper-canonical/nck1SourceMaterialization.mjs',
  'shared/analysis/analysisTextRanges.d.mts',
  'shared/analysis/objectiveTeachingContent.mjs',
  'shared/writing/applicationReviewCard.d.ts',
  'shared/writing/continuationAnalysis.d.ts',
  'server/paper-import-ai/analyzeReading.mjs',
  'server/paper-import-ai/analyzeSevenChoices.mjs',
  'server/paper-import-ai/analyzeCloze.mjs',
  'server/paper-import-ai/analyzeGrammarFill.mjs',
  'server/paper-import-ai/analyzeListening.mjs',
]

const runtimeAssets = [
  '.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md',
  'prompts/application-writing-model-answer-v3.md',
  'prompts/application-writing-staged-analysis-v1.md',
  'prompts/cloze-analysis-v1.md',
  'prompts/continuation-analysis-v2.md',
  'prompts/continuation-writing-staged-analysis-v2.md',
  'prompts/grammar-fill-analysis-v1.md',
  'prompts/listening-analysis-v1.md',
  'prompts/reading-choice-analysis-v1.md',
  'prompts/seven-choices-analysis-v1.md',
  'schemas/paper-import/analyzed-package-v1.schema.json',
  'schemas/paper-import/answer-key-v1.schema.json',
  'schemas/paper-import/continuation-analysis-v1.schema.json',
  'schemas/paper-import/continuation-analysis-v2.schema.json',
  'schemas/paper-import/import-meta-v1.schema.json',
  'schemas/paper-import/listening-analysis-v1.schema.json',
  'schemas/paper-import/paper-asset-v1.schema.json',
  'schemas/paper-import/paper-normalized-groups-v1.schema.json',
  'schemas/paper-import/reading-choice-analysis-v1.schema.json',
  'schemas/paper-import/writing-analysis-v1.schema.json',
]

// esbuild preserves import.meta.url. Modules that originally used their own
// dirname therefore resolve these two initialization assets beside the bundle.
const runtimeRelocatedAssets = [
  ['server/paper-import-ai/grammar-fill-facets-v2.json', 'server/paper-import/grammar-fill-facets-v2.json'],
  ['server/paper-import-ai/grammar-fill-similarity-v1.json', 'server/paper-import/grammar-fill-similarity-v1.json'],
]

const bundledDependencies = [
  { name: 'ajv', version: '8.20.0', license: 'MIT', licenseFile: 'LICENSE' },
  { name: 'fast-deep-equal', version: '3.1.3', license: 'MIT', licenseFile: 'LICENSE' },
  { name: 'fast-uri', version: '3.1.5', license: 'BSD-3-Clause', licenseFile: 'LICENSE' },
  { name: 'json-schema-traverse', version: '1.0.0', license: 'MIT', licenseFile: 'LICENSE' },
]

const validatorCli = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] || null
}

function prerequisite(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') {
    const error = new Error(\`${'${label}'} is required but ${'${command}'} was not found on PATH\`)
    error.code = 'KIT_PREREQUISITE_MISSING'
    throw error
  }
  if (result.error || result.status !== 0) {
    const error = new Error(\`${'${label}'} prerequisite check failed\`)
    error.code = 'KIT_PREREQUISITE_UNAVAILABLE'
    throw error
  }
}

async function main() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 24) {
    const error = new Error(\`Node.js 24 or newer is required; found ${'${process.versions.node}'}\`)
    error.code = 'KIT_NODE_VERSION_UNSUPPORTED'
    throw error
  }
  if (!process.argv[2] || !option('--paper-id')) {
    throw new Error('Usage: node validate.mjs <package-directory-or-zip> --paper-id paper-…')
  }
  prerequisite('python3', ['--version'], 'Python 3 (safe ZIP admission)')
  prerequisite('ffprobe', ['-version'], 'FFmpeg/ffprobe (audio admission)')
  prerequisite('magick', ['-version'], 'ImageMagick 7 (image admission)')

  Object.defineProperty(globalThis, 'fetch', {
    configurable: false,
    value() {
      const error = new Error('Network access is forbidden in the offline validator')
      error.code = 'KIT_NETWORK_FORBIDDEN'
      throw error
    },
  })
  const { prepareNck1AnalyzedPackageReview } = await import('./runtime/server/paper-import/analyzedPackage.mjs')
  const temporary = mkdtempSync(path.join(tmpdir(), 'eqb-kit-validation-'))
  try {
    const result = await prepareNck1AnalyzedPackageReview({
      sourcePath: path.resolve(process.argv[2]),
      destinationDir: path.join(temporary, 'review'),
      expectedPaperId: option('--paper-id'),
    })
    console.log(JSON.stringify({ ok: true, stage: 'complete-admission', ...result }, null, 2))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    stage: error.code?.startsWith('KIT_') ? 'prerequisite' : 'complete-admission',
    code: error.code || 'ANALYZED_PACKAGE_INVALID',
    path: error.path || '$',
    message: error.message,
  }, null, 2))
  process.exitCode = 1
})
`

const kitReadme = `# EQB analyzed-package producer kit

This kit contains an offline, runnable snapshot of the same complete admission seam used by EQB intake: \`prepareNck1AnalyzedPackageReview\`. It checks archive safety, manifest/provenance, official answers, all required analysis annexes, exact analysis/content agreement, Canonical Paper derivation, and Review projection. It is not publication authority and makes no OCR, AI, Sol, or network calls.

## Prerequisites

- Node.js 24 or newer
- Python 3 (the included \`runtime/scripts/import-pipeline/analyzed-package-archive.py\` validates and extracts ZIPs)
- FFmpeg, including \`ffprobe\` (audio identity and duration checks)
- ImageMagick 7, with the \`magick\` command (declared image identity checks)

The CLI checks these commands up front and reports a \`KIT_*\` prerequisite error if one is unavailable. It disables Node's network fetch API before loading the admission runtime; the recorded external-import closure contains only \`node:\` built-ins and no network module. No \`npm install\` is needed: Ajv and its exact transitive runtime are selectively bundled. Do not run \`npm install\`; \`package.json\` intentionally has no install dependencies.

## Validate

From this directory, with no repository checkout and no network access:

\`\`\`sh
node validate.mjs /absolute/path/to/package-directory-or.zip --paper-id paper-…
\`\`\`

A successful result has \`ok: true\` and \`stage: "complete-admission"\`. Merely passing the archive parser or loading \`KIT.json\` is not content validation.

\`BUNDLE-CLOSURE.json\` records every repository and third-party source input embedded by esbuild, with SHA-256 and byte length. \`KIT.json\` hashes every delivered file (except itself) and records the closure-file hash. Bundled dependency versions and licenses are in \`BUNDLED-DEPENDENCIES.json\`, \`THIRD-PARTY-NOTICES.md\`, and \`THIRD-PARTY-LICENSES/\`.
`

const producerPrompt = `# EQB NCK1 complete analyzed-package producer prompt

Create one complete current-standard NCK1 analyzed package. Preserve the supplied original question text, identities, official answers, provenance, media and audio bytes. Never invent an official answer, original PDF/DOCX, crop, ASR receipt, review receipt, or publication authority. Original PDF/DOCX attachments are optional.

Use package.json exactly as defined by schemas/paper-import/analyzed-package-v1.schema.json. Content uses the current NCK1 package content contract. Produce all ten staged groups when listening is captured (nine written groups otherwise). For every Reading A-D, Seven Choices, Cloze and Grammar group, output groups[groupId].teachingContent matching the full schemas/paper-import/objective-teaching-content-v1.schema.json included in this kit: exact Unicode-code-point ranges, quotes, text/paragraph identities, question relations, completed-text insertion ranges and sentence-structure relations. Do not merely write the annex schema name.

Use the complete three-level topic triples in contracts/topic-taxonomy-v1.json. Follow the relevant tracked prompt, JSON schema/type contract, and the shared teaching style. Do not emit retired teachingNote, grammar path/framework, highlightExpressions or continuationDesign. Keep official model answers separate from generated model answers.

Source declarations must truthfully describe the actual supplied transcription and official-answer provenance. A package created from external transcription must say so; package JSON pointers do not claim replay of raw OCR, crops, DOCX extraction or ASR. Resource paths are package-relative and all referenced bytes must be declared. Before delivery, run \`node validate.mjs /absolute/path/to/package-directory-or.zip --paper-id paper-…\` from this kit; success must report \`stage: "complete-admission"\`. If any source or legacy field cannot be represented without loss, stop and report its exact JSON path instead of dropping it or manufacturing teaching ranges.
`

function addInventoryFile(destination, inventory, relativePath, bytes) {
  const targetPath = path.join(destination, relativePath)
  mkdirSync(path.dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, bytes)
  const stored = new Uint8Array(readFileSync(targetPath))
  inventory.push({ path: relativePath, sha256: sha256(stored), byteLength: stored.byteLength })
}

export function writeAnalyzedPackageProducerKit(destination) {
  if (!destination || existsSync(destination)) {
    const error = new Error('Producer kit destination must not already exist')
    error.code = 'ANALYZED_PACKAGE_KIT_DESTINATION_EXISTS'
    throw error
  }
  mkdirSync(destination, { recursive: true })
  const inventory = []
  for (const relativePath of trackedFiles) {
    const source = path.join(repositoryRoot, relativePath)
    if (!existsSync(source)) throw new Error(`Producer kit source is missing: ${relativePath}`)
    const targetPath = path.join(destination, relativePath)
    mkdirSync(path.dirname(targetPath), { recursive: true })
    copyFileSync(source, targetPath)
    const bytes = new Uint8Array(readFileSync(targetPath))
    inventory.push({ path: relativePath, sha256: sha256(bytes), byteLength: bytes.byteLength })
  }
  for (const relativePath of runtimeAssets) {
    const source = path.join(repositoryRoot, relativePath)
    if (!existsSync(source)) throw new Error(`Producer kit runtime asset is missing: ${relativePath}`)
    const targetPath = path.join(destination, 'runtime', relativePath)
    mkdirSync(path.dirname(targetPath), { recursive: true })
    copyFileSync(source, targetPath)
    const bytes = new Uint8Array(readFileSync(targetPath))
    inventory.push({ path: `runtime/${relativePath}`, sha256: sha256(bytes), byteLength: bytes.byteLength })
  }
  for (const [sourcePath, targetPath] of runtimeRelocatedAssets) {
    addInventoryFile(
      destination,
      inventory,
      `runtime/${targetPath}`,
      readFileSync(path.join(repositoryRoot, sourcePath)),
    )
  }
  const runtimeEntry = 'runtime/server/paper-import/analyzedPackage.mjs'
  const metafilePath = path.join(destination, '.bundle-metafile.json')
  execFileSync(esbuildBinary, [
    'server/paper-import/analyzedPackage.mjs',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node24',
    '--legal-comments=none',
    '--charset=utf8',
    `--metafile=${metafilePath}`,
    `--outfile=${path.join(destination, runtimeEntry)}`,
  ], { cwd: repositoryRoot, stdio: ['ignore', 'ignore', 'pipe'] })
  const buildMetadata = JSON.parse(readFileSync(metafilePath, 'utf8'))
  rmSync(metafilePath)
  const runtimeBytes = new Uint8Array(readFileSync(path.join(destination, runtimeEntry)))
  inventory.push({ path: runtimeEntry, sha256: sha256(runtimeBytes), byteLength: runtimeBytes.byteLength })
  const closure = {
    schemaVersion: 'eqb-analyzed-package-validator-bundle-closure-v1',
    entryPoint: 'server/paper-import/analyzedPackage.mjs',
    admissionExport: 'prepareNck1AnalyzedPackageReview',
    bundler: { name: 'esbuild', version: '0.25.12', target: 'node24' },
    externalImports: [...new Set(Object.values(buildMetadata.outputs)
      .flatMap(({ imports = [] }) => imports)
      .filter(({ external }) => external)
      .map(({ path: importPath }) => importPath))].sort(),
    inputs: Object.keys(buildMetadata.inputs).sort().map((relativePath) => {
      const bytes = new Uint8Array(readFileSync(path.join(repositoryRoot, relativePath)))
      return { path: relativePath, sha256: sha256(bytes), byteLength: bytes.byteLength }
    }),
  }
  const closureBytes = new TextEncoder().encode(`${JSON.stringify(closure, null, 2)}\n`)
  addInventoryFile(destination, inventory, 'BUNDLE-CLOSURE.json', closureBytes)
  const dependencyMetadata = {
    schemaVersion: 'eqb-bundled-dependencies-v1',
    installRequired: false,
    dependencies: bundledDependencies.map(({ licenseFile: ignored, ...dependency }) => dependency),
  }
  addInventoryFile(destination, inventory, 'BUNDLED-DEPENDENCIES.json', new TextEncoder().encode(`${JSON.stringify(dependencyMetadata, null, 2)}\n`))
  const notices = ['# Third-party notices', '', 'The offline validator bundle includes:']
  for (const dependency of bundledDependencies) {
    notices.push(`- ${dependency.name} ${dependency.version} — ${dependency.license}; see THIRD-PARTY-LICENSES/${dependency.name}.txt`)
    const licenseSource = path.join(repositoryRoot, 'server/node_modules', dependency.name, dependency.licenseFile)
    addInventoryFile(destination, inventory, `THIRD-PARTY-LICENSES/${dependency.name}.txt`, readFileSync(licenseSource))
  }
  addInventoryFile(destination, inventory, 'THIRD-PARTY-NOTICES.md', new TextEncoder().encode(`${notices.join('\n')}\n`))
  addInventoryFile(destination, inventory, 'package.json', new TextEncoder().encode(`${JSON.stringify({
    name: 'eqb-analyzed-package-offline-validator',
    version: '1.0.0',
    private: true,
    type: 'module',
    engines: { node: '>=24' },
    scripts: { validate: 'node validate.mjs' },
    dependencies: {},
  }, null, 2)}\n`))
  addInventoryFile(destination, inventory, 'validate.mjs', new TextEncoder().encode(validatorCli))
  addInventoryFile(destination, inventory, 'README.md', new TextEncoder().encode(kitReadme))
  const archiveValidator = 'scripts/import-pipeline/analyzed-package-archive.py'
  const archiveTarget = `runtime/${archiveValidator}`
  if (!inventory.some(({ path: filePath }) => filePath === archiveTarget)) {
    addInventoryFile(destination, inventory, archiveTarget, readFileSync(path.join(repositoryRoot, archiveValidator)))
  }
  const taxonomyPath = 'contracts/topic-taxonomy-v1.json'
  const taxonomyBytes = new TextEncoder().encode(`${JSON.stringify(
    TOPIC_LABEL_TAXONOMY.map(({ theme, themeGroup, subtopic }) => ({ theme, themeGroup, subtopic })),
    null,
    2,
  )}\n`)
  mkdirSync(path.join(destination, 'contracts'), { recursive: true })
  writeFileSync(path.join(destination, taxonomyPath), taxonomyBytes)
  inventory.push({ path: taxonomyPath, sha256: sha256(taxonomyBytes), byteLength: taxonomyBytes.byteLength })
  const promptBytes = new TextEncoder().encode(producerPrompt)
  writeFileSync(path.join(destination, 'PRODUCER-PROMPT.md'), promptBytes)
  inventory.push({ path: 'PRODUCER-PROMPT.md', sha256: sha256(promptBytes), byteLength: promptBytes.byteLength })
  const manifest = {
    schemaVersion: 'eqb-analyzed-package-producer-kit-v1',
    purpose: 'Self-contained offline complete-admission runtime/schema/prompt/type contract snapshot; not review or publication authority.',
    validationCommand: 'node validate.mjs <package-directory-or.zip> --paper-id paper-…',
    closureSha256: sha256(closureBytes),
    files: inventory.sort((a, b) => a.path.localeCompare(b.path)),
  }
  writeFileSync(path.join(destination, 'KIT.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export const analyzedPackageProducerKitTrackedFiles = Object.freeze([...trackedFiles])
