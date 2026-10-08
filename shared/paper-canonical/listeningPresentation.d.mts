export type ListeningPresentationGroup = {
  readonly groupType: 'listening'
  readonly firstSectionPlayback?: 'once_explicit' | 'twice_default'
  readonly questions: ReadonlyArray<{ readonly questionId: string; readonly questionNo: number }>
  readonly segments: ReadonlyArray<{
    readonly segmentId: string
    readonly questionIds: ReadonlyArray<string>
  }>
}
export type ListeningPresentation = {
  readonly partHeading: string | null
  readonly transferNotice: string | null
  readonly sectionHeading: string
  readonly instruction: string
  readonly example: null | {
    readonly stem: string
    readonly options: ReadonlyArray<{ readonly label: string; readonly text: string }>
    readonly answer: string
  }
  readonly segmentCues: ReadonlyArray<{ readonly beforeQuestionId: string; readonly text: string }>
}
export const listeningOpening: {
  readonly title: string
  readonly notices: ReadonlyArray<string>
  readonly transferNotice: string
}
export function listeningSegmentCue(segment: ListeningPresentationGroup['segments'][number], ordinal: number, questions: ListeningPresentationGroup['questions']): string
export function projectListeningGroupPresentation(group: ListeningPresentationGroup): ListeningPresentation
export function ownsCompletePaperOpening(consumption: unknown, renderedGroupIds: ReadonlyArray<string>): boolean
export function mockPaperCoverName(sourceType: unknown, paperName: unknown): string | null
