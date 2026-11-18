export type ListeningTopic = {
  theme: string
  themeGroup: string
  subtopic: string
}

export type ListeningSentence = {
  speaker: string
  en: string
  zh: string
  /** Seconds on the whole-paper playback recording. */
  start: number
  end: number
  repeatStart?: number
  evidence?: Array<{ question: number; kind: 'support' | 'trap' }>
}

export type ListeningMaterialAnalysis = {
  segmentId: string
  questionIds: string[]
  transcript: string
  translationZh: string
  topic: ListeningTopic
  summaryZh: string
  sentences?: ListeningSentence[]
}

export type ListeningQuestionAnalysis = {
  questionId: string
  segmentId: string
  stemTranslationZh: string
  optionTranslationsZh: Record<'A' | 'B' | 'C', string>
  officialAnswer: 'A' | 'B' | 'C'
  evidence: { quote: string }
  reasonZh: string
  distractors?: Array<{ label: 'A' | 'B' | 'C'; explanationZh: string }>
}

export type ListeningAnalysisV1 = {
  schemaVersion: 'listening-analysis-v1'
  paperId: string
  sourceAssetVersion: number
  materials: Record<string, ListeningMaterialAnalysis>
  questions: Record<string, ListeningQuestionAnalysis>
}
