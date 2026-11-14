// 半身像「没找到」摊手第四轮：照第六批草图 SA-shrug 的手臂结构描矢量（g、变体 h），审过以后以 h 为准改出 i；
// i 被打回以后照第二组草图 SC-shrug 忠实描出 sc（手臂路径由 scripts/brand/half-shrug-sc-trace.py 从 SC 原图描出，贴在下面）。出对比图和叠图。
// 底子是 mascot/states/half-not-found.svg：头、脸、躯干路径、水面原样不动，这个脚本只读不写它（i 的手形盖住并修顺了两侧一段身体外沿，身体路径本身没改）。
// 旧合爪不是单独的形状，是胸口浅色和下腹浅色之间露出来的一段身体色；照第三轮的办法先补一块浅雾薄荷（belly-fill）把肚皮补成一整块，
// 再把两只前臂连爪画在上面（<g id="paws">，每只一整块填充形状）。
// SA 的手臂结构：上臂贴着身体两侧往下，不另画肩膀，就是身体外沿那条身体色；肘弯在下腹高度，在身体外沿上略微鼓出一点；
// 前臂从肘往外、略往上斜出去，爪停在身体外轮廓外面一点点，掌心朝上、上沿放平。左右大致对称，头不歪，脸不改。
// 爪照 half-offer 捧东西的爪形：圆头、连指一块、不画趾。只用 #72BFA4、#DDF1E8、#F2FAF6、#191D18 四色，无描边、渐变、透明。
// 用法：node scripts/brand/half-shrug-r4.mjs。可选环境变量：INVENTORY_CHROMIUM（chromium 路径）、NO_SHOT=1（只写 SVG）、
//   SC_PNG（SC 草图原图 PNG；没给或不存在就用仓库里的 sketches-batch6/SC-shrug.jpg）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const REV = path.join(BRAND, 'image-review-2026-11-14')
const OUT = path.join(REV, 'half-shrug-round4')
mkdirSync(OUT, { recursive: true })

const MINT = '#72BFA4'
const PALE = '#DDF1E8'

const base = readFileSync(path.join(BRAND, 'mascot/states/half-not-found.svg'), 'utf8')
const VB = 'viewBox="294 12 494 715"'
const CLIP = '<rect x="294" y="12" width="494" height="679.5"/>'
const slot = '<g id="held"></g>'
if (!base.includes(VB) || !base.includes(CLIP) || !base.includes(slot)) throw new Error('mascot/states/half-not-found.svg 变了，先核对再出图')

// 补缝：和第三轮同一块，盖住旧合爪那段身体色，两边接回原肚皮的边，不碰两侧身体。
const bellyFill = `<path id="belly-fill" d="M514 340C515 400 501 462 489 490L479 525H686.2C685 517.9 683.5 511 681.7 504.3C679 468 674.5 420 673.5 366C650 352 560 346 514 340Z" fill="${PALE}"/>`

// 身体外沿（从 #body 逐行量出来，viewBox 单位）：
//   y 440：左 410 / 右 715；y 460：403 / 708；y 480：394 / 696；y 500：386 / 692。右侧 y 480～500 那道内凹是坐石母版的旧肘弯。
//   身体往左歪：上半身中线约 x 560，水面条中线 541。爪按 x 548 左右对称摆，肘各自贴在本侧身体外沿上。
// 一只手是一整块：从身体里面起笔（不碰肚皮），沿身体外沿出来成前臂上沿 → 爪上沿（放平）→ 圆头外端 → 爪底 → 腕下 → 前臂下沿 → 肘（鼓出外沿一点）→ 回身体里。
// g：照 SA 描的主稿。肘在 y≈503（下腹上沿，旧合爪下面那一带），鼓出本侧身体外沿约 10～20；前臂上沿在 y≈456 离开身体，
//   往外略往上到腕；爪约 42×44，上沿在 y 430 放平，圆头外端，腕下收一道浅弯；不画趾。爪尖右到 x 784、左到 x 312，viewBox 原样。
// h：变体，结构和 g 一样，前臂长一点、爪大一点（约 46×48），爪尖右到 x 798、左到 x 298；viewBox 左右各放宽 14 给爪尖。
const HANDS = {
  g: {
    right: 'M686 440L705 456C713 456 720 450 726 442C730 436 735 430 743 430L764 430C777 430 784 438 784 450C784 464 774 474 760 474C752 474 746 476 742 480C734 489 723 499 713 503C705 506 695 506 686 505Z',
    left: 'M430 440L402 456C392 456 380 450 372 442C367 436 361 430 353 430L332 430C319 430 312 438 312 450C312 464 322 474 336 474C344 474 350 476 354 480C360 489 367 498 376 503C384 507 396 506 410 505Z',
  },
  h: {
    right: 'M686 438L705 456C716 456 726 449 734 440C739 434 745 428 754 428L776 428C790 428 798 437 798 450C798 465 787 476 772 476C762 476 755 477 750 481C740 490 726 500 713 504C705 507 695 507 686 505Z',
    left: 'M430 438L402 456C390 456 372 449 362 440C357 434 351 428 342 428L320 428C306 428 298 437 298 450C298 465 309 476 324 476C334 476 341 477 346 481C354 490 364 499 376 504C384 507 396 507 410 505Z',
    viewBox: 'viewBox="280 12 522 715"',
    clip: '<rect x="280" y="12" width="522" height="679.5"/>',
  },
  // i：以 h 为准改。Owner 嫌手太丑太小，按审图意见改了四处：
  //   1. 爪大很多：约 78×62（h 约 46×48），面积约 h 的两倍，接近一边脸颊那团白（约 113×85）的一半多；横着放，宽大于高，读成掌心朝上，不读成举起来的手掌。
  //      形状是圆润的连指手套：外端整圆（半径约 28），上沿放平（掌心朝上，两头不翘尖角），下沿一条连续圆弧顺到腕，不掐口，不方头。
  //      腕约 45 粗，比 h 的前臂粗约三成；爪比腕宽，从腕到爪是一条顺的曲线。
  //   2. 右侧旧外鼓：手的形状从 y 380 起沿身体外沿往下（x 717～719）一直接到爪根，把旧外鼓下面那道收腰（y 460～500，原来收到 x 692）补平，
  //      从肩到新肘是一条顺的线，不再像多一个肘。身体路径本身没改，是手的形状盖在上面。
  //   3. 左边接缝：左手也从 y 400 起贴着本侧身体外沿里侧往下接到爪根，和右边一样的接法，臂根上方没有折角。
  //   4. 爪离身体近：爪根和身体之间只留一道 V 形窄口（读成肘弯里侧）；爪上沿 y 414，不高过胸口；爪尖右到 x 800、左到 x 326，放得进加宽后的 viewBox。
  //      左右以「爪根贴本侧身体外沿」对齐（右爪 722～800，左爪 326～404），目测对称。肘在右边鼓出外沿约 20；左边身体本来往外斜，肘顺进身体外沿，不另鼓。
  i: {
    right: 'M690 380L713 380C717 392 719 410 719 425C719 432 718 438 717 444C721 429 728 415 742 414L770 414C789 414 800 427 800 445C800 465 788 475 770 476C750 478 736 484 726 494C720 500 717 505 712 509C706 514 698 514 690 512Z',
    left: 'M440 400L422 400C419 418 414 432 409 444C405 429 398 415 384 414L356 414C337 414 326 427 326 445C326 465 338 475 356 476C374 478 386 483 390 492C392 497 386 508 379 516L412 513Z',
    viewBox: 'viewBox="280 12 522 715"',
    clip: '<rect x="280" y="12" width="522" height="679.5"/>',
  },
}

const titles = {
  g: '<title>獭獭 · 半身像 · 没找到（摊手 g：照草图 SA，肘在下腹两侧，前臂往外略往上，掌心朝上，肚子前空着）</title>',
  h: '<title>獭獭 · 半身像 · 没找到（摊手 h：g 的变体，前臂长一点、爪大一点）</title>',
  i: '<title>獭獭 · 半身像 · 没找到（摊手 i：以 h 为准，大爪、掌心朝上，肚子前空着）</title>',
}
const notes = {
  g: 'viewBox 也原样',
  h: 'viewBox 和水面以上的裁切框左右各放宽 14 给爪尖（294 12 494 715 → 280 12 522 715）',
  i: 'viewBox 和水面以上的裁切框左右各放宽 14 给爪（294 12 494 715 → 280 12 522 715）；两侧身体外沿在臂根以上被手的形状盖住修顺（身体路径没改）',
}
const build = (k) => (HANDS[k].viewBox ? base.replace(VB, HANDS[k].viewBox).replace(CLIP, HANDS[k].clip) : base)
  .replace(/<title>[\s\S]*?<\/title>/, titles[k])
  .replace(/<!--[\s\S]*?-->/, `<!-- 对比稿，不是母版：半身像「没找到」摊手第四轮 ${k} 版，照第六批草图 SA-shrug 的手臂结构描。头、脸、躯干外轮廓、肚皮、水面的路径照 mascot/states/half-not-found.svg 原样，${notes[k]}；只在旧合爪那段补了一块肚皮色（belly-fill），画两只前臂连爪（scripts/brand/half-shrug-r4.mjs）。提案 · 单一来源 · Owner 还没看。 -->`)
  .replace(slot, `${bellyFill}\n<g id="paws"><path d="${HANDS[k].left}" fill="${MINT}"/><path d="${HANDS[k].right}" fill="${MINT}"/></g>\n${slot}`)

const KEYS = Object.keys(HANDS)
for (const k of KEYS) writeFileSync(path.join(OUT, `shrug-${k}.svg`), build(k))

// ---- sc：照草图 SC-shrug 忠实描 ----
// 手臂：scripts/brand/half-shrug-sc-trace.py 的输出（SC 原图 1024×1024，像素换回 SVG 坐标用
//   svg_x = 294 + (px − 228.7) / 1.14685，svg_y = 12 + (py − 102) / 1.14685，偏移 0）。每只手臂连爪一整块，含拇指那个小包；
//   肘上那块深色阴影也算身体色，统一填 #72BFA4。手臂往身体里多吃进一段同色，接上不露缝。
const SC_ARMS = {
  left: 'M273.9 363.1C273.2 365.3 273.4 367.9 273.7 370C274 372.2 274.4 373.5 275.7 375.8C277 378.2 279.4 381.6 281.5 384C283.7 386.3 285.6 388 288.6 390C291.6 392 295.3 394.2 299.3 395.9C303.3 397.6 305.2 399.2 312.5 400.1C319.8 401 335.3 397 342.9 401.2C350.5 405.4 353 418.5 358 425.2C363.1 431.9 367.5 436.9 373 441.6C378.5 446.2 385.4 450.3 391.1 453.2C396.8 456 404.1 458 407.1 458.7C410 459.5 406.9 462 408.7 457.6C410.6 453.3 415.9 440.4 418.4 432.6C420.9 424.9 423.4 421.6 424 411.1C424.5 400.7 422.7 377.9 421.9 369.8C421 361.7 422.7 359.7 418.7 362.5C414.8 365.3 402.7 382.8 398.2 386.4C393.6 389.9 395 386 391.6 383.8C388.2 381.6 381.6 377.5 377.8 373.2C373.9 368.9 371.5 361.8 368.6 357.9C365.8 354.1 365.1 352.7 360.7 350.1C356.4 347.5 348.5 343.4 342.4 342.3C336.4 341.1 328.8 342.5 324.5 343.1C320.3 343.7 319.7 344.6 317.1 346.1C314.4 347.6 312.4 351.4 308.7 352.3C305.1 353.2 298.9 351.2 295.1 351.2C291.3 351.2 288.8 351.5 285.9 352.5C283.1 353.4 280 355 278 356.7C276 358.5 274.6 360.9 273.9 363.1Z',
  right: 'M706.6 449C706.2 453.4 706.4 453.4 708.6 453.8C710.8 454.1 714.7 453.4 719.6 451.1C724.5 448.8 732.7 444.2 738.1 440.1C743.4 436.1 746.3 433.3 751.7 426.7C757 420 763.9 404.4 770.3 400.1C776.8 395.8 784.9 401 790.4 400.9C795.8 400.8 797.1 401.2 802.9 399.5C808.8 397.7 819.9 393.4 825.3 390.4C830.6 387.5 832.7 384.4 835.1 381.9C837.5 379.4 838.7 377.6 839.7 375.2C840.8 372.9 841.6 370.1 841.6 367.8C841.5 365.4 841.7 363.5 839.6 361.3C837.6 359 834.8 355.4 829.4 354.1C824 352.7 812.8 354.4 807.3 353.1C801.7 351.8 799.9 347.9 796.2 346.3C792.5 344.7 789.5 343.9 785 343.6C780.4 343.3 774.2 343.2 768.9 344.5C763.5 345.8 756.8 349.1 753 351.3C749.2 353.5 748.6 354.7 746.3 357.7C744.1 360.7 744.3 364.8 739.5 369.2C734.7 373.6 722.6 381.7 717.6 384.2C712.6 386.6 710.5 376.8 709.4 384C708.3 391.1 711.4 416.1 711 427C710.5 437.8 707 444.5 706.6 449Z',
}
// 手臂伸出水面条：左到 x≈273.7，右到 x≈841.6。viewBox 和水面以上的裁切框往左加宽 24、往右加宽 58（294 12 494 715 → 270 12 576 715），
// 各留约 4 的边。新框中线 x 558，正好是上半身中线（约 557～560）；水面条中线 541，所以水面条在框里偏左 17。
const SC_VB = 'viewBox="270 12 576 715"'
const SC_CLIP = '<rect x="270" y="12" width="576" height="679.5"/>'
// 肚皮：照 SC 是原来的上下两块、中间身体色的 V（不再补成一整块）。去掉合爪留下的几处小凸起：
//   1. 胸口那块的 V 尖：原来两侧往里收的凹弧换成往外鼓的两段弧，尖上留一点圆，像 SC 那样干净；两头和原路径相切接上。
//   2. 下腹那块的上沿：原来随两只爪起伏（中间 x≈614 有个往上的包），换成一条中间往下沉的平滑弧，两头接回原来的左右上角。
const V_OLD_FROM = 'C650.7 434.1'
const V_OLD_TO = '538.8 415.2'
const V_NEW = 'C642.8 442.7 628 461 614.5 473.2C612.9 474.6 611.6 474.6 610 473.2C585 466 550.8 427.2 538.8 415.2'
const LOW_OLD_FROM = 'C505 490.2'
const LOW_OLD_TO = '680.3 501.8'
const LOW_NEW = 'C535 503 565 511 592 511C625 511 660 504 680.3 501.8'
const splice = (str, from, to, rep) => {
  const a = str.indexOf(from), b = str.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`肚皮路径里找不到 ${from} … ${to}，先核对再出图`)
  return str.slice(0, a) + rep + str.slice(b + to.length)
}
const buildSC = () => splice(splice(base, V_OLD_FROM, V_OLD_TO, V_NEW), LOW_OLD_FROM, LOW_OLD_TO, LOW_NEW)
  .replace(VB, SC_VB).replace(CLIP, SC_CLIP)
  .replace(/<title>[\s\S]*?<\/title>/, '<title>獭獭 · 半身像 · 没找到（摊手 sc：照草图 SC，肘松松垂在腰边，前臂往左右荡开，掌心朝上）</title>')
  .replace(/<!--[\s\S]*?-->/, '<!-- 对比稿，不是母版：半身像「没找到」摊手 sc 版，照第六批草图 SC-shrug 忠实描。头、脸、躯干外轮廓、水面的路径照 mascot/states/half-not-found.svg 原样；肚皮仍是上下两块，只把合爪留下的小凸起修干净（V 尖和下腹上沿）；两只手臂连爪从 SC 原图按颜色描出（scripts/brand/half-shrug-sc-trace.py、scripts/brand/half-shrug-r4.mjs）。viewBox 和水面以上的裁切框往左加宽 24、往右加宽 58（270 12 576 715）。提案 · 单一来源 · Owner 还没看。 -->')
  .replace(slot, `<g id="paws"><path d="${SC_ARMS.left}" fill="${MINT}"/><path d="${SC_ARMS.right}" fill="${MINT}"/></g>\n${slot}`)
writeFileSync(path.join(OUT, 'shrug-sc.svg'), buildSC())

// sc2：Owner 看 sc——手可以，肚子不行（胸口和下腹之间露出一块身体色的 V）。手臂、头、脸、身体外轮廓、水面、viewBox 都和 sc 一样；
// 肚皮回到原路径（不用 sc 修的 V 尖和下腹上沿），再盖上一块浅雾薄荷补块（形状照 i、第三轮的 belly-fill，两侧边线重画顺），补成从胸口到下腹的一整块浅雾薄荷。
// belly-fill 原样用会在左边 y≈340 留一个往里收的小台阶（胸口浅色的左边线在那里往里收，补块从它下面起笔），看着像收腰。
// 所以 sc2 的补块两侧边线重画：左边从胸口左边线 y 255 处（那里几乎竖直）起笔，一路往外放宽、顺到下腹左边线 y 545 处，切线接上；
// 右边从胸口浅色里面（y 320）起笔，在胸口右边线最宽处（y≈380）斜着穿出来，顺到下腹右边线 y 545 处（补块和胸口同色，藏在里面的那段看不出来，穿出来的地方不留台阶）。补块只盖肚皮和旧合爪那段，不碰身体外沿和手臂。
const bellyFill2 = `<path id="belly-fill" d="M500 255C500 340 491 475 471 545L690 545C684 495 677 420 666 320Z" fill="${PALE}"/>`
const buildSC2 = () => base
  .replace(VB, SC_VB).replace(CLIP, SC_CLIP)
  .replace(/<title>[\s\S]*?<\/title>/, '<title>獭獭 · 半身像 · 没找到（摊手 sc2：sc 的两只手，肚皮补成一整块）</title>')
  .replace(/<!--[\s\S]*?-->/, '<!-- 对比稿，不是母版：半身像「没找到」摊手 sc2 版。两只手臂连爪和 sc 一样，照第六批草图 SC-shrug 描（scripts/brand/half-shrug-sc-trace.py）；头、脸、躯干外轮廓、水面的路径照 mascot/states/half-not-found.svg 原样；旧合爪那段用一块浅雾薄荷（belly-fill，照 i 那块、两侧边线重画顺）补成从胸口到下腹的一整块肚皮。viewBox 和水面以上的裁切框往左加宽 24、往右加宽 58（270 12 576 715）（scripts/brand/half-shrug-r4.mjs）。提案 · 单一来源 · Owner 还没看。 -->')
  .replace(slot, `${bellyFill2}\n<g id="paws"><path d="${SC_ARMS.left}" fill="${MINT}"/><path d="${SC_ARMS.right}" fill="${MINT}"/></g>\n${slot}`)
writeFileSync(path.join(OUT, 'shrug-sc2.svg'), buildSC2())

if (process.env.NO_SHOT) process.exit(0)

const require = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const uri = (sv) => `data:image/svg+xml;base64,${Buffer.from(sv).toString('base64')}`
const SC_PNG = process.env.SC_PNG && existsSync(process.env.SC_PNG) ? process.env.SC_PNG : path.join(REV, 'sketches-batch6/SC-shrug.jpg')
const scImg = `data:image/${SC_PNG.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(SC_PNG).toString('base64')}`
const svgOf = (k) => readFileSync(path.join(OUT, `shrug-${k}.svg`), 'utf8')
const cur = readFileSync(path.join(BRAND, 'mascot/states/half-not-found.svg'), 'utf8')

// compare.png：四格。现在的合爪、SC 草图、sc、sc2；每格 300 像素宽大图，除草图外下面再放 110、64 像素宽各一张。
const CSS = 'body{margin:0;padding:28px;background:#F2F5F8;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-start}figure{margin:0;background:#fff;border-radius:8px;padding:14px;width:300px}figcaption{padding-top:10px;font-size:14px}.big{display:flex;align-items:flex-end;justify-content:center;height:440px}.sm{display:flex;gap:20px;margin-top:14px;align-items:flex-end;height:170px}'
const cell = (src, label, smalls = true) => `<figure><div class="big"><img src="${src}" width="300"></div><div class="sm">${smalls ? `<img src="${src}" width="110"><img src="${src}" width="64">` : '<span style="color:#5A6C75;font-size:13px;align-self:center">草图只看大图</span>'}</div><figcaption>${label}${smalls ? ' · 300 / 110 / 64 像素宽' : ''}</figcaption></figure>`
// 草图按 sc 的框裁出来（同一块画面），和 sc 大图一样大，方便对着看。
const K = 1.14685
const [vx, vy, vw, vh] = SC_VB.match(/"([^"]+)"/)[1].split(' ').map(Number)
const z = 300 / (vw * K)
const sketchCrop = `<div style="width:300px;height:${Math.round(vh * K * z)}px;background:url(${scImg}) no-repeat;background-size:${1024 * z}px;background-position:${-(228.7 + (vx - 294) * K) * z}px ${-(102 + (vy - 12) * K) * z}px"></div>`
const sketchCell = `<figure><div class="big">${sketchCrop}</div><div class="sm"><span style="color:#5A6C75;font-size:13px;align-self:center">草图只看大图（按 sc 的框裁）</span></div><figcaption>草图 SC（照它描）</figcaption></figure>`
const cells = [cell(uri(cur), '现在：合爪'), sketchCell, cell(uri(svgOf('sc')), 'sc（肚子已否）'), cell(uri(svgOf('sc2')), 'sc2：肚皮补成一整块')]
const page = await browser.newPage({ viewport: { width: 28 * 2 + cells.length * 328, height: 400 }, deviceScaleFactor: 2 })
await page.setContent(`<style>${CSS}</style><h1>半身像 · 没找到 · 摊手：照草图 SC 描</h1><p>对比稿 · 提案。先看 110 像素那档：是不是自然地一左一右摊开、掌心朝上。</p><div class="g">${cells.join('')}</div>`)
await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })

// overlay-sc.png：sc 半透明（50%）叠在 SC 草图上。草图生成时，参考图是把半身 SVG 放在 1024 画布正中按 820×820 渲染的，
// 所以 SVG 坐标 (x, y) 落在草图像素 (228.7 + (x − 294) × 1.14685, 102 + (y − 12) × 1.14685)。左边整张，右边两只手臂各放大 2 倍。
const scSvg = svgOf('sc')
const layer = `<img src="${scImg}" style="position:absolute;left:0;top:0;width:1024px;height:1024px"><img src="${uri(scSvg)}" style="position:absolute;left:${228.7 + (vx - 294) * K}px;top:${102 + (vy - 12) * K}px;width:${vw * K}px;height:${vh * K}px;opacity:.5">`
const view = (x, y, w, h, z, label) => `<figure style="width:auto"><div style="position:relative;width:${w * z}px;height:${h * z}px;overflow:hidden;background:#fff"><div style="position:absolute;left:${-x * z}px;top:${-y * z}px;width:1024px;height:1024px;transform:scale(${z});transform-origin:0 0">${layer}</div></div><figcaption>${label}</figcaption></figure>`
const ov = await browser.newPage({ viewport: { width: 1500, height: 400 }, deviceScaleFactor: 2 })
await ov.setContent(`<style>${CSS}</style><h1>sc 叠在草图 SC 上（sc 50% 不透明）</h1><p>手臂和爪的轮廓贴着草图走，就描准了。草图肘上的深色阴影不描；头、脸、躯干外轮廓、水面用的是现在的半身，和草图本来就几乎重合。</p><div class="g">${view(180, 300, 700, 640, 1, '整张（草图像素 1:1）')}<div style="display:flex;flex-direction:column;gap:16px">${view(190, 450, 250, 190, 2, '画面左手，放大 2 倍')}${view(630, 450, 250, 190, 2, '画面右手，放大 2 倍')}</div></div>`)
await ov.screenshot({ path: path.join(OUT, 'overlay-sc.png'), fullPage: true })
await browser.close()
