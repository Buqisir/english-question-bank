// 獭獭动效原型：鼻子轻动、状态之间的短过渡（BRAND.md §4.6「局限」里还没做的两项）。
// 读母版 SVG，原样内联进一个演示页，只加 data-otter 标记、给 id 加前缀（同一页里同一张图出现多次）。
// 用法：node scripts/brand/nose-transitions-proto.mjs  → design/brand-2026-10-13/mascot/motion/nose-and-transitions.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const M = join(ROOT, 'design/brand-2026-10-13/mascot');
let n = 0;

// 把一张母版 SVG 变成可内联的 svg：去注释和 title，id 加前缀，脸上的部件打标记。
function inline(file, { viewBox, label } = {}) {
  let s = readFileSync(join(M, file), 'utf8');
  s = s.replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<title>[\s\S]*?<\/title>/, '');
  const p = `p${++n}-`;
  const ids = [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    s = s.split(`id="${id}"`).join(`id="${p}${id}"`).split(`url(#${id})`).join(`url(#${p}${id})`).split(`href="#${id}"`).join(`href="#${p}${id}"`);
  }
  const count = (re) => (s.match(re) || []).length;
  if (count(/fill="#F2FAF6" \/>/g) !== 1) throw new Error(`${file}: 嘴套不是一处`);
  s = s.replace(/fill="#F2FAF6" \/>/, 'fill="#F2FAF6" data-otter="muzzle" />');
  s = s.replace(/<ellipse /g, '<ellipse data-otter="eye" ');
  // 鼻子：两只眼睛那一组后面紧跟的那条墨色路径
  const before = s;
  s = s.replace(/(<ellipse data-otter="eye"[^>]*\/>\s*<\/g>\s*<path d="[^"]*" fill="#191D18") \/>/, '$1 data-otter="nose" />');
  if (s === before) throw new Error(`${file}: 没找到鼻子`);
  s = s.replace(/(<\/g>\s*)<g>(\s*<circle cx="322\.3")/, '$1<g data-otter="dots">$2');
  s = s.replace(`id="${p}figure"`, `id="${p}figure" data-otter="figure"`);
  s = s.replace(/<svg ([^>]*)>/, (m, a) => {
    let attrs = a.replace(/\s*xmlns:xlink="[^"]*"/, '');
    if (viewBox) attrs = attrs.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`);
    return `<svg ${attrs} role="img" aria-label="${label}">`;
  });
  return s.replace(/\n\s*\n/g, '\n').trim();
}

// 半身三张放进同一个 viewBox（没找到那张最宽），脸自然对齐；底边裁在水面条上沿 670，水面藏在卡片边后面。
const HALF_VB = '270 12 576 658';
const half = (k, label) => inline(`states/half-${k}.svg`, { viewBox: HALF_VB, label });

const page = readFileSync(join(ROOT, 'scripts/brand/nose-transitions-proto.template.html'), 'utf8')
  .replace('{{SIT}}', inline('otter-sit.svg', { label: '海獭 · 坐石' }))
  .replace('{{NF_NOSE}}', half('not-found', '海獭 · 没找到'))
  .replace('{{SEARCHING}}', half('searching', '海獭 · 找题中'))
  .replace('{{OFFER}}', half('offer', '海獭 · 递出结果'))
  .replace('{{NOTFOUND}}', half('not-found', '海獭 · 没找到'));
writeFileSync(join(M, 'motion/nose-and-transitions.html'), page);
console.log('ok', page.length);
