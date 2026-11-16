import { Plus, Trash } from '../icons'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Dialog } from '../shared-ui/Dialog.tsx'
import { SelectField, TextAreaField, TextField } from '../shared-ui/Field.tsx'
import { Notice } from '../shared-ui/Notice.tsx'
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
  const [entryMode, setEntryMode] = useState<'create' | 'edit'>(mode)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(initialDetail ? initialDetail.id : null)
  const [entryForm, setEntryForm] = useState<EntryForm>(() =>
    initialDetail ? createEntryFormFromDetail(initialDetail) : defaultEntryForm,
  )
  const [entryStatus, setEntryStatus] = useState<'idle' | 'saving' | 'saved' | 'invalid' | 'error'>('idle')
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
      setEntryStatus('invalid')
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

  // 构件厂 2026-11-14：换成共用 Dialog 的侧边抽屉（placement="side"）。原来的 <dialog class="entry-backdrop"> 和
  // 面板、标题行、底部动作搬进 shared-ui/Dialog.tsx；表单本身不动。标题上方的英文小字「Manual Entry」去掉了
  // （只是装饰，不是标题的一部分）。父组件（App.tsx）关上时就卸载这一块，所以没有退场过渡，入场有。
  const title = entryMode === 'edit' ? '编辑题组' : '录入题组'
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      placement="side"
      closeLabel="关闭录题面板"
      bodyClassName="entry-form"
      onSubmit={handleEntrySubmit}
      cancel={{ label: '取消' }}
      confirm={{
        // 保存中：键上的字不换、不变淡，用 Button busy（DESIGN.md §5 Waiting）。
        label: entryMode === 'edit' ? '保存修改' : '保存题组',
        busy: entryStatus === 'saving',
      }}
    >
      {/* 字段构件第二轮（2026-11-15）：22 个字段从全站旧的 .field 表单样式换成 shared-ui/Field 大号（36），字、必填、类型都没改。
          宽的那几格（.wide 占满两栏）把 wide 挂在字段外层。 */}
      <fieldset>
        <legend>来源</legend>
        <SelectField label="来源类型" size="lg"
          value={entryForm.sourceType}
          onChange={(event) => updateEntryField('sourceType', event.target.value as SourceType)}
        >
          <option value="real_exam">真题</option>
          <option value="mock_exam">模拟题</option>
          <option value="self_made">自建</option>
          <option value="other">其他</option>
        </SelectField>
        <TextField label="年份" size="lg"
          required
          type="number"
          value={entryForm.year}
          onChange={(event) => updateEntryField('year', event.target.value)}
        />
        <TextField label="地区" size="lg" required value={entryForm.region} onChange={(event) => updateEntryField('region', event.target.value)} />
        <TextField label="卷别/资料名" size="lg"
          required
          value={entryForm.paperName}
          onChange={(event) => updateEntryField('paperName', event.target.value)}
        />
        <TextField label="板块" size="lg" required value={entryForm.section} onChange={(event) => updateEntryField('section', event.target.value)} />
      </fieldset>

      <fieldset>
        <legend>篇章</legend>
        <TextField className="wide" label="篇章标题" size="lg"
          required
          value={entryForm.passageTitle}
          onChange={(event) => updateEntryField('passageTitle', event.target.value)}
        />
        <TextAreaField className="wide" label="摘要" size="lg"
          required
          rows={3}
          value={entryForm.summary}
          onChange={(event) => updateEntryField('summary', event.target.value)}
        />
        <TextField label="主题" size="lg" value={entryForm.theme} onChange={(event) => updateEntryField('theme', event.target.value)} />
        <TextField label="语篇类型" size="lg"
          value={entryForm.discourseType}
          onChange={(event) => updateEntryField('discourseType', event.target.value)}
        />
        <TextAreaField className="wide" label="原文/材料" size="lg"
          rows={5}
          value={entryForm.materialText}
          onChange={(event) => updateEntryField('materialText', event.target.value)}
        />
      </fieldset>

      <fieldset>
        <legend>题组</legend>
        <TextField className="wide" label="题组标题" size="lg"
          required
          value={entryForm.groupTitle}
          onChange={(event) => updateEntryField('groupTitle', event.target.value)}
        />
        <SelectField label="题组类型" size="lg"
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
        </SelectField>
        <TextField label="小题数量" size="lg"
          readOnly
          value={String(entryForm.questions.length)}
        />
        <TextField label="默认分值" size="lg"
          min="0"
          step="0.5"
          required
          type="number"
          value={entryForm.defaultScore}
          onChange={(event) => updateEntryField('defaultScore', event.target.value)}
        />
        <TextField className="wide" label="题组说明" size="lg"
          value={entryForm.instruction}
          onChange={(event) => updateEntryField('instruction', event.target.value)}
        />
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
              <TextField label="题号" size="lg"
                required
                value={question.questionNo}
                onChange={(event) => updateEntryQuestion(index, 'questionNo', event.target.value)}
              />
              <TextField label="小题题型" size="lg"
                value={question.questionType}
                onChange={(event) => updateEntryQuestion(index, 'questionType', event.target.value)}
              />
              <TextField label="答案" size="lg"
                value={question.answer}
                onChange={(event) => updateEntryQuestion(index, 'answer', event.target.value)}
              />
              <TextAreaField className="wide" label="题干" size="lg"
                required
                rows={3}
                value={question.stem}
                onChange={(event) => updateEntryQuestion(index, 'stem', event.target.value)}
              />
              <TextAreaField className="wide" label="选项" size="lg"
                rows={4}
                placeholder={'A. ...\\nB. ...\\nC. ...\\nD. ...'}
                value={question.optionsText}
                onChange={(event) => updateEntryQuestion(index, 'optionsText', event.target.value)}
              />
              <TextAreaField className="wide" label="解析" size="lg"
                rows={3}
                value={question.explanation}
                onChange={(event) => updateEntryQuestion(index, 'explanation', event.target.value)}
              />
            </div>
          </section>
        ))}
      </fieldset>

      <fieldset>
        <legend>标签</legend>
        <TextField className="wide" label="标签" size="lg"
          placeholder="用逗号分隔，如 真实生活，兴趣驱动"
          value={entryForm.tags}
          onChange={(event) => updateEntryField('tags', event.target.value)}
        />
      </fieldset>

      {/* 整张表的报错（界面收尾 2026-11-16）：不挂在哪个字段上，换成共用 Notice（DESIGN.md §5 Notices），字没改。
          只有服务器没收下（'error'）才上危险色，照 §5「没保存」；一道小题都没有（'invalid'）只是校验提示，
          框里填的东西都还在，用灰字（协调人 2026-11-16 复核时改）。
          原来的 <p class="form-error"> 没有 role，读屏不念；现在有错才挂，挂上就是 role="alert"，会被立刻念出来。 */}
      {(entryStatus === 'error' || entryStatus === 'invalid') && (
        <Notice kind="error" danger={entryStatus === 'error'}>{entryError}</Notice>
      )}
    </Dialog>
  )
}
