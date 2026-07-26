import { createRoot } from 'react-dom/client'
import { PaperBrowsePage } from '../features/paper-browse/PaperBrowsePage.tsx'
import '../index.css'

const paperId = new URLSearchParams(window.location.search).get('paperId') ?? ''

createRoot(document.getElementById('root')!).render(
  <PaperBrowsePage
    paperId={paperId}
    questionGroupById={new Map()}
    onAddGroupsToBasket={() => {}}
    currentDraftPaperId={null}
    currentDraftGroupCount={0}
    onOpenDraftPaperWorkbench={() => {}}
    onBackToWorkbench={() => {}}
    shellNav={{ user: null, onLogout: () => {} }}
  />,
)
