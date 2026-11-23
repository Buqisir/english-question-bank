export type QuestionMarkRange = {
  start: number
  end: number
  quote: string
  annotation: { kind: string, questionIds?: string[], annotationId?: string }
}

export type QuestionMarkRun = {
  text: string
  start: number
  end: number
  answer: boolean
  clue: boolean
  before: string[]
  after: string[]
  annotationIds: string[]
  kinds: string[]
  questionNos: string[]
}

export function questionMarkRuns(
  text: string,
  ranges: QuestionMarkRange[],
  options?: { questionNo?: (questionId: string) => string | undefined, clues?: boolean, answersInText?: boolean },
): QuestionMarkRun[]

export function splitClueTail(text: string): [string, string, string]

export function quoteRanges(
  text: string,
  quotes: { quote: string, questionIds: string[] }[],
): QuestionMarkRange[]

export function rangesInPiece(text: string, ranges: QuestionMarkRange[], from: number, to: number): QuestionMarkRange[]
