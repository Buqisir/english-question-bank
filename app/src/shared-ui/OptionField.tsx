/**
 * 选项字段：从几个选项里挑一个，用不了的选项照样列出、不能选，带一行原因（构件厂，2026-11-14，提案 · 单一来源）。
 * 来由：走查「路上的构件」第 3 名（design/ux-2026-11-14/find-compose-export/README.md），卡点 4、5；
 * Owner 2026-11-14 第四节第 4 条「用不了的版本照样列出，标『用不了』并写一行原因，不能选」。
 * 设计记录：design/components-2026-11-13/migrate-field/README.md。
 *
 * 两种，都搭在 Field.tsx 的框架上（标签、说明、出错同一套）：
 *
 * - SegmentedField 分段选择：选项少（2–4 个）、名字短、一眼都要看见的（草稿卷 A4 散页 / A3 对折）。
 *   读屏是 radiogroup + radio（不是一排 aria-pressed 的按钮）：一次只能选一个、选了别的就换掉这个，正是单选；
 *   键盘照 WAI-ARIA APG 单选组——整组只占一个 Tab 位（停在选中的那一项），← → ↑ ↓ 在可用项之间走、走到就选上，
 *   到头绕回；空格选当前项。用不了的项不停（照原生单选的习惯），原因写在组下面，挂在整组和那一项的
 *   aria-describedby 上，读屏进组时就念。
 *   样子：DESIGN.md §5 Single-Radius-Family「胶囊只给标签类：分段切换」→ 圆角 --eqb-radius-pill；
 *   选中的是一张纸（白底、e1，§4），没选的透明底次要灰字，悬停由 FluidHoverList 的滑块垫桌色。
 *   项可以带一个 16px 图标（ChoiceOption.icon，放在字前面，对读屏隐藏，读屏名字只是字）；
 *   2026-11-15 切换组那一轮加的口子，第一处是认词「顺序」的「随机」（design/components-2026-11-13/migrate-segment/README.md）。
 *
 * - OptionSelectField 带原因的下拉：选项多一些、或者名字长、要写「为什么用不了」的（草稿卷 PDF 版本）。
 *   原生 <option> 只放得下一行名字，所以用共用 Menu（可勾选项 + 每项下面一行原因，fix-pdf-versions 那一轮定的），
 *   只把触发键换成字段的样子（白底、细边、8px、右边一个向下箭头），和 SelectField 长得一样。
 *   触发键的读屏名字 =「标签 + 当前值」（aria-labelledby 两段），打开后焦点落在勾着的那一项（focusChecked），
 *   禁用项方向键也停、念「不可用」和原因（Menu 的规矩，Owner 2026-11-14）。
 *   当前选中的那一项本身用不了时（比如草稿卷只剩听力题组），字段自己标出错：边变红、aria-invalid，
 *   下面一行「用不了：原因」。
 */

import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { FluidHoverList } from '../components/FluidHoverList.tsx'
import { ChevronDown } from '../icons'
import { Field, joinIds, type FieldFrameProps, type FieldSize } from './Field.tsx'
import { Menu } from './Menu.tsx'
import './field.css'

export type ChoiceOption<V extends string = string> = {
  value: V
  label: string
  /** 用不了：照样列出，不能选。 */
  disabled?: boolean
  /** 用不了的原因，一行。写在选项下面（下拉）或组下面（分段）。 */
  reason?: string
  /**
   * 字前面的 16px 图标，只有 SegmentedField 画（下拉里不画）。调用处给 size={16} 的图标，
   * 构件自己包一层 aria-hidden，读屏名字只念 label。
   */
  icon?: ReactNode
}

// ── 分段选择 ──────────────────────────────────────────────

export type SegmentedFieldProps<V extends string> = FieldFrameProps & {
  value: V
  options: ChoiceOption<V>[]
  onChange: (value: V) => void
  /** sm 高 28；md 高 32（默认）。 */
  size?: Exclude<FieldSize, 'lg'>
  /** 挂在单选组上的类名，只当选择器钩子用。 */
  controlClassName?: string
}

export function SegmentedField<V extends string>({
  label,
  hideLabel,
  hint,
  error,
  announce,
  layout,
  className,
  value,
  options,
  onChange,
  size = 'md',
  controlClassName,
}: SegmentedFieldProps<V>) {
  const reasonBase = useId()
  const reasonId = (index: number) => `${reasonBase}-reason-${index}`
  const unavailable = options.map((option, index) => ({ option, index })).filter(({ option }) => option.disabled && option.reason)
  const checkedIndex = options.findIndex((option) => option.value === value)
  // Tab 停在选中的那一项；没有选中的（或选中的用不了）就停在第一个可用项。
  const tabIndexAt = checkedIndex >= 0 && !options[checkedIndex].disabled ? checkedIndex : options.findIndex((option) => !option.disabled)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const group = event.currentTarget.parentElement
    for (let offset = 1; offset <= options.length; offset += 1) {
      const next = (index + step * offset + options.length * offset) % options.length
      if (options[next].disabled) continue
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
      if (options[next].value !== value) onChange(options[next].value)
      return
    }
  }

  const reasons = unavailable.length > 0 && (
    <>
      {unavailable.map(({ option, index }) => (
        <span key={option.value} id={reasonId(index)} className="eqb-option-reason">
          {option.label}用不了：{option.reason}
        </span>
      ))}
    </>
  )

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint || reasons ? <>{hint}{reasons}</> : undefined}
      error={error}
      announce={announce}
      layout={layout}
      className={className}
      labelledByControl
    >
      {(binding) => (
        <FluidHoverList
          as="div"
          axis="x"
          className={controlClassName ? `eqb-segmented ${controlClassName}` : 'eqb-segmented'}
          itemSelector=".eqb-segmented-option:not([aria-disabled='true'])"
          gapClick={false}
          role="radiogroup"
          aria-labelledby={binding.labelId}
          aria-describedby={binding.describedBy}
          aria-invalid={binding.invalid || undefined}
          data-size={size}
        >
          {options.map((option, index) => {
            const checked = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                className="eqb-segmented-option"
                aria-checked={checked}
                aria-disabled={option.disabled || undefined}
                aria-describedby={option.disabled && option.reason ? reasonId(index) : undefined}
                tabIndex={index === tabIndexAt ? 0 : -1}
                data-value={option.value}
                onClick={() => {
                  if (option.disabled || checked) return
                  onChange(option.value)
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {option.icon && <span className="eqb-segmented-icon" aria-hidden="true">{option.icon}</span>}
                {option.label}
              </button>
            )
          })}
        </FluidHoverList>
      )}
    </Field>
  )
}

// ── 带原因的下拉 ──────────────────────────────────────────

export type OptionSelectFieldProps<V extends string> = FieldFrameProps & {
  value: V
  options: ChoiceOption<V>[]
  onChange: (value: V) => void
  size?: FieldSize
  disabled?: boolean
  /** 挂在触发键上的类名，只当选择器钩子用。 */
  triggerClassName?: string
  /** 挂在菜单面板上的类名。 */
  menuClassName?: string
  /** 菜单和触发键哪一边对齐，默认左边。 */
  align?: 'start' | 'end'
  /** 说明 / 出错那一行只给读屏（看得见的人在别处已经看到同一句话时用，比如草稿卷顶栏：卷面上就写着为什么用不了）。 */
  hideMessages?: boolean
  /** 触发键拿到焦点时（点开或 Tab 到）调用：要在打开菜单前现问一下某项用不用得了时用（比如草稿卷的省纸版）。 */
  onTriggerFocus?: () => void
}

export function OptionSelectField<V extends string>({
  label,
  hideLabel,
  hint,
  error,
  announce,
  layout,
  className,
  value,
  options,
  onChange,
  size = 'md',
  disabled,
  triggerClassName,
  menuClassName,
  align = 'start',
  hideMessages,
  onTriggerFocus,
}: OptionSelectFieldProps<V>) {
  const valueId = useId()
  const selected = options.find((option) => option.value === value)
  // 选中的那一项自己用不了：字段标出错，原因写在下面（调用处给了 error 就用调用处的）。
  const ownError = error ?? (selected?.disabled ? (selected.reason ? `用不了：${selected.reason}` : '用不了') : undefined)
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={ownError}
      announce={announce}
      layout={layout}
      className={className ? `${className}${hideMessages ? ' eqb-field-messages-hidden' : ''}` : hideMessages ? 'eqb-field-messages-hidden' : undefined}
      labelledByControl
    >
      {(binding) => (
        <Menu
          label={typeof label === 'string' ? label : selected?.label ?? ''}
          className={menuClassName ? `eqb-option-menu ${menuClassName}` : 'eqb-option-menu'}
          align={align}
          focusChecked
          triggerDisabled={disabled}
          renderTrigger={(trigger) => (
            <button
              {...trigger}
              type="button"
              id={binding.id}
              className={triggerClassName ? `eqb-field-control eqb-option-select-trigger ${triggerClassName}` : 'eqb-field-control eqb-option-select-trigger'}
              data-size={size}
              aria-labelledby={joinIds(binding.labelId, valueId)}
              aria-describedby={binding.describedBy}
              aria-invalid={binding.invalid || undefined}
              onFocus={onTriggerFocus}
            >
              <span id={valueId} className="eqb-option-select-value">{selected?.label ?? ''}</span>
              <ChevronDown className="eqb-field-chevron" size={16} aria-hidden="true" />
            </button>
          )}
          items={options.map((option) => ({
            key: option.value,
            label: option.label,
            checked: option.value === value,
            disabled: option.disabled,
            description: option.disabled ? option.reason : undefined,
            onSelect: () => {
              if (option.value !== value) onChange(option.value)
            },
          }))}
        />
      )}
    </Field>
  )
}
