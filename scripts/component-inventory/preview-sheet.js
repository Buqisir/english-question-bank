// 构件样张页（只给 preview.mjs 用，不进网站）：把第一批构件的每个选项、每种状态都摆出来。
// 由 preview.mjs 当虚拟模块交给 Vite，所以下面的 /src/... 是 app/src 里的真代码，裸模块名从 app 解析。
import { createElement as h, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import '/src/index.css'
import '/src/App.css'
import { Button } from '/src/shared-ui/Button.tsx'
import { Menu } from '/src/shared-ui/Menu.tsx'
import { FluidHoverList } from '/src/components/FluidHoverList.tsx'
import { ArrowLeft, ArrowLeftRight, ChevronDown, Download, Save, Trash, Copy, Pencil, Ellipsis, LogOut, Printer } from '/src/icons/index.ts'

const TONES = [
  ['quiet', '淡墨 quiet', '返回找题', ArrowLeft],
  ['subtle', '次要灰 subtle', '展开', ChevronDown],
  ['strong', '墨 strong', '换篇', ArrowLeftRight],
  ['primary', '雾薄荷 primary', '导出', Download],
  ['solid', '石板墨 solid', '保存', Save],
  ['danger', '危险 danger', '删除这份卷', Trash],
]
const SIZES = [['sm', '小 sm · 28'], ['md', '中 md · 32'], ['lg', '大 lg · 36']]
const MODES = [['text', '只有字'], ['icon-text', '图标 + 字'], ['icon', '只有图标']]
const STATES = [['rest', '静止'], ['hover', '悬停'], ['focus', '键盘焦点'], ['active', '按下'], ['disabled', '禁用'], ['busy', '忙']]

const icon = (I) => h(I, { size: 16, 'aria-hidden': 'true' })
function sample(tone, size, mode, text, I, extra = {}) {
  if (mode === 'text') return h(Button, { tone, size, ...extra }, text)
  if (mode === 'icon-text') return h(Button, { tone, size, icon: icon(I), ...extra }, text)
  return h(Button, { tone, size, icon: icon(I), label: text, ...extra })
}

const log = (what) => () => { (window.__picked ||= []).push(what) }
const MENU_ITEMS = [
  { key: 'docx', label: '下载 DOCX', icon: icon(Download), onSelect: log('docx') },
  { key: 'print', label: '打印', icon: icon(Printer), onSelect: log('print') },
  { key: 'copy', label: '复制一份', icon: icon(Copy), onSelect: log('copy') },
  { key: 'sep', separator: true },
  { key: 'rename', label: '改名（这里禁用）', icon: icon(Pencil), disabled: true, onSelect: log('rename') },
  { key: 'delete', label: '删除这份卷', icon: icon(Trash), tone: 'danger', onSelect: log('delete') },
]

function Sheet() {
  return h('main', { className: 'pv' },
    h('h1', null, '第一批构件样张：按钮、菜单（提案 · 单一来源）'),
    h('section', { 'data-section': 'options' },
      h('h2', null, '按钮：语气 × 大小 × 图标'),
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, '语气'), ...SIZES.flatMap(([, sl]) => MODES.map(([, ml]) => h('th', { key: sl + ml }, sl, h('br'), ml))))),
        h('tbody', null, TONES.map(([tone, tl, text, I]) => h('tr', { key: tone },
          h('th', null, tl),
          ...SIZES.flatMap(([size]) => MODES.map(([mode]) => h('td', { key: size + mode, 'data-cell': `${tone}|${size}|${mode}` }, sample(tone, size, mode, text, I)))),
        ))),
      ),
    ),
    h('section', { 'data-section': 'states' },
      h('h2', null, '按钮：状态（中号，图标 + 字）'),
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, '语气'), ...STATES.map(([, l]) => h('th', { key: l }, l)))),
        h('tbody', null, TONES.map(([tone, tl, text, I]) => h('tr', { key: tone },
          h('th', null, tl),
          ...STATES.map(([st]) => h('td', { key: st, 'data-state-cell': `${tone}|${st}` },
            sample(tone, 'md', 'icon-text', text, I, st === 'disabled' ? { disabled: true } : st === 'busy' ? { busy: true, onClick: log(`busy-${tone}`) } : {}))),
        ))),
      ),
    ),
    h('section', { 'data-section': 'fluid' },
      h('h2', null, '放在会滑的悬停列表里（像顶栏）：底由列表画，按钮不再垫一层'),
      h(FluidHoverList, { as: 'div', axis: 'x', itemSelector: '.eqb-button', className: 'pv-fluid', 'data-fluid-row': '' },
        h(Button, { tone: 'quiet', size: 'sm', icon: icon(ArrowLeft) }, '返回找题'),
        h(Button, { tone: 'quiet', size: 'sm', icon: icon(Download) }, '草稿卷'),
        h(Button, { tone: 'quiet', size: 'sm', icon: icon(LogOut) }, '退出'),
      ),
    ),
    h('section', { 'data-section': 'menus' },
      h('h2', null, '菜单'),
      h('div', { className: 'pv-row' },
        h('div', { 'data-menu': 'icon' }, h(Menu, { label: '更多操作', items: MENU_ITEMS })),
        h('div', { 'data-menu': 'text' }, h(Menu, { label: '导出', triggerText: '导出', triggerIcon: icon(Download), triggerTone: 'primary', triggerSize: 'md', items: MENU_ITEMS.slice(0, 2), align: 'start' })),
        h('div', { 'data-menu': 'edge', className: 'pv-edge' }, h(Menu, { label: '贴着右下角的菜单', items: MENU_ITEMS, triggerIcon: icon(Ellipsis) })),
      ),
    ),
  )
}

const style = document.createElement('style')
style.textContent = `
  body { margin: 0; background: var(--eqb-color-bg); color: var(--eqb-color-text); font-family: system-ui, sans-serif; }
  .pv { padding: 24px; display: grid; gap: 28px; }
  .pv h1 { font-size: 20px; margin: 0; } .pv h2 { font-size: 14px; margin: 0 0 8px; color: var(--eqb-color-text-muted); font-weight: 500; }
  .pv table { border-collapse: separate; border-spacing: 12px 10px; margin: 0 -12px; }
  .pv th { font-size: 12px; font-weight: 400; color: var(--eqb-color-text-muted); text-align: left; white-space: nowrap; }
  .pv td { vertical-align: middle; }
  .pv-fluid { display: inline-flex; gap: 4px; --fh-radius: 8px; }
  .pv-row { display: flex; gap: 32px; align-items: center; }
  .pv-edge { position: fixed; right: 10px; bottom: 10px; }
`
document.head.appendChild(style)
createRoot(document.getElementById('root')).render(h(Fragment, null, h(Sheet)))
