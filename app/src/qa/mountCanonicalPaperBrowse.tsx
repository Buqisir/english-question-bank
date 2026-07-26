import { createRoot } from 'react-dom/client'
import { PaperBrowsePage } from '../features/paper-browse/PaperBrowsePage.tsx'
import '../index.css'

const search = new URLSearchParams(window.location.search)
const paperId = search.get('paperId') ?? ''

createRoot(document.getElementById('root')!).render(
  <PaperBrowsePage
    paperId={paperId}
    focusGroupId={search.get('focusGroupId') ?? undefined}
    questionId={search.get('questionId') ?? undefined}
    lecture={search.get('lecture') === '1'}
    questionGroupById={new Map()}
    onAddGroupsToBasket={() => {}}
    currentDraftPaperId={null}
    currentDraftGroupCount={0}
    onOpenDraftPaperWorkbench={() => {}}
    onBackToWorkbench={() => {}}
    shellNav={{ user: null, onLogout: () => {} }}
  />,
)
