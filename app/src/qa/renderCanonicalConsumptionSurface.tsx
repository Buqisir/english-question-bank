import { renderToStaticMarkup } from 'react-dom/server'

import { PaperSurface } from '../shared-ui/papersurface/PaperSurface.tsx'
import type {
  CanonicalPaperGroupSurfaceData,
} from '../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

export function renderCanonicalConsumptionSurface(
  surfaceData: CanonicalPaperGroupSurfaceData,
): string {
  return renderToStaticMarkup(
    <PaperSurface
      textMap={surfaceData.textMap}
      semanticParagraphs={surfaceData.semanticParagraphs}
      canonicalGrammarFillScreenRuling={surfaceData.grammarFillScreenRuling}
      annotations={[]}
      evidence={surfaceData.evidence}
      questions={[...surfaceData.questions]}
      mode="lecture"
      lectureFocus={null}
      readingFocusBySection={{}}
      onFocusIntent={() => {}}
    />,
  )
}
