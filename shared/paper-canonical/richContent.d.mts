import type { CanonicalReadingSurfaceFigureBlock, CanonicalFigureTextRegion } from '../paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

export function resolveFigureTextRegion(
  reference: { figureId?: string; mediaId?: string; regionId: string; quote?: string },
  figures: ReadonlyArray<CanonicalReadingSurfaceFigureBlock>,
): CanonicalFigureTextRegion
