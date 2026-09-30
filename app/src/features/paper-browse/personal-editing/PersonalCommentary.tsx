import { useMemo, useState } from 'react'
import {
  createPersonalMutationId,
  personalCommentaryTargetExists,
  type PersonalCommentaryTarget,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import {
  createEmptyPersonalTextDocument,
  isPersonalTextDocumentBlank,
} from '../../../../../shared/personal-text/index.mjs'
import { Pencil } from '../../../icons'
import { PersonalTextEditor } from './PersonalTextEditor'
import { PersonalTextView } from './PersonalTextView'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

type EditorSession = { key: string; objectId: string | null; mergeKey: string }

/*
 * One teacher's commentary on a question or writing task, inside the
 * existing lecture column. It starts blank: the public reviewed analysis
 * above is never turned into an editable draft.
 */
export function PersonalCommentary({
  api,
  target,
  label,
}: {
  api: PersonalAnnotationsApi
  target: PersonalCommentaryTarget | null
  label: string
}) {
  const [session, setSession] = useState<EditorSession | null>(null)
  const emptyDocument = useMemo(() => createEmptyPersonalTextDocument(), [])

  if (!api.active || !target || !api.source || !personalCommentaryTargetExists(api.source, target)) {
    return null
  }
  const targetKey = JSON.stringify(target)
  const existing = api.objects.find((object) => object.type === 'commentary'
    && JSON.stringify(object.target) === targetKey)
  const open = session && (!session.objectId || session.objectId === existing?.id) ? session : null

  const begin = () => {
    api.seal()
    setSession({ key: `commentary-${targetKey}`, objectId: existing?.id ?? null, mergeKey: api.nextEditKey() })
  }

  const close = (current: EditorSession) => {
    const object = current.objectId ? api.objectById.get(current.objectId) : null
    if (object?.type === 'commentary' && isPersonalTextDocumentBlank(object.document)) {
      api.apply([{ op: 'delete', objectId: object.id }], { mergeKey: current.mergeKey })
    }
    api.seal()
    setSession(null)
  }

  const save = (current: EditorSession, document: typeof emptyDocument) => {
    if (current.objectId) {
      api.apply([{ op: 'update', objectId: current.objectId, patch: { document } }], { mergeKey: current.mergeKey })
      return
    }
    if (isPersonalTextDocumentBlank(document)) return
    const id = createPersonalMutationId()
    const result = api.apply([{ op: 'create', object: { id, type: 'commentary', target, document } }], { mergeKey: current.mergeKey })
    if (result.ok) setSession({ ...current, objectId: id })
  }

  const document = existing?.type === 'commentary' ? existing.document : emptyDocument

  return (
    <section
      className="paper-personal-commentary"
      aria-label={`我的讲评：${label}`}
      onKeyDownCapture={(event) => {
        if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        close(open)
      }}
      onBlur={(event) => {
        if (!open) return
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        close(open)
      }}
    >
      <div className="paper-personal-commentary__head">
        <h5 className="paper-personal-commentary__title">我的讲评</h5>
        {!open && api.canEdit ? (
          <button type="button" className="paper-personal-commentary__edit" onClick={begin}>
            <Pencil size={16} />
            <span>{existing ? '编辑' : '写一条'}</span>
          </button>
        ) : null}
      </div>
      {open ? (
        <PersonalTextEditor
          documentKey={open.key}
          value={document}
          ariaLabel={`我的讲评：${label}`}
          autoFocus
          onChange={(next) => save(open, next)}
        />
      ) : existing?.type === 'commentary' ? (
        <button
          type="button"
          className="paper-personal-commentary__view"
          disabled={!api.canEdit}
          onClick={begin}
          aria-label={`编辑我的讲评：${label}`}
        >
          <PersonalTextView document={document} />
        </button>
      ) : null}
    </section>
  )
}
