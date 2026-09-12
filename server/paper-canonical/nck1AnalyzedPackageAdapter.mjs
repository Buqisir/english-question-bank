import { execFileSync } from 'node:child_process'

import {
  nck1AnalyzedPackageCandidateAuthorityRef55,
  resolveCanonicalAuthority,
  validateJsonSchema,
} from '../../shared/paper-canonical/authority.mjs'
import { validateNck1AnalyzedPackageContent } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  deriveNck1SemanticSource,
} from './nck1MaterializationAdapter.mjs'

export const NCK1_ANALYZED_PACKAGE_INPUT_KIND = 'nck1-analyzed-package'
export const NCK1_ANALYZED_PACKAGE_MEDIA_TYPE =
  'application/vnd.eqb.nck1-analyzed-package+json'
export const NCK1_ANALYZED_PACKAGE_CANDIDATE_SCHEMA_VERSION =
  'trusted-nck1-analyzed-package-import-candidate-v1'

const decoder = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()
const idPattern = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/
const memberRoles = new Set([
  'content', 'official_answers', 'analysis', 'provenance', 'media', 'audio',
  'attachment',
])

function issue(code, message, path = '$') {
  return { code, disposition: 'incomplete_source', path, message }
}

// JSON.parse silently accepts duplicate keys. This small parser performs the
// closed-package parse itself so the captured bytes, not a lossy reparsing, are
// the authority.
export function parseStrictPackageJson(bytes) {
  const text = decoder.decode(bytes)
  let at = 0
  const whitespace = () => { while (/[ \t\r\n]/u.test(text[at] || '')) at += 1 }
  const string = () => {
    const start = at
    if (text[at++] !== '"') throw new SyntaxError('Expected JSON string')
    while (at < text.length) {
      if (text[at] === '\\') { at += 2; continue }
      if (text[at++] === '"') return JSON.parse(text.slice(start, at))
    }
    throw new SyntaxError('Unterminated JSON string')
  }
  const value = () => {
    whitespace()
    if (text[at] === '"') return string()
    if (text[at] === '{') {
      at += 1
      const result = {}
      const keys = new Set()
      whitespace()
      if (text[at] === '}') { at += 1; return result }
      while (true) {
        whitespace()
        const key = string()
        if (keys.has(key)) throw new SyntaxError(`Duplicate JSON key: ${key}`)
        keys.add(key)
        whitespace()
        if (text[at++] !== ':') throw new SyntaxError('Expected colon')
        Object.defineProperty(result, key, {
          value: value(), enumerable: true, writable: true, configurable: true,
        })
        whitespace()
        if (text[at] === '}') { at += 1; return result }
        if (text[at++] !== ',') throw new SyntaxError('Expected comma')
      }
    }
    if (text[at] === '[') {
      at += 1
      const result = []
      whitespace()
      if (text[at] === ']') { at += 1; return result }
      while (true) {
        result.push(value())
        whitespace()
        if (text[at] === ']') { at += 1; return result }
        if (text[at++] !== ',') throw new SyntaxError('Expected comma')
      }
    }
    const token = text.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0]
    if (!token) throw new SyntaxError('Invalid JSON value')
    at += token.length
    return JSON.parse(token)
  }
  const parsed = value()
  whitespace()
  if (at !== text.length) throw new SyntaxError('Trailing JSON content')
  return parsed
}

export function isNck1AnalyzedPackageInput(value) {
  return Boolean(
    value
    && exactKeys(value, ['kind', 'manifestBytes', 'members'])
    && value.kind === NCK1_ANALYZED_PACKAGE_INPUT_KIND
    && value.manifestBytes instanceof Uint8Array
    && Array.isArray(value.members)
    && value.members.every((member) =>
      exactKeys(member, ['memberId', 'role', 'mediaType', 'bytes'])
      && idPattern.test(member.memberId)
      && memberRoles.has(member.role)
      && typeof member.mediaType === 'string'
      && member.bytes instanceof Uint8Array
      && member.bytes.byteLength > 0),
  )
}

export function cloneNck1AnalyzedPackageInput(input) {
  return {
    kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND,
    manifestBytes: new Uint8Array(input.manifestBytes),
    members: input.members.map((member) => ({
      ...member,
      bytes: new Uint8Array(member.bytes),
    })),
  }
}

function resolvePointer(root, pointer) {
  if (pointer === '') return root
  if (!/^\/(?:[^~/]|~[01])*(?:\/(?:[^~/]|~[01])*)*$/u.test(pointer)) return undefined
  let value = root
  for (const encoded of pointer.slice(1).split('/')) {
    const segment = encoded.replace(/~1/gu, '/').replace(/~0/gu, '~')
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment)) return undefined
      value = value[Number(segment)]
    } else if (value && typeof value === 'object' && Object.hasOwn(value, segment)) {
      value = value[segment]
    } else return undefined
  }
  return value
}

function identityAgrees(owner, resolved) {
  if (!owner || !resolved || typeof owner !== 'object' || typeof resolved !== 'object') return false
  const keys = ['blockId', 'groupId', 'questionId', 'segmentId', 'taskType']
  const identities = keys.filter((key) => Object.hasOwn(owner, key))
  if (Object.hasOwn(owner, 'canonicalNumber')) identities.push('canonicalNumber')
  if (Object.hasOwn(owner, 'value')) identities.push('value')
  return identities.length > 0
    && identities.every((key) => resolved[key] === owner[key])
}

function validatePointers(value, parsedMembers, issues, path = '$', owner = null) {
  if (!value || typeof value !== 'object') return
  if (value.kind === 'package_json_pointer') {
    if (!exactKeys(value, ['kind', 'documentId', 'pointer'])) {
      issues.push(issue('ANALYZED_PACKAGE_POINTER_INVALID', 'Package locator fields are closed', path))
      return
    }
    const resolved = resolvePointer(parsedMembers.get(value.documentId), value.pointer)
    if (!identityAgrees(owner, resolved)) {
      issues.push(issue('ANALYZED_PACKAGE_POINTER_UNRELATED', 'Package locator must resolve the typed value or identity it evidences', path))
    }
    return
  }
  for (const [key, child] of Object.entries(value)) {
    validatePointers(child, parsedMembers, issues, `${path}.${key}`, value)
  }
}

function identifyMedia(bytes) {
  const [width, height, format] = execFileSync(
    'magick', ['identify', '-format', '%w,%h,%m', '-'], { input: bytes, encoding: 'utf8' },
  ).split(',')
  return {
    pixelWidth: Number(width), pixelHeight: Number(height),
    mimeType: ({ PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' })[format],
  }
}

function inspectMp3(bytes) {
  const output = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'packet=duration_time:stream=codec_name:format=format_name',
    '-of', 'json', '-i', 'pipe:0',
  ], { input: bytes, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })
  const probe = JSON.parse(output)
  const durationSeconds = (probe.packets || [])
    .reduce((sum, packet) => sum + Number(packet.duration_time), 0)
  if (probe.format?.format_name !== 'mp3' || probe.streams?.[0]?.codec_name !== 'mp3'
    || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Expected an MP3 stream with measurable duration')
  }
  return durationSeconds
}

function sourceSetDigest(manifestBytes, members) {
  return digestJson({
    kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND,
    adapterVersion: '1',
    manifest: { sha256: sha256(manifestBytes), byteLength: manifestBytes.byteLength },
    members: [...members].sort((a, b) => a.memberId.localeCompare(b.memberId)).map((member) => ({
      memberId: member.memberId, role: member.role, mediaType: member.mediaType,
      sha256: sha256(member.bytes), byteLength: member.bytes.byteLength,
    })),
  })
}

function packageInputEvidence(input, sourceDigest) {
  return {
    kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND,
    manifest: {
      sha256: sha256(input.manifestBytes),
      byteLength: input.manifestBytes.byteLength,
    },
    members: input.members.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      mediaType: member.mediaType,
      sha256: sha256(member.bytes),
      byteLength: member.bytes.byteLength,
    })),
    sourceDigest,
  }
}

export function deriveNck1AnalyzedPackageBundle(rawInput) {
  const input = cloneNck1AnalyzedPackageInput(rawInput)
  const sourceDigest = sourceSetDigest(input.manifestBytes, input.members)
  const issues = []
  let manifest
  try { manifest = parseStrictPackageJson(input.manifestBytes) } catch (error) {
    return { input, sourceDigest, manifest: null, source: null, request: null, issues: [issue('ANALYZED_PACKAGE_JSON_INVALID', error.message, '$.manifest')] }
  }
  if (
    !manifest || !exactKeys(manifest, ['schemaVersion', 'paperId', 'profileId', 'contentMemberId', 'members'])
    || manifest.schemaVersion !== 'nck1-analyzed-package-v1'
    || manifest.profileId !== 'nck1'
    || !Array.isArray(manifest.members)
  ) issues.push(issue('ANALYZED_PACKAGE_MANIFEST_INVALID', 'Manifest is one closed nck1-analyzed-package-v1 inventory'))
  const packageClosure = resolveCanonicalAuthority(
    nck1AnalyzedPackageCandidateAuthorityRef55,
  ).closure
  issues.push(...validateJsonSchema(
    packageInputEvidence(input, sourceDigest),
    packageClosure.schemas['nck1-analyzed-package-input-v1'],
    '$.input',
  ).map((item) => issue('ANALYZED_PACKAGE_INPUT_INVALID', item.message, item.path)))
  issues.push(...validateJsonSchema(
    manifest,
    packageClosure.schemas['nck1-analyzed-package-v1'],
    '$.manifest',
  ).map((item) => issue('ANALYZED_PACKAGE_MANIFEST_INVALID', item.message, item.path)))
  const byId = new Map(input.members.map((member) => [member.memberId, member]))
  if (byId.size !== input.members.length) issues.push(issue('ANALYZED_PACKAGE_MEMBER_DUPLICATE', 'Member IDs must be unique', '$.members'))
  if (new Set(input.members.map((member) =>
    member.memberId.replace(/[^a-z0-9]+/gi, '_'))).size !== input.members.length) {
    issues.push(issue('ANALYZED_PACKAGE_MEMBER_ID_COLLISION', 'Member IDs must remain unique as compiler input keys', '$.members'))
  }
  const inventory = new Map((manifest?.members || []).map((member) => [member.memberId, member]))
  if (inventory.size !== input.members.length || inventory.size !== (manifest?.members || []).length) {
    issues.push(issue('ANALYZED_PACKAGE_MEMBER_SET_MISMATCH', 'Captured members must exactly equal the manifest inventory', '$.members'))
  }
  for (const member of input.members) {
    const claimed = inventory.get(member.memberId)
    if (!claimed || !exactKeys(claimed, ['memberId', 'role', 'mediaType', 'sha256', 'byteLength'])
      || claimed.role !== member.role || claimed.mediaType !== member.mediaType
      || claimed.sha256 !== sha256(member.bytes) || claimed.byteLength !== member.bytes.byteLength) {
      issues.push(issue('ANALYZED_PACKAGE_MEMBER_MISMATCH', `Member ${member.memberId} differs from its immutable inventory`, '$.members'))
    }
  }
  const parsedMembers = new Map()
  for (const member of input.members.filter((entry) => entry.mediaType === 'application/json')) {
    try { parsedMembers.set(member.memberId, parseStrictPackageJson(member.bytes)) } catch (error) {
      issues.push(issue('ANALYZED_PACKAGE_JSON_INVALID', error.message, `$.members.${member.memberId}`))
    }
  }
  const contentMember = byId.get(manifest?.contentMemberId)
  const content = parsedMembers.get(manifest?.contentMemberId)
  if (!contentMember || contentMember.role !== 'content' || !content) {
    issues.push(issue('ANALYZED_PACKAGE_CONTENT_REQUIRED', 'contentMemberId must identify one captured JSON content member'))
  }
  if (content && (content.paperId !== manifest.paperId || content.profileId !== manifest.profileId)) {
    issues.push(issue('ANALYZED_PACKAGE_CONTENT_IDENTITY_MISMATCH', 'Manifest and content paper/profile identities must agree', '$.content'))
  }
  if (content) validatePointers(content, parsedMembers, issues)
  const semantic = content ? structuredClone(content) : null
  if (semantic) {
    issues.push(...validateNck1AnalyzedPackageContent(semantic, input.members.map((member) => ({
      ...member, sha256: sha256(member.bytes),
    })), manifest.contentMemberId).map((item) => issue(item.code, item.message, item.path)))
  }
  const mediaById = new Map()
  for (const media of semantic?.media || []) {
    const member = byId.get(media.extraction?.memberId)
    if (!member || member.role !== 'media' || sha256(member.bytes) !== media.sha256) {
      issues.push(issue('ANALYZED_PACKAGE_MEDIA_MISMATCH', `Media ${media.mediaId} must bind one supplied media member`, '$.content.media'))
      continue
    }
    try {
      const identified = identifyMedia(member.bytes)
      if (identified.mimeType !== media.mimeType || identified.pixelWidth !== media.pixelWidth || identified.pixelHeight !== media.pixelHeight) throw new Error()
      mediaById.set(media.mediaId, { mediaId: media.mediaId, bytes: member.bytes })
    } catch {
      issues.push(issue('ANALYZED_PACKAGE_MEDIA_INVALID', `Media ${media.mediaId} MIME or dimensions do not match decodable bytes`, '$.content.media'))
    }
  }
  let listeningAudio = null
  const audioMembers = input.members.filter((member) => member.role === 'audio')
  if (semantic?.listening?.state === 'captured') {
    if (audioMembers.length !== 1 || audioMembers[0].mediaType !== 'audio/mpeg') {
      issues.push(issue('ANALYZED_PACKAGE_LISTENING_AUDIO_REQUIRED', 'Captured Listening requires exactly one supplied MP3 member', '$.members'))
    } else {
      try {
        listeningAudio = {
          relativePath: 'listening/playback.mp3',
          sha256: sha256(audioMembers[0].bytes),
          byteLength: audioMembers[0].bytes.byteLength,
          durationSeconds: inspectMp3(audioMembers[0].bytes),
          mediaType: 'audio/mpeg',
        }
      } catch {
        issues.push(issue('ANALYZED_PACKAGE_LISTENING_AUDIO_INVALID', 'Listening audio must be a machine-decodable MP3 with a measured duration', '$.members'))
      }
    }
  } else if (audioMembers.length > 0) {
    issues.push(issue('ANALYZED_PACKAGE_LISTENING_AUDIO_UNEXPECTED', 'Audio cannot be supplied when Listening is not captured', '$.members'))
  }
  if (issues.length > 0 || !semantic) return { input, sourceDigest, manifest, materialization: semantic, source: null, request: null, issues }
  const documentsById = new Map(input.members.map((member) => [member.memberId, { ...member }]))
  const derivationIssues = []
  const source = deriveNck1SemanticSource(
    semantic, documentsById, mediaById, contentMember, derivationIssues,
    {
      analyzedPackage: true,
      authorityRef: nck1AnalyzedPackageCandidateAuthorityRef55,
    },
  )
  issues.push(...derivationIssues)
  const sourceBytes = encoder.encode(JSON.stringify(source))
  const documents = [{
    inputKey: 'canonical_source_envelope', roles: ['operator_assertions'], bytes: sourceBytes,
    declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json', originalName: 'canonical-source-envelope.json' },
  }, {
    inputKey: 'nck1_analyzed_package_manifest', roles: ['structured_source', 'source_provenance'],
    bytes: new Uint8Array(input.manifestBytes),
    declared: { mediaType: NCK1_ANALYZED_PACKAGE_MEDIA_TYPE, originalName: 'nck1-analyzed-package-v1.json' },
  }, ...(listeningAudio ? [{
    inputKey: 'listening_audio_descriptor', roles: ['source_provenance'],
    bytes: encoder.encode(JSON.stringify(listeningAudio)),
    declared: { mediaType: 'application/json', originalName: 'listening-audio.json' },
  }] : []), ...input.members.map((member) => ({
    inputKey: `source_document_${member.memberId.replace(/[^a-z0-9]+/gi, '_')}`,
    roles: member.role === 'official_answers'
      ? ['official_answer_source', 'source_provenance']
      : member.role === 'media' ? ['source_media'] : ['structured_source', 'source_provenance'],
    bytes: new Uint8Array(member.bytes),
    declared: { mediaType: member.mediaType, originalName: `${member.memberId}.${member.mediaType === 'application/json' ? 'json' : 'bin'}` },
  }))]
  return {
    input, sourceDigest, manifest, materialization: semantic, listeningAudio, source,
    request: {
      authority: nck1AnalyzedPackageCandidateAuthorityRef55,
      evidence: { documents },
    },
    issues,
  }
}

export function nck1AnalyzedPackageSourceSummary(derivation) {
  return {
    mediaType: NCK1_ANALYZED_PACKAGE_MEDIA_TYPE,
    sha256: derivation.sourceDigest,
    byteLength: derivation.input.manifestBytes.byteLength
      + derivation.input.members.reduce((sum, member) => sum + member.bytes.byteLength, 0),
    manifest: { sha256: sha256(derivation.input.manifestBytes), byteLength: derivation.input.manifestBytes.byteLength },
    members: derivation.input.members.map((member) => ({
      memberId: member.memberId, role: member.role, mediaType: member.mediaType,
      sha256: sha256(member.bytes), byteLength: member.bytes.byteLength,
    })),
  }
}
