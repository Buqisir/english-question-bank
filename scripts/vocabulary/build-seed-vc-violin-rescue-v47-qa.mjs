#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-seed-vc-violin-v47/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-seed-vc-violin-rescue-v47' || manifest.formalAssetsChanged !== false) throw new Error('Expected private V47 Seed-VC candidate')
const sources = {
  authority: manifest.source.url,
  candidate: manifest.entry.publicPath,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin Cambridge 母带音色迁移 V47</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:820px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;line-height:1.65;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:24px}.card h2{font-size:20px;margin:0 0 10px}.card p{color:#666b63;line-height:1.55;min-height:72px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:680px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin：锁定正确发音 V47</h1><p class="lead">这次不再让任何 TTS 读 violin。</p><div class="notice"><strong>Cambridge 的发音、重音和节奏被直接保留。</strong>Seed-VC 只把说话人音色迁移到现有 Google C 女声；机器复核前后都识别为 <code>violin</code>。</div><section class="grid"><article class="card"><h2>① Cambridge 正确母带</h2><p>不可改变的发音基准。</p><button data-audio="authority">播放正确母带</button></article><article class="card"><h2>② Google 女声音色迁移</h2><p>同一发音母带，只转换音色，不重新拼读。</p><button data-audio="candidate">播放 V47 成品</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'seed-vc-violin-rescue-owner-qa-v47.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
