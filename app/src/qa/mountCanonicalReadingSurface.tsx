import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { PaperSurface } from '../shared-ui/papersurface/PaperSurface'
import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

async function mount(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const groupId = params.get('groupId')
  const fixture = params.get('fixture')
  const invalidCompanion = params.get('invalidCompanion')
  if (!groupId) throw new Error('groupId is required')
  if (fixture !== null && fixture !== 'q33-source-crop') {
    throw new Error('unsupported Canonical Reading QA fixture')
  }
  const consumptionPath = fixture === 'q33-source-crop'
    ? '/qa/paper-mock-sz-2026-m1-q33-screen-consumption.json'
    : '/qa/canonical-reading-consumption.json'
  const response = await fetch(consumptionPath)
  if (!response.ok) throw new Error('canonical Reading QA consumption unavailable')
  const consumption = await response.json() as unknown
  const model = buildCanonicalReadingConsumptionSurfaceData({
    consumption,
    groupId,
  })
  const root = document.getElementById('root')
  if (!root) throw new Error('QA root is missing')
  createRoot(root).render(
    <StrictMode>
      <PaperSurface
        textMap={model.surfaceData.textMap}
        annotations={[]}
        evidence={[]}
        questions={model.surfaceData.questions}
        canonicalReadingBlocks={model.richBlocks}
        canonicalReadingPassageLetter={
          invalidCompanion === 'missing-letter'
            ? undefined
            : model.passageLetter
        }
        canonicalReadingSemanticSignature={model.semanticDigest}
        mode="lecture"
        lectureFocus={null}
        readingFocusBySection={{}}
        onFocusIntent={() => {}}
      />
    </StrictMode>,
  )
}

void mount()
