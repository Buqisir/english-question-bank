#!/usr/bin/env node
// Real React consumers and App routes; only HTTP and clipboard outcomes are fixtures.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(new URL('../app/package.json', import.meta.url))('playwright')
const evidence = path.join(root, 'output/playwright/icon-motion')
mkdirSync(evidence, { recursive: true })
const entryPath = '/__icon-motion/main.js'
const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SelectionOverlay } from '/src/features/paper-browse/selection/SelectionOverlay.tsx';
import { ListeningSegmentPlayer } from '/src/features/paper-browse/ListeningSegmentPlayer.tsx';
import { DictionaryCard } from '/src/features/paper-browse/selection/DictionaryCard.tsx';
import { useClipboardCopy } from '/src/hooks/useClipboardCopy.ts';
import { DisclosureIcon } from '/src/icons/MotionIcons.tsx';
import { iconMotionInput } from '/src/icons/motionInput.ts';
import '/src/index.css';
import '/src/App.css';
import '/src/features/paper-browse/paperBrowsePage.css';
import '/src/features/paper-browse/selection/selectionOverlay.css';
const h = React.createElement;
const range = document.createRange(); range.selectNodeContents(document.getElementById('sentence'));
window.copyRequests = [];
Object.defineProperty(navigator, 'clipboard', { value: { writeText(text) {
  return new Promise((resolve, reject) => window.copyRequests.push({ text, resolve, reject }));
} } });
function Fixture() {
 const [open, setOpen] = useState(false);
 const clipboard = useClipboardCopy();
 return h(React.Fragment, null,
  h(SelectionOverlay, { phase:'result', range, translation:'A short translation.', liveMessage:'', onTranslate(){}, onRetry(){}, onPointerInsideChange(){} }),
  h('div', { style:{ marginTop:180 } }, h(ListeningSegmentPlayer, { src:'/fixture.wav', label:'测试', startSeconds:0, endSeconds:12, onActivate(){} })),
  h('div', { className:'paper-browse-reading-header', style:{ marginTop:160 } },
   h('button', { ...iconMotionInput, type:'button', className:'paper-browse-reading-overview-toggle', 'aria-expanded':open, onClick:()=>setOpen(!open) }, '文章简介', h(DisclosureIcon,{expanded:open})),
   h('p', {className:'paper-browse-reading-overview',hidden:!open}, '简短的文章简介。')),
  h('div', {id:'dictionary', style:{maxWidth:340, marginTop:32}}, h(DictionaryCard, {
   surface:'word', lookup:'ready', result:null, lookupError:'', playErrorId:'', sense:{status:'ok',text:'词'}, onRetrySense(){}, onPlayError(){},
   copied:clipboard.copied, copyState:clipboard.state, copyError:clipboard.error, onCopy:()=>clipboard.copy('word')
  }))
 );
}
createRoot(document.getElementById('root')).render(h(Fixture));
`
const vite = await createServer({
  root: path.join(root, 'app'), logLevel: 'error', cacheDir: path.join(evidence, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'icon-motion-fixture',
    resolveId(id) { if (id === entryPath) return '\0icon-motion-main' },
    load(id) { if (id === '\0icon-motion-main') return harness },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__icon-motion/') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(await server.transformIndexHtml(req.url, `<html><head></head><body style="padding:32px"><p id="sentence">A short source sentence.</p><div id="root"></div><script type="module" src="${entryPath}"></script></body></html>`))
      })
    },
  }],
})

function wav() {
  const buffer = Buffer.alloc(44 + 8000 * 15 * 2)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40)
  return buffer
}
const audio = wav()
const word = {
  id:'motion-word', headword:'word', answer:'word', phonetic:'/wɜːd/', partOfSpeech:'n.',
  sourceMeanings:['词'], teachingSense:'词', pronunciationMode:'word', syllables:[],
  audio:{ path:'/fixture.wav', key:'motion', version:'fixture', voice:'fixture' },
  example:{ english:'A word.', chinese:'一个词。', highlight:'word', reviewStatus:'approved' },
  visual:{ path:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24"/%3E', alt:'测试插图' },
  pinned:false, paused:false, status:'repeated', totalWrong:2, currentCorrectDateCount:0,
  lastForgottenDate:'2026-10-03',
  source:{ title:'测试词表', edition:'1', stage:'core', week:1, day:1, sourceOrder:1, printedPage:1, verification:'page-checked' },
}
const vocabularySet = { title:'图标动效验证', entryCount:1, entries:[word], createdAt:'2026-10-03T00:00:00Z' }
const savedSet = { ...vocabularySet, id:'set-motion', programId:'wanwei-round-one-v1', studentId:'motion-student', reviewRunId:null, share:{shareId:'icon-motion', status:'active'} }
const program = { id:'wanwei-round-one-v1', version:'fixture', title:'测试词表', subtitle:'', sourceTitle:'测试词表', sourceEdition:'1', totalPlannedEntries:1, groups:[{id:'day-1',stage:'core',week:1,group:1,sourceLabel:'Day 1',startOrder:1,endOrder:1}], entries:[word] }
let browser
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport:{width:1100,height:1000} })
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  await page.route('**/fixture.wav', route => route.fulfill({ contentType:'audio/wav', body:audio }))
  await page.goto(`${origin}/__icon-motion/`)
  const copy = page.getByRole('button',{name:'复制译文', exact:true})
  await copy.waitFor()
  await page.evaluate(() => {
    window.runs = []
    document.addEventListener('transitionrun', event => {
      if (event.target.closest('.eqb-motion')) window.runs.push({ property:event.propertyName, class:event.target.getAttribute('class') })
    })
  })
  await copy.click()
  assert.equal(await copy.isDisabled(), true)
  assert.equal(await copy.locator('.eqb-motion-copy').getAttribute('data-state'), 'pending')
  await page.waitForFunction(() => window.copyRequests.length === 1)
  await page.evaluate(() => window.copyRequests[0].reject(new Error('denied')))
  await page.getByRole('alert').filter({hasText:'复制未成功'}).waitFor()
  assert.equal(await copy.locator('.eqb-motion-copy').getAttribute('data-state'),'idle')
  await copy.click()
  await page.waitForTimeout(100)
  await page.evaluate(() => window.copyRequests[1].resolve())
  await page.waitForFunction(() => document.querySelector('.eqb-motion-copy').dataset.state === 'done')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.eqb-copy-check')).opacity==='1', null, { timeout:1500 })
  assert.ok(await page.evaluate(() => window.runs.some(r=>r.property==='transform')))
  await page.screenshot({path:path.join(evidence,'copy-success.png')})
  await page.waitForFunction(() => document.querySelector('.eqb-motion-copy').dataset.state === 'idle')
  await copy.focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.copyRequests.length === 3)
  await page.evaluate(() => window.copyRequests[2].resolve())
  assert.ok(await copy.locator('.eqb-copy-check').evaluate(n=>getComputedStyle(n).transitionDuration==='0s'))
  console.log('PASS translation copy: pending, actual success, failure, reset and keyboard')

  const dictionaryCopy=page.locator('#dictionary button[aria-label="复制词条"]')
  await dictionaryCopy.click()
  assert.equal(await dictionaryCopy.isDisabled(),true)
  await page.evaluate(() => window.copyRequests[3].resolve())
  await page.waitForFunction(() => document.querySelector('#dictionary .eqb-motion-copy').dataset.state==='done')
  console.log('PASS dictionary uses the same copy feedback')

  await page.getByRole('button',{name:'测试录音',exact:true}).click()
  const transport=page.locator('.listening-player-play')
  await page.waitForFunction(() => document.querySelector('.listening-player audio').paused===false)
  await page.waitForFunction(() => document.querySelector('.listening-player .eqb-motion-playback').dataset.playing==='true')
  await transport.click()
  await page.waitForFunction(() => document.querySelector('.listening-player .eqb-motion-playback').dataset.playing==='false')
  for(let i=0;i<4;i++) await transport.click()
  await page.waitForTimeout(250)
  assert.equal(await transport.locator('.eqb-motion-playback').getAttribute('data-playing'),'false')
  await transport.focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.listening-player .eqb-motion-playback').dataset.playing==='true')
  assert.ok(await transport.locator('.eqb-play-left').evaluate(n=>getComputedStyle(n).transitionDuration==='0s'))
  await page.locator('.listening-player audio').evaluate(n=>{n.pause();n.dispatchEvent(new Event('error'))})
  await page.waitForFunction(() => document.querySelector('.listening-player .eqb-motion-playback').dataset.playing==='false')
  console.log('PASS real audio play/pause/error events, rapid reversal and keyboard')

  const overview=page.getByRole('button',{name:'文章简介',exact:true})
  await overview.click(); assert.equal(await overview.getAttribute('aria-expanded'),'true')
  await page.waitForTimeout(200)
  assert.equal(await overview.locator('.eqb-motion-disclosure').evaluate(n=>getComputedStyle(n).transform),'matrix3d(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)')
  await page.emulateMedia({reducedMotion:'reduce'})
  await overview.click()
  await dictionaryCopy.click()
  assert.equal(await dictionaryCopy.locator('.eqb-copy-paper svg > path:last-of-type').evaluate(n=>getComputedStyle(n).transform),'none')
  await page.evaluate(() => window.copyRequests.at(-1).resolve())
  await overview.focus(); await page.keyboard.press('Enter')
  assert.equal(await overview.locator('.eqb-motion-disclosure').evaluate(n=>getComputedStyle(n).transitionDuration),'0s')
  await page.getByRole('button',{name:'测试录音',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.listening-player .eqb-motion-playback')?.dataset.playing==='true')
  assert.ok(await transport.locator('.eqb-pause-bars path').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).transform==='none')))
  console.log('PASS disclosure direction, reduced motion and instant keyboard transition')

  let pinResponse
  let pinned = false
  await page.route('**/api/**', async route => {
    const url=new URL(route.request().url())
    const pathname=url.pathname
    if(pathname==='/api/auth/me') return route.fulfill({json:{authRequired:false,user:null}})
    if(pathname.startsWith('/api/public/vocabulary/')) return route.fulfill({json:{vocabularySet}})
    if(pathname==='/api/vocabulary/students') return route.fulfill({json:{students:[{id:'motion-student',displayName:'演示学生',isDefault:true}]}})
    if(pathname==='/api/vocabulary/programs') return route.fulfill({json:{programs:[program]}})
    if(pathname==='/api/vocabulary/programs/wanwei-round-one-v1') return route.fulfill({json:{program}})
    if(pathname==='/api/vocabulary/sets') return route.fulfill({json:{vocabularySets:[savedSet]}})
    if(pathname==='/api/vocabulary/sets/set-motion') return route.fulfill({json:{vocabularySet:savedSet}})
    if(pathname.startsWith('/api/vocabulary/progress/')) return route.fulfill({json:{progress:{cursor:0,lastTarget:15}}})
    if(pathname.endsWith('/flag')) { pinResponse=route; return }
    if(pathname==='/api/vocabulary/meaning-review-states') return route.fulfill({json:{states:[{...word,pinned}]}})
    if(pathname==='/api/vocabulary/dictation-tasks') return route.fulfill({json:{tasks:[]}})
    if(pathname==='/api/vocabulary/meaning-recall-records'||pathname==='/api/vocabulary/dictation-records') return route.fulfill({json:{records:[]}})
    if(pathname==='/api/vocabulary/set-library') return route.fulfill({json:{library:{items:[],page:1,pageSize:20,total:0,hasMore:false}}})
    if(pathname==='/api/question-groups') return route.fulfill({json:{questionGroups:[]}})
    return route.fulfill({json:{}})
  })
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.goto(`${origin}/?view=vocabulary-dictation-workbench`)
  await page.getByRole('button',{name:'待复习',exact:true}).click()
  const pin=page.getByRole('button',{name:'重点',exact:true})
  await pin.waitFor()
  const tip=()=>pin.locator('svg').evaluate(n=>{
    const point=new DOMPoint(12,21).matrixTransform(n.getScreenCTM());return {x:point.x,y:point.y}
  })
  const before=await tip(),box=await pin.boundingBox()
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(100)
  const pressed=await tip()
  assert.ok(Math.hypot(before.x-pressed.x,before.y-pressed.y)<.05,'14px pin needle stays anchored')
  await page.mouse.up()
  await page.waitForFunction(()=>document.querySelector('.eqb-motion-pin').closest('button').disabled)
  assert.equal(await pin.getAttribute('aria-pressed'),'false')
  await pinResponse.fulfill({status:500,json:{message:'保存未成功'}})
  await page.waitForFunction(()=>!document.querySelector('.eqb-motion-pin').closest('button').disabled)
  assert.equal(await pin.getAttribute('aria-pressed'),'false')
  pinResponse=null
  await pin.click()
  while(!pinResponse) await new Promise(resolve=>setTimeout(resolve,10))
  pinned=true;await pinResponse.fulfill({json:{ok:true}})
  await page.waitForFunction(()=>document.querySelector('.eqb-motion-pin').dataset.pinned==='true')
  await page.waitForTimeout(260)
  assert.equal(await pin.locator('svg > g').evaluate(n=>getComputedStyle(n).opacity),'1')
  assert.equal(await page.getByText('保存未成功',{exact:true}).count(),0)
  await page.screenshot({path:path.join(evidence,'workbench-pin.png')})
  console.log('PASS App workbench: anchored pin, pending lock, rejected save and confirmed fill')

  await page.goto(`${origin}/?view=vocabulary-review&setId=set-motion`)
  await page.evaluate(()=>{
    window.copyRequests=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){return new Promise((resolve,reject)=>window.copyRequests.push({text,resolve,reject}))}}})
  })
  const listCopy=page.getByRole('button',{name:'复制清单',exact:true})
  await listCopy.click()
  assert.equal(await listCopy.isDisabled(),true)
  assert.equal(await listCopy.locator('.eqb-motion-copy').getAttribute('data-state'),'pending')
  await page.evaluate(()=>window.copyRequests[0].resolve())
  await page.getByRole('button',{name:'已复制',exact:true}).waitFor()
  const shareCopy=page.getByRole('button',{name:'复制公开链接',exact:true})
  await shareCopy.click()
  await page.evaluate(()=>window.copyRequests[1].reject(new Error('denied')))
  await page.getByRole('button',{name:'复制失败',exact:true}).waitFor()
  console.log('PASS App vocabulary review: list success and public-link copy failure')

  for(const route of ['listen','dictation']) {
    await page.goto(`${origin}/vocabulary/${route}/icon-motion`)
    const button=page.locator(route==='listen'?'.vocabulary-listen-primary-control':'.primary-control')
    await button.click()
    await page.waitForFunction(()=>document.querySelector('.eqb-motion-playback')?.dataset.playing==='true')
    await button.click()
    await page.waitForFunction(()=>document.querySelector('.eqb-motion-playback').dataset.playing==='false')
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.eqb-play-left')).opacity==='1')
    await page.setViewportSize({width:390,height:844})
    await page.screenshot({path:path.join(evidence,`${route}-narrow.png`)})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    console.log(`PASS App ${route} route: session playback state and narrow viewport`)
  }
  assert.deepEqual(errors,[])
  console.log('PASS no browser runtime errors')
} finally {
  await browser?.close()
  await vite.close()
}
