import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Fragment, Slice } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import {
  PERSONAL_TEXT_STARTER_KIT_OPTIONS,
  validatePersonalTextDocument,
  type PersonalTextContent,
  type PersonalTextDocumentV1,
  type PersonalTextValidationError,
} from '../../../../../shared/personal-text/index.mjs'
import { Bold, List, ListOrdered, Quote, Underline } from '../../../icons'
import { personalTextRootStyle } from './personalTextRootStyle'
import './personalText.css'

type PersonalTextEditorProps = {
  /** Changing the key starts a fresh editor and undo history for another document. */
  documentKey: string
  value: PersonalTextDocumentV1
  readOnly?: boolean
  ariaLabel: string
  autoFocus?: boolean
  onChange: (document: PersonalTextDocumentV1) => void
  onInvalid?: (errors: PersonalTextValidationError[]) => void
}

function contentKey(content: PersonalTextContent) {
  return JSON.stringify(content)
}

const TOOLS = [
  { id: 'bold', label: '加粗', Icon: Bold, isActive: (editor: Editor) => editor.isActive('bold'), run: (editor: Editor) => editor.chain().focus().toggleBold().run() },
  { id: 'underline', label: '下划线', Icon: Underline, isActive: (editor: Editor) => editor.isActive('underline'), run: (editor: Editor) => editor.chain().focus().toggleUnderline().run() },
  { id: 'bulletList', label: '无序列表', Icon: List, isActive: (editor: Editor) => editor.isActive('bulletList'), run: (editor: Editor) => editor.chain().focus().toggleBulletList().run() },
  { id: 'orderedList', label: '有序列表', Icon: ListOrdered, isActive: (editor: Editor) => editor.isActive('orderedList'), run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: 'blockquote', label: '引用', Icon: Quote, isActive: (editor: Editor) => editor.isActive('blockquote'), run: (editor: Editor) => editor.chain().focus().toggleBlockquote().run() },
] as const

export function PersonalTextEditor({
  documentKey,
  value,
  readOnly = false,
  ariaLabel,
  autoFocus = false,
  onChange,
  onInvalid,
}: PersonalTextEditorProps) {
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onInvalidRef = useRef(onInvalid)
  const lastEmittedRef = useRef(contentKey(value.content))
  const [invalid, setInvalid] = useState<PersonalTextValidationError[] | null>(null)

  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
    onInvalidRef.current = onInvalid
  })

  const editor = useEditor({
    extensions: [StarterKit.configure(PERSONAL_TEXT_STARTER_KIT_OPTIONS)],
    content: value.content,
    editable: !readOnly,
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'eqb-personal-text__input',
      },
      // Pasted rich text arrives as plain text with its line breaks.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        if (text === undefined) return false
        const lines = text.replace(/\r\n?/gu, '\n').split('\n')
        if (lines.length === 1) {
          view.dispatch(view.state.tr.insertText(text))
          return true
        }
        const { schema } = view.state
        const paragraphs = lines.map((line) => schema.nodes.paragraph.create(
          null,
          line ? schema.text(line) : null,
        ))
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1)))
        return true
      },
    },
    onUpdate: ({ editor: updated }) => {
      const content = updated.getJSON() as PersonalTextContent
      const key = contentKey(content)
      if (key === lastEmittedRef.current) return
      const next = { ...valueRef.current, content }
      const result = validatePersonalTextDocument(next)
      if (!result.ok) {
        // Never emit or silently trim an invalid document; the host keeps the last valid one.
        setInvalid(result.errors)
        onInvalidRef.current?.(result.errors)
        return
      }
      setInvalid(null)
      lastEmittedRef.current = key
      onChangeRef.current(next)
    },
  }, [documentKey])

  useEffect(() => {
    editor?.setEditable(!readOnly, false)
  }, [editor, readOnly])

  // Tiptap's own autofocus fires before EditorContent attaches the view, so
  // it silently misses; focus once the view is in the page.
  useEffect(() => {
    if (!autoFocus || !editor || readOnly) return undefined
    const frame = requestAnimationFrame(() => {
      if (!editor.isDestroyed && !editor.isFocused) editor.commands.focus('end')
    })
    return () => cancelAnimationFrame(frame)
  }, [autoFocus, editor, readOnly])

  // Adopt outside changes (undo at host level, restore, server merge) without
  // resetting the caret on every keystroke echo.
  useEffect(() => {
    if (!editor) return
    const key = contentKey(value.content)
    if (key === lastEmittedRef.current) return
    lastEmittedRef.current = key
    editor.commands.setContent(value.content, { emitUpdate: false })
  }, [editor, value.content])

  const activeTools = useEditorState({
    editor,
    selector: ({ editor: current }) => (
      current ? TOOLS.filter((tool) => tool.isActive(current)).map((tool) => tool.id) : []
    ),
  })

  const stopPaperShortcuts = (event: KeyboardEvent<HTMLDivElement>) => {
    // Typing belongs to the editor; Paper-level shortcuts must not react to it.
    event.stopPropagation()
  }

  return (
    <div
      className={`eqb-personal-text eqb-personal-text--editor${readOnly ? ' is-readonly' : ''}`}
      style={personalTextRootStyle(value)}
      onKeyDown={stopPaperShortcuts}
    >
      {!readOnly && editor ? (
        <div className="eqb-personal-text__tools" role="toolbar" aria-label="文字格式">
          {TOOLS.map(({ id, label, Icon, run }) => {
            const active = activeTools?.includes(id) ?? false
            return (
              <button
                key={id}
                type="button"
                className={`eqb-personal-text__tool${active ? ' is-active' : ''}`}
                aria-label={label}
                aria-pressed={active}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(editor)}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {invalid ? (
        <p className="eqb-personal-text__error" role="alert">
          {invalid[0].code === 'PERSONAL_TEXT_LIMIT'
            ? '内容超过单条上限，最新修改未保存。缩短后即可继续保存。'
            : '这段内容格式不受支持，最新修改未保存。'}
        </p>
      ) : null}
    </div>
  )
}
