export type ContinuationEvidenceSource =
  | 'instruction'
  | 'material'
  | 'paragraph1Starter'
  | 'paragraph2Starter'

export type ContinuationEvidenceRef = {
  source: ContinuationEvidenceSource
  excerpt: string
}

export type ContinuationGroundedStatement = {
  statement: string
  evidence: ContinuationEvidenceRef[]
}

export type ContinuationConstraint = ContinuationGroundedStatement & {
  id: string
}

export type ContinuationCharacter = {
  name: string
  role: string
  establishedTraits: ContinuationGroundedStatement[]
  motivations: ContinuationGroundedStatement[]
  currentState: ContinuationGroundedStatement
}

export type ContinuationRelationship = {
  participants: [string, string]
  currentRelation: ContinuationGroundedStatement
}

export type ContinuationCausalLink = {
  cause: ContinuationGroundedStatement
  effect: ContinuationGroundedStatement
}

export type ContinuationStoryUnderstanding = {
  centralSituation: ContinuationGroundedStatement
  sourceEndState: ContinuationGroundedStatement
  narrativePerspective: ContinuationGroundedStatement
  timeAndPlaceFrame: ContinuationGroundedStatement
  characters: ContinuationCharacter[]
  relationships: ContinuationRelationship[]
  causalChain: ContinuationCausalLink[]
  unresolvedProblem: ContinuationGroundedStatement
  usableClues: ContinuationGroundedStatement[]
  meaningDirection: {
    statement: string
    confidence: 'explicit' | 'stronglyInferred' | 'open'
    evidence: ContinuationEvidenceRef[]
  }
  sourceStyle: ContinuationGroundedStatement
}

export type ContinuationParagraphContract = {
  paragraphIndex: 1 | 2
  entryState: ContinuationGroundedStatement
  starterFunction: ContinuationGroundedStatement
  requiredMoves: ContinuationConstraint[]
  requiredExitState: ContinuationConstraint[]
  supportedOptions: ContinuationGroundedStatement[]
}

export type ContinuationContract = {
  hardConstraints: ContinuationConstraint[]
  softAffordances: ContinuationGroundedStatement[]
  openChoices: string[]
  forbiddenContradictions: ContinuationConstraint[]
  paragraphs: [ContinuationParagraphContract, ContinuationParagraphContract]
  closureRequirements: ContinuationConstraint[]
}

export type ContinuationEvent = {
  cause: string
  event: string
  immediateEffect: string
  evidence: ContinuationEvidenceRef[]
}

export type ContinuationEmotionLogic = {
  trigger: string
  internalResponse: string
  visibleAction: string
}

export type ContinuationRelationshipMovement = {
  participants: [string, string]
  from: string
  to: string
  cause: string
}

export type ContinuationInteractionMove = {
  speaker: string
  listener: string
  purpose: string
  relationshipNeed: string
  expectedEffect: string
  evidence: ContinuationEvidenceRef[]
}

export type ContinuationCluePayoff = {
  clue: ContinuationEvidenceRef
  payoff: string
}

export type ContinuationNarrativeDevelopment = {
  coreTension: ContinuationGroundedStatement
  drivingMotivations: ContinuationGroundedStatement[]
  requiredTurningPoints: ContinuationGroundedStatement[]
  eventChain: ContinuationEvent[]
  emotionLogic: ContinuationEmotionLogic[]
  relationshipMovement: ContinuationRelationshipMovement[]
  interactionMoves: ContinuationInteractionMove[]
  cluePayoffs: ContinuationCluePayoff[]
  endingState: string
}

export type ContinuationCohesionItem = {
  relation: 'sequence' | 'cause' | 'contrast' | 'reference' | 'echo'
  use: string
}

export type ContinuationLanguageAlignment = {
  personAndPerspective: string
  baseTense: string
  licensedTenseShifts: string[]
  narrativeDistanceAndRegister: string
  sourceStyleContinuity: string
  cohesionPlan: ContinuationCohesionItem[]
  dialoguePolicy: string
  descriptionPriorities: string[]
  functionLedLanguage: string[]
  languageRisks: string[]
}

export type ContinuationParagraphBlueprintItem = {
  paragraphIndex: 1 | 2
  narrativeFunction: string
  eventMoves: string[]
  characterActionsAndReactions: string[]
  evidenceToReuse: ContinuationEvidenceRef[]
  stateChange: string
  bridgeToNext: string
}

export type ContinuationParagraphBlueprint = {
  selectedRoute: string
  routeRationale: ContinuationGroundedStatement[]
  paragraphs: [ContinuationParagraphBlueprintItem, ContinuationParagraphBlueprintItem]
  finalEffect: string
  validAlternativeRoutes: string[]
  qualityRisks: string[]
}

export type ContinuationAnalysisV1 = {
  schemaVersion: 'continuation-analysis-v1'
  storyUnderstanding: ContinuationStoryUnderstanding
  continuationContract: ContinuationContract
  narrativeDevelopment: ContinuationNarrativeDevelopment
  languageAlignment: ContinuationLanguageAlignment
  paragraphBlueprint: ContinuationParagraphBlueprint
}

export function isNarrativeContinuationAnalysis(value: unknown): value is ContinuationAnalysisV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const analysis = value as Record<string, unknown>
  return (
    analysis.schemaVersion === 'continuation-analysis-v1'
    && Boolean(analysis.storyUnderstanding)
    && typeof analysis.storyUnderstanding === 'object'
    && Boolean(analysis.continuationContract)
    && typeof analysis.continuationContract === 'object'
    && Boolean(analysis.narrativeDevelopment)
    && typeof analysis.narrativeDevelopment === 'object'
    && Boolean(analysis.languageAlignment)
    && typeof analysis.languageAlignment === 'object'
    && Boolean(analysis.paragraphBlueprint)
    && typeof analysis.paragraphBlueprint === 'object'
  )
}

export function isNarrativeContinuationWritingAnalysis(value: unknown): value is {
  taskType: 'continuation'
  modelAnswer: string
  continuationAnalysis: ContinuationAnalysisV1
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const analysis = value as Record<string, unknown>
  return (
    analysis.taskType === 'continuation'
    && typeof analysis.modelAnswer === 'string'
    && analysis.modelAnswer.trim().length > 0
    && isNarrativeContinuationAnalysis(analysis.continuationAnalysis)
  )
}
