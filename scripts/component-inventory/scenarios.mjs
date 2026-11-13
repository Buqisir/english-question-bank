// 构件清点 · 页面场景：按固定顺序走的页面和状态（render.mjs 用它取数，analyze.mjs 用它判断在不在主线）。
// mainline = 在「找题 → 加入 → 草稿卷 → 导出」这条主线上。
import { OWNER } from './rig.mjs'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function settle(page, ms = 1200) { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(ms) }
export async function login(page, base) {
  await page.goto(base + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
  await page.locator('#login-username').fill(OWNER.username); await page.locator('#login-password').fill(OWNER.password)
  await page.locator('.login-submit').click(); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 }); await settle(page, 600)
}
export async function addDraftItems(page) {
  return page.evaluate(async () => {
    let d = await (await fetch('/api/draft-papers/current?create=1')).json()
    if ((d.draftPaper?.items || []).length < 3) {
      for (const g of ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c']) {
        const r = await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
        if (!r.ok && r.status !== 409) throw new Error('add ' + g + ' ' + r.status + ' ' + (await r.text()).slice(0, 200))
      }
      d = await (await fetch('/api/draft-papers/current')).json()
    }
    return d.draftPaper.items.map((i) => ({ id: i.id, groupId: i.groupId }))
  })
}
async function suggestRoutes(page, items) {
  // 排序建议和分页小签要真排一遍才算得出；测试数据算不出，这里拦截接口塞一条（与 verify-reorder-suggest 同法）
  await page.route('**/pagination*', async (route) => {
    try {
      const res = await route.fetch({ timeout: 120000 }); const json = await res.json()
      json.pageBreakSuggestions = [{ itemId: items[1].id, groupId: items[1].groupId, reason: '跨页断篇（第1/2页）' }]
      await route.fulfill({ response: res, json })
    } catch {} // 页面已关时请求作废，不算错
  })
  await page.route('**/reorder-suggestion*', (route) => route.fulfill({ json: { suggestion: { order: [items[0].id, ...items.slice(2).map((i) => i.id), items[1].id], move: { kind: 'end', itemId: items[1].id }, brokenGroupId: items[1].groupId }, reused: false } }))
}
const clickText = async (page, re, sel = 'button,[role=menuitem],a') => { const l = page.locator(sel).filter({ hasText: re }).first(); await l.click({ timeout: 8000 }); }

// 每个场景：id、主线与否、怎么到达。顺序有依赖（先空后满）。
export const SKIPPED = () => SCENARIOS.filter((s) => s.skip).map((s) => ({ id: s.id, why: s.skip }))
export const SCENARIOS = [
  { id: 'login', auth: false, mainline: false, go: async (p, b) => { await p.goto(b + '/'); await p.locator('.login-card').waitFor({ timeout: 30000 }); await settle(p, 1500) } },
  { id: 'login-error', auth: false, mainline: false, go: async (p, b) => { await p.goto(b + '/'); await p.locator('#login-username').fill(OWNER.username); await p.locator('#login-password').fill('wrong-password'); await p.locator('.login-submit').click(); await p.locator('.login-error').waitFor({ timeout: 15000 }); await sleep(600) } },
  { id: 'home', mainline: true, go: async (p, b) => { await p.goto(b + '/'); await settle(p, 2000) } },
  { id: 'home-results', mainline: true, go: async (p, b) => { await p.goto(b + '/'); await settle(p, 1500); const i = p.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter'); await settle(p, 3000) } },
  { id: 'home-row-menu', mainline: true, go: async (p) => { await p.locator('.concierge-row-menu-trigger, [aria-haspopup="menu"]').first().click({ timeout: 8000 }); await sleep(500) } },
  { id: 'home-added', mainline: true, go: async (p) => { await p.keyboard.press('Escape'); await sleep(300); await p.locator('button').filter({ hasText: /^加入/ }).first().click({ timeout: 8000 }); await sleep(900) } },
  { id: 'home-noresult', mainline: true, go: async (p, b) => { await p.goto(b + '/'); await settle(p, 1500); const i = p.locator('.concierge-intent-input'); await i.fill('zzqqxx 不存在的题'); await i.press('Enter'); await settle(p, 3000) } },
  { id: 'browse', mainline: true, go: async (p, b) => { await p.goto(b + '/?view=browse'); await settle(p, 2000) } },
  { id: 'detail', mainline: true, go: async (p, b) => { await p.goto(b + '/?view=detail&groupId=group-2026-i-reading-a'); await settle(p, 2500) } },
  { id: 'paper-browse', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=paper-browse&paperId=paper-2026-i'); await settle(p, 3000) } },
  { id: 'paper-browse-selection', mainline: false, go: async (p) => {
    const para = p.locator('.paper-browse-page p, [class*="paper-surface"] p').first(); const bb = await para.boundingBox()
    await p.mouse.move(bb.x + 4, bb.y + 8); await p.mouse.down(); await p.mouse.move(bb.x + 90, bb.y + 8, { steps: 6 }); await p.mouse.up(); await sleep(1500) } },
  { id: 'paper-browse-lecture', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=paper-browse&paperId=paper-2026-i&lecture=1'); await settle(p, 3000) } },
  { id: 'paper-browse-similar', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=paper-browse&paperId=paper-2026-i&similar=1'); await settle(p, 3000) } },
  { id: 'draft-empty', mainline: true, go: async (p, b) => { await p.evaluate(async () => { const d = await (await fetch('/api/draft-papers/current?create=1')).json(); for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' }) }); await p.goto(b + '/?view=draft-paper'); await p.getByText('还没有题组').first().waitFor({ timeout: 30000 }); await settle(p, 1500) } },
  { id: 'draft', mainline: true, go: async (p, b, ctx) => { ctx.items = await addDraftItems(p); await suggestRoutes(p, ctx.items); await p.goto(b + '/?view=draft-paper'); await p.locator('.draft-reorder-suggestion').waitFor({ timeout: 120000 }); await settle(p, 1500) } },
  { id: 'draft-decided', mainline: true, go: async (p) => { await p.locator('.draft-reorder-suggestion-act').click(); await sleep(1200) } },
  { id: 'draft-group-actions', mainline: true, go: async (p) => { const t = p.locator('[aria-label="更多题组操作"]').first(); await t.waitFor({ timeout: 150000 }); await t.click({ timeout: 8000 }); await sleep(500) } },
  { id: 'draft-export-menu', mainline: true, go: async (p) => { await p.keyboard.press('Escape'); await p.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click({ timeout: 8000 }); await sleep(500) } },
  { id: 'draft-more-menu', mainline: true, go: async (p) => { await p.keyboard.press('Escape'); await p.locator('.draft-more-menu-trigger').first().click({ timeout: 8000 }); await sleep(500) } },
  { id: 'draft-space-dialog', mainline: false, go: async (p) => { await p.keyboard.press('Escape'); await p.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(300); await clickText(p, /个人空间/); await sleep(1500) } },
  { id: 'draft-saved', mainline: false, go: async (p) => { await p.locator('.draft-save-space-dialog button[type=submit]').click({ timeout: 8000 }); await p.locator('.draft-save-space-dialog').waitFor({ state: 'detached', timeout: 150000 }); await sleep(800) } },
  { id: 'draft-removed-toast', mainline: true, go: async (p) => { await p.keyboard.press('Escape'); const t = p.locator('[aria-label="更多题组操作"]').first(); await t.waitFor({ timeout: 150000 }); await t.click(); await sleep(300); await clickText(p, /移除/); await p.locator('.draft-undo-toast[data-visible="true"]').first().waitFor({ timeout: 15000 }); await sleep(600) } },
  { id: 'my-space', mainline: false, go: async (p, b) => { await p.unrouteAll({ behavior: 'ignoreErrors' }); await p.goto(b + '/?view=my-space'); await settle(p, 2000) } },
  { id: 'my-space-menu', mainline: false, go: async (p) => { await p.locator('.my-space-row-menu-trigger').first().click({ timeout: 8000 }); await sleep(500) } },
  { id: 'my-space-confirm', mainline: false, go: async (p) => { await clickText(p, /删除文件/, '[role=menuitem],button'); await p.getByText('删除草稿卷 PDF').waitFor({ timeout: 8000 }); await sleep(700) } },
  { id: 'vocab-notebook', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=vocabulary-notebook'); await settle(p, 2000) } },
  { id: 'vocab-review', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=vocabulary-review'); await settle(p, 2000) } },
  { id: 'vocab-practice', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=vocabulary-practice'); await settle(p, 2000) } },
  { id: 'vocab-dictation', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=vocabulary-dictation-workbench'); await settle(p, 2000) } },
  { id: 'admin', mainline: false, go: async (p, b) => { await p.goto(b + '/?view=admin'); await settle(p, 2000) } },
  { id: 'admin-token-revoke', mainline: false, go: async (p) => { const i = p.locator('.agent-tokens form input').first(); await i.fill('清点用口令'); await p.locator('.agent-token-submit').click(); await sleep(1200); await clickText(p, /作废口令/); await p.locator('.agent-token-dialog').waitFor({ timeout: 8000 }); await sleep(600) } },
  { id: 'reading-analysis', mainline: false, skip: '这个页面 2026-07-16 已下线（App.tsx reading-analysis-retire），打开只会回到首页，会重复计首页',  go: async (p, b) => { await p.goto(b + '/?view=reading-analysis'); await settle(p, 2000) } },
  { id: 'paper-intelligence', mainline: false, skip: '同上，2026-07-16 已下线',  go: async (p, b) => { await p.goto(b + '/?view=paper-intelligence'); await settle(p, 2000) } },
]
