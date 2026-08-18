#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-c-family-violin-rescue-v46/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-c-family-violin-rescue-v46' || manifest.formalAssetsChanged !== false || manifest.entries.length !== 2) throw new Error('Expected two private V46 C-family candidates')
const waveNet = manifest.entries.find((entry) => entry.voice === 'en-US-Wavenet-C')
const standard = manifest.entries.find((entry) => entry.voice === 'en-US-Standard-C')
if (!waveNet || !standard) throw new Error('Missing V46 C-family candidate')
const sources = {
  authority: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  waveNet: waveNet.crop.publicPath,
  standard: standard.crop.publicPath,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin Google C 系列最终救援 V46</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:960px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;line-height:1.6;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:22px}.card h2{font-size:20px;margin:0 0 10px}.card p{color:#666b63;line-height:1.55;min-height:72px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:760px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin：Google C 系列最终救援 V46</h1><p class="lead">不再改拼写、音标或提示词；只换同为 C 号美式女声的合成引擎。</p><div class="notice"><strong>只需要判断哪一个能用。</strong>若 WaveNet-C 或 Standard-C 读音正确且音色能接受，就让最后一个词过关，不再卡住发布。</div><section class="grid"><article class="card"><h2>① Cambridge 正确目标</h2><p>正确读音基准。</p><button data-audio="authority">播放正确基准</button></article><article class="card"><h2>② Google WaveNet-C</h2><p>同为 C 号美式女声，WaveNet 引擎。</p><button data-audio="waveNet">播放 WaveNet-C</button></article><article class="card"><h2>③ Google Standard-C</h2><p>同为 C 号美式女声，Standard 引擎。</p><button data-audio="standard">播放 Standard-C</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-c-family-violin-rescue-owner-qa-v46.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
