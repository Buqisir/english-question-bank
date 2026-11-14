// 半身像「没找到」改摊手：在现有半身（half-final/otter-half.svg）上只重画两只前爪。第一轮 a、b，第二轮 c、d，第三轮 e、f，出对比图。
// 头、脸、躯干、肚皮、水面的路径原样不动。旧的合爪不是单独的形状，是两块肚皮浅色之间露出来的一段身体色；
// 所以先在那段缝上补一块浅雾薄荷（id="belly-fill"，只盖旧爪那一段），再把新手臂画在上面。
// a：画面右边那只爪抬到肩外侧、掌心朝上；左边那只横在肚子前。
// b：两只爪从胸前往两边摊开、掌心朝上，左右大致对称，不高过肩。
// 爪子照母版：圆爪、不画趾、不画趾垫；只用 #72BFA4、#DDF1E8、#F2FAF6、#191D18 四色，没有描边、渐变、透明。
// c：两手一摊，上臂贴身、肘在胸口下沿、前臂往外往上，爪停在胸口中段，左右对称。d：c 的收敛版，爪更低、更靠近身体。
// e、f（第三轮）：照旧图 05，两只前爪往下往两边伸，平搭在水面条上，中间空着；f 两爪近一点、不出身体外框。
// 出 compare.png：四格「现在：合爪」「e」「f」「空态：坐石」，每格大图 400 宽，下面 110、64 宽各一张，deviceScaleFactor 2。
// 用法：node scripts/brand/half-shrug.mjs。可选环境变量：INVENTORY_CHROMIUM（chromium 路径）、HALF_OUT（输出目录）、NO_SHOT=1（只写 SVG）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const REV = path.join(BRAND, 'image-review-2026-11-14')
const OUT = process.env.HALF_OUT ? path.resolve(process.env.HALF_OUT) : path.join(REV, 'half-shrug')
mkdirSync(OUT, { recursive: true })

const MINT = '#72BFA4'
const PALE = '#DDF1E8'

const base = readFileSync(path.join(REV, 'half-final/otter-half.svg'), 'utf8')
const oldTitle = '<title>獭獭 · 半身像（底稿，手里空着）</title>'
const slot = '<g id="held"></g>'
if (!base.includes(oldTitle) || !base.includes(slot)) throw new Error('half-final/otter-half.svg 变了，先核对再出图')

// 补缝：盖住旧合爪那段身体色（胸口浅色的 V 尖到下腹浅色的上沿），两边接回原肚皮的边，不碰两侧身体。
const bellyFill = `<path id="belly-fill" d="M514 340C515 400 501 462 489 490L479 525H686.2C685 517.9 683.5 511 681.7 504.3C679 468 674.5 420 673.5 366C650 352 560 346 514 340Z" fill="${PALE}"/>`


// 手臂：上臂藏在身体两侧的身体色里，只画露出来的前臂和爪，每只手臂（连爪）是一整块填充形状。
// 坐石母版右侧 y≈420 那处外鼓就是肘，下面 y≈488 那道内凹是肘弯；新前臂从这一带长出来，不另造肩膀。
// 前臂粗约 40～48，和旧合爪那段身体色的宽度相当；爪是圆头连指的一块，比腕子略宽，上沿放平（掌心朝上），腕子底下收一道浅弯把爪和前臂分开，
// 读成「摊开、手里空着」；不分趾、不画趾垫。
const AXIS = 558 // 身体在肘这一高度的左右中线（左边身体 x≈406、右边 x≈712，y 450 处）
const mirror = (d) => d.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${+(2 * AXIS - x).toFixed(1)} ${y}`)

// b 右手：从肘往外略往上，爪在身体外面摊开，不高过肩（肩约在 y 300）。
const B_RIGHT = 'M714 426C724 423 732 418 740 412C750 404 762 398 772 398C782 398 788 408 787 420C786 434 776 444 762 446C754 447 748 450 746 456C738 472 718 486 702 488C698 489 694 489 692 488Z'
// b 左手：右手镜过来；起笔点挪回左边身体边上（左边身体比右边往外斜）。
const B_LEFT = mirror(B_RIGHT).replace(/^M\S+ 426/, 'M412 424')

const ARMS = {
  a: [
    // 画面左边那只：从左侧身体伸出，横过肚子往上斜，圆爪停在肚子中线右边。
    'M462 452C500 458 540 456 570 448C584 444 592 436 602 432C616 426 634 428 638 442C642 456 636 470 622 476C608 482 592 484 578 486C540 494 500 504 462 510Z',
    // 画面右边那只：从肘往上斜，爪抬到肩外侧，掌心朝上，爪尖朝外。
    'M692 488C712 486 732 476 742 458C750 444 755 428 758 414C760 406 764 402 770 400C780 396 787 388 786 376C785 364 776 357 764 357C752 357 744 359 737 361C730 363 727 371 727 381C727 395 722 408 716 420Z',
  ],
  b: [B_LEFT, B_RIGHT],
}

// 第二轮（c、d）：手臂从肩膀下面沿身体两侧下来，上臂贴着身体（就是肚皮和身体外沿之间那条身体色，母版里本来就是上臂），
// 肘弯在胸口下沿高度（y≈475），前臂往外往上斜出去，爪停在胸口中段，和身体之间留一道空。
// 前臂粗约 38～40，和母版手臂相当；前臂斜着出去（不竖着），爪是前臂末端往外鼓出的一块扁圆，约 64×42（c）/ 58×36（d），
// 比第一轮大，和母版合在胸前那两只爪差不多大；上沿放平、外端略低一点（掌心朝上、略往外倾）；
// 爪的内端和前臂内沿齐平，不往里伸（往里伸一截再收弯的那一稿像钩子、像攥拳，去掉了）；爪往外一侧鼓出去，读成摊开的爪。
// 右手先画，左手以 x 562（身体在胸口这一段的中线）镜过来。
// c 的爪尖到 x≈806，超出原 viewBox 右边 18 个单位，所以 c、d 的 viewBox 和裁切框往右放宽 26（294 12 520 715），左、上、下和水面都不动。
const AXIS2 = 562
const mirror2 = (d) => d.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${+(2 * AXIS2 - x).toFixed(1)} ${y}`)
// c：爪在胸口中段（y 366～414），爪内端离身体约 25，前臂离身体约 25。
const C_RIGHT = 'M712 446L700 474C712 490 740 494 754 480C764 470 776 442 784 418C792 413 804 406 806 393C807 379 798 368 784 367C774 366 764 366 756 368C746 371 742 382 744 394C746 404 750 410 750 420C750 430 744 440 736 446C730 452 724 452 718 450Z'
// d：收敛版，爪再低（y 389～432）、离身体更近（约 14），爪尖到 x≈794。
const D_RIGHT = 'M712 446L700 474C712 490 738 494 750 482C758 474 766 456 774 438C782 432 792 426 794 414C795 401 787 391 775 390C766 389 758 389 750 391C741 394 738 404 740 414C742 422 744 426 743 432C742 440 736 447 728 450C724 452 720 452 716 450Z'
ARMS.c = [mirror2(C_RIGHT), C_RIGHT]
ARMS.d = [mirror2(D_RIGHT), D_RIGHT]
const VIEWBOX2 = 'viewBox="294 12 520 715"'
const CLIP2 = '<rect x="294" y="12" width="520" height="679.5"/>' // 水面以上的裁切框跟着放宽，身体路径不动

const titles = {
  a: '<title>獭獭 · 半身像 · 没找到（摊手 a：画面右边那只爪抬到肩外侧，掌心朝上；另一只横在肚子前）</title>',
  b: '<title>獭獭 · 半身像 · 没找到（摊手 b：两只爪从胸前往两边摊开，掌心朝上）</title>',
  c: '<title>獭獭 · 半身像 · 没找到（摊手 c：两手一摊，左右对称，爪停在胸口中段，掌心朝上）</title>',
  d: '<title>獭獭 · 半身像 · 没找到（摊手 d：收敛版，爪更低、更靠近身体，掌心朝上）</title>',
}
const build = (k) => (k === 'c' || k === 'd' ? base.replace('viewBox="294 12 494 715"', VIEWBOX2).replace('<rect x="294" y="12" width="494" height="679.5"/>', CLIP2) : base)
  .replace(oldTitle, titles[k])
  .replace(/<!--[\s\S]*?-->/, `<!-- 对比稿，不是母版：半身像「没找到」摊手 ${k} 版。身体、头、脸、肚皮、水面的路径都照 half-final/otter-half.svg 原样${k === 'c' || k === 'd' ? '，viewBox 和水面以上的裁切框往右放宽 26 给爪尖' : '，viewBox 也原样'}；只在旧合爪那段补了一块肚皮色（belly-fill），重画两只前臂和爪（scripts/brand/half-shrug.mjs）。提案 · 单一来源。 -->`)
  .replace(slot, `${bellyFill}\n<g id="paws">${ARMS[k].map((d) => `<path d="${d}" fill="${MINT}"/>`).join('')}</g>\n${slot}`)

for (const k of ['a', 'b', 'c', 'd']) writeFileSync(path.join(OUT, `shrug-${k}.svg`), build(k))

// 第三轮（e、f）：照旧图 05（mascot/states/state-05-not-found.svg）的读法——两只前爪往下、往两边伸出去，平搭在水面条（卡片上沿）上，
// 两爪之间隔开一大段、中间什么都没有。手臂从身体两侧（上臂就是肚皮和身体外沿之间那条身体色）在肘下斜着往下出去，不往上抬。
// 爪画在水面条前面（第 29 条「前爪画在边的前面」），越过水面条上沿一点。
// 上臂从肩下沿着身侧那条身体色下来（y 425 起），肘在胸口下沿（y≈480）；前臂是一段粗细渐变的圆头带子（tube），粗 46 到 40，和母版手臂相当；爪是一个横放的扁圆，约 80×40（f 约 72×38），照母版的圆头扁圆爪，不画趾。
// 前臂、爪压在同色身体上的那一段，底下垫一道浅雾薄荷的细缝（填充形状，不是描边；只在身体范围里露出来），
// 和第四轮爪子跟石头之间的浅色细缝是一个办法；肘以上不垫，免得像贴上去的。
// 两爪以水面条中线 x 541 左右对称（身体本身往左歪，所以左右前臂的斜度不完全一样）。
const WATER_MID = 541
// 一条粗细渐变的带子：pts = [[x, y, 粗细], ...]，两侧用 Catmull-Rom 转三次贝塞尔连起来，两头是半圆。
function tube(pts) {
  const n = pts.length
  const dir = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
  }
  const L = [], R = []
  pts.forEach(([x, y, w], i) => { const [dx, dy] = dir(i); L.push([x - dy * w / 2, y + dx * w / 2]); R.push([x + dy * w / 2, y - dx * w / 2]) })
  const f = (v) => +v.toFixed(1)
  const seg = (P) => {
    let d = ''
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
    }
    return d
  }
  const Rr = [...R].reverse()
  const re = pts[n - 1][2] / 2, rs = pts[0][2] / 2
  return `M${f(L[0][0])} ${f(L[0][1])}${seg(L)}A${re} ${re} 0 0 0 ${f(Rr[0][0])} ${f(Rr[0][1])}${seg(Rr)}A${rs} ${rs} 0 0 0 ${f(L[0][0])} ${f(L[0][1])}Z`
}
const GAP = 7 // 浅色细缝宽
// 一只手：arm = 前臂中线点 [x, y, 粗细]，paw = [cx, cy, rx, ry, 转角]；haloFrom = 从第几个点开始垫细缝。
function hand({ arm, paw, haloFrom = 1 }) {
  const [cx, cy, rx, ry, rot] = paw
  const haloArm = arm.slice(haloFrom).map(([x, y, w], i) => [x, y, i === 0 ? w : w + GAP * 2])
  const ell = (dx, fill) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx + dx}" ry="${ry + dx}" transform="rotate(${rot} ${cx} ${cy})" fill="${fill}"/>`
  return {
    halo: `<path d="${tube(haloArm)}" fill="${PALE}"/>${ell(GAP, PALE)}`,
    fill: `<path d="${tube(arm)}" fill="${MINT}"/>${ell(0, MINT)}`,
  }
}
const mirrorHand = ({ arm, paw, haloFrom }, leftArm) => ({ arm: leftArm, paw: [2 * WATER_MID - paw[0], paw[1], paw[2], paw[3], -paw[4]], haloFrom })
const HANDS = {
  // e：两爪搭在水面条上、往两边伸出去，比身体外框宽一点；爪中心 x 770 / 312，爪外沿到 x≈810 / 272。
  e: (() => {
    const right = { arm: [[698, 425, 38], [706, 480, 46], [722, 545, 44], [742, 608, 42], [758, 650, 40]], paw: [770, 669, 40, 20, 4], haloFrom: 2 }
    const left = mirrorHand(right, [[440, 430, 38], [418, 485, 46], [396, 545, 44], [364, 608, 42], [326, 650, 40]])
    return [left, right]
  })(),
  // f：收敛版，两爪近一点，贴着身体外框（身体在水面条上沿处是 x 332～749）；爪中心 x 720 / 362。
  f: (() => {
    const right = { arm: [[698, 425, 38], [702, 480, 46], [706, 545, 44], [712, 608, 42], [718, 650, 40]], paw: [720, 669, 36, 19, 3], haloFrom: 2 }
    const left = mirrorHand(right, [[440, 430, 38], [424, 485, 46], [410, 545, 44], [384, 608, 42], [364, 650, 40]])
    return [left, right]
  })(),
}
// e 的爪外沿超出原 viewBox（294～788）左右各约 22，所以 e 的 viewBox 左右对称各放宽 24（270 12 542 715），f 不放宽。
const VIEWBOX3 = { e: 'viewBox="270 12 542 715"', f: 'viewBox="294 12 494 715"' }
const titles3 = {
  e: '<title>獭獭 · 半身像 · 没找到（摊手 e：两只前爪往下往两边伸，平搭在水面条上，中间空着）</title>',
  f: '<title>獭獭 · 半身像 · 没找到（摊手 f：同 e，两爪近一点，不出身体外框）</title>',
}
const water = '<rect id="water" x="308" y="670" width="466" height="43" rx="21.5" fill="#DDF1E8"/>'
if (!base.includes(water)) throw new Error('水面条变了')
const build3 = (k) => {
  const hs = HANDS[k]
  const front = `<clipPath id="on-body"><use xlink:href="#body"/></clipPath>\n<g id="paws"><g clip-path="url(#on-body)">${hs.map((h) => hand(h).halo).join('')}</g>${hs.map((h) => hand(h).fill).join('')}</g>`
  return base
    .replace('viewBox="294 12 494 715"', VIEWBOX3[k])
    .replace(oldTitle, titles3[k])
    .replace(/<!--[\s\S]*?-->/, `<!-- 对比稿，不是母版：半身像「没找到」摊手 ${k} 版（第三轮，照旧图 05 的读法）。身体、头、脸、肚皮、水面的路径都照 half-final/otter-half.svg 原样${k === 'e' ? '，viewBox 左右对称各放宽 24 给爪' : '，viewBox 也原样'}；只在旧合爪那段补了一块肚皮色（belly-fill），两只前臂和爪画在水面条前面（scripts/brand/half-shrug.mjs）。提案 · 单一来源。 -->`)
    .replace(slot, `${bellyFill}\n${slot}`)
    .replace(water, `${water}\n${front}`)
}
for (const k of ['e', 'f']) writeFileSync(path.join(OUT, `shrug-${k}.svg`), build3(k))
if (process.env.NO_SHOT) process.exit(0)

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const cur = readFileSync(path.join(BRAND, 'mascot/states/half-not-found.svg'), 'utf8')
const sit = readFileSync(path.join(BRAND, 'mascot/otter-sit.svg'), 'utf8')
const CSS = 'body{margin:0;padding:28px;background:#F2F5F8;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-start}figure{margin:0;background:#fff;border-radius:8px;padding:14px}figcaption{padding-top:10px}.big{display:flex;align-items:flex-end;min-height:580px}'
const cell = (sv, label) => `<figure style="width:400px"><div class="big"><img src="${uri(sv)}" width="400"></div><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end"><img src="${uri(sv)}" width="110"><img src="${uri(sv)}" width="64"></div><figcaption>${label} · 400 / 110 / 64 像素宽</figcaption></figure>`
const page = await browser.newPage({ viewport: { width: 1860, height: 400 }, deviceScaleFactor: 2 })
await page.setContent(`<style>${CSS}</style><h1>半身像 · 没找到 · 摊手第三轮对比</h1><p>对比稿 · 提案。看三件事：读不读得出「没找到 / 空着」，和空态分不分得开，110 像素时读不读得出。</p><div class="g">${cell(cur, '现在：合爪')}${cell(read('e'), 'e：两爪搭在边上，往两边伸')}${cell(read('f'), 'f：收敛版，不出身体外框')}${cell(sit, '空态：坐石')}</div>`)
await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
await browser.close()

function read(k) { return readFileSync(path.join(OUT, `shrug-${k}.svg`), 'utf8') }
