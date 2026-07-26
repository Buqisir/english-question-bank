export type CanonicalInlineTextNode = {
  readonly kind: 'text'
  readonly nodeId: string
  readonly text: string
}

export type AbcdOption<Label extends 'A' | 'B' | 'C' | 'D'> = {
  readonly optionId: string
  readonly label: Label
  readonly content: readonly CanonicalInlineTextNode[]
}

export type AbcdOptionSet = {
  readonly owner: 'question'
  readonly questionId?: string
  readonly options: readonly [
    AbcdOption<'A'>,
    AbcdOption<'B'>,
    AbcdOption<'C'>,
    AbcdOption<'D'>,
  ]
}

export type AbcdPlacement = {
  readonly optionId: string
  readonly label: 'A' | 'B' | 'C' | 'D'
  readonly row: number
  readonly column: number
  readonly startTwip: number
  readonly continuationStartTwip: number | null
  readonly hardBreaks: number
  readonly advanceTwip: number
  readonly unbreakableAdvanceTwip: number
  readonly renderedText: string
}

export type SelectedAbcdLayoutPlan = {
  readonly status: 'selected'
  readonly mode: 'four_columns' | 'two_by_two' | 'one_column'
  readonly rowCount: 1 | 2 | 4
  readonly columnCount: 1 | 2 | 4
  readonly rulesetRef: {
    readonly id: string
    readonly digest: string
    readonly shapingImplementationDigest: string
    readonly fontMetricsDigest: string
  }
  readonly rowWidthTwip: number
  readonly placements: readonly AbcdPlacement[]
}

export type AbcdLayoutResult =
  | SelectedAbcdLayoutPlan
  | {
      readonly status: 'not_applicable'
      readonly reason: 'selector_requires_one_question_owned_A_B_C_D_set'
    }
  | {
      readonly status: 'needs_review'
      readonly reason: 'one_column_contains_unrenderable_unbreakable_content'
    }

export type AbcdRendererFontClosure = {
  readonly primary: {
    readonly fontFaceId: string
    readonly fontFileSha256: string
    readonly fontVersion: string
  }
  readonly fallbacks: readonly {
    readonly fontFaceId: string
    readonly characters: string
    readonly fontFileSha256: string
    readonly fontVersion: string
  }[]
  readonly fontMetricsDigest: string
  readonly shapingImplementationDigest: string
}

export type VerifiedAbcdRendererFontClosure = AbcdRendererFontClosure
export type AbcdRendererFontMaterial = {
  readonly primary: {
    readonly fontFaceId: string
    readonly fontVersion: string
    readonly fontBytes: Uint8Array
  }
  readonly fallbacks: readonly {
    readonly fontFaceId: string
    readonly characters: string
    readonly fontVersion: string
    readonly fontBytes: Uint8Array
  }[]
  readonly fontMetricsDigest: string
  readonly shapingImplementationDigest: string
}

export function layoutAbcdOptionSet(optionSet: AbcdOptionSet): AbcdLayoutResult
export const expectedAbcdRendererFontClosure: AbcdRendererFontClosure
export function resolveAbcdRendererFontClosure(
  candidate: AbcdRendererFontMaterial,
):
  | { readonly status: 'ready'; readonly closure: VerifiedAbcdRendererFontClosure }
  | {
      readonly status: 'needs_review'
      readonly reason: 'pinned_renderer_font_closure_unavailable'
    }
export function translateAbcdPlanToPaperSurface(
  plan: SelectedAbcdLayoutPlan,
  fontClosure: VerifiedAbcdRendererFontClosure,
): object
export function translateAbcdPlanToPrintPdf(
  plan: SelectedAbcdLayoutPlan,
  fontClosure: VerifiedAbcdRendererFontClosure,
): object
export function translateAbcdPlanToDocx(
  plan: SelectedAbcdLayoutPlan,
  fontClosure: VerifiedAbcdRendererFontClosure,
): object
export const abcdLayoutRules: Readonly<Record<string, string | number>>
