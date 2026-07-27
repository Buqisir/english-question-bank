import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { WritingPaperPage } from '../features/paper-intelligence/WritingPaperPage'
import { PaperSurface } from '../shared-ui/papersurface/PaperSurface'

async function mount(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const groupId = params.get('groupId')
  if (!groupId) throw new Error('groupId is required')
  const response = await fetch(
    '/qa/canonical-continuation-writing-consumption.json',
  )
  if (!response.ok) {
    throw new Error(
      'canonical Continuation Writing QA consumption unavailable',
    )
  }
  const consumption = await response.json() as unknown
  const model = buildCanonicalContinuationWritingConsumptionSurfaceData({
    consumption,
    groupId,
  })
  const root = document.getElementById('root')
  if (!root) throw new Error('QA root is missing')
  createRoot(root).render(
    <StrictMode>
      <WritingPaperPage
        pageModel={model.pageModel}
        retainedModelAnswer={
          params.get('teacher') === '1'
            ? 'TEACHER SUPPLEMENT — not paper semantics'
            : undefined
        }
      >
        <PaperSurface
          textMap={model.surfaceData.textMap}
          annotations={[]}
          evidence={[]}
          questions={model.surfaceData.questions}
          canonicalContinuationMaterialBlocks={model.materialBlocks}
          mode="lecture"
          lectureFocus={null}
          readingFocusBySection={{}}
          onFocusIntent={() => {}}
        />
      </WritingPaperPage>
    </StrictMode>,
  )
}

void mount()
