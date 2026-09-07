import { createRoot } from 'react-dom/client'
import type { GroupType, QuestionGroupDetail } from '../domain/questionBank.ts'
import { QuestionGroupDetailView } from '../features/question-detail/QuestionGroupDetailView.tsx'
import '../index.css'

const search = new URLSearchParams(window.location.search)
const paperId = search.get('paperId') ?? ''
const groupId = search.get('groupId') ?? ''
const rawGroupType = (search.get('rawGroupType') ?? 'reading') as GroupType
const rawMirror = search.get('rawMirror') ?? 'RAW_MIRROR'

// This deliberately conflicting caller detail is the public seam adversary:
// the preview paper must come only from the confirmed Canonical Consumption.
const selectedDetail = {
  id: groupId,
  title: `${rawMirror} raw title`,
  source: `${rawMirror} raw source`,
  sourceType: 'self_made',
  year: 2026,
  region: 'QA',
  paperName: `${rawMirror} raw paper`,
  section: `${rawMirror} raw section`,
  passageTitle: `${rawMirror} raw passage`,
  summary: `${rawMirror} raw summary`,
  groupType: rawGroupType,
  questionCount: 99,
  difficulty: 'medium',
  tags: [],
  topicLabels: [],
  hit: '',
  answerPreview: `${rawMirror} raw answer`,
  defaultScore: 1,
  hasPaperSurfaceAnalysis: false,
  paperSurfaceHref: `?view=paper-browse&paperId=${encodeURIComponent(paperId)}&groupId=${encodeURIComponent(groupId)}`,
  paperSurfaceLabel: null,
  canAddToDraftPaper: true,
  draftPaperButtonState: 'add',
  currentDraftPaperId: null,
  printUnavailableReason: null,
  canEdit: false,
  instruction: `${rawMirror} raw instruction`,
  note: `${rawMirror} raw note`,
  sourceDetail: {
    id: `${rawMirror}-source`,
    publisher: `${rawMirror} publisher`,
    originalUrl: '',
    fileRef: '',
    note: `${rawMirror} raw source note`,
  },
  passage: {
    id: `${rawMirror}-passage`,
    title: `${rawMirror} raw passage title`,
    materialText: `${rawMirror} raw passage body`,
    summary: `${rawMirror} raw passage summary`,
    theme: `${rawMirror} raw theme`,
    discourseType: `${rawMirror} raw discourse`,
    wordCount: 999,
    note: `${rawMirror} raw passage note`,
  },
  questions: [{
    id: `${rawMirror}-question`,
    questionNo: '99',
    questionType: `${rawMirror} raw question type`,
    stem: `${rawMirror} raw question stem`,
    answer: `${rawMirror} raw answer`,
    explanation: `${rawMirror} raw explanation`,
    difficulty: 'medium',
    score: 1,
    displayOrder: 1,
    note: `${rawMirror} raw question note`,
    options: [],
  }],
} satisfies QuestionGroupDetail

createRoot(document.getElementById('root')!).render(
  <QuestionGroupDetailView
    isOwnerView={false}
    detail={{ selectedDetail, detailStatus: 'loaded', detailError: '' }}
    readingParse={{ result: null }}
    onBack={() => {}}
    onEdit={() => {}}
    onDelete={() => {}}
    onAddToBasket={() => {}}
    onOpenPaperBrowse={() => {}}
    onOpenPaperBrowseLecture={() => {}}
    questionGroupById={new Map()}
    onAddSimilarToBasket={() => {}}
  />,
)
