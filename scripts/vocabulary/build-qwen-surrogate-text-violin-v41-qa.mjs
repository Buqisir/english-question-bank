#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const v40 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-qwen-dual-teacher-violin-v40/manifest.json'), 'utf8'))
const v41 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-qwen-surrogate-text-violin-v41/manifest.json'), 'utf8'))
if (v41.schemaVersion !== 'gaokao-frequency-qwen-surrogate-text-violin-v41' || v41.formalAssetsChanged !== false) throw new Error('Expected one private V41 candidate')
const sources = {
  authority: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  prior: v40.entry.publicPath,
  surrogate: v41.entry.publicPath,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin 绕过词典先验 V41</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:960px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#fff7d8;border:1px solid #e6d78a;border-radius:14px;padding:16px 18px;line-height:1.6;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:22px}.card h2{font-size:20px}.card p{color:#666b63;line-height:1.55;min-height:96px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:760px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin 绕过词典先验 V41</h1><p class="lead">只改了千问看到的文字，模型、参考音频、音色和随机种子全部与 V40 相同。</p><div class="notice"><strong>V41 不再把目标写成 violin，</strong>而是写成 <code>vie-a-Lynn</code>，直接要求“歪—啊—LIN”。先只判断音素与重读；若读对但不够连贯，下一步只修间隙。</div><section class="grid"><article class="card"><h2>① Cambridge 正确目标</h2><p>“歪啊 LIN”的听觉基准。</p><button data-audio="authority">播放正确基准</button></article><article class="card"><h2>② V40 错误对照</h2><p>目标文字仍写 violin，模型发音先验把重读拉错。</p><button data-audio="prior">播放 V40</button></article><article class="card"><h2>③ V41 文字替身</h2><p>目标文字改成 vie-a-Lynn。先听重读是否终于落在 LIN。</p><button data-audio="surrogate">播放 V41</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'qwen-surrogate-text-violin-owner-qa-v41.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
