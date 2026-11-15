/**
 * 字段构件：标签 + 一个输入控件 + 说明 / 出错一行（构件厂，2026-11-14，提案 · 单一来源）。
 * 设计记录：design/components-2026-11-13/migrate-field/README.md。
 *
 * 变体从清点推出来（design/components-2026-11-13/inventory.md「输入框 / 搜索」11 种）：
 * - 文字输入 4 种（草稿卷「⋯」面板、存 PDF 对话框、听写工作台、管理页）高 34–37、圆角 8 / 12、字 13–16，
 *   收成三档高度 sm 28 / md 32 / lg 36，和 Button 的三档同高，并排放时上下齐。
 * - 下拉 3 种（PDF 版本、最近草稿卷、听写学生）高 32–36，同上三档。
 * - 搜索 4 种不归这里（收成首页 / 浏览页两档的搜索框构件排在下一轮，见 README「搜索框」）；
 *   能写原因的下拉和分段选择见 OptionField.tsx。
 *
 * 样子（DESIGN.md §5 Inputs / Fields、Single-Radius-Family、§4、§3）：
 * - 圆角 --eqb-radius-control（8，高 28–44 的控件）；白底 --eqb-color-paper；1px --eqb-color-border 边；
 *   输入框贴桌，不投影（§4 e0）。
 * - 字：sm、md 用 --eqb-font-size-control（13）；lg 用 --eqb-font-size-sm（14）。四级字号以外不加。
 *   触屏上一律 16（--eqb-font-size-md），防 iOS 聚焦时放大页面（缺口见 docs/design-gaps.md 登录页那条）。
 * - 悬停边深一档（--eqb-color-border-strong）；焦点走 §4 的墨焦点环（2px --eqb-color-action，外扩 2px），不挪布局。
 * - 出错：边换 --eqb-color-danger（描边可用亮红），下面一行次要灰字 + 16px 图标，照 §5 Notices 的写法，
 *   字不上红——红只在边上，图标和字给不看颜色的人。
 * - 禁用：桌色底、次要灰字，不可点。
 *
 * 无障碍：
 * - 标签用 <label for> 和控件连上（Field 生成 id）；只给读屏的标签用 hideLabel（标签照样在 DOM 里）。
 * - 说明、出错用 aria-describedby 挂到控件上（调用处自己给的 aria-describedby 接在后面）；有出错时控件带 aria-invalid。
 * - 出错那一行是普通文字，不用 role=alert：焦点在控件上时读屏会念描述；要「一出错就播报」的地方由调用处另放提示行。
 *
 * 用法：
 * - TextField / TextAreaField / SelectField：一行写完，props 照原生元素给。
 * - Field：只出框架（标签、说明、出错），控件由调用处用 render 函数画，拿到 id、labelId、describedBy、invalid。
 *   OptionField.tsx 的两种选项字段就是这么搭的（控件不是原生输入，标签用 aria-labelledby 连）。
 */

import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, ChevronDown } from '../icons'
import './field.css'

export type FieldSize = 'sm' | 'md' | 'lg'
export type FieldLayout = 'stack' | 'inline'

export type FieldFrameProps = {
  /** 标签：看得见的字，也是读屏名字。 */
  label: ReactNode
  /** 只给读屏念的标签（标签在 DOM 里，但看不见）。 */
  hideLabel?: boolean
  /** 说明：控件下面一行次要灰字。 */
  hint?: ReactNode
  /** 出错：控件下面一行，图标 + 次要灰字；控件边变危险色、带 aria-invalid。 */
  error?: ReactNode
  /** stack 标签在上（默认）；inline 标签在左、控件在右（顶栏这种一行放得下的地方）。 */
  layout?: FieldLayout
  /** 挂在最外层的类名，只当选择器钩子和放法用。 */
  className?: string
}

export type FieldControlBinding = {
  /** 控件的 id（<label for> 指向它）。 */
  id: string
  /** 标签那一段的 id，控件不是原生输入时用 aria-labelledby 连它。 */
  labelId: string
  /** 说明、出错的 id，空格分开；都没有时是 undefined。 */
  describedBy: string | undefined
  invalid: boolean
}

type FieldProps = FieldFrameProps & {
  /** 控件不是原生 input / select / textarea 时为 true：标签不用 <label for>，用 <span id>，控件自己用 aria-labelledby 连。 */
  labelledByControl?: boolean
  /** 调用处固定的 id（比如脚本要认）。不给就生成一个。 */
  id?: string
  children: (binding: FieldControlBinding) => ReactNode
}

/** 拼 aria-describedby：框架的说明、出错在前，调用处自己给的接在后面。 */
export function joinIds(...ids: Array<string | undefined | false | null>): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

/** 字段框架：标签、控件、说明、出错。 */
export function Field({ label, hideLabel = false, hint, error, layout = 'stack', className, labelledByControl = false, id, children }: FieldProps) {
  const generated = useId()
  const controlId = id ?? `${generated}-control`
  const labelId = `${generated}-label`
  const hintId = hint ? `${generated}-hint` : undefined
  const errorId = error ? `${generated}-error` : undefined
  const invalid = Boolean(error)
  const labelClass = hideLabel ? 'eqb-field-label visually-hidden' : 'eqb-field-label'
  return (
    <div
      className={className ? `eqb-field ${className}` : 'eqb-field'}
      data-layout={layout}
      data-invalid={invalid ? '' : undefined}
      data-label-hidden={hideLabel ? '' : undefined}
    >
      {labelledByControl ? (
        <span id={labelId} className={labelClass}>{label}</span>
      ) : (
        <label id={labelId} htmlFor={controlId} className={labelClass}>{label}</label>
      )}
      <div className="eqb-field-body">
        {children({ id: controlId, labelId, describedBy: joinIds(hintId, errorId), invalid })}
      </div>
      {(hint || error) && (
        <div className="eqb-field-messages">
          {error && (
            <p id={errorId} className="eqb-field-message" data-kind="error">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
          {hint && (
            <p id={hintId} className="eqb-field-message" data-kind="hint">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type ControlCommon = FieldFrameProps & {
  /** sm 高 28；md 高 32（默认）；lg 高 36。和 Button 的三档同高。 */
  size?: FieldSize
  /** 挂在控件本身上的类名，只当选择器钩子用。 */
  controlClassName?: string
}

export type TextFieldProps = ControlCommon &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'> & {
    ref?: Ref<HTMLInputElement>
    /**
     * 框里左边的 16px 图标（比如列表筛选框的放大镜），调用处自己写 aria-hidden。字往右让出图标的位置。
     * 2026-11-15 第二轮加的口子，第一处是听写工作区「搜索词组」（design/components-2026-11-13/migrate-fields2/README.md）。
     */
    icon?: ReactNode
    /**
     * 跟在框后面、同一行的东西：单位小字（「词」）、紧挨着的动作键（「保存名称」）。不进框，不挂 aria-describedby；
     * 单位要读出来时，调用处给单位一个 id，自己放进 aria-describedby。说明 / 出错那一行仍在这一行下面。
     */
    trailing?: ReactNode
  }

/** 一行文字输入。 */
export function TextField({ label, hideLabel, hint, error, layout, className, size = 'md', controlClassName, id, ref, icon, trailing, 'aria-describedby': describedBy, ...rest }: TextFieldProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} layout={layout} className={className} id={id}>
      {(binding) => (
        <>
          {icon && <span className="eqb-field-icon">{icon}</span>}
          <input
            ref={ref}
            id={binding.id}
            className={controlClassName ? `eqb-field-control ${controlClassName}` : 'eqb-field-control'}
            data-size={size}
            data-has-icon={icon ? '' : undefined}
            aria-describedby={joinIds(binding.describedBy, describedBy)}
            aria-invalid={binding.invalid || undefined}
            {...rest}
          />
          {trailing}
        </>
      )}
    </Field>
  )
}

export type TextAreaFieldProps = ControlCommon &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    ref?: Ref<HTMLTextAreaElement>
  }

/** 多行输入。高度跟 rows 走，字号跟 size 走（sm、md 13，lg 14）。 */
export function TextAreaField({ label, hideLabel, hint, error, layout, className, size = 'md', controlClassName, id, ref, rows = 3, 'aria-describedby': describedBy, ...rest }: TextAreaFieldProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} layout={layout} className={className} id={id}>
      {(binding) => (
        <textarea
          ref={ref}
          id={binding.id}
          rows={rows}
          className={controlClassName ? `eqb-field-control ${controlClassName}` : 'eqb-field-control'}
          data-size={size}
          data-multiline=""
          aria-describedby={joinIds(binding.describedBy, describedBy)}
          aria-invalid={binding.invalid || undefined}
          {...rest}
        />
      )}
    </Field>
  )
}

export type SelectOption = { value: string; label: string; disabled?: boolean }

export type SelectFieldProps = ControlCommon &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'className' | 'children'> & {
    /** 选项。也可以直接给 children（<option>…），两者给一个。 */
    options?: SelectOption[]
    children?: ReactNode
    ref?: Ref<HTMLSelectElement>
  }

/**
 * 原生下拉（选一项）。系统自己的选项列表，键盘、读屏、手机上的滚轮都是浏览器给的。
 * 选项要写「为什么用不了」时用 OptionField.tsx 的 OptionSelectField（原生 <option> 只放得下一行名字）。
 */
export function SelectField({ label, hideLabel, hint, error, layout, className, size = 'md', controlClassName, id, ref, options, children, 'aria-describedby': describedBy, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} layout={layout} className={className} id={id}>
      {(binding) => (
        <span className="eqb-field-select" data-size={size}>
          <select
            ref={ref}
            id={binding.id}
            className={controlClassName ? `eqb-field-control ${controlClassName}` : 'eqb-field-control'}
            data-size={size}
            aria-describedby={joinIds(binding.describedBy, describedBy)}
            aria-invalid={binding.invalid || undefined}
            {...rest}
          >
            {options
              ? options.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
                ))
              : children}
          </select>
          <ChevronDown className="eqb-field-chevron" size={16} aria-hidden="true" />
        </span>
      )}
    </Field>
  )
}
