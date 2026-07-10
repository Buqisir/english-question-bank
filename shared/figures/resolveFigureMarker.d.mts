/**
 * Type declarations for `shared/figures/resolveFigureMarker.mjs`.
 *
 * figure-render cut (fig-token P0). Types-only — DO NOT add value
 * declarations here. The runtime `.mjs` is the single source of truth.
 */

export type PaperFigureManifestEntry = {
  figureId: string
  groupId?: string
  kind?: string
  file: string
  caption?: string
  placeholderMarker: string
}

export type ResolveFigureMarkerResult =
  | { kind: 'figure'; figure: PaperFigureManifestEntry }
  | { kind: 'placeholder'; marker: string }
  | null

export function resolveFigureMarker(
  rawText: string,
  figures: ReadonlyArray<PaperFigureManifestEntry> | undefined,
): ResolveFigureMarkerResult

export const FIGURE_TOKEN_PATTERN: RegExp
