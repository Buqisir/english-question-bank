#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-sub-alias-v42/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-sub-alias-v42' || manifest.formalAssetsChanged !== false) throw new Error('Expected private V42 alias candidate')
const sources = {
  authority: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  context: manifest.entry.context.publicPath,
  crop: manifest.entry.crop.publicPath,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin 同音色词语替换 V42</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:960px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;line-height:1.6;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:22px}.card h2{font-size:20px}.card p{color:#666b63;line-height:1.55;min-height:96px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:760px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin 同音色词语替换 V42</h1><p class="lead">千问已停。本轮回到原 Google 女声，但让它在句中实际念 <code>vie a Lynn</code>。</p><div class="notice"><strong>音色完全没换，也没有人工拼音节。</strong>Google 自己在一句话里完成“歪啊 LIN”的连读。先听完整句；若完整句正确，再判断裁切。</div><section class="grid"><article class="card"><h2>① Cambridge 正确目标</h2><p>唯一听觉基准。</p><button data-audio="authority">播放正确基准</button></article><article class="card"><h2>② 原女声完整句</h2><p>判断合成本身是否终于读对。这里错就不用听裁切。</p><button data-audio="context">播放完整句</button></article><article class="card"><h2>③ 同源单词切片</h2><p>②与③来自同一条音，只用于判断切点与连贯性。</p><button data-audio="crop">播放裁切词</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-sub-alias-owner-qa-v42.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
