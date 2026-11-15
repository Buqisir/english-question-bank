// 字段构件样张 / 键盘测试共用的小舞台（构件厂，2026-11-14）。
// 用 Vite 自己的 build 把 app/src/shared-ui 的真构件（Field.tsx、OptionField.tsx、Menu.tsx）和真 CSS 打成一页，
// 放在 .scratch/component-inventory/field-harness/ 下，再用 Playwright 的 route 当静态服务器给出去。
// 画的是构件本身，不是另写的仿样式；不起后端、不登录。
//
// 舞台上的每一格（.cell）一个状态。data-force="hover|focus" 的格子由调用方用 CDP CSS.forcePseudoState 强制出状态。
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { APP, RAW, SRC, requireFromApp } from './lib.mjs'

const DIR = path.join(RAW, 'field-harness')
const DIST = path.join(DIR, 'dist')

const ENTRY = `
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '${SRC}/index.css'
import { TextField, TextAreaField, SelectField } from '${SRC}/shared-ui/Field.tsx'
import { OptionSelectField, SegmentedField } from '${SRC}/shared-ui/OptionField.tsx'

// 和草稿卷用的同一组选项、同一句原因（DraftPaperWorkbench.tsx editionOptions / editionUnavailableText）。
const EDITIONS = [
  { value: 'compact', label: '省纸版' },
  { value: 'answer', label: '纯答案版', disabled: true, reason: '选中的题组还没有审过的参考答案' },
  { value: 'largeComplete', label: '大字完整版', disabled: true, reason: '要有完整的两个听力题组' },
  { value: 'largeNoListening', label: '大字无听力版' },
]
const FORMS = [
  { value: 'a4', label: 'A4 散页' },
  { value: 'a3', label: 'A3 对折' },
]
const FORMS_WITH_DISABLED = [
  { value: 'a4', label: 'A4 散页' },
  { value: 'a3', label: 'A3 对折', disabled: true, reason: '卷面超过 8 页，对折装不下' },
  { value: 'a5', label: 'A5 小册' },
]
const FOLDERS = [{ value: '', label: '未归档' }, { value: 'a', label: '高三一班' }, { value: 'b', label: '期中复习' }]

function Edition({ initial = 'largeNoListening', ...rest }) {
  const [value, setValue] = useState(initial)
  return <OptionSelectField label="PDF 版本" value={value} options={EDITIONS} onChange={setValue} {...rest} />
}
function Form({ initial = 'a4', options = FORMS, ...rest }) {
  const [value, setValue] = useState(initial)
  return <SegmentedField label="打印形态" value={value} options={options} onChange={setValue} {...rest} />
}
function Text(props) {
  const [value, setValue] = useState(props.defaultValue ?? '')
  return <TextField {...props} defaultValue={undefined} value={value} onChange={(e) => setValue(e.target.value)} />
}

const Cell = ({ cap, force, id, children }) => (
  <div className="cell" data-force={force} id={id}>
    <span className="cap">{cap}</span>
    {children}
  </div>
)

function Sheet() {
  return (
    <main>
      <h1>字段构件 · 样张（shared-ui/Field.tsx、OptionField.tsx）</h1>
      <p className="lead">直接把构件渲染出来；悬停、键盘焦点由浏览器强制出来（分段选择的悬停是真鼠标停上去，滑块要 JS 才动）。白底细边、8px，焦点 2px 墨环外扩 2px，出错红边 + 灰字图标。</p>

      <h2>文字输入 TextField / TextAreaField</h2>
      <div className="grid">
        <Cell cap="静止 · md 32"><Text label="学生（可选）" placeholder="未填写" /></Cell>
        <Cell cap="悬停" force="hover"><Text label="学生（可选）" placeholder="未填写" /></Cell>
        <Cell cap="键盘焦点" force="focus"><Text label="文件名" defaultValue="1114 英语草稿卷-省纸版.pdf" /></Cell>
        <Cell cap="带说明"><Text label="学生（可选）" placeholder="未填写" hint="写了会印在卷头姓名栏" /></Cell>
        <Cell cap="出错"><Text label="文件名" defaultValue="" placeholder="文件名" error="文件名不能空着" /></Cell>
        <Cell cap="禁用"><Text label="文件名" defaultValue="正在保存…" disabled /></Cell>
        <Cell cap="三档高度 sm 28 / md 32 / lg 36">
          <div className="row"><Text label="sm" size="sm" placeholder="28" /><Text label="md" placeholder="32" /><Text label="lg" size="lg" placeholder="36" /></div>
        </Cell>
        <Cell cap="多行 TextAreaField"><TextAreaField label="备注" placeholder="写给学生的话" rows={3} /></Cell>
      </div>

      <h2>原生下拉 SelectField</h2>
      <div className="grid">
        <Cell cap="静止 · lg 36"><SelectField label="文件夹" size="lg" options={FOLDERS} defaultValue="a" /></Cell>
        <Cell cap="悬停" force="hover"><SelectField label="文件夹" size="lg" options={FOLDERS} defaultValue="a" /></Cell>
        <Cell cap="键盘焦点" force="focus"><SelectField label="文件夹" size="lg" options={FOLDERS} defaultValue="a" /></Cell>
        <Cell cap="出错"><SelectField label="文件夹" size="lg" options={FOLDERS} defaultValue="b" error="这个文件夹已经删了" /></Cell>
        <Cell cap="禁用"><SelectField label="文件夹" size="lg" options={FOLDERS} defaultValue="" disabled /></Cell>
      </div>

      <h2>分段选择 SegmentedField（radiogroup）</h2>
      <div className="grid">
        <Cell cap="静止"><Form /></Cell>
        <Cell cap="悬停未选的一项（真鼠标）" id="seg-hover"><Form /></Cell>
        <Cell cap="键盘焦点（停在选中项）" force="focus"><Form /></Cell>
        <Cell cap="标签在左（inline）"><Form layout="inline" /></Cell>
        <Cell cap="有一项用不了 + 原因"><Form options={FORMS_WITH_DISABLED} /></Cell>
        <Cell cap="小号 sm 28"><Form size="sm" /></Cell>
      </div>

      <h2>带原因的下拉 OptionSelectField（Menu）</h2>
      <div className="grid">
        <Cell cap="静止 · inline"><Edition layout="inline" /></Cell>
        <Cell cap="悬停" force="hover"><Edition layout="inline" /></Cell>
        <Cell cap="键盘焦点" force="focus"><Edition layout="inline" /></Cell>
        <Cell cap="选中的版本用不了（出错）"><Edition initial="largeComplete" /></Cell>
        <Cell cap="禁用（正在导出）"><Edition layout="inline" disabled /></Cell>
        <Cell cap="打开：用不了的项照样列出 + 一行原因" id="menu-open"><Edition layout="inline" /></Cell>
      </div>
      <div className="menu-room" />
    </main>
  )
}

// 键盘测试用的小舞台：一组分段、一个带原因的下拉、一个出错的文字输入，前后各一个普通按钮当 Tab 起点和终点。
function Keys() {
  return (
    <main>
      <button id="start">起点</button>
      <Form options={FORMS_WITH_DISABLED} />
      <Edition layout="inline" />
      <Text label="文件名" defaultValue="" error="文件名不能空着" hint="存进个人空间时用的名字" />
      <button id="end">终点</button>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode>{location.hash === '#keys' ? <Keys /> : <Sheet />}</StrictMode>)
`

const PAGE_CSS = `
body{margin:0;background:var(--eqb-color-bg);color:var(--eqb-color-text)}
main{padding:32px;max-width:1376px}
h1{font-size:20px;margin:0 0 4px;font-weight:600}
h2{font-size:15px;margin:28px 0 8px;font-weight:600}
.lead{margin:0 0 12px;color:var(--eqb-color-text-muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cell{background:var(--eqb-color-bg);border:1px solid var(--eqb-color-border);border-radius:var(--eqb-radius-card);padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.cell .cap{font-size:12px;color:var(--eqb-color-text-muted)}
.row{display:flex;gap:8px;align-items:flex-end}.row>*{flex:1 1 0}
.menu-room{height:200px}
@media (max-width:600px){main{padding:16px}.grid{grid-template-columns:minmax(0,1fr)}}
`

export async function buildHarness() {
  rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
  writeFileSync(path.join(DIR, 'entry.jsx'), ENTRY)
  writeFileSync(path.join(DIR, 'page.css'), PAGE_CSS)
  writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./page.css"><title>field harness</title></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>')
  const { build } = requireFromApp('vite')
  const react = requireFromApp('@vitejs/plugin-react')
  const nm = path.join(APP, 'node_modules')
  await build({
    root: DIR,
    configFile: false,
    logLevel: 'warn',
    base: './',
    plugins: [(react.default ?? react)()],
    // 舞台在 app/ 外面：react 系列从 app/node_modules 拿，和构件同一份。
    resolve: { alias: [{ find: /^(react|react-dom)(\/.*)?$/, replacement: `${nm}/$1$2` }] },
    build: { outDir: DIST, emptyOutDir: true, minify: false },
  })
  return DIST
}

/** 用 route 把 dist 当静态站点给出去，返回舞台地址。 */
export async function serveHarness(context) {
  const origin = 'http://field-harness.local'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
  await context.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url())
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
  })
  return `${origin}/`
}
