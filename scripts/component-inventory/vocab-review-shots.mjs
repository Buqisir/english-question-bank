#!/usr/bin/env node
// 过生词的按钮换构件前后对照（构件厂第 4 步第十页）：开始设置、选择下一词、过完一轮、生词组、分享确认、
// 重新打开生词组、出错重新加载这几处的 .ghost-button / .primary-button。拍静止、悬停、键盘焦点（有禁用的拍禁用），
// 宽屏 1440 和窄屏 390；量出位置和实算样式。胶囊、分段开关、列表行、带描边的键这次没换，只在区域图里带上。
//
// 数据：清点用的本地网站没有词汇课程（/api/vocabulary/programs 回空，页面停在「词库没有加载出来」）。
// 脚本起网站以后，用仓库自带的 scripts/vocabulary/import-calibration-program.mjs 把 30 词的校准课程导进
// 这次临时的数据库（.scratch/component-inventory/rigdata/qb.sqlite），不碰仓库里的数据库。之后过词、生成生词组、
// 公开分享、撤销分享都走页面上的正常操作和正常接口。
// 拦接口只有一处：两种出错状态（词库、学生档案没加载出来）各让对应接口回一次 500，拍完就撤掉。
// 不点「复制」类的键（会写剪贴板），也不真的下载 PDF。
//
// 用法：node scripts/component-inventory/vocab-review-shots.mjs before|after
// 输出：design/components-2026-11-13/migrate-vocab-review/<before|after>/
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：vocab-review-shots.mjs before|after'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-vocab-review', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const PAGE = '/?view=vocabulary-review'

function measure(selector) {
  const round = (n) => Math.round(n * 10) / 10
  return [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector(':scope svg')
    return {
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      cls: typeof e.className === 'string' ? e.className : '',
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      iconX: svg ? round(svg.getBoundingClientRect().x) : null,
      bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}`,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, radius: cs.borderRadius,
      border: cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      opacity: cs.opacity, cursor: cs.cursor, outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
      busy: e.getAttribute('aria-busy') || undefined, expanded: e.getAttribute('aria-expanded') || undefined,
      name: e.getAttribute('aria-label') || undefined,
    }
  })
}

async function shotAround(page, name, locators, pad = 12) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  if (!boxes.length) return false
  const vp = page.viewportSize()
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  if (x1 <= x0 || y1 <= y0) return false
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 区域：前后都认得的容器类名（这次没改容器）。
const A = {
  heading: '.vocabulary-heading-actions',
  start: '.vocabulary-run-start-row',
  direct: '.vocabulary-direct-set',
  explorerHead: '.vocabulary-progress-explorer-heading',
  explorerPick: '.vocabulary-progress-selection',
  done: '.vocabulary-completion-state .vocabulary-completion-actions',
  rail: '.vocabulary-collection-actions',
  confirm: '.vocabulary-share-download-confirmation',
  reopen: '.vocabulary-set-reopen .vocabulary-completion-actions',
  error: '.vocabulary-run-setup',
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RAW, 'rigdata/qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) { await rig.stop(); throw new Error('导入校准课程失败：' + imported.stderr.slice(-400)) }
const browser = await chromium.launch({ channel: 'chromium' })
const result = {}
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const keyFocus = async (locator) => { await page.keyboard.press('Shift'); await locator.focus(); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const rec = { missing: [] }
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        rec.missing.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`)
        await page.screenshot({ path: path.join(OUT, `missing-${name}${suffix}.png`) }).catch(() => {})
      }
    }
    const area = (key) => page.locator(A[key]).first()
    // 区域静止图 + 区域里每个键的量值
    const still = async (name, key) => {
      await blur(); await park()
      await area(key).scrollIntoViewIfNeeded(); await sleep(200)
      await shotAround(page, `${name}${suffix}`, [area(key)])
      rec[name] = await page.evaluate(measure, `${A[key]} :is(button, a)`)
    }
    // 悬停和键盘焦点：只在宽屏拍。图围着整个区域截，看得出和旁边键的关系。
    const hoverFocus = async (name, key, locator) => {
      if (suffix) return
      await step(name, async () => {
        await locator.scrollIntoViewIfNeeded()
        await locator.hover(); await sleep(350)
        await shotAround(page, `${name}-hover`, [area(key)])
        rec[`${name}Hover`] = await locator.evaluate(measureOne)
        await park(); await keyFocus(locator)
        await shotAround(page, `${name}-focus`, [area(key)])
        rec[`${name}Focus`] = await locator.evaluate(measureOne)
        await blur()
      })
    }
    const btn = (key, name) => area(key).getByRole('button', { name, exact: true })
    await login(page, rig.base)

    // 1. 两种出错：「重新加载」
    await step('error', async () => {
      await page.route(/\/api\/vocabulary\/programs(\?|$)/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"shot"}' }))
      await page.goto(rig.base + PAGE); await page.getByRole('button', { name: '重新加载' }).waitFor({ timeout: 30000 }); await settle(page, 800)
      await still('error-program', 'error')
      await hoverFocus('reload-program', 'error', btn('error', '重新加载'))
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await page.route(/\/api\/vocabulary\/students(\?|$)/, (route) => route.request().method() === 'GET'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"shot"}' }) : route.fallback())
      await page.goto(rig.base + PAGE); await page.getByRole('button', { name: '重新加载' }).waitFor({ timeout: 30000 }); await settle(page, 800)
      await still('error-students', 'error')
      await hoverFocus('reload-students', 'error', btn('error', '重新加载'))
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    })

    // 2. 开始设置：「单词复习」「开始过词」「生成固定词组」（没填词时禁用，填了以后可点）
    await step('setup', async () => {
      await page.goto(rig.base + PAGE); await page.locator(A.start).waitFor({ timeout: 30000 }); await settle(page, 1500)
      await blur(); await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      await page.screenshot({ path: path.join(OUT, `setup${suffix}.png`) })
      await still('heading', 'heading')
      await hoverFocus('dictation', 'heading', btn('heading', '单词复习'))
      await page.locator('.vocabulary-run-fields input').fill('2'); await sleep(200)
      await still('start', 'start')
      await hoverFocus('start', 'start', btn('start', '开始过词'))
      await still('direct', 'direct')
      await page.locator('#vocabulary-direct-set-input').fill('about，advice'); await sleep(300)
      await still('direct-filled', 'direct')
      await hoverFocus('direct-generate', 'direct', btn('direct', '生成固定词组'))
      await page.locator('#vocabulary-direct-set-input').fill(''); await sleep(200)
    })

    // 3. 选择下一词：「返回开始设置」；选一个词以后出「确认从这里开始」（不点确认）
    await step('explorer', async () => {
      await page.getByRole('button', { name: '查看 / 调整进度' }).click(); await page.locator(A.explorerHead).waitFor({ timeout: 15000 }); await settle(page, 600)
      await still('explorer-head', 'explorerHead')
      await hoverFocus('explorer-close', 'explorerHead', btn('explorerHead', '返回开始设置'))
      await page.locator('.vocabulary-progress-word').nth(5).click(); await page.locator(A.explorerPick).waitFor({ timeout: 15000 }); await sleep(400)
      await still('explorer-pick', 'explorerPick')
      await hoverFocus('explorer-confirm', 'explorerPick', btn('explorerPick', '确认从这里开始'))
      await btn('explorerHead', '返回开始设置').click(); await page.locator(A.start).waitFor({ timeout: 15000 }); await sleep(400)
    })

    // 4. 过两个词（都「不认识，收下」），到「已收满」：生成固定生词组、复制清单、开始下一轮；右栏复制、下载（还没有生词组，禁用）
    await step('done', async () => {
      await page.locator('.vocabulary-run-fields input').fill('2')
      await page.locator(A.start).getByRole('button').last().click()
      for (let i = 0; i < 2; i++) {
        const u = page.locator('.vocabulary-control-unfamiliar:not(:disabled)'); await u.waitFor({ timeout: 20000 }); await u.click(); await sleep(700)
      }
      await page.locator(A.done).waitFor({ timeout: 20000 }); await settle(page, 1000)
      await blur(); await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      await page.screenshot({ path: path.join(OUT, `done${suffix}.png`) })
      await still('done', 'done')
      await still('rail', 'rail')
      await hoverFocus('generate', 'done', btn('done', '生成固定生词组'))
      await hoverFocus('copy-list', 'done', btn('done', '复制清单'))
      await hoverFocus('next-round', 'done', btn('done', '开始下一轮'))
      await hoverFocus('rail-copy', 'rail', btn('rail', '复制'))
    })

    // 5. 生成固定生词组：保存名称（没改名时禁用）、下载（菜单开关）、生成公开二维码、趣味练习；右栏下载可点了
    await step('set', async () => {
      await btn('done', '生成固定生词组').click(); await page.locator('.vocabulary-set-title-control').waitFor({ timeout: 30000 }); await settle(page, 1000)
      await blur(); await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      await page.screenshot({ path: path.join(OUT, `set${suffix}.png`) })
      await still('set', 'done')
      await still('rail-set', 'rail')
      const trigger = page.locator('.vocabulary-download-menu > button')
      await hoverFocus('download', 'done', trigger)
      await hoverFocus('create-share', 'done', btn('done', '生成公开二维码'))
      await hoverFocus('practice', 'done', btn('done', '趣味练习'))
      await hoverFocus('rail-download', 'rail', btn('rail', '下载'))
      const title = page.locator('#vocabulary-set-title'); const original = await title.inputValue()
      await title.fill(original + '（改）'); await sleep(200)
      await still('set-renamed', 'done')
      await hoverFocus('save-title', 'done', btn('done', '保存名称'))
      await title.fill(original); await sleep(200)
      // 下载菜单打开着：键是 aria-expanded=true
      await trigger.click(); await page.locator('#vocabulary-download-options').waitFor({ timeout: 8000 }); await sleep(300); await park()
      await shotAround(page, `download-open${suffix}`, [area('done'), page.locator('#vocabulary-download-options')])
      rec.downloadOpen = await page.evaluate(measure, '.vocabulary-download-menu > button')
      await trigger.click(); await sleep(300)
    })

    // 6. 下载要公开二维码的文件（单词纸）时的确认条：取消、生成链接并下载（不点「生成链接并下载」）
    await step('confirm', async () => {
      await page.locator('.vocabulary-download-menu > button').click(); await page.locator('#vocabulary-download-options').waitFor({ timeout: 8000 })
      await page.locator('#vocabulary-download-options .vocabulary-download-option').first().locator('button').first().click()
      await page.locator(A.confirm).waitFor({ timeout: 8000 }); await sleep(400)
      await still('confirm', 'confirm')
      await hoverFocus('confirm-cancel', 'confirm', btn('confirm', '取消'))
      await hoverFocus('confirm-go', 'confirm', btn('confirm', '生成链接并下载'))
      await btn('confirm', '取消').click(); await sleep(300)
    })

    // 7. 生成公开二维码以后：复制公开链接
    await step('shared', async () => {
      await btn('done', '生成公开二维码').click(); await btn('done', '复制公开链接').waitFor({ timeout: 20000 }); await settle(page, 600)
      await still('shared', 'done')
      await hoverFocus('copy-link', 'done', btn('done', '复制公开链接'))
    })

    // 8. 重新进页面，打开刚才那份生词组：撤销公开分享、复制公开链接、复制清单、趣味练习、看词说义、返回；
    //    撤销以后出「生成公开二维码」
    await step('reopen', async () => {
      // 页面记得刚才那份生词组，重新打开时直接进它；没记住时从「最近生词组」点开。
      await page.goto(rig.base + PAGE)
      await page.locator(`${A.reopen}, .vocabulary-recent-set-list button`).first().waitFor({ timeout: 30000 }); await settle(page, 1000)
      if (!(await page.locator(A.reopen).count())) {
        await page.locator('.vocabulary-recent-set-list button').first().click(); await page.locator(A.reopen).waitFor({ timeout: 20000 }); await settle(page, 800)
      }
      rec.reopenVia = page.url().replace(rig.base, '')
      await blur(); await park(); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
      await page.screenshot({ path: path.join(OUT, `reopen-page${suffix}.png`) })
      await still('reopen', 'reopen')
      await hoverFocus('revoke', 'reopen', btn('reopen', '撤销公开分享'))
      await hoverFocus('reopen-copy-link', 'reopen', btn('reopen', '复制公开链接'))
      await hoverFocus('reopen-copy-list', 'reopen', btn('reopen', '复制清单'))
      await hoverFocus('reopen-practice', 'reopen', btn('reopen', '趣味练习'))
      await hoverFocus('look-say', 'reopen', btn('reopen', '看词说义'))
      await hoverFocus('back', 'reopen', btn('reopen', '返回'))
      await btn('reopen', '撤销公开分享').click(); await btn('reopen', '生成公开二维码').waitFor({ timeout: 20000 }); await settle(page, 600)
      await still('reopen-unshared', 'reopen')
      await hoverFocus('reopen-create-share', 'reopen', btn('reopen', '生成公开二维码'))
    })

    rec.errors = errors
    result[`w${width}`] = rec
    console.log(`w${width} missing`, rec.missing, 'errors', errors.length)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)

// 单个键的量值（悬停、焦点时用）：和 measure 同样的字段。
function measureOne(e) {
  const round = (n) => Math.round(n * 10) / 10
  const cs = getComputedStyle(e), r = e.getBoundingClientRect()
  return {
    text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), cls: e.className,
    x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
    bg: cs.backgroundColor, color: cs.color, font: `${cs.fontSize}/${cs.fontWeight}`,
    outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor} @${cs.outlineOffset}`,
    transform: cs.transform === 'none' ? null : cs.transform, focusVisible: e.matches(':focus-visible'),
  }
}
