#!/usr/bin/env node
// 对话框换构件的对照图和样张：读 dialog-shots.mjs 拍好的 before/after，拼成
//   migrate-dialog/compare-<处>.png：每处 before / after 并排，1440 一行、390 一行（框住面板裁的图）；
//   sheet-dialog-new.png：换完以后共用 Dialog 的全部变体（居中小表单、确认框 sm / md、带列表的大框、侧边抽屉），
//   各在 1440 和 390 两种宽度下。
// 不起测试站，只拼图。用法：node scripts/component-inventory/dialog-sheet.mjs
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { ROOT } from './lib.mjs'

const DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-dialog')
const SHEET = path.join(ROOT, 'design/components-2026-11-13/sheet-dialog-new.png')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const SCENES = [
  ['draft-save-space', '草稿卷「保存 PDF 到个人空间」', 'tone dialog · size md · 右上角关闭 · 面板是 <form> · 取消 strong / 保存 solid'],
  ['my-space-delete', '个人空间「删除草稿卷 PDF」', 'tone alert · size sm · 没有关闭键 · 取消 strong / 删除 PDF danger · 焦点落在「取消」'],
  ['agent-token-revoke', '后台「作废 Agent 口令」', 'tone alert · size md（口令名可能长）· 原来是 role=dialog、键靠左，现在 alertdialog、靠右'],
  ['vocab-handwriting', '过生词「选择练字单词」', 'tone dialog · size lg · 只让单词列表滚 · footnote 在底部左边 · 点遮罩关（原来就这样）'],
  ['entry-edit', '题组详情「编辑题组」（录题面板）', 'placement side · 贴右边满高的抽屉 · 标题下、动作上各一条发丝线'],
]

const img = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null)
const fig = (file, cap) => {
  const src = img(file)
  return `<figure>${src ? `<img src="${src}">` : '<div class="none">没拍到</div>'}<figcaption>${cap}</figcaption></figure>`
}
const STYLE = `<style>
  body{margin:0;padding:24px;background:#fff;font:14px/1.5 system-ui,'PingFang SC',sans-serif;color:#1B2B33}
  h1{font-size:18px;margin:0 0 2px}p.note{margin:0 0 16px;color:#5A6C75}
  h2{font-size:15px;margin:20px 0 2px}p.sub{margin:0 0 8px;color:#5A6C75;font-size:13px}
  .g{display:grid;gap:16px;align-items:start}figure{margin:0}
  img{display:block;max-width:100%;border:1px solid #E1E7EA;border-radius:4px}
  figcaption{font-size:12px;color:#5A6C75;padding-top:4px}.none{padding:24px;color:#94A4AC;border:1px dashed #C5D3DA;border-radius:4px}
</style>`

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
async function render(html, out, width = 1600) {
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 1 })
  await page.setContent(`${STYLE}${html}`)
  await page.screenshot({ path: out, fullPage: true })
  await page.close()
}
// 侧边抽屉裁出来是整屏高，用整屏图更看得清它和页面的关系。
const shot = (label, id, w) => path.join(DIR, label, id === 'entry-edit' ? `${id}-${w}.png` : `${id}-${w}-crop.png`)
try {
  for (const [id, title, sub] of SCENES) {
    const rows = [1440, 390].map((w) => `<div class="g" style="grid-template-columns:${w === 390 ? '300px 300px' : '1fr 1fr'}">
      ${fig(shot('before', id, w), `before · ${w}`)}
      ${fig(shot('after', id, w), `after · ${w}`)}</div>`).join('')
    await render(`<h1>${title}</h1><p class="note">${sub}。本地测试站实拍，2 倍图按 1 倍显示。</p>${rows}`, path.join(DIR, `compare-${id}.png`))
  }
  const sheet = SCENES.map(([id, title, sub]) => `<h2>${title}</h2><p class="sub">${sub}</p>
    <div class="g" style="grid-template-columns:1fr 300px">
      ${fig(shot('after', id, 1440), '1440')}
      ${fig(shot('after', id, 390), '390')}</div>`).join('')
  await render(`<h1>对话框 / 抽屉：一种写法（shared-ui/Dialog）</h1>
    <p class="note">本地测试站实拍，换完以后。白底 e3、圆角 12、遮罩墨 28%；标题 14/600、说明 13 次要灰；「取消」在左、确认在右，靠右排。左 1440 宽，右 390 宽。</p>${sheet}`, SHEET)
} finally {
  await browser.close()
}
console.log('写到', path.relative(ROOT, DIR), '和', path.relative(ROOT, SHEET))
