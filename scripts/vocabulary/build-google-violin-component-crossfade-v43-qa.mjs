#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-component-crossfade-v43/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-component-crossfade-v43' || manifest.formalAssetsChanged !== false) throw new Error('Expected private V43 component-crossfade candidate')
const entry = manifest.entry
const sources = {
  authority: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  vie: entry.components.vie.publicPath,
  aLynn: entry.components.aLynn.publicPath,
  final: entry.publicPath,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin 同音色分块合成 V43</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:980px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;line-height:1.6;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:22px}.card h2{font-size:20px;margin:0 0 10px}.card p{color:#666b63;line-height:1.55;min-height:50px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:700px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin 同音色分块合成 V43</h1><p class="lead">不再让模型理解或重读 violin，只使用原来的 Google 女声录出两个自然声音块。</p><div class="notice"><strong>先听②和③，再听④。</strong>②应是“歪”，③应是轻读“啊”接重读“琳”。如果两个分块都对而④不对，后面只修连接处。</div><section class="grid"><article class="card"><h2>① Cambridge 正确目标</h2><p>正确读音基准。</p><button data-audio="authority">播放正确基准</button></article><article class="card"><h2>② 原女声：vie</h2><p>只判断开头是不是你要的“歪”。</p><button data-audio="vie">播放 vie</button></article><article class="card"><h2>③ 原女声：a Lynn</h2><p>只判断后半是不是轻“啊”接重“琳”。</p><button data-audio="aLynn">播放 a Lynn</button></article><article class="card"><h2>④ 拼合成品：violin</h2><p>同一音色、两个自然声音块，24ms 波形交叠。</p><button data-audio="final">播放拼合成品</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-component-crossfade-owner-qa-v43.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
