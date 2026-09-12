export type LegacyApplicationReviewCard = {
  form: string
  topic: string
  reader: string
  person: string
  tense: string
  type: string
  points: [string, string]
  readerWho: string
  readerCares: string
  readerWants: string
  value: string
}

export type ApplicationReviewCardV2 = {
  schemaVersion: 'application-review-card-v2'
  form: string
  topic: string
  purpose: string
  person: string
  tense: string
  points: [string, ...string[]]
  reader: string
  relationship: string
  readerNeeds: string
  value: string
}

export type ApplicationReviewCard = LegacyApplicationReviewCard | ApplicationReviewCardV2

export type ApplicationReviewCardDisplay = {
  sourceVersion: 'legacy' | 'application-review-card-v2'
  form: string
  topicPurpose: string[]
  person: string
  tense: string
  points: string[]
  readerRelationship: string[]
  readerNeeds: string[]
  value: string
}

export declare const APPLICATION_REVIEW_CARD_V2: 'application-review-card-v2'
export declare function isLegacyApplicationReviewCard(value: unknown): value is LegacyApplicationReviewCard
export declare function isApplicationReviewCardV2(value: unknown): value is ApplicationReviewCardV2
export declare function isCompleteApplicationReviewCard(value: unknown): value is ApplicationReviewCard
export declare function projectApplicationReviewCardDisplay(value: unknown): ApplicationReviewCardDisplay | null
