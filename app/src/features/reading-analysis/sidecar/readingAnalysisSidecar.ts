/**
 * Reading Analysis sidecar — manually-curated annotation entries keyed by
 * questionGroupId. JSON files under ./data/ are bundled at build time via
 * import.meta.glob with eager: true so we don't need any new dep.
 *
 * Schema:
 *   {
 *     "groupId": "g-...",
 *     "entries": [
 *       { "questionNo": "1", "kind": "evidence", "quote": "..." },
 *       { "questionNo": "1", "optionLabel": "A", "kind": "trap", "quote": "..." }
 *     ]
 *   }
 *
 * We're deliberately *not* doing AI auto-generation here. The sidecar is the
 * V0 source of truth for "this passage span is the evidence for question N
 * option K". Missing groups simply have zero entries, which is fine.
 */

import type {
  ReadingAnalysisSidecar,
  ReadingAnnotationSidecarEntry,
} from '../annotation/index.ts'

type SidecarFile = {
  groupId: string
  entries: Array<{
    questionNo: string | number
    optionLabel?: string
    kind: 'evidence' | 'trap'
    quote: string
  }>
}

// Eagerly load every JSON file under ./data — works in Vite/Vitest without
// any extra plugin or dep. Each module's default export is the parsed JSON.
const sidecarModules = import.meta.glob<{ default: SidecarFile }>('./data/*.json', {
  eager: true,
})

const sidecarById = new Map<string, ReadingAnalysisSidecar>()

for (const mod of Object.values(sidecarModules)) {
  const file = mod.default
  if (!file || typeof file.groupId !== 'string' || !Array.isArray(file.entries)) continue
  const entries: ReadingAnnotationSidecarEntry[] = []
  for (const raw of file.entries) {
    const questionNo = String(raw.questionNo).trim()
    if (!questionNo) continue
    const kind = raw.kind === 'trap' ? 'trap' : 'evidence'
    const quote = typeof raw.quote === 'string' ? raw.quote : ''
    if (!quote) continue
    const optionLabel = normalizeOptionLabel(raw.optionLabel)
    entries.push({
      groupId: file.groupId,
      questionNo,
      optionLabel,
      kind,
      quote,
    })
  }
  sidecarById.set(file.groupId, { entries })
}

function normalizeOptionLabel(
  raw: string | undefined,
): 'A' | 'B' | 'C' | 'D' | undefined {
  if (!raw) return undefined
  const upper = raw.trim().replace(/[().\s]/g, '').toUpperCase()
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D') return upper
  return undefined
}

export function getReadingAnalysisSidecar(
  groupId: string,
): ReadingAnalysisSidecar | undefined {
  return sidecarById.get(groupId)
}

/** Test seam — returns the loaded count so verify scripts can sanity-check. */
export function listLoadedSidecarGroupIds(): string[] {
  return Array.from(sidecarById.keys())
}
