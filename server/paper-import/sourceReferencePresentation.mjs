import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { SOURCE_REFERENCE_IMAGE_DPI } from './sourceReferenceImages.mjs'

// Both answer entry points have already validated the same frozen raster.
export function sourceReferenceFigurePresentation(entry, paragraphId, namespace) {
  return (entry.figures ?? []).filter(figure => figure.afterParagraphId === paragraphId)
    .map(figure => sourceReferenceFigureItemPresentation(entry, figure, namespace))
}

export function sourceReferenceFigureItemPresentation(entry, figure, namespace) {
  return {
    figureId: figure.figureId,
    domId: `reference-figure-${digestJson([namespace, entry.referenceId, figure.figureId]).slice(7)}`,
    dataUrl: `data:image/png;base64,${figure.raster.base64}`,
    widthMm: figure.raster.pixelWidth / SOURCE_REFERENCE_IMAGE_DPI * 25.4,
    heightMm: figure.raster.pixelHeight / SOURCE_REFERENCE_IMAGE_DPI * 25.4,
  }
}
