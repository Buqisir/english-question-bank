export type VocabularyWordSearchEntry = {
  id: string
  headword: string
  teachingSense: string
  partOfSpeech: string
  pronunciationMode?: 'syllables' | 'forms'
}

export type VocabularyWordSearchDirection = 'right' | 'down' | 'down-right' | 'up-right'
export type VocabularyWordSearchPlacementKind = 'target' | 'correct-decoy' | 'misspelling-decoy'

export type VocabularyWordSearchPlacement = {
  id: string
  entryId: string | null
  kind: VocabularyWordSearchPlacementKind
  answer: string
  gridWord: string
  row: number
  column: number
  endRow: number
  endColumn: number
  direction: VocabularyWordSearchDirection
  correction?: string
}

export type VocabularyWordSearchClue = {
  entryId: string
  number: number
  teachingSense: string
  hint: string | null
  answer: string
  searchable: boolean
}

export type VocabularyWordSearchPage = {
  pageIndex: number
  size: number
  grid: string[][]
  clues: VocabularyWordSearchClue[]
  placements: VocabularyWordSearchPlacement[]
  correctDecoys: string[]
  misspellingDecoys: Array<{ incorrect: string; correct: string }>
}

type DirectionVector = {
  direction: VocabularyWordSearchDirection
  rowStep: number
  columnStep: number
}

type PendingWord = {
  id: string
  entryId: string | null
  kind: VocabularyWordSearchPlacementKind
  answer: string
  gridWord: string
  correction?: string
}

type PlacementCandidate = {
  row: number
  column: number
  endRow: number
  endColumn: number
  direction: VocabularyWordSearchDirection
  rowStep: number
  columnStep: number
  overlap: number
  tieBreaker: number
}

const WORDS_PER_PAGE = 10
const GRID_SIZE = 12
const CORRECT_DECOYS_PER_PAGE = 2
const MISSPELLING_DECOYS_PER_PAGE = 1

const DIRECTIONS: DirectionVector[] = [
  { direction: 'right', rowStep: 0, columnStep: 1 },
  { direction: 'down', rowStep: 1, columnStep: 0 },
  { direction: 'down-right', rowStep: 1, columnStep: 1 },
  { direction: 'up-right', rowStep: -1, columnStep: 1 },
]

const READ_DIRECTIONS = [
  ...DIRECTIONS,
  { direction: 'left', rowStep: 0, columnStep: -1 },
  { direction: 'up', rowStep: -1, columnStep: 0 },
  { direction: 'up-left', rowStep: -1, columnStep: -1 },
  { direction: 'down-left', rowStep: 1, columnStep: -1 },
]

const OPTIONAL_PHRASE_PARTS = new Set([
  'about', 'after', 'as', 'at', 'away', 'down', 'for', 'from', 'in', 'into', 'of',
  'off', 'on', 'out', 'over', 'to', 'up', 'with',
])

// Only reviewed, common learner misspellings belong here. No generative fallback:
// a page with no reviewed candidate simply contains fewer misspelling decoys.
const REVIEWED_MISSPELLINGS: Record<string, string> = {
  address: 'adress',
  beautiful: 'beatiful',
  because: 'becuase',
  beginning: 'begining',
  believe: 'beleive',
  business: 'buisness',
  comfortable: 'confortable',
  different: 'diffrent',
  environment: 'enviroment',
  exercise: 'excercise',
  experience: 'experiance',
  favourite: 'favourate',
  foreign: 'foriegn',
  friend: 'freind',
  government: 'goverment',
  information: 'infomation',
  interesting: 'intresting',
  knowledge: 'knowlege',
  language: 'langauge',
  library: 'libary',
  necessary: 'neccessary',
  people: 'poeple',
  really: 'realy',
  receive: 'recieve',
  remember: 'rember',
  restaurant: 'resturant',
  sentence: 'sentance',
  separate: 'seperate',
  special: 'speical',
  success: 'sucess',
  successful: 'sucessful',
  surprise: 'suprise',
  temperature: 'temperture',
  tomorrow: 'tommorow',
  usually: 'usualy',
  vegetable: 'vegtable',
  vocabulary: 'vocablary',
  writing: 'writting',
}

// These only reject occurrences that use at least one random-fill cell. A source
// word such as "class" may still contain one of these sequences without being
// censored or rewritten.
const UNSAFE_GRID_WORDS = [
  'anal', 'anus', 'ass', 'bastard', 'bitch', 'boob', 'cock', 'crap', 'cunt', 'dick',
  'dildo', 'dyke', 'fag', 'fuck', 'hentai', 'nazi', 'nigger', 'nude', 'penis', 'piss',
  'porn', 'rape', 'sex', 'shit', 'slut', 'sperm', 'spic', 'suicide', 'whore',
]

function hashSeed(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function createRandom(seed: string): () => number {
  let state = hashSeed(seed) || 0x6d2b79f5
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }
  return result
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

export function getVocabularyWordSearchAnswer(headword: string): string {
  const firstForm = normalizeSpaces(headword).split(/\s+\/\s+/u)[0]?.trim() ?? ''
  const withPhraseParts = firstForm.replace(/\(([^()]*)\)/gu, (_full, content: string) => {
    const normalized = content.trim().toLowerCase()
    return OPTIONAL_PHRASE_PARTS.has(normalized) ? ` ${content.trim()}` : ''
  })
  return normalizeSpaces(withPhraseParts.replace(/\s+([.,;:!?])/gu, '$1'))
}

export function getVocabularyWordSearchGridWord(answer: string): string {
  return [...answer].filter((character) => /[a-z]/iu.test(character)).join('')
}

function isPlainLowercaseWord(answer: string): boolean {
  return /^[a-z]+$/u.test(answer)
}

function canPlace(grid: Array<Array<string | null>>, word: string, candidate: PlacementCandidate): boolean {
  for (let index = 0; index < word.length; index += 1) {
    const row = candidate.row + candidate.rowStep * index
    const column = candidate.column + candidate.columnStep * index
    const current = grid[row]?.[column]
    if (current !== null && current !== word[index]) return false
  }
  return true
}

function placementCandidates(
  grid: Array<Array<string | null>>,
  word: string,
  random: () => number,
): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = []
  for (const vector of DIRECTIONS) {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const endRow = row + vector.rowStep * (word.length - 1)
        const endColumn = column + vector.columnStep * (word.length - 1)
        if (endRow < 0 || endRow >= GRID_SIZE || endColumn < 0 || endColumn >= GRID_SIZE) continue
        const candidate: PlacementCandidate = {
          ...vector,
          row,
          column,
          endRow,
          endColumn,
          overlap: 0,
          tieBreaker: random(),
        }
        if (!canPlace(grid, word, candidate)) continue
        for (let index = 0; index < word.length; index += 1) {
          const nextRow = row + vector.rowStep * index
          const nextColumn = column + vector.columnStep * index
          if (grid[nextRow][nextColumn] === word[index]) candidate.overlap += 1
        }
        candidates.push(candidate)
      }
    }
  }
  return candidates.sort((left, right) => right.overlap - left.overlap || left.tieBreaker - right.tieBreaker)
}

function placePendingWords(words: PendingWord[], seed: string): {
  grid: Array<Array<string | null>>
  placements: VocabularyWordSearchPlacement[]
} {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const random = createRandom(`${seed}:layout:${attempt}`)
    const grid = Array.from({ length: GRID_SIZE }, () => Array<string | null>(GRID_SIZE).fill(null))
    const placements: VocabularyWordSearchPlacement[] = []
    const ordered = [...words].sort((left, right) => right.gridWord.length - left.gridWord.length)
    let failed = false

    for (const word of ordered) {
      const candidates = placementCandidates(grid, word.gridWord, random)
      const candidate = candidates[0]
      if (!candidate) {
        failed = true
        break
      }
      for (let index = 0; index < word.gridWord.length; index += 1) {
        const row = candidate.row + candidate.rowStep * index
        const column = candidate.column + candidate.columnStep * index
        grid[row][column] = word.gridWord[index]
      }
      placements.push({
        id: word.id,
        entryId: word.entryId,
        kind: word.kind,
        answer: word.answer,
        gridWord: word.gridWord,
        row: candidate.row,
        column: candidate.column,
        endRow: candidate.endRow,
        endColumn: candidate.endColumn,
        direction: candidate.direction,
        ...(word.correction ? { correction: word.correction } : {}),
      })
    }

    if (!failed) return { grid, placements }
  }
  throw new Error('word_search_layout_failed')
}

type GridCell = [row: number, column: number]

function readGridLineCells(size: number): GridCell[][] {
  const lines: GridCell[][] = []
  for (let row = 0; row < size; row += 1) {
    lines.push(Array.from({ length: size }, (_, column) => [row, column]))
  }
  for (let column = 0; column < size; column += 1) {
    lines.push(Array.from({ length: size }, (_, row) => [row, column]))
  }
  for (let startColumn = 0; startColumn < size; startColumn += 1) {
    const downRight: GridCell[] = []
    const upRight: GridCell[] = []
    for (let offset = 0; startColumn + offset < size; offset += 1) {
      downRight.push([offset, startColumn + offset])
      upRight.push([size - 1 - offset, startColumn + offset])
    }
    lines.push(downRight, upRight)
  }
  for (let startRow = 1; startRow < size; startRow += 1) {
    const downRight: GridCell[] = []
    const upRight: GridCell[] = []
    for (let offset = 0; startRow + offset < size; offset += 1) {
      downRight.push([startRow + offset, offset])
      upRight.push([size - 1 - startRow - offset, offset])
    }
    lines.push(downRight, upRight)
  }
  return lines.flatMap((line) => [line, [...line].reverse()])
}

function readGridLines(grid: string[][]): string[] {
  return readGridLineCells(grid.length).map((cells) => (
    cells.map(([row, column]) => grid[row][column]).join('').toLowerCase()
  ))
}

export function findUnsafeVocabularyWordSearchWords(grid: string[][]): string[] {
  const lines = readGridLines(grid)
  return UNSAFE_GRID_WORDS.filter((word) => lines.some((line) => line.includes(word)))
}

function findUnsafeWordsCreatedByFill(
  grid: string[][],
  baseGrid: Array<Array<string | null>>,
): string[] {
  const lineCells = readGridLineCells(grid.length)
  return UNSAFE_GRID_WORDS.filter((word) => lineCells.some((cells) => {
    const line = cells.map(([row, column]) => grid[row][column]).join('').toLowerCase()
    let fromIndex = 0
    while (fromIndex <= line.length - word.length) {
      const matchIndex = line.indexOf(word, fromIndex)
      if (matchIndex < 0) return false
      const occurrenceCells = cells.slice(matchIndex, matchIndex + word.length)
      if (occurrenceCells.some(([row, column]) => baseGrid[row][column] === null)) return true
      fromIndex = matchIndex + 1
    }
    return false
  }))
}

export function findUnsafeVocabularyWordSearchWordsCreatedByFill(
  grid: string[][],
  placements: VocabularyWordSearchPlacement[],
): string[] {
  const baseGrid = Array.from({ length: grid.length }, () => Array<string | null>(grid.length).fill(null))
  for (const placement of placements) {
    const rowStep = Math.sign(placement.endRow - placement.row)
    const columnStep = Math.sign(placement.endColumn - placement.column)
    for (let index = 0; index < placement.gridWord.length; index += 1) {
      baseGrid[placement.row + rowStep * index][placement.column + columnStep * index] = placement.gridWord[index]
    }
  }
  return findUnsafeWordsCreatedByFill(grid, baseGrid)
}

function fillGridSafely(baseGrid: Array<Array<string | null>>, seed: string): string[][] {
  const alphabet = 'eeeeeeeeaaaaaaiiiiiooooonnnnrrrrttttllllssssddddgggbbccmmppffhhvvwwyykjxqz'
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const random = createRandom(`${seed}:fill:${attempt}`)
    const grid = baseGrid.map((row) => row.map((character) => (
      character ?? alphabet[Math.floor(random() * alphabet.length)]
    )))
    if (findUnsafeWordsCreatedByFill(grid, baseGrid).length === 0) return grid
  }
  throw new Error('word_search_safe_fill_failed')
}

export function findVocabularyWordSearchOccurrences(
  grid: string[][],
  word: string,
): Array<{ row: number; column: number; endRow: number; endColumn: number }> {
  const occurrences = new Map<string, { row: number; column: number; endRow: number; endColumn: number }>()
  for (const vector of READ_DIRECTIONS) {
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < grid.length; column += 1) {
        const endRow = row + vector.rowStep * (word.length - 1)
        const endColumn = column + vector.columnStep * (word.length - 1)
        if (endRow < 0 || endRow >= grid.length || endColumn < 0 || endColumn >= grid.length) continue
        const candidate = Array.from({ length: word.length }, (_, index) => (
          grid[row + vector.rowStep * index][column + vector.columnStep * index]
        )).join('')
        if (candidate !== word) continue
        const startKey = `${row}:${column}`
        const endKey = `${endRow}:${endColumn}`
        const key = startKey < endKey ? `${startKey}:${endKey}` : `${endKey}:${startKey}`
        if (!occurrences.has(key)) occurrences.set(key, { row, column, endRow, endColumn })
      }
    }
  }
  return [...occurrences.values()]
}

function hasUniqueTargetOccurrences(grid: string[][], placements: VocabularyWordSearchPlacement[]): boolean {
  return placements.filter((placement) => placement.kind === 'target').every((placement) => {
    const occurrences = findVocabularyWordSearchOccurrences(grid, placement.gridWord)
    return occurrences.length === 1
      && occurrences[0].row === placement.row
      && occurrences[0].column === placement.column
      && occurrences[0].endRow === placement.endRow
      && occurrences[0].endColumn === placement.endColumn
  })
}

function selectCorrectDecoys(
  targets: VocabularyWordSearchEntry[],
  pool: VocabularyWordSearchEntry[],
  seed: string,
): PendingWord[] {
  const targetIds = new Set(targets.map((entry) => entry.id))
  const targetMeanings = new Set(targets.map((entry) => normalizeSpaces(entry.teachingSense)))
  const targetWords = targets.map((entry) => getVocabularyWordSearchGridWord(getVocabularyWordSearchAnswer(entry.headword)).toLowerCase())
  const targetWordSet = new Set(targetWords)
  const candidates = pool.flatMap((entry) => {
    const answer = getVocabularyWordSearchAnswer(entry.headword)
    const gridWord = getVocabularyWordSearchGridWord(answer)
    if (
      targetIds.has(entry.id)
      || targetMeanings.has(normalizeSpaces(entry.teachingSense))
      || targetWordSet.has(gridWord.toLowerCase())
      || targetWords.some((targetWord) => targetWord.includes(gridWord.toLowerCase()) || gridWord.toLowerCase().includes(targetWord))
      || !isPlainLowercaseWord(answer)
      || gridWord.length < 4
      || gridWord.length > 12
    ) return []
    return [{
      id: `correct-decoy:${entry.id}`,
      entryId: entry.id,
      kind: 'correct-decoy' as const,
      answer,
      gridWord,
    }]
  })
  return shuffle(candidates, createRandom(`${seed}:correct-decoys`)).slice(0, CORRECT_DECOYS_PER_PAGE)
}

function selectMisspellingDecoys(targets: VocabularyWordSearchEntry[], seed: string): PendingWord[] {
  const targetWords = targets.map((entry) => getVocabularyWordSearchGridWord(getVocabularyWordSearchAnswer(entry.headword)).toLowerCase())
  const candidates = targets.flatMap((entry) => {
    const answer = getVocabularyWordSearchAnswer(entry.headword)
    if (!isPlainLowercaseWord(answer) || answer.length < 5) return []
    const incorrect = REVIEWED_MISSPELLINGS[answer]
    if (!incorrect) return []
    if (getVocabularyWordSearchGridWord(incorrect).length > GRID_SIZE) return []
    if (targetWords.some((targetWord) => targetWord !== answer && (
      targetWord.includes(incorrect) || incorrect.includes(targetWord)
    ))) return []
    return [{
      id: `misspelling-decoy:${entry.id}`,
      entryId: entry.id,
      kind: 'misspelling-decoy' as const,
      answer: incorrect,
      gridWord: incorrect,
      correction: answer,
    }]
  })
  return shuffle(candidates, createRandom(`${seed}:misspelling-decoys`)).slice(0, MISSPELLING_DECOYS_PER_PAGE)
}

function buildClues(
  targets: VocabularyWordSearchEntry[],
  pageIndex: number,
  searchableEntryIds: Set<string>,
): VocabularyWordSearchClue[] {
  const grouped = new Map<string, VocabularyWordSearchEntry[]>()
  for (const entry of targets) {
    const key = normalizeSpaces(entry.teachingSense)
    grouped.set(key, [...(grouped.get(key) ?? []), entry])
  }
  return targets.map((entry, entryIndex) => {
    const answer = getVocabularyWordSearchAnswer(entry.headword)
    const sameMeaning = grouped.get(normalizeSpaces(entry.teachingSense)) ?? []
    let ambiguityHint: string | null = null
    if (sameMeaning.length > 1) {
      const partsOfSpeech = new Set(sameMeaning.map((item) => normalizeSpaces(item.partOfSpeech)))
      if (partsOfSpeech.size > 1) {
        ambiguityHint = entry.partOfSpeech
      } else {
        const lengths = new Set(sameMeaning.map((item) => getVocabularyWordSearchGridWord(getVocabularyWordSearchAnswer(item.headword)).length))
        ambiguityHint = lengths.size > 1
          ? `${getVocabularyWordSearchGridWord(answer).length}字母`
          : `首字母 ${getVocabularyWordSearchGridWord(answer)[0] ?? ''}`
      }
    }
    const searchable = searchableEntryIds.has(entry.id)
    const hint = [searchable ? null : '直接写', ambiguityHint].filter(Boolean).join(' · ') || null
    return {
      entryId: entry.id,
      number: pageIndex * WORDS_PER_PAGE + entryIndex + 1,
      teachingSense: entry.teachingSense,
      hint,
      answer,
      searchable,
    }
  })
}

function buildPage(
  setId: string,
  pageIndex: number,
  targets: VocabularyWordSearchEntry[],
  excludedEntries: VocabularyWordSearchEntry[],
  pool: VocabularyWordSearchEntry[],
): VocabularyWordSearchPage {
  const seed = `vocabulary-word-search-v1:${setId}:${pageIndex}`
  const targetDrafts = targets.map((entry) => {
    const answer = getVocabularyWordSearchAnswer(entry.headword)
    const gridWord = getVocabularyWordSearchGridWord(answer)
    if (!gridWord) throw new Error(`word_search_target_invalid:${entry.id}`)
    return {
      id: `target:${entry.id}`,
      entryId: entry.id,
      kind: 'target' as const,
      answer,
      gridWord,
    }
  })
  const searchableEntryIds = new Set(targetDrafts.flatMap((target) => {
    if (target.gridWord.length < 3 || target.gridWord.length > GRID_SIZE) return []
    const sameWordCount = targetDrafts.filter((other) => other.gridWord === target.gridWord).length
    const containedByAnotherTarget = targetDrafts.some((other) => (
      other.id !== target.id
      && other.gridWord.length > target.gridWord.length
      && other.gridWord.toLowerCase().includes(target.gridWord.toLowerCase())
    ))
    return sameWordCount === 1 && !containedByAnotherTarget && target.entryId ? [target.entryId] : []
  }))
  const targetWords = targetDrafts.filter((target) => target.entryId && searchableEntryIds.has(target.entryId))
  if (targetWords.length === 0) {
    return {
      pageIndex,
      size: GRID_SIZE,
      grid: [],
      clues: buildClues(targets, pageIndex, searchableEntryIds),
      placements: [],
      correctDecoys: [],
      misspellingDecoys: [],
    }
  }
  const correctDecoys = selectCorrectDecoys(excludedEntries, pool, seed)
  const misspellingDecoys = selectMisspellingDecoys(targets, seed)
  const decoyPlans = [
    { correct: correctDecoys, misspelling: misspellingDecoys },
    { correct: correctDecoys, misspelling: [] },
    { correct: correctDecoys.slice(0, 1), misspelling: [] },
    { correct: [], misspelling: [] },
  ]
  for (let planIndex = 0; planIndex < decoyPlans.length; planIndex += 1) {
    const plan = decoyPlans[planIndex]
    for (let solutionAttempt = 0; solutionAttempt < 64; solutionAttempt += 1) {
      const solutionSeed = `${seed}:plan:${planIndex}:solution:${solutionAttempt}`
      let baseGrid: Array<Array<string | null>>
      let placements: VocabularyWordSearchPlacement[]
      let grid: string[][]
      try {
        const placed = placePendingWords(
          [...targetWords, ...plan.correct, ...plan.misspelling],
          solutionSeed,
        )
        baseGrid = placed.grid
        placements = placed.placements
        grid = fillGridSafely(baseGrid, solutionSeed)
      } catch {
        continue
      }
      if (!hasUniqueTargetOccurrences(grid, placements)) continue
      return {
        pageIndex,
        size: GRID_SIZE,
        grid,
        clues: buildClues(targets, pageIndex, searchableEntryIds),
        placements,
        correctDecoys: plan.correct.map((word) => word.answer),
        misspellingDecoys: plan.misspelling.map((word) => ({ incorrect: word.answer, correct: word.correction ?? '' })),
      }
    }
  }
  throw new Error('word_search_unique_solution_failed')
}

export function buildVocabularyWordSearchPages(
  setId: string,
  entries: VocabularyWordSearchEntry[],
  pool: VocabularyWordSearchEntry[],
): VocabularyWordSearchPage[] {
  const pages: VocabularyWordSearchPage[] = []
  for (let index = 0; index < entries.length; index += WORDS_PER_PAGE) {
    pages.push(buildPage(setId, pages.length, entries.slice(index, index + WORDS_PER_PAGE), entries, pool))
  }
  return pages
}

export const vocabularyWordSearchRules = {
  wordsPerPage: WORDS_PER_PAGE,
  gridSize: GRID_SIZE,
  correctDecoysPerPage: CORRECT_DECOYS_PER_PAGE,
  misspellingDecoysPerPage: MISSPELLING_DECOYS_PER_PAGE,
}
