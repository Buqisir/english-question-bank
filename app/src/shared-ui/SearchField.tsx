/**
 * 搜索框构件：一行输入 + 可选清除键 + 回车提交键（构件厂，2026-11-15，提案 · 单一来源）。
 * 设计记录：design/components-2026-11-13/migrate-search/README.md。
 *
 * 两档（DESIGN.md §5 Inputs / Fields 的 Hero search、Compact search；清点里 4 种收成这两档）：
 * - hero（首页）：高 54、圆角 --eqb-radius-search（16）、白底、e1（§4：边线透明，墨圈当边）、输入字 16、提交键 32。
 * - compact（浏览页）：高 36、圆角 --eqb-radius-card（12）、不投影、输入字 13、提交键 28。
 * 搜索框比同高控件圆一档（DESIGN.md Single-Radius-Family）。数值从 App.css 原样搬来，换前换后逐像素一样。
 *
 * 宽度和在一行里怎么摆（占满、固定 320、窄屏独占一行）是放它的页面的事，构件不管，见 App.css 的 .concierge-intent-bar。
 *
 * 无障碍：
 * - 外层是 <form role="search">：读屏的地标列表里有「搜索」，一跳就到；回车提交走表单原生提交。
 * - 输入框不用 type="search"：Chrome 会在框里自己画一个叉（和我们的清除键重复，两个叉摆一起），
 *   按 Esc 时还会自己清空（调用处另有 Esc 的处理）。读屏的「搜索」由 role="search" 地标交代，输入框仍是 textbox。
 *   手机键盘的回车键写成「搜索」用 enterKeyHint，不靠 type。
 * - 标签只给读屏（label 必填，<label for> 连输入框），看得见的提示在占位符里。
 * - 提交键只有图标，submitLabel 必填，作读屏名字，也作悬停提示（title）。清除键同理（clearLabel）。
 *
 * 选择器钩子：hooks 给的类名挂在对应元素上，只给脚本和放法用（首页沿用 concierge-intent-*，测试脚本按它们认）。
 */

import { useId, type FormEvent, type InputHTMLAttributes, type Ref } from 'react'
import { CornerDownLeft, X } from '../icons'
import { Button } from './Button.tsx'
import './search.css'

export type SearchTier = 'hero' | 'compact'

export type SearchFieldHooks = {
  form?: string
  input?: string
  clear?: string
  submit?: string
}

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSubmit' | 'type' | 'className' | 'size' | 'id'> & {
  /** hero 首页；compact 浏览页。 */
  tier: SearchTier
  /** 读屏名字（只给读屏，看不见）。 */
  label: string
  value: string
  onValueChange: (value: string) => void
  /** 表单提交（回车或点提交键）。构件不拦默认行为，调用处自己 preventDefault。 */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  /** 提交键的读屏名字和悬停提示。 */
  submitLabel: string
  /** 提交键不能点（没字、在等、题库没连上）：灰色回车。 */
  submitDisabled?: boolean
  /** 提交键读屏念「忙」。 */
  submitBusy?: boolean
  /** 正在搜：提交键宽度放开（is-loading）。 */
  loading?: boolean
  /** 清除：给了才有清除键；有字、且输入框没禁用时才出。 */
  onClear?: () => void
  clearLabel?: string
  inputRef?: Ref<HTMLInputElement>
  /** 调用处固定的 id。不给就生成一个。 */
  id?: string
  hooks?: SearchFieldHooks
}

const join = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base)

export function SearchField({
  tier,
  label,
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  submitBusy = false,
  loading = false,
  onClear,
  clearLabel = '清除搜索',
  inputRef,
  id,
  hooks,
  disabled,
  autoComplete = 'off',
  enterKeyHint = 'search',
  ...inputProps
}: SearchFieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const showClear = Boolean(onClear) && value.length > 0 && !disabled
  return (
    <form className={join('eqb-search', hooks?.form)} data-tier={tier} onSubmit={onSubmit} role="search">
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={join('eqb-search-input', hooks?.input)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        disabled={disabled}
        {...inputProps}
      />
      {showClear && (
        // 清除键：shared-ui/Button 次要灰小号、只有图标（高 28）。清完焦点放回哪里由 onClear 决定。
        <Button
          className={join('eqb-search-clear', hooks?.clear)}
          tone="subtle"
          size="sm"
          label={clearLabel}
          title={clearLabel}
          icon={<X size={16} aria-hidden="true" />}
          onClick={onClear}
        />
      )}
      <button
        type="submit"
        className={join(join('eqb-search-submit', hooks?.submit), loading ? 'is-loading' : undefined)}
        disabled={submitDisabled}
        aria-label={submitLabel}
        title={submitLabel}
        aria-busy={submitBusy || undefined}
      >
        {/* 键上始终是回车图标；在等什么由调用处的提示行说（共用提示行 shared-ui/Notice）。 */}
        <CornerDownLeft size={18} aria-hidden="true" />
      </button>
    </form>
  )
}
