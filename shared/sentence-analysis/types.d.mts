export type TokenSpan = { start: number; end: number }

export type Token = {
  index: number
  start: number
  end: number
  text: string
  kind: 'word' | 'punct'
}

export type TextRange = { start: number; end: number; quote: string }

export type Unit = {
  id: string
  spans: TokenSpan[]
  form: string
  role: string | null
  layerId: string | null
  parentId: string | null
  sense?: string
  connector?: string
  obstacles: string[]
  focusObstacles?: string[]
  collocationSpans?: TokenSpan[]
  marks?: string[]
  noteZh?: string
  voice?: 'active' | 'passive' | 'completed'
  actionZh?: string
  translationRanges: TextRange[]
}

export type Relation = {
  id: string
  kind: string
  from: string
  to: string[]
  certainty: 'certain' | 'uncertain'
  implied?: true
  noteZh?: string
}

export type RestoreSegment =
  | { start: number; end: number; lowercase?: true }
  | { text: string }

export type RestoreKind = 'normal-order' | 'ellipsis' | 'antecedent' | 'rewrite'

export type Restore = {
  id: string
  unitId: string
  scopeId: string
  kind: RestoreKind
  segments: RestoreSegment[]
}

export type RestoreDisplaySegment = { text: string; inserted: boolean; spaceBefore: boolean }

export type SentenceAnalysisV1 = {
  schemaVersion: 'paper-sentence-analysis-v1'
  tokenizerVersion: string
  source: {
    paperId: string
    sourceRevision: string
    streamId: string
    start: number
    end: number
    sentenceText: string
  }
  producer: { kind: 'fixture' | 'model'; id: string }
  status: 'ok' | 'partial' | 'unavailable'
  unavailableReason?: string
  tokens: Token[]
  rootClauseIds: string[]
  units: Unit[]
  relations: Relation[]
  restores: Restore[]
  translation: { textZh: string } | null
  gaps?: string[]
}

export type FocusState = { kind: 'main' } | { kind: 'unit'; unitId: string }

export type StructureSegment = {
  text: string
  unitId: string | null
  lang: 'en' | 'zh' | 'sep'
}

export type ExplanationLine = { label: string; text: string; unitIds: string[] }

export type ExplanationModel = {
  title: string
  lines: ExplanationLine[]
  note?: string
  obstacles: string[]
  restores: Array<{ kindLabel: string; segments: RestoreDisplaySegment[] }>
  uncertain: boolean
}

export type Difficulty = {
  id: string
  unitId: string
  obstacle: string
  label: string
  rule: string
  attention: 'priority' | 'hint' | 'on-demand'
  highlightSpans?: TokenSpan[]
  restoreId: string | null
}

export type BubbleModel = {
  title: string
  body: string
  /** What the unit does for its neighbour; shown only when nothing else fills the line. */
  relation?: string
  /** The neighbour the relation names, even when the line itself is not shown. */
  relationTargetId?: string | null
  uncertain: boolean
  restore: { id: string; label: string; kindLabel: string } | null
}

export type LayoutItem =
  | { kind: 'token'; index: number; lowercase: boolean; struck?: boolean; gap: string; capitalize: boolean }
  | { kind: 'insert'; text: string; gap: string; capitalize: boolean }

export type MainFocus = {
  primary: Unit[]
  relations: Relation[]
  trunkText: string
  trunkZh: string | null
}

export type FocusView = {
  focused: Unit
  related: Unit[]
  relations: Relation[]
  connectorOf: Unit | null
  layerLabel: string
}

export type ValidationError = { code: string; path: string; message: string }

export type SentenceTarget = {
  paperId: string
  sourceRevision: string
  streamId: string
  start: number
  end: number
  sentenceText: string
}
