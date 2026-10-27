import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_RULE_EVIDENCE_VERSION } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'

// The rule evidence binds a review to a particular segmentation, including its
// inputs and diagnostic digest. Audio/subject equality alone is insufficient.
function ruleDigest(dir, review) {
  const matches = []
  for (const file of review.evidence || []) {
    if (file.kind !== 'review_notes' || !/^listening-review-evidence\/[a-zA-Z0-9._-]+\.json$/u.test(file.path)) continue
    const bytes = readFileSync(path.join(dir, file.path))
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.byteLength) throw new Error(`听力证据已变化：${file.path}`)
    if (JSON.parse(bytes).schemaVersion === LISTENING_RULE_EVIDENCE_VERSION) matches.push(file.sha256)
  }
  return matches.length === 1 ? matches[0] : null
}

export async function retainOwnerListening({ paperDir, attempt, report, verify, log }) {
  const sidecar = path.join(paperDir, 'listening-review-v1.json')
  if (!existsSync(sidecar)) return null
  const bytes = readFileSync(sidecar)
  const owner = JSON.parse(bytes)
  if (owner.method !== 'audio_source_comparison') return null
  if (digestJson(owner.subject) !== digestJson(report.subject)) {
    log('听力音频或来源已变化，旧 Owner 听核结论已失效；重新安装分段结果')
    return null
  }
  const oldRule = ruleDigest(paperDir, owner)
  const newRule = ruleDigest(attempt, report)
  if (!oldRule || !newRule) throw new Error('无法确认 Owner 听核与当前分段的绑定；保留现有 sidecar，需人工核对')
  if (oldRule !== newRule) {
    log('听力切分证据已变化，旧 Owner 听核结论已失效；重新安装分段结果')
    return null
  }
  await verify()
  if (sha256(readFileSync(sidecar)) !== sha256(bytes)) throw new Error('校验期间 Owner 听核 sidecar 已变化')
  log('保留已校验且绑定当前分段的 Owner 听核结果')
  return { sidecar, sha256: sha256(bytes), groups: owner.groups.length,
    usable: owner.groups.filter(group => group.decision === 'usable').length, retainedOwnerReview: true }
}
