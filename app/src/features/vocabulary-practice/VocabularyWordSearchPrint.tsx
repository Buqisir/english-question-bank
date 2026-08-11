import type { VocabularyWordSearchPage } from './vocabularyWordSearch'
import './vocabularyWordSearchPrint.css'

type VocabularyWordSearchPrintProps = {
  title: string
  entryCount: number
  pages: VocabularyWordSearchPage[]
}

function WordSearchGrid({ page, answer }: { page: VocabularyWordSearchPage; answer: boolean }) {
  const targetPlacements = page.placements.filter((placement) => placement.kind === 'target')
  return (
    <div className={`vocabulary-word-search-grid${answer ? ' is-answer' : ''}`} aria-label={answer ? '已标出答案的词阵' : '找词字母阵'}>
      {answer && (
        <svg viewBox={`0 0 ${page.size} ${page.size}`} preserveAspectRatio="none" aria-hidden="true">
          {targetPlacements.map((placement) => (
            <line
              key={placement.id}
              x1={placement.column + 0.5}
              y1={placement.row + 0.5}
              x2={placement.endColumn + 0.5}
              y2={placement.endRow + 0.5}
            />
          ))}
        </svg>
      )}
      {page.grid.flatMap((row, rowIndex) => row.map((letter, columnIndex) => (
        <span key={`${rowIndex}-${columnIndex}`}>{letter}</span>
      )))}
    </div>
  )
}

function WordSearchClues({ page, answer }: { page: VocabularyWordSearchPage; answer: boolean }) {
  const leftCount = Math.ceil(page.clues.length / 2)
  const columns = [page.clues.slice(0, leftCount), page.clues.slice(leftCount)]
  return (
    <div className={`vocabulary-word-search-clues${answer ? ' is-answer' : ''}`}>
      {columns.map((clues, columnIndex) => (
        <ol key={`clue-column-${columnIndex + 1}`} start={clues[0]?.number}>
          {clues.map((clue) => (
            <li key={clue.entryId}>
              <span>{clue.number}</span>
              <p>
                <strong>{clue.teachingSense}</strong>
                {clue.hint && <small>{clue.hint}</small>}
              </p>
              <i aria-hidden="true">
                {answer && <b>{clue.answer}</b>}
              </i>
            </li>
          ))}
        </ol>
      ))}
    </div>
  )
}

function AnswerNotes({ page }: { page: VocabularyWordSearchPage }) {
  return (
    <aside className="vocabulary-word-search-answer-notes">
      <span>
        <strong>额外正确词</strong>
        {page.correctDecoys.length ? page.correctDecoys.join('、') : '本页无'}
      </span>
      <span>
        <strong>相近错词</strong>
        {page.misspellingDecoys.length
          ? page.misspellingDecoys.map((item) => `${item.incorrect} → ${item.correct}`).join('；')
          : '本页无'}
      </span>
    </aside>
  )
}

function WordSearchPage({
  page,
  title,
  entryCount,
  answer,
  documentPageNumber,
  documentPageCount,
}: {
  page: VocabularyWordSearchPage
  title: string
  entryCount: number
  answer: boolean
  documentPageNumber: number
  documentPageCount: number
}) {
  const hasSearchableTargets = page.clues.some((clue) => clue.searchable)
  return (
    <div className={`vocabulary-print-page vocabulary-word-search-print-page${answer ? ' is-answer' : ''}`}>
      <header className="vocabulary-word-search-header">
        <div>
          <h1>{title}</h1>
          <p>{answer ? '圈词与拼写 · 教师答案' : '圈词与拼写'}</p>
        </div>
        <span>第 {page.pageIndex + 1} 组 · {page.clues.length}词</span>
      </header>

      {answer ? (
        <p className="vocabulary-word-search-instruction">
          {hasSearchableTargets
            ? '可圈出的目标词已在词阵中标出；标有“直接写”的词只核对横线答案。额外正确词和相近错词只作干扰。'
            : '本页词语均为“直接写”；教师答案已写在横线上。'}
        </p>
      ) : (
        <>
          <p className="vocabulary-word-search-instruction">
            {hasSearchableTargets
              ? '根据中文意思，在词阵中圈出英文，再把正确拼写写在横线上。词语可能横向、纵向或斜向出现；标有“直接写”的词无需圈出。'
              : '根据中文意思，把英文写在横线上。本页词语均标为“直接写”，不设词阵。'}
          </p>
          <div className="vocabulary-word-search-meta"><span>姓名：</span><i /><span>日期：</span><i /></div>
        </>
      )}

      <WordSearchClues page={page} answer={answer} />
      {answer && hasSearchableTargets && <AnswerNotes page={page} />}
      {hasSearchableTargets ? (
        <WordSearchGrid page={page} answer={answer} />
      ) : (
        <div className="vocabulary-word-search-direct-only">
          <strong>{answer ? '本页答案已列出' : '直接完成拼写'}</strong>
          <span>{answer ? '无需在词阵中核对。' : '请在上方横线上写出对应英文。'}</span>
        </div>
      )}

      <footer className="vocabulary-word-search-footer">
        <span><strong>{title}</strong> · 共{entryCount}词</span>
        <span>第 {documentPageNumber} / {documentPageCount} 页</span>
      </footer>
    </div>
  )
}

export function VocabularyWordSearchPrint({ title, entryCount, pages }: VocabularyWordSearchPrintProps) {
  const documentPageCount = pages.length * 2
  return (
    <>
      {pages.map((page, pageIndex) => (
        <WordSearchPage
          key={`word-search-student-${page.pageIndex}`}
          page={page}
          title={title}
          entryCount={entryCount}
          answer={false}
          documentPageNumber={pageIndex + 1}
          documentPageCount={documentPageCount}
        />
      ))}
      {pages.map((page, pageIndex) => (
        <WordSearchPage
          key={`word-search-answer-${page.pageIndex}`}
          page={page}
          title={title}
          entryCount={entryCount}
          answer
          documentPageNumber={pages.length + pageIndex + 1}
          documentPageCount={documentPageCount}
        />
      ))}
    </>
  )
}
