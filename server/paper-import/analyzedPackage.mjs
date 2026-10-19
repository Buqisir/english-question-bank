import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  NCK1_LISTENING_STAGED_ANALYSIS,
  NCK1_STAGED_ANALYSIS_FILES,
} from '../import-review/nck1AnalysisProjection.mjs'
import {
  buildNck1AnalyzedPackageReviewSourceManifest,
  buildNck1ReviewProjection,
  reviewBundleFilePathsForProjection,
} from '../import-review/revisionProjection.mjs'
import {
  NCK1_ANALYZED_PACKAGE_INPUT_KIND,
  deriveNck1AnalyzedPackageBundle,
  parseStrictPackageJson,
} from '../paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import { LISTENING_ANALYSIS_PROFILE } from '../paper-import-ai/analyzeListening.mjs'
import { readAnalyzedPackageArchive } from '../source-intake/analyzedPackageArchive.mjs'

const schema = JSON.parse(readFileSync(new URL('../../schemas/paper-import/analyzed-package-v1.schema.json', import.meta.url), 'utf8'))
const validateManifest = new Ajv({ allErrors: true, strict: false }).compile(schema)
const encoder = new TextEncoder()
const stagedByKey = new Map([
  ...NCK1_STAGED_ANALYSIS_FILES,
  NCK1_LISTENING_STAGED_ANALYSIS,
].map((descriptor) => [descriptor.key, descriptor]))

function fail(location, message, code = 'ANALYZED_PACKAGE_INVALID') {
  const error = new Error(`${location}: ${message}`)
  error.code = code
  error.path = location
  throw error
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function assertRoleMediaType(file, location) {
  const jsonRole = ['content', 'official_answers', 'analysis'].includes(file.role)
  if (jsonRole && file.mediaType !== 'application/json') {
    fail(location, `${file.role} members must use application/json`)
  }
  if (file.role === 'audio' && file.mediaType !== 'audio/mpeg') {
    fail(location, 'Audio members must use audio/mpeg')
  }
  if (file.role === 'media' && !['image/png', 'image/jpeg', 'image/webp'].includes(file.mediaType)) {
    fail(location, 'Media members must use a supported image type')
  }
  if (file.role === 'attachment' && ![
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(file.mediaType)) fail(location, 'Attachments are optional PDF or DOCX originals')
}

function assertDeclaredBytes(file, location) {
  if (file.role !== 'attachment') return
  if (file.mediaType === 'application/pdf'
    && !Buffer.from(file.bytes.subarray(0, 5)).equals(Buffer.from('%PDF-'))) {
    fail(location, 'Declared PDF attachment does not have a PDF signature')
  }
  if (file.mediaType.includes('wordprocessingml')
    && !(file.bytes[0] === 0x50 && file.bytes[1] === 0x4b)) {
    fail(location, 'Declared DOCX attachment does not have a ZIP signature')
  }
}

function collectPackageFiles(rootDir) {
  const files = new Map()
  const identities = new Set()
  let totalBytes = 0
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory)) {
      const relativePath = `${prefix}${entry}`
      if (relativePath.length > 240 || /[\\:\u0000-\u001f]/u.test(relativePath)) {
        fail(relativePath, 'Invalid package path')
      }
      const identity = relativePath.toLowerCase()
      if (identities.has(identity)) fail(relativePath, 'Duplicate case-insensitive package path')
      identities.add(identity)
      if (identities.size > 1024) fail(relativePath, 'Package exceeds 1024 entries')
      const filePath = path.join(directory, entry)
      const stat = lstatSync(filePath)
      if (stat.isSymbolicLink()) fail(relativePath, 'Symbolic links are not allowed')
      if (stat.isDirectory()) {
        visit(filePath, `${relativePath}/`)
        continue
      }
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024) {
        fail(relativePath, 'Expected a regular file of at most 64 MiB')
      }
      totalBytes += stat.size
      if (totalBytes > 256 * 1024 * 1024) fail(relativePath, 'Package exceeds 256 MiB')
      const bytes = new Uint8Array(readFileSync(filePath))
      if (bytes.byteLength !== stat.size) fail(relativePath, 'File changed while reading')
      files.set(relativePath, { path: relativePath, bytes })
    }
  }
  const rootStat = lstatSync(rootDir)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail('$', 'Package root must be a directory, not a link')
  }
  visit(rootDir)
  return files
}

function strictJson(file, location) {
  try {
    return parseStrictPackageJson(file.bytes)
  } catch (error) {
    fail(location, `Expected strict UTF-8 JSON (${error.message})`, 'ANALYZED_PACKAGE_JSON_INVALID')
  }
}

function assertOfficialAnswerLocators(content, byId) {
  const answers = [
    ...(Array.isArray(content.answers) ? content.answers : []),
    ...(Array.isArray(content.listening?.answers) ? content.listening.answers : []),
  ]
  for (const [index, answer] of answers.entries()) {
    const member = byId.get(answer?.authority?.documentId)
    if (member?.role !== 'official_answers') {
      fail(
        `content official answers/${index}/authority`,
        'Official answer locators must resolve to a sealed official_answers member',
        'ANALYZED_PACKAGE_OFFICIAL_PROVENANCE_REQUIRED',
      )
    }
  }
}

function assertNoRetiredAnalysisFields(analysisKey, value) {
  const rootKeys = ({
    'reading-a': ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'questions'],
    'reading-b': ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'questions'],
    'reading-c': ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'questions'],
    'reading-d': ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'questions'],
    seven: ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'questions'],
    cloze: ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'blanks'],
    grammar: ['schemaVersion', 'paperId', 'sourceAssetVersion', 'targetGroups', 'meta', 'groups', 'blanks'],
    'listening-unit': ['schemaVersion', 'paperId', 'sourceAssetVersion', 'materials', 'questions'],
    application: ['taskType', 'modelAnswer', 'reviewCard', 'officialModelAnswer'],
    continuation: ['taskType', 'modelAnswer', 'continuationAnalysis', 'officialModelAnswer'],
  })[analysisKey]
  const unknownRootKeys = Object.keys(value).filter((key) => !rootKeys.includes(key))
  if (unknownRootKeys.length) {
    fail(`analysis.${analysisKey}`, `Unknown analysis fields are not accepted: ${unknownRootKeys.join(', ')}`)
  }
  const retired = new Set(['teachingNote', 'continuationDesign', 'highlightExpressions'])
  function visit(child, location) {
    if (!child || typeof child !== 'object') return
    for (const [key, nested] of Object.entries(child)) {
      if (retired.has(key)
        || (analysisKey === 'grammar' && key === 'path' && location.includes('.blanks.'))) {
        fail(`${location}.${key}`, 'Retired analysis fields are not accepted in a new package')
      }
      visit(nested, `${location}.${key}`)
    }
  }
  visit(value, `analysis.${analysisKey}`)
}

export function assertAnalyzedPackageIntroductionCompatibility(analysisKey, value) {
  if (analysisKey !== 'cloze') return
  for (const [groupId, group] of Object.entries(value?.groups || {})) {
    const overview = typeof group?.overview === 'string' ? group.overview.trim() : ''
    const legacy = typeof group?.similaritySummary === 'string'
      ? group.similaritySummary.trim()
      : ''
    if (overview && legacy && overview !== legacy) {
      fail(
        `analysis.cloze.groups.${groupId}.similaritySummary`,
        'Legacy similaritySummary conflicts with canonical overview; normalization cannot silently choose between introductions',
        'ANALYZED_PACKAGE_INTRODUCTION_CONFLICT',
      )
    }
  }
}

// This is the shared producer/worker admission seam. expectedPaperId is supplied
// by the OPS target and is intentionally mandatory: package bytes cannot select
// an unrelated correction target by themselves.
export function loadAnalyzedPackageFiles(rootDir, { expectedPaperId } = {}) {
  if (!expectedPaperId) fail('$', 'expectedPaperId is required from the intake target', 'ANALYZED_PACKAGE_EXPECTED_PAPER_REQUIRED')
  const files = collectPackageFiles(rootDir)
  const packageManifestFile = files.get('package.json')
  if (!packageManifestFile) fail('package.json', 'Required file is missing')
  const manifest = strictJson(packageManifestFile, 'package.json')
  if (!validateManifest(manifest)) {
    fail('package.json', validateManifest.errors.map((error) =>
      `${error.instancePath || '/'} ${error.message}`).join('; '))
  }
  if (manifest.paperId !== expectedPaperId) {
    fail('package.json/paperId', `Expected ${expectedPaperId}, received ${manifest.paperId}`, 'ANALYZED_PACKAGE_PAPER_ID_MISMATCH')
  }
  if (!nonBlank(manifest.paperName)
    || Object.values(manifest.metadata).some((value) => typeof value === 'string' && !nonBlank(value))
    || manifest.sources.some(({ description, suppliedBy }) => !nonBlank(description) || !nonBlank(suppliedBy))) {
    fail('package.json', 'Paper metadata and source declarations cannot be blank')
  }

  const expectedPaths = new Set(['package.json'])
  const byId = new Map()
  const byAnalysisKey = new Map()
  const members = manifest.files.map((descriptor, index) => {
    const location = `package.json/files/${index}`
    if (byId.has(descriptor.memberId)) fail(`${location}/memberId`, 'Member IDs must be unique')
    if (expectedPaths.has(descriptor.path)) fail(`${location}/path`, 'File paths must be unique and cannot replace package.json')
    assertRoleMediaType(descriptor, location)
    expectedPaths.add(descriptor.path)
    const file = files.get(descriptor.path)
    if (!file) fail(`${location}/path`, `File not found: ${descriptor.path}`)
    if (file.bytes.byteLength === 0) fail(`${location}/path`, 'Package members cannot be empty')
    const member = { ...descriptor, bytes: file.bytes }
    assertDeclaredBytes(member, location)
    byId.set(member.memberId, member)
    if (member.analysisKey) {
      if (byAnalysisKey.has(member.analysisKey)) fail(`${location}/analysisKey`, 'Analysis keys must be unique')
      byAnalysisKey.set(member.analysisKey, member)
    }
    if (member.mediaType === 'application/json') strictJson(member, descriptor.path)
    return member
  })
  for (const relativePath of files.keys()) {
    if (!expectedPaths.has(relativePath)) fail(relativePath, 'Undeclared file is not allowed')
  }

  const contentMembers = members.filter(({ role }) => role === 'content')
  if (contentMembers.length !== 1) fail('package.json/files', 'Exactly one content member is required')
  const requiredAnalysisKeys = NCK1_STAGED_ANALYSIS_FILES.map(({ key }) => key)
  const missing = requiredAnalysisKeys.filter((key) => !byAnalysisKey.has(key))
  if (missing.length) fail('package.json/files', `Missing required analyses: ${missing.join(', ')}`, 'ANALYZED_PACKAGE_ANALYSES_INCOMPLETE')
  const content = strictJson(contentMembers[0], contentMembers[0].path)
  for (const [analysisKey, member] of byAnalysisKey) {
    const analysis = strictJson(member, member.path)
    assertNoRetiredAnalysisFields(analysisKey, analysis)
    assertAnalyzedPackageIntroductionCompatibility(analysisKey, analysis)
  }
  const listeningCaptured = content.listening?.state === 'captured'
  if (listeningCaptured !== byAnalysisKey.has(NCK1_LISTENING_STAGED_ANALYSIS.key)) {
    fail('package.json/files', listeningCaptured
      ? 'Captured listening requires analysisKey listening-unit'
      : 'listening-unit is forbidden when listening is not captured', 'ANALYZED_PACKAGE_LISTENING_ANALYSIS_INCOMPLETE')
  }

  const sourceIds = new Set()
  const sourceRoles = new Set()
  const declaredSourceMembers = new Set()
  for (const [index, source] of manifest.sources.entries()) {
    if (sourceIds.has(source.sourceId)) fail(`package.json/sources/${index}/sourceId`, 'Source IDs must be unique')
    sourceIds.add(source.sourceId)
    sourceRoles.add(source.role)
    declaredSourceMembers.add(source.memberId)
    const member = byId.get(source.memberId)
    const expectedRole = source.role === 'official_answers' ? 'official_answers' : 'content'
    if (member?.role !== expectedRole) fail(`package.json/sources/${index}/memberId`, `Source declaration must resolve to a ${expectedRole} member`)
  }
  if (!sourceRoles.has('question_source') || !sourceRoles.has('official_answers')) {
    fail('package.json/sources', 'Complete question and official-answer provenance declarations are required', 'ANALYZED_PACKAGE_OFFICIAL_PROVENANCE_REQUIRED')
  }
  const undeclaredSource = members.find(({ role, memberId }) =>
    ['content', 'official_answers'].includes(role) && !declaredSourceMembers.has(memberId))
  if (undeclaredSource) {
    fail('package.json/sources', `Missing provenance declaration for ${undeclaredSource.memberId}`, 'ANALYZED_PACKAGE_OFFICIAL_PROVENANCE_REQUIRED')
  }
  assertOfficialAnswerLocators(content, byId)

  const packageManifestMember = {
    memberId: 'package-manifest',
    role: 'provenance',
    mediaType: 'application/json',
    bytes: packageManifestFile.bytes,
  }
  if (byId.has(packageManifestMember.memberId)) fail('package.json/files', 'package-manifest is a reserved memberId')
  const nativeMembers = [packageManifestMember, ...members.map(({ analysisKey, path: ignored, ...member }) => member)]
  const manifestBytes = encoder.encode(JSON.stringify({
    schemaVersion: 'nck1-analyzed-package-v1',
    paperId: manifest.paperId,
    profileId: manifest.profileId,
    contentMemberId: contentMembers[0].memberId,
    members: nativeMembers.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      mediaType: member.mediaType,
      sha256: sha256(member.bytes),
      byteLength: member.bytes.byteLength,
    })),
  }))
  const input = { kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND, manifestBytes, members: nativeMembers }
  const derived = deriveNck1AnalyzedPackageBundle(input)
  if (derived.issues.length || !derived.materialization) {
    const first = derived.issues[0]
    fail(first?.path || 'content', `${first?.code || 'ANALYZED_PACKAGE_INVALID'}: ${first?.message || 'Canonical package derivation failed'}`, first?.code)
  }
  return { manifest, content, files, members, nativeInput: input, derived, byAnalysisKey }
}

function writeReviewWorkspace(rootDir, loaded) {
  const nativeManifestPath = 'analyzed-package/native-manifest.json'
  mkdirSync(path.join(rootDir, 'analyzed-package/members'), { recursive: true })
  writeFileSync(path.join(rootDir, nativeManifestPath), loaded.nativeInput.manifestBytes)
  const reviewMembers = loaded.nativeInput.members.map((member) => {
    const analysisKey = [...loaded.byAnalysisKey.entries()].find(([, candidate]) =>
      candidate.memberId === member.memberId)?.[0]
    const descriptor = analysisKey ? stagedByKey.get(analysisKey) : null
    const relativePath = descriptor?.path
      || `analyzed-package/members/${member.memberId}.${member.mediaType === 'application/json' ? 'json' : 'bin'}`
    const filePath = path.join(rootDir, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, member.bytes)
    return { ...member, path: relativePath }
  })
  writeFileSync(path.join(rootDir, 'config.json'), `${JSON.stringify({
    paperId: loaded.manifest.paperId,
    provenance: {
      paperName: loaded.manifest.paperName,
      source: loaded.manifest.sources.map(({ description }) => description).join('; '),
      sourceType: loaded.manifest.metadata.sourceType,
      region: loaded.manifest.metadata.region,
      year: loaded.manifest.metadata.year,
      ...(loaded.manifest.metadata.month !== undefined ? { month: loaded.manifest.metadata.month } : {}),
    },
  }, null, 2)}\n`)
  const sourceManifest = buildNck1AnalyzedPackageReviewSourceManifest({
    paperId: loaded.manifest.paperId,
    manifestPath: nativeManifestPath,
    manifestBytes: loaded.nativeInput.manifestBytes,
    members: reviewMembers,
  })
  writeFileSync(path.join(rootDir, 'universal-source-manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`)
  const analysisProfile = loaded.content.listening?.state === 'captured'
    ? LISTENING_ANALYSIS_PROFILE
    : undefined
  const projection = buildNck1ReviewProjection(rootDir, {
    requireAnalyses: true,
    ...(analysisProfile ? { analysisProfile } : {}),
  })
  const files = reviewBundleFilePathsForProjection(rootDir, projection)
  return { projection, files }
}

export async function prepareNck1AnalyzedPackageReview({
  sourcePath,
  destinationDir,
  expectedPaperId,
}) {
  if (!sourcePath || !destinationDir || !expectedPaperId) fail('$', 'sourcePath, destinationDir and expectedPaperId are required')
  if (existsSync(destinationDir)) fail(destinationDir, 'Destination already exists')
  const parent = path.dirname(destinationDir)
  mkdirSync(parent, { recursive: true })
  const temporary = mkdtempSync(path.join(parent, '.analyzed-package-review-'))
  let installed = false
  try {
    let packageRoot = sourcePath
    if (!lstatSync(sourcePath).isDirectory()) {
      packageRoot = path.join(temporary, 'package')
      await readAnalyzedPackageArchive(sourcePath, { destination: packageRoot })
    }
    const loaded = loadAnalyzedPackageFiles(packageRoot, { expectedPaperId })
    const workspace = path.join(temporary, 'review')
    mkdirSync(workspace)
    const { projection, files } = writeReviewWorkspace(workspace, loaded)
    renameSync(workspace, destinationDir)
    installed = true
    return {
      paperId: projection.paperId,
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
      visibleStructureDigest: projection.visibleStructureDigest,
      analysisDigest: projection.analysisDigest,
      files,
    }
  } catch (error) {
    if (installed && existsSync(destinationDir)) rmSync(destinationDir, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
