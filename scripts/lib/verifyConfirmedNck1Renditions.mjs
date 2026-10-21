import assert from 'node:assert/strict'
import * as authorities from '../../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper, importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { deriveNck1MaterializationBundle, nck1MaterializationSourceSummary, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { materializeNck1CanonicalRequest } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'

export function verifyConfirmedNck1Renditions(input) {
  return withNck1MaterializationSourceCache(() => {
    const confirmation = candidate => ({
      schemaVersion: 'teacher-confirmation-v1', confirmed: true,
      candidateDigest: candidate.candidateDigest, sourceDigest: candidate.source.sha256,
    })
    const imported = importCanonicalCandidate(input)
    assert.deepEqual(imported.issues, [])
    const materialized = materializeNck1CanonicalRequest(input, confirmation(imported.candidate))
    const request = materialized.request
    assert.equal(compileCanonicalPaper(request).disposition, 'ready')
    const indexes = request.evidence.documents.flatMap((document, index) =>
      document.inputKey.startsWith('candidate_media_') ? [index] : [])
    assert.equal(indexes.length, 2, 'two distinct renditions exercise swaps')
    assert.notDeepEqual(request.evidence.documents[indexes[0]].bytes, request.evidence.documents[indexes[1]].bytes)
    const versions = ['54', '57', '58', '59', '61', '62', '64', '66', '67', '68', '69', '71']
    for (const version of versions) {
      const authority = Object.values(authorities).find(value =>
        value?.manifestId === 'paper-canonical' && value.manifestVersion === version)
      assert(authority, `raw authority ${version}`)
      const derivation = deriveNck1MaterializationBundle(input, authority)
      assert.deepEqual(derivation.issues, [])
      // v54/v57 are historical compile refs, not importer override choices.
      // Reconstruct their exact Candidate body, as historical replay does.
      const body = {
        schemaVersion: imported.candidate.schemaVersion, authority,
        source: nck1MaterializationSourceSummary(derivation), operatorChoices: {},
        interpretation: derivation.source, issues: derivation.issues,
      }
      const candidate = { ...body, candidateDigest: digestJson(body) }
      if (!['54', '57'].includes(version)) {
        const reimported = importCanonicalCandidate(input, undefined, { materializationAuthorityRef: authority })
        assert.deepEqual(reimported.issues, [])
        assert.equal(candidate.candidateDigest, reimported.candidate.candidateDigest)
        assert.equal(candidate.source.sha256, reimported.candidate.source.sha256)
      }
      const compiled = compileCanonicalPaper({
        ...derivation.request, nck1MaterializationConfirmation: confirmation(candidate),
      })
      assert.equal(compiled.disposition, 'ready', `raw authority ${version}: ${JSON.stringify(compiled.artifacts.normalizationReport.diagnostics)}`)
    }
    for (const [label, mutate] of [
      ['missing', value => { value.evidence.documents.splice(indexes[0], 1) }],
      ['extra', value => { value.evidence.documents.push({ ...structuredClone(value.evidence.documents[indexes[0]]), inputKey: 'candidate_media_undeclared' }) }],
      ['swapped', value => {
        const docs = value.evidence.documents
        ;[docs[indexes[0]].bytes, docs[indexes[1]].bytes] = [docs[indexes[1]].bytes, docs[indexes[0]].bytes]
      }],
      ['tampered bytes', value => { value.evidence.documents[indexes[0]].bytes[0] ^= 1 }],
      ['length', value => { value.evidence.documents[indexes[0]].bytes = value.evidence.documents[indexes[0]].bytes.slice(0, -1) }],
      ['evidence order', value => { value.evidence.documents.reverse() }],
      ['roles', value => { value.evidence.documents[indexes[0]].roles = ['source_media'] }],
      ['declared MIME', value => { value.evidence.documents[indexes[0]].declared.mediaType = 'image/jpeg' }],
      ['declared name', value => { value.evidence.documents[indexes[0]].declared.originalName = 'changed.png' }],
      ['Candidate digest', value => { value.nck1MaterializationConfirmation.candidateDigest = `sha256:${'0'.repeat(64)}` }],
      ['Source digest', value => { value.nck1MaterializationConfirmation.sourceDigest = `sha256:${'0'.repeat(64)}` }],
    ]) {
      const changed = structuredClone(request)
      mutate(changed)
      const compiled = compileCanonicalPaper(changed)
      assert.notEqual(compiled.disposition, 'ready', label)
      assert.equal(compiled.artifacts.canonicalPaper, undefined, label)
    }
    // Validate the adapter's actual declaration checks independently of the
    // confirmation mismatch caused by editing the materialization evidence.
    for (const [label, mutate] of [
      ['SHA', candidate => { candidate.sha256 = `sha256:${'0'.repeat(64)}` }],
      ['MIME', candidate => { candidate.mimeType = 'image/jpeg' }],
      ['width', candidate => { candidate.pixelWidth++ }],
      ['height', candidate => { candidate.pixelHeight++ }],
    ]) {
      const changed = structuredClone(input)
      const materialization = JSON.parse(new TextDecoder().decode(changed.materializationBytes))
      mutate(materialization.media.find(media => media.publication?.candidate).publication.candidate)
      changed.materializationBytes = new TextEncoder().encode(JSON.stringify(materialization))
      const result = importCanonicalCandidate(changed)
      assert(result.issues.some(issue => issue.code === 'MATERIALIZATION_MEDIA_RENDITION_MISMATCH'), label)
    }
    console.log(`verify-confirmed-nck1-renditions: PASS (raw ${versions.join('/')}; missing/extra/swapped/tampered/length; declaration, digest and evidence fingerprints)`)
  })
}
