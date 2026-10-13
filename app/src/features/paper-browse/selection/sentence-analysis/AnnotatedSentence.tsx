import { capsuleGroups, firstToken } from './capsuleGroups'
import { CapsuleGroup } from './CapsuleGroup'
import type { MissingRelation } from './relationGeometry'
import { LABEL_TOP_SPACE } from './annotationLayout'
import { placeDecorations } from './measureAnnotations'
import { tokenStates, underlineOf } from './sentencePaint'
import type { TokenState } from './sentencePaint'
import type { SentenceBubble } from './sentenceCardView'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { coverage, unitDisplayLabel, unitText, voiceLine } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { Difficulty, FocusState, LayoutItem, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { RelationLayer } from './RelationLayer'
import { syncHoveredLines } from './underlines'
import type { GrammarFilter } from './underlines'
import { ConnectorMarker } from './ConnectorMarker'
import { connectorAt, connectorTarget, selectableUnits, canEnterUnit, sentenceHit, hasPersistentLabel, persistentLabelUnits, capsuleLabel, visibleRoleUnits, outgoingRelations, lineRole, matchesGrammarFilter } from './sentencePresentation'
import { isLexicalObstacle, unitFormPart } from '../../../../../../shared/sentence-analysis/enums.mjs'

const MOVE_MS = 340
// Outlives the strip's slowest fade-out (--motion-fast, 120ms) before the echo unmounts.
const ECHO_MS = 200

type RestoredPiece = { text: string; rects: DOMRect[]; next: number | null }

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function AnnotatedSentence({
  analysis,
  focus,
  mainActive,
  logicalSubjectActive,
  onToggleLogicalSubject,
  selectedRole,
  scopeId,
  onEnter,
  onBack,
  onSelect,
  onReset,
  onMove,
  keyboard,
  onKeyboard,
  locate,
  layout,
  layoutKey,
  leaving,
  flags,
  openFlagId,
  onFlag,
  bubble,
  onBubbleAction,
  detailHost,
  localRestoreScopeId,
}: {
  analysis: SentenceAnalysisV1
  focus: FocusState
  mainActive: boolean
  logicalSubjectActive: boolean
  onToggleLogicalSubject: () => void
  selectedRole: GrammarFilter | null
  scopeId: string | null
  onEnter: (unitId: string) => void
  onBack: () => void
  onSelect: (unitId: string) => void
  onReset: () => void
  onMove: (focus: FocusState) => void
  keyboard: boolean
  onKeyboard: (value: boolean) => void
  locate?: number
  layout: LayoutItem[]
  layoutKey: string
  leaving: LayoutItem[] | null
  flags: Difficulty[]
  openFlagId: string | null
  onFlag: (flagId: string) => void
  bubble: SentenceBubble | null
  onBubbleAction: () => void
  detailHost: HTMLDivElement | null
  localRestoreScopeId: string | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const sentenceRef = useRef<HTMLDivElement>(null)
  const reserveRef = useRef<HTMLDivElement>(null)
  const geometryRef = useRef({ width: 0, fontSize: '', top: LABEL_TOP_SPACE, line: 0, analysis, captured: false,
    resting: new Map<string, { top: number; line: number }>() })
  const dragRef = useRef({ x: 0, y: 0, moved: false })
  const rectsRef = useRef<{ key: string; rects: Map<number, DOMRect>; inserts: RestoredPiece[] }>({ key: layoutKey, rects: new Map(), inserts: [] })
  const [hover, setHover] = useState<number | null>(null)
  const [settled, setSettled] = useState(0)
  const activeFlag = flags.find(flag => flag.id === openFlagId) || null
  const states = tokenStates(analysis, focus, hover, selectedRole, mainActive, scopeId, logicalSubjectActive, activeFlag)
  const focusId = focus.kind === 'unit' ? focus.unitId : ''
  const logicalSubjectIds = new Set(focusId ? outgoingRelations(analysis, focusId)
    .filter(relation => relation.kind === 'logical-subject' && relation.certainty === 'certain')
    .flatMap(relation => relation.to) : [])
  const logicalSubjectText = analysis.units.filter(unit => logicalSubjectIds.has(unit.id) && coverage(analysis, unit.id).size)
    .map(unit => unitText(analysis, unit)).join('、')
  const [missing, setMissing] = useState({ unitId: '', lines: [] as MissingRelation[] })
  const onMissingRelations = useCallback((unitId: string, lines: MissingRelation[]) => {
    setMissing(previous => previous.unitId === unitId && JSON.stringify(previous.lines) === JSON.stringify(lines) ? previous : { unitId, lines })
  }, [])
  const fallbackLines = missing.unitId === focusId ? missing.lines : []
  const focusedUnit = analysis.units.find(unit => unit.id === focusId)
  const visibleUnits = visibleRoleUnits(analysis, scopeId)
  const persistentUnits = persistentLabelUnits(analysis, scopeId)
  const selectable = selectableUnits(analysis, scopeId)
  // A selected structure shows its own range line too, so the legend's stroke
  // for that role is always findable even when a capsule names it.
  const activeUnits = focusedUnit && lineRole(focusedUnit) ? [focusedUnit]
    : visibleUnits.filter(unit => lineRole(unit) && focus.kind === 'main' && selectedRole && matchesGrammarFilter(unit, selectedRole))
  const localFocusLabel = Boolean(focusedUnit && !focusedUnit.connector && !bubble?.flagId)
  // A voice line already names the logical subject and lights it.
  const subjectAction = Boolean(focusedUnit && !bubble?.flagId && logicalSubjectText && !voiceLine(analysis, focusedUnit))
  // The relation line fills an otherwise empty explanation; a logical-subject
  // action or a relation the arrows could not draw already fills it.
  const relationText = bubble && !bubble.flagId && !bubble.model.body && !subjectAction && !fallbackLines.length
    ? bubble.model.relation || '' : ''
  const formText = focusedUnit && !bubble?.flagId ? unitFormPart(focusedUnit) : ''
  const meaningfulBubble = bubble && (bubble.flagId || bubble.model.body || relationText || bubble.model.restore || bubble.model.uncertain) ? bubble : null
  // Tokens of a selected component that has an inner layer: clicking one of
  // them again goes one layer deeper. 看内部 always ends the explanation line.
  const deeper = focusedUnit && !bubble?.flagId && !bubble?.restored && focusId !== scopeId
    && canEnterUnit(analysis, focusId) ? coverage(analysis, focusId) : null
  // Set by label placement when the selection capsule had no room on its row.
  const [crowdedId, setCrowdedId] = useState('')
  // A numbered member capsule (②) keeps its number when selected so it never
  // grows; the explanation line names it instead.
  const crowdedLabel = Boolean(focusId && crowdedId === focusId)
    || Boolean(focusedUnit && focusedUnit.id !== scopeId && hasPersistentLabel(analysis, focusedUnit)
      && capsuleLabel(analysis, focusedUnit, false) !== capsuleLabel(analysis, focusedUnit, true))
  const enterAction = Boolean(deeper)
  const layerNav = enterAction || Boolean(scopeId)
  // A connector always names its kind (并列连词), even with nothing more to say.
  const detail = meaningfulBubble || (focusedUnit && (fallbackLines.length || subjectAction || crowdedLabel || formText || focusedUnit.connector) ? {
    key: `unit:${focusId}`, unitId: focusId, flagId: null, restored: false,
    model: { title: unitDisplayLabel(analysis, focusedUnit), body: '', uncertain: false, restore: null },
  } : null)
  const plainLayout = !scopeId && !layoutKey && !leaving && focus.kind === 'main' && !openFlagId && !detail
  const showDetailTitle = Boolean(detail && !detail.flagId && focusedUnit
    && (crowdedLabel || (!localFocusLabel && !hasPersistentLabel(analysis, focusedUnit))))
  const tokens = analysis.tokens
  const frame = new Set(analysis.units.filter((unit) => unit.role === 'cleft-frame').flatMap((unit) => [...coverage(analysis, unit.id)]))
  const kept = leaving ? new Set(leaving.flatMap((item) => (item.kind === 'token' ? [item.index] : []))) : null

  // Reflow changes annotation lanes even if the analysis/focus stayed the same.
  useLayoutEffect(() => {
    const root = sentenceRef.current
    if (!root) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSettled(count => count + 1))
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    document.fonts?.addEventListener('loadingdone', schedule)
    return () => {
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Move animation: every kept word glides from where it stood before the
  // order changed. Runs only when the order changes, so hovering mid-move
  // does not cut it short.
  useLayoutEffect(() => {
    const root = sentenceRef.current
    const previous = rectsRef.current
    if (!root || previous.key === layoutKey) return undefined
    if (reducedMotion() || typeof root.animate !== 'function') return undefined
    const pieces = [...root.querySelectorAll<HTMLElement>('[data-sa-token], .sa-inserted')]
    const tokenNodes = pieces.filter(node => node.dataset.saToken !== undefined)
    const animations: Animation[] = []
    const timing = { duration: MOVE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    const shifts = new Map<HTMLElement, { box: DOMRect; dx: number }>()
    for (const token of tokenNodes) {
      const before = previous.rects.get(Number(token.dataset.saToken))
      const after = token.getClientRects()[0]
      if (!before || !after) continue
      const dx = before.left - after.left
      const dy = (before.top + before.bottom) / 2 - (after.top + after.bottom) / 2
      shifts.set(token, { box: after, dx })
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      token.dataset.saMove = ''
      // A relative offset moves the inline word as it stands. Transform would
      // need inline-block, whose taller box shifted every capsule and marker
      // measured from it for the length of the move.
      animations.push(token.animate(
        [{ left: `${dx}px`, top: `${dy}px` }, { left: '0px', top: '0px' }],
        timing,
      ))
    }

    // A restored piece is uncovered left to right exactly as fast as the word
    // after it makes room, so it fills the opening as it widens. Keyframe
    // offsets sit on eased progress, which keeps the edge locked to that word.
    let pending: HTMLElement[] = []
    const reveal = (next: { box: DOMRect; dx: number } | undefined) => {
      for (const node of pending) {
        const box = node.getClientRects()[0]
        if (!box) continue
        const from = next ? next.box.left + next.dx : box.left
        const to = next ? next.box.left : box.right
        const sameLine = next && Math.abs(next.box.top - box.top) < 4 && to - from > 0.5
        const start = sameLine ? Math.min(1, Math.max(0, (box.left - from) / (to - from))) : 0
        const end = sameLine ? Math.min(1, Math.max(start, (box.right - from) / (to - from))) : 1
        const hidden = `inset(-4px ${box.width + 4}px -4px -4px)`
        const shown = 'inset(-4px -4px -4px -4px)'
        animations.push(node.animate([
          { offset: 0, clipPath: hidden },
          { offset: start, clipPath: hidden },
          { offset: end, clipPath: shown },
          { offset: 1, clipPath: shown },
        ], timing))
      }
      pending = []
    }
    for (const node of pieces) {
      if (node.hasAttribute('data-sa-leaving')) continue
      if (shifts.has(node)) reveal(shifts.get(node))
      else if (node.dataset.saToken === undefined) pending.push(node)
    }
    reveal(undefined)

    // A piece being taken back stays as a stand-in where it stood and is
    // covered right to left by the word closing in on it: the reverse of the
    // reveal, in the same single motion.
    const ghosts: HTMLElement[] = []
    const kept = new Set([...root.querySelectorAll<HTMLElement>('.sa-inserted')].map(node => node.textContent))
    const rootBox = root.getBoundingClientRect()
    const scale = root.offsetWidth ? rootBox.width / root.offsetWidth : 1
    const style = getComputedStyle(root)
    const padLeft = Number.parseFloat(style.paddingLeft) || 0
    const lineHeight = Number.parseFloat(style.lineHeight) || rootBox.height
    const width = root.clientWidth - padLeft - (Number.parseFloat(style.paddingRight) || 0)
    for (const gone of previous.inserts) {
      const first = gone.rects[0]
      if (!first || kept.has(gone.text)) continue
      const ghost = document.createElement('div')
      ghost.className = 'sa-insert-ghost'
      ghost.setAttribute('aria-hidden', 'true')
      ghost.dataset.saDecoration = ''
      // Laid out on the sentence's own lines from where the piece began, so a
      // piece that wrapped wraps the same way.
      const top = (first.top - rootBox.top) / scale + 1 - (lineHeight - (first.height / scale - 2)) / 2
      Object.assign(ghost.style, {
        left: `${padLeft}px`, top: `${top}px`, width: `${width}px`, lineHeight: `${lineHeight}px`,
        textIndent: `${(first.left - rootBox.left) / scale - padLeft}px`,
      })
      const piece = document.createElement('span')
      piece.className = 'sa-inserted'
      piece.textContent = gone.text
      ghost.append(piece)
      root.append(ghost)
      ghosts.push(ghost)
      const next = gone.next === null ? undefined : tokenNodes.find(node => Number(node.dataset.saToken) === gone.next)
      const closing = next && shifts.get(next)
      const nextBefore = gone.next === null ? undefined : previous.rects.get(gone.next)
      const from = closing ? closing.box.left + closing.dx : 0
      const to = closing ? closing.box.left : 0
      // Only a one-line piece followed on its own line can be tracked by the
      // closing word; anything else just fades early in the move.
      if (gone.rects.length !== 1 || !closing || !nextBefore || Math.abs(nextBefore.top - first.top) > 4 || from - to < 0.5) {
        animations.push(ghost.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { ...timing, fill: 'forwards' }))
        continue
      }
      const edge = (x: number) => `inset(-12px ${padLeft + width - (x - rootBox.left) / scale}px -12px -12px)`
      const start = Math.min(1, Math.max(0, (from - first.right) / (from - to)))
      const end = Math.min(1, Math.max(start, (from - first.left) / (from - to)))
      animations.push(ghost.animate([
        { offset: 0, clipPath: edge(first.right) },
        { offset: start, clipPath: edge(first.right) },
        { offset: end, clipPath: edge(first.left) },
        { offset: 1, clipPath: edge(first.left) },
      ], { ...timing, fill: 'forwards' }))
    }

    const clear = () => {
      for (const token of tokenNodes) delete token.dataset.saMove
      for (const ghost of ghosts) ghost.remove()
      delete root.dataset.saMoving
    }
    if (animations.length === 0) {
      clear()
      return undefined
    }
    // Washes and underlines read this to ride along (RelationLayer).
    root.dataset.saMoving = ''
    const finish = window.setTimeout(() => {
      clear()
      setSettled((count) => count + 1)
    }, MOVE_MS + 20)
    return () => {
      window.clearTimeout(finish)
      for (const animation of animations) animation.cancel()
      clear()
    }
  }, [layoutKey])

  useLayoutEffect(() => {
    const root = sentenceRef.current
    const wrap = wrapRef.current
    if (!root || !wrap) return
    const fontSize = getComputedStyle(root).fontSize
    const newLayout = geometryRef.current.width !== root.offsetWidth || geometryRef.current.fontSize !== fontSize
      || geometryRef.current.analysis !== analysis
    if (newLayout) {
      geometryRef.current = { width: root.offsetWidth, fontSize, top: LABEL_TOP_SPACE, line: 0, analysis, captured: false, resting: new Map() }
    }
    wrap.style.minHeight = ''
    // Each reading state (layer, substitution) has a resting layout with
    // nothing selected; a selection inside it is locked to that frame.
    const stateKey = `${scopeId || ''}|${layoutKey || ''}`
    const resting = !leaving && !focusId && !mainActive && !selectedRole && !logicalSubjectActive && !openFlagId && !detail?.key
    const frame = leaving ? undefined : geometryRef.current.resting.get(stateKey)
    const hidden = placeDecorations(root, wrap, reserveRef.current, frame && !resting
      ? { ...frame, locked: true }
      : { top: geometryRef.current.top, line: geometryRef.current.line, locked: false })
    if (resting && !frame) {
      geometryRef.current.resting.set(stateKey, { top: Number.parseFloat(wrap.style.paddingTop), line: Number.parseFloat(root.style.lineHeight) })
    }
    setCrowdedId(focusId && hidden.includes(focusId) ? focusId : '')
    // The baseline is the plain sentence only. Capturing it inside a layer, a
    // selection or a substitution would keep that transient space after return.
    if (!geometryRef.current.captured && plainLayout) {
      geometryRef.current.top = Number.parseFloat(wrap.style.paddingTop)
      geometryRef.current.line = Number.parseFloat(root.style.lineHeight)
      geometryRef.current.captured = true
    }
    if (reserveRef.current) reserveRef.current.style.height = '0px'

    const rects = new Map<number, DOMRect>()
    const inserts: RestoredPiece[] = []
    let open: RestoredPiece[] = []
    for (const node of root.querySelectorAll<HTMLElement>('[data-sa-token], .sa-inserted')) {
      if (node.dataset.saToken !== undefined) {
        const rect = node.getClientRects()[0]
        if (rect) rects.set(Number(node.dataset.saToken), rect)
        for (const piece of open) piece.next = Number(node.dataset.saToken)
        open = []
      } else if (!node.hasAttribute('data-sa-leaving')) {
        const piece = { text: node.textContent || '', rects: [...node.getClientRects()], next: null }
        inserts.push(piece)
        open.push(piece)
      }
    }
    rectsRef.current = { key: layoutKey, rects, inserts }
  }, [analysis, scopeId, focusId, mainActive, selectedRole, logicalSubjectActive, layoutKey, leaving,
    settled, flags, openFlagId, detail?.key, detail?.model.body, detail?.model.title,
    detail?.model.uncertain, detail?.model.restore?.label, detail?.restored, showDetailTitle, missing, plainLayout])

  // Hover changes paint only; it must not rerun label placement or resize the card.
  useLayoutEffect(() => {
    const root = sentenceRef.current
    if (!root) return
    const tokenNodes = [...root.querySelectorAll<HTMLElement>('[data-sa-token]')]
    const groups = new Map<string, HTMLElement[]>()
    for (const token of tokenNodes) {
      token.dataset.edge = ''
      if (!token.dataset.saState) continue
      const rect = token.getClientRects()[0]
      if (!rect) continue
      const key = `${token.dataset.saState}:${token.dataset.saBlock}:${Math.round(rect.top)}`
      groups.set(key, [...(groups.get(key) || []), token])
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      if (list.length === 1) list[0].dataset.edge = 'both'
      else {
        list[0].dataset.edge = 'start'
        list[list.length - 1].dataset.edge = 'end'
      }
    }
    syncHoveredLines(root)
  })

  const onPointerDown = (event: ReactPointerEvent) => {
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (event.buttons === 0) return
    if (Math.hypot(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y) > 4) dragRef.current.moved = true
  }
  const select = (unitId: string | null) => {
    if (!unitId) return
    onKeyboard(false)
    onSelect(unitId)
  }

  const localAnchor = scopeId ? analysis.units.find(unit => unit.id === scopeId) : null
  const shownTokens = new Set(layout.flatMap(item => item.kind === 'token' && !item.struck ? [item.index] : []))
  const labels = [...persistentUnits, ...(localAnchor ? [localAnchor] : [])]
    .filter(unit => unit.id !== localRestoreScopeId && shownTokens.has(firstToken(unit)))
  const { at: groupsAt, anchors } = capsuleGroups(analysis, labels, scopeId)
  // A temporary selection has its own decoration. It cannot regroup or widen
  // the stable capsules the reader already sees.
  if (focusedUnit && localFocusLabel && focusedUnit.id !== localRestoreScopeId
    && !anchors.has(focusedUnit.id) && shownTokens.has(firstToken(focusedUnit))) {
    const index = firstToken(focusedUnit)
    groupsAt.set(index, [...(groupsAt.get(index) || []), { kind: 'plain', units: [focusedUnit], persistent: false }])
  }
  const flagsAt = new Map<number, Difficulty[]>()
  for (const flag of flags) {
    const unit = analysis.units.find((item) => item.id === flag.unitId)
    if (!unit) continue
    // A word-level flag sits under the words it explains.
    const index = isLexicalObstacle(flag.obstacle) && flag.highlightSpans?.length ? flag.highlightSpans[0].start : firstToken(unit)
    flagsAt.set(index, [...(flagsAt.get(index) || []), flag])
  }

  const localScope = localRestoreScopeId ? analysis.units.find(unit => unit.id === localRestoreScopeId) : null
  const localStart = localScope ? Math.min(...localScope.spans.map(span => span.start)) : -1
  const localEnd = localScope ? Math.max(...localScope.spans.map(span => span.end)) : -1
  const startPosition = localScope ? layout.findIndex(item => item.kind === 'insert' || item.index >= localStart) : -1
  const endPosition = localScope ? layout.findIndex((item, position) => position >= startPosition && item.kind === 'token' && item.index >= localEnd) : -1
  const beforePieces: ReactNode[] = []
  const localPieces: ReactNode[] = []
  const afterPieces: ReactNode[] = []
  let previousState: TokenState | undefined
  layout.forEach((item, position) => {
    const pieces = !localScope || position < startPosition ? beforePieces
      : endPosition >= 0 && position >= endPosition ? afterPieces : localPieces
    const itemState = item.kind === 'token' ? states.get(item.index) : previousState
    if (item.gap) {
      const gapState = previousState && itemState && previousState.state === itemState.state && previousState.block === itemState.block ? itemState : null
      pieces.push(<span key={`gap-${position}`} className="sa-gap" data-sa-state={gapState?.state}>{item.gap}</span>)
    }
    const shownText = (value: string) => (item.capitalize ? value[0].toUpperCase() + value.slice(1) : value)
    if (item.kind === 'insert') {
      pieces.push(
        <ins key={`ins-${position}`} className="sa-inserted" data-sa-inserted="" data-sa-leaving={leaving ? '' : undefined}>
          {shownText(item.text)}
        </ins>,
      )
      return
    }
    const index = item.index
    const token = tokens[index]
    const struck = Boolean(item.struck)
    const tokenState = struck ? undefined : states.get(index)
    previousState = tokenState
    const line = struck ? null : underlineOf(analysis, index, activeUnits, scopeId)
    const candidate = struck ? null : connectorAt(analysis, index)
    const connector = candidate && selectable.some(unit => unit.id === candidate.id
      || unit.id === connectorTarget(analysis, candidate).id) ? candidate : null
    const groups = struck ? [] : groupsAt.get(index) || []
    const tokenFlags = struck ? [] : flagsAt.get(index) || []
    const word = item.lowercase ? token.text[0].toLowerCase() + token.text.slice(1) : token.text
    pieces.push(
      <span
        key={`token-${index}`}
        className="sa-token"
        data-sa-token={index}
        data-sa-line={line?.kind}
        data-sa-line-unit={line?.unitId}
        data-sa-line-active={line?.active ? '' : undefined}
        data-sa-connector={connector ? '' : undefined}
        data-sa-frame={frame.has(index) ? '' : undefined}
        data-sa-struck={struck ? '' : undefined}
        data-sa-deeper={deeper?.has(index) ? '' : undefined}
        data-sa-state={tokenState?.state}
        data-sa-block={tokenState?.block}
        data-sa-leaving={kept && !kept.has(index) ? '' : undefined}
        data-keyboard={keyboard && tokenState?.state === 'focused' && focus.kind === 'unit' ? 'true' : undefined}
        onMouseEnter={() => setHover(index)}
      >
        {shownText(word)}
        {connector && connector.spans.some(span => span.start === index) ? <ConnectorMarker analysis={analysis} connector={connector} focus={focus} onSelect={select} /> : null}
        {groups.map(group => <CapsuleGroup key={`${group.kind}:${group.units[0].id}`} group={group}
          analysis={analysis} focusId={focusId} scopeId={scopeId} onSelect={select} onBack={onBack}
          onHover={() => setHover(null)} />)}
        {/* Always rendered when present: adding an element later would split the
            text run and nudge the kerning of the words after it. */}
        {tokenFlags.length > 0 ? (
          <span className="sa-under" data-sa-decoration="">
            {tokenFlags.map((flag) => (
              <button
                key={flag.id}
                type="button"
                className="sa-flag"
                data-sa-flag={flag.id}
                data-current={openFlagId === flag.id ? 'true' : undefined}
                aria-label={`难点：${flag.label}`}
                aria-expanded={openFlagId === flag.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  onKeyboard(false)
                  onFlag(flag.id)
                }}
              >
                {flag.label}
              </button>
            ))}
          </span>
        ) : null}
      </span>,
    )
  })

  const pieces = localScope ? [...beforePieces,
    <span key="local-restore" className="sa-local-restore" role="group" aria-label="局部还原">
      <span className="sa-restore-controls" data-sa-decoration="" onClick={event => event.stopPropagation()}>
        <span className="sa-local-restore-label">局部还原</span>
        <button type="button" className="sa-local-action" onMouseDown={event => event.preventDefault()}
          onClick={() => select(localScope.id)}>{capsuleLabel(analysis, localScope, true)}</button>
        {canEnterUnit(analysis, localScope.id) ? <button type="button" className="sa-local-action" aria-label="看内部成分"
          onMouseDown={event => event.preventDefault()} onClick={() => onEnter(localScope.id)}>看内部 →</button> : null}
        <button type="button" className="sa-local-action" aria-label="收起局部还原"
          onMouseDown={event => event.preventDefault()} onClick={onBubbleAction}>← 原句</button>
      </span>{localPieces}
    </span>, ...afterPieces] : beforePieces

  const detailContent = detail ? (
    <>
      {showDetailTitle ? <span className="sa-bubble-title">{detail.model.title}</span> : null}
      {formText && !showDetailTitle ? <span className="sa-bubble-title sa-bubble-form">{formText}</span> : null}
      {detail.model.uncertain ? <span className="sa-bubble-unsure">不确定</span> : null}
      {detail.model.body ? <span className="sa-bubble-body">{detail.model.body}</span> : null}
      {relationText ? <span className="sa-bubble-body">{relationText}</span> : null}
      {/* One explanation at a time: relation text only fills an otherwise empty line. */}
      {detail.model.body ? null : fallbackLines.map(item => (
        <button type="button" className="sa-local-action" key={item.relationId + ':' + item.targetId} title={unitText(analysis, item.targetId)}
          onMouseDown={event => event.preventDefault()}
          onClick={event => { event.stopPropagation(); select(item.targetId) }}>{item.text}</button>
      ))}
      {detail.model.restore ? (
        <button
          type="button"
          className="sa-bubble-action"
          aria-pressed={detail.restored}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onBubbleAction}
        >
          {detail.restored ? (detail.model.restore.kindLabel === '代入先行词' ? '收起代入' : '看原句') : detail.model.restore.label}
        </button>
      ) : null}
      {subjectAction && !detail.flagId ? (
        <button
          type="button"
          className="sa-bubble-action sa-subject-action"
          aria-pressed={logicalSubjectActive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => { event.stopPropagation(); onToggleLogicalSubject() }}
        >
          逻辑主语：{logicalSubjectText}
        </button>
      ) : null}
    </>
  ) : null
  // Words never leave the strip at once: the last explanation stays as an inert
  // echo and fades out, with the fill when nothing follows, under the next text
  // on a switch.
  const lastDetailRef = useRef<{ key: string; content: ReactNode }>({ key: '', content: null })
  const [echo, setEcho] = useState<{ id: number; content: ReactNode; swap: boolean } | null>(null)
  const detailKey = detail?.key || ''
  // Runs before the ref below is refreshed, so it still sees the words that were on screen.
  useLayoutEffect(() => {
    const last = lastDetailRef.current
    if (last.key) setEcho((previous) => ({ id: (previous?.id || 0) + 1, content: last.content, swap: Boolean(detailKey) }))
  }, [detailKey])
  useLayoutEffect(() => {
    lastDetailRef.current = { key: detailKey, content: detailContent }
  })
  useEffect(() => {
    if (!echo) return undefined
    const timer = window.setTimeout(() => setEcho(null), ECHO_MS)
    return () => window.clearTimeout(timer)
  }, [echo])

  return (
    <div ref={wrapRef} className="sa-sentence-wrap" 
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('[data-sa-token], .sa-bubble, .sa-local-restore') && !dragRef.current.moved && window.getSelection()?.isCollapsed) {
          setHover(null)
          onReset()
        }
      }}>
      <div
        ref={sentenceRef}
        className="sa-sentence"
        data-local-restore={localScope ? '' : undefined}
        tabIndex={0}
        role="group"
        aria-label="句子结构，使用方向键浏览"
        data-sa-focus={focus.kind === 'main' ? 'main' : focus.unitId}
        data-sa-focus-form={focus.kind === 'unit' ? analysis.units.find((unit) => unit.id === focus.unitId)?.form : undefined}
        data-sa-restored={layoutKey || undefined}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          const selection = window.getSelection()
          if (dragRef.current.moved || (selection && !selection.isCollapsed && sentenceRef.current?.contains(selection.anchorNode))) return
          if ((event.target as HTMLElement).closest('[data-sa-label], [data-sa-flag], .sa-ink-connector')) return
          const token = (event.target as HTMLElement).closest<HTMLElement>('[data-sa-token]')
          if (!token) return
          const index = Number(token.dataset.saToken)
          if (deeper?.has(index)) {
            const inner = sentenceHit(analysis, index, focusId)
            onEnter(focusId)
            if (inner && inner !== focusId) select(inner)
            return
          }
          select(sentenceHit(analysis, index, scopeId))
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          onKeyboard(true)
          const ordered = [...new Map([...visibleUnits, ...persistentUnits].map(unit => [unit.id, unit])).values()].sort((a, b) => firstToken(a) - firstToken(b))
          const current = focus.kind === 'unit' ? ordered.findIndex(unit => unit.id === focus.unitId) : -1
          const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
          const target = event.key === 'Home' ? ordered[0] : event.key === 'End' ? ordered.at(-1)
            : ordered[(current + step + ordered.length) % ordered.length]
          if (target) onMove({ kind: 'unit', unitId: target.id })
        }}
        onCopy={(event) => {
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0 || !sentenceRef.current) return
          const range = selection.getRangeAt(0)
          if (!sentenceRef.current.contains(range.commonAncestorContainer)) return
          const fragment = range.cloneContents()
          fragment.querySelectorAll('[data-sa-decoration]').forEach((node) => node.remove())
          event.clipboardData?.setData('text/plain', fragment.textContent || '')
          event.preventDefault()
        }}
      >
        <RelationLayer sentenceRef={sentenceRef} analysis={analysis} focus={focus} selectedRole={selectedRole} locate={locate} repaint={`${layoutKey}:${settled}:${mainActive}:${logicalSubjectActive}:${openFlagId}`} showRelations={!activeFlag || !isLexicalObstacle(activeFlag.obstacle)} onMissingRelations={onMissingRelations} />
        {pieces}
      </div>
      <div ref={reserveRef} className="sa-detail-reserve" aria-hidden="true" />
      {/* One resident strip per sentence: it never appears, moves or resizes, so
          a selection reads as its text updating rather than a box arriving. */}
      {detailHost ? createPortal(
        <div className="sa-detail-strip">
        {echo ? (
          <div key={echo.id} className="sa-bubble-echo" data-swap={echo.swap ? '' : undefined} aria-hidden="true" inert>{echo.content}</div>
        ) : null}
        {detail ? (
        <div key={detail.key} className="sa-bubble sa-bubble-docked" data-placed="" data-sa-bubble="" aria-label={detail.model.title}>
          {detailContent}
        </div>
        ) : null}
        {/* The way in and the way out share the strip's right end, so entering
            and returning never move the pointer. */}
        {layerNav ? (
          <span className="sa-layer-nav" role="group" aria-label="阅读层级">
            {enterAction ? (
              <button type="button" className="sa-bubble-action sa-layer-btn sa-enter-action" aria-label="看内部成分"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => { event.stopPropagation(); onEnter(focusId) }}>
                看内部 →
              </button>
            ) : null}
            {scopeId ? (
              <button type="button" className="sa-bubble-action sa-layer-btn sa-back-action" aria-label="返回上一层"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => { event.stopPropagation(); onBack() }}>
                ← 返回
              </button>
            ) : null}
          </span>
        ) : null}
        </div>, detailHost
      ) : null}
    </div>
  )
}
