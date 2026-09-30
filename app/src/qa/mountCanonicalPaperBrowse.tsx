import { createRoot } from 'react-dom/client'
import { PaperBrowsePage } from '../features/paper-browse/PaperBrowsePage.tsx'
import '../index.css'

const search = new URLSearchParams(window.location.search)
const paperId = search.get('paperId') ?? ''

createRoot(document.getElementById('root')!).render(
  <PaperBrowsePage
    paperId={paperId}
    personalAccountKey={search.get('personalAccount') ?? undefined}
    reviewRevision={search.get('reviewRevision') ?? undefined}
    focusGroupId={search.get('focusGroupId') ?? undefined}
    questionId={search.get('questionId') ?? undefined}
    lecture={search.get('lecture') === '1'}
    sevenChoicesBankHeading={
      search.get('sevenChoicesBankHeading') === 'present'
        ? 'A-G 选项'
        : undefined
    }
    grammarFillGeometryVariantId={
      search.get('grammarFillGeometryVariant') ?? undefined
    }
    questionGroupById={new Map()}
    onAddGroupsToBasket={() => {}}
    currentDraftPaperId={null}
    currentDraftGroupCount={0}
    onOpenDraftPaperWorkbench={() => {}}
    onBackToWorkbench={() => {}}
    shellNav={{ user: null, onLogout: () => {} }}
  />,
)
