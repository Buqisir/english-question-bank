import type { VocabularyHandwritingEntry } from './VocabularyHandwritingSelector'
import type { VocabularyHandwritingMode } from '../../services/vocabulary'

export const HANDWRITING_PRINT_ENTRIES_PER_PAGE = 7
export const HANDWRITING_SINGLE_ENTRIES_PER_PAGE = 10

function formatMeaning(entry: VocabularyHandwritingEntry) {
  const values = entry.teachingSenses?.length
    ? entry.teachingSenses
    : entry.sourceMeanings?.length
      ? entry.sourceMeanings
      : entry.teachingSense
        ? [entry.teachingSense]
        : []
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 2).join('；')
}

function HandwritingGuide({ word, tone, meaning }: {
  word?: string
  tone: 'black' | 'trace' | 'blank'
  meaning?: string
}) {
  return (
    <div className={`vocabulary-handwriting-guide is-${tone}`}>
      {meaning && <span className="vocabulary-handwriting-meaning">{meaning}</span>}
      <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
      {word && <strong>{word}</strong>}
    </div>
  )
}

export function VocabularyHandwritingPrint({
  title,
  pages,
  entryCount,
  mode = 'standard',
}: {
  title: string
  pages: Array<{ entries: VocabularyHandwritingEntry[]; title?: string }>
  entryCount: number
  mode?: VocabularyHandwritingMode
}) {
  return pages.map((page, pageIndex) => (
    <div className={`vocabulary-print-page vocabulary-handwriting-print-page is-${mode}`} key={`handwriting-page-${pageIndex + 1}`}>
      <header className="vocabulary-handwriting-print-header">
        <div>
          <h1>{page.title || title}</h1>
          <p>{mode === 'single' ? '衡水体练字纸 · 每词写 1 遍' : '衡水体练字纸 · 标准练习'}</p>
        </div>
        <div className="vocabulary-handwriting-print-meta">
          <span>姓名：</span><i />
          <span>日期：</span><i />
        </div>
      </header>
      <div className="vocabulary-handwriting-rows">
        {page.entries.map((entry) => {
          const letterCount = (entry.headword.match(/[A-Za-z]/gu) || []).length
          return (
            <section className="vocabulary-handwriting-row" key={entry.id}>
              <HandwritingGuide word={entry.headword} tone="black" meaning={formatMeaning(entry)} />
              {mode === 'standard' && <HandwritingGuide word={entry.headword} tone="trace" />}
              {mode === 'standard' && letterCount <= 8 && <HandwritingGuide word={entry.headword} tone="trace" />}
              <HandwritingGuide tone="blank" />
            </section>
          )
        })}
      </div>
      <footer className="vocabulary-handwriting-print-footer">
        <span><strong>{title}</strong> · 衡水体练字纸 · {mode === 'single' ? '每词写1遍 · ' : ''}{entryCount}词</span>
        <span>第 {pageIndex + 1} / {pages.length} 页</span>
      </footer>
    </div>
  ))
}
