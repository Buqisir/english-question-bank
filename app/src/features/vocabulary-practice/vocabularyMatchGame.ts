export type VocabularyMatchEntry = {
  id: string
  headword: string
  teachingSense: string
}

export type VocabularyMatchCardKind = 'word' | 'meaning'
export type VocabularyMatchCardStatus = 'hidden' | 'revealed' | 'matched'

export type VocabularyMatchCard = {
  id: string
  entryId: string
  kind: VocabularyMatchCardKind
  label: string
  matchKey: string
  status: VocabularyMatchCardStatus
}

export type VocabularyMatchResolution = 'idle' | 'match' | 'mismatch'

export type VocabularyMatchGameState = {
  cards: VocabularyMatchCard[]
  firstCardId: string | null
  secondCardId: string | null
  resolution: VocabularyMatchResolution
  matchedPairCount: number
  totalPairCount: number
}

export type VocabularyMatchSelection = {
  state: VocabularyMatchGameState
  outcome: 'ignored' | 'first' | 'match' | 'mismatch'
  spokenEntryId: string | null
}

export type VocabularyMatchShuffle = (cards: VocabularyMatchCard[]) => VocabularyMatchCard[]

const DEFAULT_ROUND_SIZE = 10

function normalizedMeaning(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}

export function shuffleVocabularyMatchCards(cards: VocabularyMatchCard[]) {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

export function splitVocabularyMatchRounds<T>(entries: T[], roundSize = DEFAULT_ROUND_SIZE): T[][] {
  if (!Number.isInteger(roundSize) || roundSize < 1) throw new Error('roundSize must be a positive integer')
  const rounds: T[][] = []
  for (let index = 0; index < entries.length; index += roundSize) {
    rounds.push(entries.slice(index, index + roundSize))
  }
  return rounds
}

export function createVocabularyMatchGame(
  entries: VocabularyMatchEntry[],
  shuffle: VocabularyMatchShuffle = shuffleVocabularyMatchCards,
): VocabularyMatchGameState {
  const cards = entries.flatMap((entry) => {
    const matchKey = normalizedMeaning(entry.teachingSense)
    return [
      {
        id: `${entry.id}:word`,
        entryId: entry.id,
        kind: 'word' as const,
        label: entry.headword,
        matchKey,
        status: 'hidden' as const,
      },
      {
        id: `${entry.id}:meaning`,
        entryId: entry.id,
        kind: 'meaning' as const,
        label: entry.teachingSense,
        matchKey,
        status: 'hidden' as const,
      },
    ]
  })

  return {
    cards: shuffle(cards).map((card) => ({ ...card })),
    firstCardId: null,
    secondCardId: null,
    resolution: 'idle',
    matchedPairCount: 0,
    totalPairCount: entries.length,
  }
}

function revealCard(cards: VocabularyMatchCard[], cardId: string) {
  return cards.map((card) => card.id === cardId ? { ...card, status: 'revealed' as const } : card)
}

function hideUnmatchedCards(cards: VocabularyMatchCard[]) {
  return cards.map((card) => card.status === 'revealed' ? { ...card, status: 'hidden' as const } : card)
}

export function selectVocabularyMatchCard(
  state: VocabularyMatchGameState,
  cardId: string,
): VocabularyMatchSelection {
  const selectedCard = state.cards.find((card) => card.id === cardId)
  if (!selectedCard || selectedCard.status !== 'hidden' || state.resolution === 'match') {
    return { state, outcome: 'ignored', spokenEntryId: null }
  }

  const spokenEntryId = selectedCard.kind === 'word' ? selectedCard.entryId : null

  if (state.resolution === 'mismatch') {
    return {
      state: {
        ...state,
        cards: revealCard(hideUnmatchedCards(state.cards), cardId),
        firstCardId: cardId,
        secondCardId: null,
        resolution: 'idle',
      },
      outcome: 'first',
      spokenEntryId,
    }
  }

  if (!state.firstCardId) {
    return {
      state: {
        ...state,
        cards: revealCard(state.cards, cardId),
        firstCardId: cardId,
      },
      outcome: 'first',
      spokenEntryId,
    }
  }

  const firstCard = state.cards.find((card) => card.id === state.firstCardId)
  if (!firstCard) return { state, outcome: 'ignored', spokenEntryId: null }
  const isMatch = firstCard.kind !== selectedCard.kind && firstCard.matchKey === selectedCard.matchKey

  return {
    state: {
      ...state,
      cards: revealCard(state.cards, cardId),
      secondCardId: cardId,
      resolution: isMatch ? 'match' : 'mismatch',
    },
    outcome: isMatch ? 'match' : 'mismatch',
    spokenEntryId,
  }
}

export function settleVocabularyMatch(state: VocabularyMatchGameState): VocabularyMatchGameState {
  if (state.resolution !== 'match' || !state.firstCardId || !state.secondCardId) return state
  const matchedIds = new Set([state.firstCardId, state.secondCardId])
  return {
    ...state,
    cards: state.cards.map((card) => matchedIds.has(card.id) ? { ...card, status: 'matched' } : card),
    firstCardId: null,
    secondCardId: null,
    resolution: 'idle',
    matchedPairCount: state.matchedPairCount + 1,
  }
}

export function isVocabularyMatchRoundComplete(state: VocabularyMatchGameState) {
  return state.totalPairCount > 0 && state.matchedPairCount === state.totalPairCount
}
