import { Plus, Trash, X } from '../icons'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useModalDialog } from '../components/useModalDialog'
import {
  type CreateQuestionGroupInput,
  type Difficulty,
  type GroupType,
  type QuestionGroupCard,
  type QuestionGroupDetail,
  type SourceType,
} from '../domain/questionBank'
import { createQuestionGroup, updateQuestionGroup } from '../services/questionGroups'
import { nextQuestionNumber } from './entryQuestionHelpers'

type EntryForm = {
  sourceType: SourceType
  year: string
  region: string
  paperName: string
  section: string
  passageTitle: string
  materialText: string
  summary: string
  theme: string
  discourseType: string
  groupTitle: string
  groupType: GroupType
  instruction: string
  difficulty: Difficulty
  defaultScore: string
  questions: EntryQuestionForm[]
  tags: string
}

type EntryQuestionForm = {
  questionNo: string
  questionType: string
  stem: string
  optionsText: string
  answer: string
  explanation: string
}

function createEntryQuestion(questionNo: string): EntryQuestionForm {
  return {
    questionNo,
    questionType: '待分类',
    stem: '',
    optionsText: '',
    answer: '',
    explanation: '',
  }
}

const defaultEntryForm: EntryForm = {
  sourceType: 'self_made',
  year: '2026',
  region: '校本',
  paperName: '课堂训练',
  section: '阅读理解 B',
  passageTitle: '',
  materialText: '',
  summary: '',
  theme: '',
  discourseType: '',
  groupTitle: '',
  groupType: 'reading',
  instruction: 'Read the passage and answer the questions.',
  difficulty: 'medium',
  defaultScore: '2.5',
  questions: [createEntryQuestion('1')],
  tags: '',
}

function parseOptionText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^([A-Ha-h])[\s.．、)）:：-]+(.+)$/)

      return {
        label: match ? match[1].toUpperCase() : String.fromCharCode(65 + index),
        content: match ? match[2].trim() : line,
      }
    })
    .filter((option) => option.content)
}

function formatOptionsText(question: QuestionGroupDetail['questions'][number]) {
  return question.options.map((option) => `${option.label}. ${option.content}`).join('\n')
}

function createEntryFormFromDetail(detail: QuestionGroupDetail): EntryForm {
  return {
    sourceType: detail.sourceType,
    year: String(detail.year),
    region: detail.region,
    paperName: detail.paperName,
    section: detail.section,
    passageTitle: detail.passage.title,
    materialText: detail.passage.materialText,
    summary: detail.summary,
    theme: detail.passage.theme,
    discourseType: detail.passage.discourseType,
    groupTitle: detail.title,
    groupType: detail.groupType,
    instruction: detail.instruction,
    difficulty: detail.difficulty,
    defaultScore: String(detail.defaultScore),
    questions:
      detail.questions.length > 0
        ? detail.questions.map((question) => ({
            questionNo: question.questionNo,
            questionType: question.questionType,
            stem: question.stem,
            optionsText: formatOptionsText(question),
            answer: question.answer,
            explanation: question.explanation,
          }))
        : [createEntryQuestion('1')],
    tags: detail.tags.join(', '),
  }
}

export type EntryModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialDetail: QuestionGroupDetail | null
  onClose: () => void
  onSaved: (savedCard: QuestionGroupCard, context: { mode: 'create' | 'edit' }) => void | Promise<void>
}

export function EntryModal({ open, mode, initialDetail, onClose, onSaved }: EntryModalProps) {
  const dialogRef = useModalDialog(open)
  const [entryMode, setEntryMode] = useState<'create' | 'edit'>(mode)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(initialDetail ? initialDetail.id : null)
  const [entryForm, setEntryForm] = useState<EntryForm>(() =>
    initialDetail ? createEntryFormFromDetail(initialDetail) : defaultEntryForm,
  )
  const [entryStatus, setEntryStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [entryError, setEntryError] = useState('')

  function updateEntryField<K extends keyof EntryForm>(field: K, value: EntryForm[K]) {
    setEntryForm((form) => ({ ...form, [field]: value }))
  }

  function updateEntryQuestion<K extends keyof EntryQuestionForm>(index: number, field: K, value: EntryQuestionForm[K]) {
    setEntryForm((form) => ({
      ...form,
      questions: form.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      ),
    }))
  }

  function addEntryQuestion() {
    setEntryForm((form) => {
      const lastQuestion = form.questions[form.questions.length - 1]
      const nextQuestion = createEntryQuestion(nextQuestionNumber(form.questions))

      return {
        ...form,
        questions: [
          ...form.questions,
          {
            ...nextQuestion,
            questionType: lastQuestion?.questionType || nextQuestion.questionType,
          },
        ],
      }
    })
  }

  function removeEntryQuestion(index: number) {
    setEntryForm((form) => {
      if (form.questions.length <= 1) return form
      return {
        ...form,
        questions: form.questions.filter((_, questionIndex) => questionIndex !== index),
      }
    })
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEntryStatus('saving')
    setEntryError('')

    const questions = entryForm.questions
      .map((question) => ({
        questionNo: question.questionNo.trim(),
        questionType: question.questionType.trim() || '待分类',
        stem: question.stem.trim(),
        answer: question.answer.trim(),
        explanation: question.explanation.trim(),
        options: parseOptionText(question.optionsText),
      }))
      .filter((question) => question.stem)
    const firstQuestion = questions[0]

    if (!firstQuestion) {
      setEntryStatus('error')
      setEntryError('至少需要录入一道小题。')
      return
    }

    const input: CreateQuestionGroupInput = {
      ...entryForm,
      defaultScore: Number(entryForm.defaultScore),
      questionCount: questions.length,
      questionType: firstQuestion.questionType,
      questionStem: firstQuestion.stem,
      answer: firstQuestion.answer,
      explanation: firstQuestion.explanation,
      questions,
      tags: entryForm.tags
        .split(/[,，、\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      year: Number(entryForm.year),
    }

    try {
      const saved =
        entryMode === 'edit' && editingGroupId
          ? await updateQuestionGroup(editingGroupId, input)
          : await createQuestionGroup(input)
      await onSaved(saved, { mode: entryMode })
      setEntryStatus('saved')
      setEntryForm(defaultEntryForm)
      setEntryMode('create')
      setEditingGroupId(null)
    } catch (error) {
      setEntryStatus('error')
      setEntryError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="entry-backdrop"
      aria-label={entryMode === 'edit' ? '编辑题组' : '录入题组'}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <section className="entry-panel">
        <div className="entry-header">
          <div>
            <p className="eyebrow">Manual Entry</p>
            <h2>{entryMode === 'edit' ? '编辑题组' : '录入题组'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭录题面板">
            <X size={20} />
          </button>
        </div>

        <form className="entry-form" onSubmit={handleEntrySubmit}>
          <fieldset>
            <legend>来源</legend>
            <label className="field">
              <span>来源类型</span>
              <select
                value={entryForm.sourceType}
                onChange={(event) => updateEntryField('sourceType', event.target.value as SourceType)}
              >
                <option value="real_exam">真题</option>
                <option value="mock_exam">模拟题</option>
                <option value="self_made">自建</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="field">
              <span>年份</span>
              <input
                required
                type="number"
                value={entryForm.year}
                onChange={(event) => updateEntryField('year', event.target.value)}
              />
            </label>
            <label className="field">
              <span>地区</span>
              <input required value={entryForm.region} onChange={(event) => updateEntryField('region', event.target.value)} />
            </label>
            <label className="field">
              <span>卷别/资料名</span>
              <input
                required
                value={entryForm.paperName}
                onChange={(event) => updateEntryField('paperName', event.target.value)}
              />
            </label>
            <label className="field">
              <span>板块</span>
              <input required value={entryForm.section} onChange={(event) => updateEntryField('section', event.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>篇章</legend>
            <label className="field wide">
              <span>篇章标题</span>
              <input
                required
                value={entryForm.passageTitle}
                onChange={(event) => updateEntryField('passageTitle', event.target.value)}
              />
            </label>
            <label className="field wide">
              <span>摘要</span>
              <textarea
                required
                rows={3}
                value={entryForm.summary}
                onChange={(event) => updateEntryField('summary', event.target.value)}
              />
            </label>
            <label className="field">
              <span>主题</span>
              <input value={entryForm.theme} onChange={(event) => updateEntryField('theme', event.target.value)} />
            </label>
            <label className="field">
              <span>语篇类型</span>
              <input
                value={entryForm.discourseType}
                onChange={(event) => updateEntryField('discourseType', event.target.value)}
              />
            </label>
            <label className="field wide">
              <span>原文/材料</span>
              <textarea
                rows={5}
                value={entryForm.materialText}
                onChange={(event) => updateEntryField('materialText', event.target.value)}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>题组</legend>
            <label className="field wide">
              <span>题组标题</span>
              <input
                required
                value={entryForm.groupTitle}
                onChange={(event) => updateEntryField('groupTitle', event.target.value)}
              />
            </label>
            <label className="field">
              <span>题组类型</span>
              <select
                value={entryForm.groupType}
                onChange={(event) => updateEntryField('groupType', event.target.value as GroupType)}
              >
                <option value="reading">阅读理解</option>
                <option value="cloze">完形填空</option>
                <option value="seven_choices">七选五</option>
                <option value="grammar_cloze">语法填空</option>
                <option value="writing">写作</option>
                <option value="continuation">读后续写</option>
                <option value="listening">听力</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="field">
              <span>小题数量</span>
              <input
                readOnly
                value={String(entryForm.questions.length)}
              />
            </label>
            <label className="field">
              <span>默认分值</span>
              <input
                min="0"
                step="0.5"
                required
                type="number"
                value={entryForm.defaultScore}
                onChange={(event) => updateEntryField('defaultScore', event.target.value)}
              />
            </label>
            <label className="field wide">
              <span>题组说明</span>
              <input
                value={entryForm.instruction}
                onChange={(event) => updateEntryField('instruction', event.target.value)}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>小题</legend>
            <div className="question-entry-toolbar wide">
              <div>
                <strong>{entryForm.questions.length} 道小题</strong>
                <span>选项按行录入，如 A. ... / B. ...；非选择题可留空。</span>
              </div>
              <button className="detail-button" type="button" onClick={addEntryQuestion}>
                <Plus size={16} />
                添加小题
              </button>
            </div>

            {entryForm.questions.map((question, index) => (
              <section className="entry-question-card wide" key={index} aria-label={`小题 ${index + 1}`}>
                <div className="entry-question-title">
                  <strong>小题 {index + 1}</strong>
                  <button
                    className="icon-button"
                    disabled={entryForm.questions.length <= 1}
                    type="button"
                    onClick={() => removeEntryQuestion(index)}
                    aria-label={`删除小题 ${index + 1}`}
                  >
                    <Trash size={16} />
                  </button>
                </div>

                <div className="entry-question-grid">
                  <label className="field">
                    <span>题号</span>
                    <input
                      required
                      value={question.questionNo}
                      onChange={(event) => updateEntryQuestion(index, 'questionNo', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>小题题型</span>
                    <input
                      value={question.questionType}
                      onChange={(event) => updateEntryQuestion(index, 'questionType', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>答案</span>
                    <input
                      value={question.answer}
                      onChange={(event) => updateEntryQuestion(index, 'answer', event.target.value)}
                    />
                  </label>
                  <label className="field wide">
                    <span>题干</span>
                    <textarea
                      required
                      rows={3}
                      value={question.stem}
                      onChange={(event) => updateEntryQuestion(index, 'stem', event.target.value)}
                    />
                  </label>
                  <label className="field wide">
                    <span>选项</span>
                    <textarea
                      rows={4}
                      placeholder={'A. ...\\nB. ...\\nC. ...\\nD. ...'}
                      value={question.optionsText}
                      onChange={(event) => updateEntryQuestion(index, 'optionsText', event.target.value)}
                    />
                  </label>
                  <label className="field wide">
                    <span>解析</span>
                    <textarea
                      rows={3}
                      value={question.explanation}
                      onChange={(event) => updateEntryQuestion(index, 'explanation', event.target.value)}
                    />
                  </label>
                </div>
              </section>
            ))}
          </fieldset>

          <fieldset>
            <legend>标签</legend>
            <label className="field wide">
              <span>标签</span>
              <input
                placeholder="用逗号分隔，如 真实生活，兴趣驱动"
                value={entryForm.tags}
                onChange={(event) => updateEntryField('tags', event.target.value)}
              />
            </label>
          </fieldset>

          {entryStatus === 'error' && <p className="form-error">{entryError}</p>}

          <div className="entry-footer">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={entryStatus === 'saving'}>
              {entryStatus === 'saving' ? '保存中' : entryMode === 'edit' ? '保存修改' : '保存题组'}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  )
}
