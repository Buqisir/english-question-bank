import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  inspectNck1Materialization,
  NCK1_MATERIALIZATION_BINDING_MISMATCH,
  NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE,
} from './nck1-docx-materialize.mjs'

// Called only after full source verification, under the paper writer lock.
export function retireRecoveredSourceBlock(paperDir) {
  const blockedPath = path.join(paperDir, 'signals', 'blocked.json')
  if (!existsSync(blockedPath)) return
  const bytes = readFileSync(blockedPath)
  let blocked
  try { blocked = JSON.parse(bytes.toString('utf8')) } catch { return }
  if (blocked.code !== 'source_incomplete') return
  // A refused restage is recovered by valid signal evidence, not by deleting it.
  const recoveredSignal = blocked.note === 'Signal audio requires a fresh attachment-free source manifest'
    && JSON.parse(readFileSync(path.join(paperDir, 'universal-source-manifest.json'), 'utf8'))
      .schemaVersion === 'universal-nck1-source-manifest-v3'
  let recoveredMaterialization = false
  if (blocked.errorCode === NCK1_MATERIALIZATION_BINDING_MISMATCH
    || (!blocked.errorCode && blocked.note === NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE)) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(paperDir, 'universal-source-manifest.json'), 'utf8'))
      recoveredMaterialization = inspectNck1Materialization({ paperDir, manifest })?.producerState === 'current'
    } catch {
      // Missing, stale or invalid evidence cannot retire the original blocker.
    }
  }
  if (!blocked.note?.startsWith('Spelling review:') && !recoveredSignal && !recoveredMaterialization) return
  const historyDir = path.join(paperDir, 'signals', 'history')
  const historyPath = path.join(historyDir, `blocked-${sha256(bytes)}.json`)
  mkdirSync(historyDir, { recursive: true })
  if (existsSync(historyPath)) throw new Error('Recovered blocker history already exists')
  renameSync(blockedPath, historyPath)
}
