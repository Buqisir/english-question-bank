import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  createPersonalLayerSession,
  type PersonalLayerSession,
  type PersonalLayerSessionSnapshot,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import type { PaperSelectionSource } from '../../../../../shared/paper-selection/sourceProjection.mjs'
import { personalPaperLayerTransport } from '../../../services/personalPaperLayer.ts'
import { personalLayerIndexedDbStore } from './personalLayerLocalStore.ts'

const noopSubscribe = () => () => {}
const nullSnapshot = () => null

/*
 * `accountKey` is whatever identifies the signed-in account in the host; a
 * change tears the old session down so its drafts are never shown to, or
 * sent as, the next account.
 */
export function usePersonalLayerSession({
  accountKey,
  paperId,
  source,
  enabled,
}: {
  accountKey: string | null
  paperId: string
  source: PaperSelectionSource | null
  enabled: boolean
}): { session: PersonalLayerSession | null; snapshot: PersonalLayerSessionSnapshot | null } {
  const [current, setCurrent] = useState<{ key: string; session: PersonalLayerSession } | null>(null)
  const sourceRevision = source?.sourceRevision ?? null
  const key = enabled && accountKey && sourceRevision ? JSON.stringify([accountKey, paperId, sourceRevision]) : null
  // A session left over from another account/paper/revision is never exposed, even for one render.
  const session = current && current.key === key ? current.session : null

  useEffect(() => {
    if (!key || !source) return undefined
    const next = createPersonalLayerSession({
      paperId,
      source,
      transport: personalPaperLayerTransport,
      localStore: personalLayerIndexedDbStore,
    })
    // The session subscribes to external state (server, IndexedDB); publishing it is that subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent({ key, session: next })
    void next.load()
    return () => next.dispose()
    // The session is keyed by identity, not by the source object instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const snapshot = useSyncExternalStore(
    session ? session.subscribe : noopSubscribe,
    session ? session.getSnapshot : nullSnapshot,
  )

  useEffect(() => {
    if (!session) return undefined
    const onOnline = () => session.retryNow()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [session])

  const hasUnsent = (snapshot?.unsentCount ?? 0) > 0
  useEffect(() => {
    if (!hasUnsent) return undefined
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsent])

  return { session, snapshot }
}
