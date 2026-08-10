export type VocabularyStage = 'core' | 'basic' | 'recognition'

export type VocabularyReviewVerdict = 'known' | 'unfamiliar'

export type VocabularyAsset = {
  key: string
  version: string
  path: string
}

export type VocabularyVisualAsset = VocabularyAsset & {
  alt: string
}

export type VocabularyAudioAsset = VocabularyAsset & {
  voice: 'eqb-british-teacher-v1' | 'en-GB-SoniaNeural'
}

export type VocabularyPhonetics = {
  american: string
  british: string
}

export type VocabularySetEntry = {
  id: string
  headword: string
  phonetic: string
  phonetics?: VocabularyPhonetics
  partOfSpeech: string
  sourceMeanings: string[]
  teachingSense: string
  pronunciationMode: 'syllables' | 'forms'
  syllables: Array<string | VocabularyPronunciationPart>
  pronunciationParts?: VocabularyPronunciationParts
  example: {
    english: string
    chinese: string
    highlight: string
    reviewStatus?: 'approved'
  }
  visual: VocabularyVisualAsset
  audio: VocabularyAudioAsset
}

export type PublicVocabularyEntry = Omit<VocabularySetEntry, 'example' | 'sourceMeanings'>

export type PublicVocabularySet = {
  title: string
  entryCount: number
  entries: PublicVocabularyEntry[]
  createdAt: string
}

export type VocabularyVisualKey = string

export type VocabularyProgramGroup = {
  id: string
  stage?: VocabularyStage
  week: number
  group: number
  sourceLabel: string
  startOrder: number
  endOrder: number
}

export type VocabularyPronunciationPart = {
  spelling: string
  phonetic: string
}

export type VocabularyPronunciationParts = {
  american: VocabularyPronunciationPart[]
  british: VocabularyPronunciationPart[]
}

export type VocabularyLearningContent = {
  pronunciationGuide: {
    mode: 'syllables' | 'forms'
    parts: VocabularyPronunciationPart[]
  }
  example: {
    english: string
    chinese: string
    highlight: string
  }
}

export type VocabularyEntry = {
  id: string
  headword: string
  phonetic: string
  phonetics?: VocabularyPhonetics
  partOfSpeech: string
  sourceMeanings: string[]
  teachingSense: string
  examFrequency?: number
  primaryStageReview?: boolean
  visualKey: VocabularyVisualKey
  visual?: VocabularyVisualAsset
  audio?: VocabularyAudioAsset
  learning: VocabularyLearningContent
  pronunciationParts?: VocabularyPronunciationParts
  source: {
    title: string
    edition: string
    stage: VocabularyStage
    week: number
    group: number
    sourceLabel: string
    indexInGroup: number
    globalOrder: number
    printedPage: number
    verification: 'page-checked' | 'index-and-heading-reviewed'
  }
}

export type VocabularyProgram = {
  id: string
  version: string
  title: string
  subtitle: string
  sourceTitle: string
  sourceEdition: string
  totalPlannedEntries: number
  calibrationSize: number
  groups: VocabularyProgramGroup[]
  entries: VocabularyEntry[]
}

export type VocabularyInputFilterResult = {
  matchedEntries: VocabularyEntry[]
  duplicateTerms: string[]
  rejectedTerms: string[]
}

function normalizeVocabularyInputTerm(value: string): string {
  return value
    .trim()
    .replace(/^[\s\-*•]+/u, '')
    .replace(/^\(?\d{1,3}[.)、]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function vocabularyHeadwordAliases(headword: string): string[] {
  const aliases = new Set<string>()
  const add = (value: string) => {
    const normalized = normalizeVocabularyInputTerm(value)
    if (normalized) aliases.add(normalized)
  }

  add(headword)
  const base = headword.replace(/\s*\([^)]*\)\s*/gu, ' ').replace(/\s+/gu, ' ').trim()
  add(base)
  base.split(/\s*\/\s*/u).forEach(add)

  for (const match of headword.matchAll(/\(([^)]*)\)/gu)) {
    const rawInner = match[1].trim()
    if (!rawInner) continue
    if (/^(?:to|for|at|on|of|with|from|up|down|out|in|off|over|after|before|into)$/iu.test(rawInner)) {
      add(`${base} ${rawInner}`)
      continue
    }
    rawInner
      .replace(/^pl\.\s*/iu, '')
      .replace(/^=\s*/u, '')
      .replace(/\bAmE\b/giu, ',')
      .split(/\s*[,/]\s*/u)
      .forEach(add)
  }

  return [...aliases]
}

export function filterVocabularyInput(
  raw: string,
  entries: VocabularyEntry[],
): VocabularyInputFilterResult {
  const exactAliases = new Map<string, Set<VocabularyEntry>>()
  const foldedAliases = new Map<string, Set<VocabularyEntry>>()
  const addAlias = (map: Map<string, Set<VocabularyEntry>>, alias: string, entry: VocabularyEntry) => {
    const candidates = map.get(alias) ?? new Set<VocabularyEntry>()
    candidates.add(entry)
    map.set(alias, candidates)
  }

  for (const entry of entries) {
    for (const alias of vocabularyHeadwordAliases(entry.headword)) {
      addAlias(exactAliases, alias, entry)
      addAlias(foldedAliases, alias.toLocaleLowerCase('en-US'), entry)
    }
  }

  const matchTerm = (term: string): VocabularyEntry | null => {
    const exact = exactAliases.get(term)
    if (exact?.size === 1) return [...exact][0]
    const folded = foldedAliases.get(term.toLocaleLowerCase('en-US'))
    return folded?.size === 1 ? [...folded][0] : null
  }
  const terms: string[] = []
  for (const rawLine of raw.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = normalizeVocabularyInputTerm(rawLine)
    if (!line) continue
    if (matchTerm(line)) {
      terms.push(line)
      continue
    }
    const pieces = line.split(/[，,、；;\t]+/u).map(normalizeVocabularyInputTerm).filter(Boolean)
    for (const piece of pieces) {
      if (matchTerm(piece)) {
        terms.push(piece)
        continue
      }
      const words = piece.split(/\s+/u).filter(Boolean)
      if (words.length > 1 && words.every((word) => matchTerm(word))) {
        terms.push(...words)
      } else {
        terms.push(piece)
      }
    }
  }

  const matchedEntries: VocabularyEntry[] = []
  const duplicateTerms: string[] = []
  const rejectedTerms: string[] = []
  const matchedIds = new Set<string>()
  for (const term of terms) {
    const entry = matchTerm(term)
    if (!entry) {
      rejectedTerms.push(term)
    } else if (matchedIds.has(entry.id)) {
      duplicateTerms.push(term)
    } else {
      matchedIds.add(entry.id)
      matchedEntries.push(entry)
    }
  }
  return { matchedEntries, duplicateTerms, rejectedTerms }
}

export type VocabularyReviewState = {
  cursor: number
  targetUnfamiliarCount: number
  decisions: Record<string, VocabularyReviewVerdict>
  decisionOrder: string[]
  revealed: boolean
}

export type VocabularyReviewCompletion = 'active' | 'target-reached' | 'program-exhausted'

export function createVocabularyReviewState(targetUnfamiliarCount = 15): VocabularyReviewState {
  return {
    cursor: 0,
    targetUnfamiliarCount,
    decisions: {},
    decisionOrder: [],
    revealed: false,
  }
}

export function countVocabularyDecisions(
  state: VocabularyReviewState,
  verdict: VocabularyReviewVerdict,
): number {
  return Object.values(state.decisions).filter((value) => value === verdict).length
}

export function getVocabularyReviewCompletion(
  program: VocabularyProgram,
  state: VocabularyReviewState,
): VocabularyReviewCompletion {
  if (countVocabularyDecisions(state, 'unfamiliar') >= state.targetUnfamiliarCount) {
    return 'target-reached'
  }
  if (state.cursor >= program.entries.length) return 'program-exhausted'
  return 'active'
}

export function decideVocabularyEntry(
  program: VocabularyProgram,
  state: VocabularyReviewState,
  verdict: VocabularyReviewVerdict,
): VocabularyReviewState {
  if (getVocabularyReviewCompletion(program, state) !== 'active') return state
  const entry = program.entries[state.cursor]
  if (!entry) return state

  return {
    ...state,
    cursor: Math.min(state.cursor + 1, program.entries.length),
    decisions: { ...state.decisions, [entry.id]: verdict },
    decisionOrder: [...state.decisionOrder.filter((entryId) => entryId !== entry.id), entry.id],
    revealed: false,
  }
}

export function undoVocabularyDecision(
  program: VocabularyProgram,
  state: VocabularyReviewState,
): VocabularyReviewState {
  const entryId = state.decisionOrder.at(-1)
  if (!entryId) return state
  const entryIndex = program.entries.findIndex((entry) => entry.id === entryId)
  if (entryIndex < 0) return state

  const decisions = { ...state.decisions }
  delete decisions[entryId]

  return {
    ...state,
    cursor: entryIndex,
    decisions,
    decisionOrder: state.decisionOrder.slice(0, -1),
    revealed: false,
  }
}

export function revealVocabularyEntry(state: VocabularyReviewState): VocabularyReviewState {
  return state.revealed ? state : { ...state, revealed: true }
}

export function getUnfamiliarVocabularyEntries(
  program: VocabularyProgram,
  state: VocabularyReviewState,
): VocabularyEntry[] {
  return state.decisionOrder
    .filter((entryId) => state.decisions[entryId] === 'unfamiliar')
    .map((entryId) => program.entries.find((entry) => entry.id === entryId))
    .filter((entry): entry is VocabularyEntry => Boolean(entry))
}

export function parseVocabularyReviewState(
  raw: string | null,
  program: VocabularyProgram,
  targetUnfamiliarCount = 15,
): VocabularyReviewState {
  if (!raw) return createVocabularyReviewState(targetUnfamiliarCount)
  try {
    const parsed = JSON.parse(raw) as Partial<VocabularyReviewState>
    const entryIds = new Set(program.entries.map((entry) => entry.id))
    const decisionOrder = Array.from(new Set(parsed.decisionOrder ?? [])).filter(
      (entryId): entryId is string => typeof entryId === 'string' && entryIds.has(entryId),
    )
    const decisions = decisionOrder.reduce<Record<string, VocabularyReviewVerdict>>((result, entryId) => {
      const verdict = parsed.decisions?.[entryId]
      if (verdict === 'known' || verdict === 'unfamiliar') result[entryId] = verdict
      return result
    }, {})
    const validOrder = decisionOrder.filter((entryId) => decisions[entryId])

    return {
      cursor: Math.min(validOrder.length, program.entries.length),
      targetUnfamiliarCount,
      decisions,
      decisionOrder: validOrder,
      revealed: false,
    }
  } catch {
    return createVocabularyReviewState(targetUnfamiliarCount)
  }
}
