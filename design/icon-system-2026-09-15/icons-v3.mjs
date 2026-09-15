// 第三版全集：按 principles.md 定稿规则绘制。
//   24 网格；中心线画在 3–21；外圆角 4（小形体按比例收到 3 / 2），内圆角 2；圆头圆接。
//   描边不在这里定：16px 用 2.25，24px 及以上用 2.75（由 CSS 按尺寸给）。
//   每个字形 ≤ 2–3 个形 + ≤ 1 处细节；细节承担语义，轮廓承担识别。
// key 与 lucide-react 名一一对应（kebab-case），便于逐文件替换；领域层用 eqb 自己的名字。

const dot = (cx, cy, r = 1.75) => `<circle class="dot" cx="${cx}" cy="${cy}" r="${r}"/>`
const rr = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`

// 齿轮：8 齿，齿顶齿根都短，靠圆接头把角磨圆；中心是空心圆（16px 下留 1px 孔）。
function gear({ teeth = 8, outer = 9.25, root = 6.9 } = {}) {
  const pts = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const c = i * step - Math.PI / 2
    for (const [r, a] of [
      [root, c - step * 0.3],
      [outer, c - step * 0.14],
      [outer, c + step * 0.14],
      [root, c + step * 0.3],
    ])
      pts.push([12 + r * Math.cos(a), 12 + r * Math.sin(a)])
  }
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('') + 'Z'
}

// 圆弧箭头：弧从 a0 走到 a1（角度制，sweep 1 顺时针），箭头两翼从弧的终点长出来，弧与箭头一笔相连。
// 靠圆心那一翼张得更开（否则它会贴着弧走、16px 下粘成一坨），靠外那一翼收窄。
function arcArrow({ r = 8, a0, a1, sweep, wing = 4.75, spreadIn = 70, spreadOut = 40 } = {}) {
  const P = (deg) => [12 + r * Math.cos((deg * Math.PI) / 180), 12 + r * Math.sin((deg * Math.PI) / 180)]
  const [sx, sy] = P(a0)
  const [ex, ey] = P(a1)
  const rad = (a1 * Math.PI) / 180
  // 行进方向的反向单位向量
  const back = sweep ? [Math.sin(rad), -Math.cos(rad)] : [-Math.sin(rad), Math.cos(rad)]
  const toCenter = [(12 - ex) / r, (12 - ey) / r]
  const rot = (v, deg) => {
    const t = (deg * Math.PI) / 180
    return [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)]
  }
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1]
  const sign = dotp(rot(back, 1), toCenter) > dotp(back, toCenter) ? 1 : -1 // 往哪边转是朝圆心
  const inner = rot(back, sign * spreadIn)
  const outer = rot(back, -sign * spreadOut)
  const f = (n) => n.toFixed(2)
  const span = ((a1 - a0) * (sweep ? 1 : -1) + 360) % 360
  return `<path d="M${f(sx)} ${f(sy)}A${r} ${r} 0 ${span > 180 ? 1 : 0} ${sweep} ${f(ex)} ${f(ey)}"/><path d="M${f(ex + inner[0] * wing)} ${f(ey + inner[1] * wing)}L${f(ex)} ${f(ey)}L${f(ex + outer[0] * wing)} ${f(ey + outer[1] * wing)}"/>`
}

// ───────── 领域原语 ─────────
// 一张卷：折角纸。外圆角 4，折角内圆角 2。
// 折角从 6.5 收到 5，内部多出一格空气；记号一律放在下半（y 13–19），离边 ≥ 4。
// 斜切 (14.5,2.5)→(20,8)；折线 L 的两端各往里错 1 单位（x 13.5 / y 9），三角里才留得住空气，否则胖描边一填就成一坨。
const sheet = `<path d="M8 2.5h6.5L20 8v9.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-11a4 4 0 0 1 4-4z"/><path d="M13.5 2.5V7a2 2 0 0 0 2 2H20"/>`
const sheetFill = `<path d="M8 2.5h6.5L20 8v9.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-11a4 4 0 0 1 4-4z"/>`
// 一本书：合上的书，圆脊。
const bookCover = `<path d="M4.5 6.5a4 4 0 0 1 4-4h11v15.5h-11a3 3 0 0 0-3 3z"/><path d="M4.5 18a3 3 0 0 0 3 3h12"/>`
const bookFill = `<path d="M4.5 6.5a4 4 0 0 1 4-4h11v15.5h-11a3 3 0 0 0-3 3z"/>`
// 打开的书。
const bookOpen = `<path d="M12 6.5C10.3 5 8 4.5 3.5 4.5v13c4.5 0 6.8.5 8.5 2 1.7-1.5 4-2 8.5-2v-13c-4.5 0-6.8.5-8.5 2z"/><path d="M12 6.5v13"/>`
const bookOpenFill = `<path d="M12 6.5C10.3 5 8 4.5 3.5 4.5v13c4.5 0 6.8.5 8.5 2 1.7-1.5 4-2 8.5-2v-13c-4.5 0-6.8.5-8.5 2z"/>`

// ───────── 通用层（对应 lucide 名） ─────────
export const generic = {
  // 确认 / 关闭 / 增
  check: { zh: '确认', lucide: 'check', line: `<path d="m4 12.75 4.75 4.75L20 6.5"/>` },
  x: { zh: '关闭', lucide: 'x', line: `<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>` },
  plus: { zh: '加入', lucide: 'plus', line: `<path d="M12 5v14M5 12h14"/>` },
  // 撤销 / 刷新
  'rotate-ccw': {
    zh: '撤销 / 重来',
    lucide: 'rotate-ccw',
    // 一条弧从左边出发逆时针绕一圈，箭头长在弧的终点上（左上），弧与箭头相连。
    line: arcArrow({ a0: 180, a1: -140, sweep: 0 }),
  },
  'refresh-cw': {
    zh: '刷新',
    lucide: 'refresh-cw',
    // 两条对称的弧，各自终点长箭头；两段之间留 40° 空。
    line: arcArrow({ a0: 200, a1: -30, sweep: 1 }) + arcArrow({ a0: 20, a1: 150, sweep: 1 }),
  },
  // 箭头
  'arrow-left': { zh: '返回', lucide: 'arrow-left', line: `<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>` },
  'arrow-right': { zh: '前往', lucide: 'arrow-right', line: `<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>` },
  'arrow-up': { zh: '上移', lucide: 'arrow-up', line: `<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>` },
  'arrow-down': { zh: '下移', lucide: 'arrow-down', line: `<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>` },
  'arrow-left-right': { zh: '交换', lucide: 'arrow-left-right', line: `<path d="M3.5 12h17"/><path d="m8 7.5-4.5 4.5L8 16.5M16 7.5l4.5 4.5L16 16.5"/>` },
  'chevron-down': { zh: '展开', lucide: 'chevron-down', line: `<path d="m5.5 9 6.5 6.5L18.5 9"/>` },
  'chevron-up': { zh: '收起', lucide: 'chevron-up', line: `<path d="m5.5 15 6.5-6.5L18.5 15"/>` },
  'chevron-right': { zh: '进入', lucide: 'chevron-right', line: `<path d="m9 5.5 6.5 6.5L9 18.5"/>` },
  'chevron-left': { zh: '上一个', lucide: 'chevron-left', line: `<path d="M15 5.5 8.5 12l6.5 6.5"/>` },
  // 查找 / 传输
  // 搜索：手柄与圆环斜切相接会留两个尖凹角，两侧各补一小片 class="joint" 的填充内圆角（两片关于 y=x 对称）。
  search: {
    zh: '搜索',
    lucide: 'search',
    line: `<circle cx="10.5" cy="10.5" r="6.75"/><path d="m15.5 15.5 5 5"/><path class="joint" d="M16.32 18.26C15.61 17.55 14.64 17.56 13.72 17.96L15.19 17.13ZM18.26 16.32C17.55 15.61 17.56 14.64 17.96 13.72L17.13 15.19Z"/>`,
    fillShape: `<circle cx="10.5" cy="10.5" r="6.75"/>`,
  },
  download: {
    zh: '下载',
    lucide: 'download',
    line: `<path d="M3.5 15.5v3A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5v-3"/><path d="M12 3.5V15"/><path d="m7.25 10.5 4.75 4.75 4.75-4.75"/>`,
  },
  save: {
    zh: '保存',
    lucide: 'save',
    // 软盘：切角壳 + 顶部标签槽 + 底部滑门，不加点。
    line: `<path d="M7.5 3.5h8.75l4.25 4.25V16.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4z"/><path d="M8.5 3.5v4.5h6"/><path d="M8 20.5v-4.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4.5"/>`,
    fillShape: `<path d="M7.5 3.5h8.75l4.25 4.25V16.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4z"/>`,
  },
  copy: {
    zh: '复制',
    lucide: 'copy',
    line: `${rr(3.5, 8.5, 12, 12, 3.5)}<path d="M8.5 8.5V7a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 20.5 7v5a3.5 3.5 0 0 1-3.5 3.5h-1.5"/>`,
    fillShape: rr(3.5, 8.5, 12, 12, 3.5),
  },
  pencil: {
    zh: '编辑',
    lucide: 'pencil',
    line: `<path d="m4 20 .9-4.4L15.65 4.85a2.6 2.6 0 0 1 3.7 0l-.2-.2a2.6 2.6 0 0 1 0 3.7L8.4 19.1 4 20z"/><path d="m13.5 7 3.5 3.5"/>`,
  },
  trash: {
    zh: '删除',
    lucide: 'trash-2',
    line: `<path d="M4.5 7.5h15"/><path d="M6.25 7.5 7 19a2.5 2.5 0 0 0 2.5 2.5h5A2.5 2.5 0 0 0 17 19l.75-11.5"/><path d="M9.25 7.5V5.25a1.75 1.75 0 0 1 1.75-1.75h2a1.75 1.75 0 0 1 1.75 1.75V7.5"/>`,
    fillShape: `<path d="M6.25 7.5h11.5L17 19a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 19z"/>`,
  },
  // 显隐 / 输出
  eye: {
    zh: '预览',
    lucide: 'eye',
    line: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>${dot(12, 12, 2.5)}`,
    fillShape: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>`,
  },
  'eye-off': {
    zh: '隐藏',
    lucide: 'eye-off',
    // 与「预览」同一只眼；瞳孔保留；斜杠一笔到底穿过瞳孔（Owner 要连着）。
    line: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>${dot(12, 12, 2.5)}<path d="m4.5 4.5 15 15"/>`,
    fillShape: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>`,
  },
  printer: {
    zh: '打印',
    lucide: 'printer',
    // 机身两侧开口给出纸口，进纸在上、出纸在下都是完整的纸，不加灯点。
    line: `<path d="M6.5 17.5H5.75A3 3 0 0 1 2.75 14.5v-3.25a3 3 0 0 1 3-3h12.5a3 3 0 0 1 3 3v3.25a3 3 0 0 1-3 3h-.75"/><path d="M7 8.25V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5v3.75"/>${rr(6.5, 13.5, 11, 7.5, 2)}`,
    fillShape: `<path d="M2.75 11.25a3 3 0 0 1 3-3h12.5a3 3 0 0 1 3 3v3.25a3 3 0 0 1-3 3H5.75a3 3 0 0 1-3-3z"/>`,
  },
  // 播放 / 声音
  play: {
    zh: '播放',
    lucide: 'play',
    line: `<path d="M7.5 5.7v12.6c0 1.3 1.4 2.1 2.5 1.4l10-6.3a1.65 1.65 0 0 0 0-2.8l-10-6.3c-1.1-.7-2.5.1-2.5 1.4z"/>`,
    fillShape: `<path d="M7.5 5.7v12.6c0 1.3 1.4 2.1 2.5 1.4l10-6.3a1.65 1.65 0 0 0 0-2.8l-10-6.3c-1.1-.7-2.5.1-2.5 1.4z"/>`,
  },
  pause: { zh: '暂停', lucide: 'pause', line: `${rr(5.5, 4.5, 4.5, 15, 2.25)}${rr(14, 4.5, 4.5, 15, 2.25)}` },
  'pause-circle': { zh: '暂停（圆）', lucide: 'pause-circle', line: `<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5v7M14.5 8.5v7"/>`, fillShape: `<circle cx="12" cy="12" r="9"/>` },
  volume: {
    zh: '朗读',
    lucide: 'volume-2',
    line: `<path d="M3.5 9.75v4.5a1.5 1.5 0 0 0 1.5 1.5h2.4l4.6 3.7a1 1 0 0 0 1.6-.8V5.35a1 1 0 0 0-1.6-.8L7.4 8.25H5a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M17.5 8.25a5.5 5.5 0 0 1 0 7.5"/>`,
    fillShape: `<path d="M3.5 9.75v4.5a1.5 1.5 0 0 0 1.5 1.5h2.4l4.6 3.7a1 1 0 0 0 1.6-.8V5.35a1 1 0 0 0-1.6-.8L7.4 8.25H5a1.5 1.5 0 0 0-1.5 1.5z"/>`,
  },
  shuffle: {
    zh: '随机',
    lucide: 'shuffle',
    line: `<path d="M3.5 6.5h2.8c5.4 0 5.4 11 10.8 11h3.4"/><path d="M3.5 17.5h2.8c5.4 0 5.4-11 10.8-11h3.4"/><path d="m17.5 3.5 3 3-3 3M17.5 14.5l3 3-3 3"/>`,
  },
  // 更多 / 调节 / 系统
  ellipsis: { zh: '更多', lucide: 'more-horizontal', line: `${dot(5.25, 12)}${dot(12, 12)}${dot(18.75, 12)}` },
  sliders: {
    zh: '筛选',
    lucide: 'sliders-horizontal',
    // 两条推子，旋钮是竖着的小药丸（像真的推杆），不用点。两条比三条在 16px 下更清爽。
    // 旋钮 3.5×6.5 → 4.25×7：孔从 0.75 放到 1.5 单位（Owner：大一点点，别大多）。
    line: `<path d="M3.5 8h17M3.5 16h17"/>${rr(12.625, 4.5, 4.25, 7, 2.125)}${rr(7.125, 12.5, 4.25, 7, 2.125)}`,
    fillShape: `${rr(12.625, 4.5, 4.25, 7, 2.125)}${rr(7.125, 12.5, 4.25, 7, 2.125)}`,
  },
  settings: { zh: '管理', lucide: 'settings', line: `<path d="${gear()}"/><circle cx="12" cy="12" r="2.9"/>`, fillShape: `<path d="${gear()}"/>` },
  'log-out': {
    zh: '退出登录',
    lucide: 'log-out',
    line: `<path d="M10 20.5H7a3.5 3.5 0 0 1-3.5-3.5V7A3.5 3.5 0 0 1 7 3.5h3"/><path d="m15.5 7.5 4.5 4.5-4.5 4.5M20 12H9.5"/>`,
  },
  link: {
    zh: '链接',
    lucide: 'link-2',
    line: `<path d="M9.5 7.5H7a4.5 4.5 0 0 0 0 9h2.5M14.5 7.5H17a4.5 4.5 0 0 1 0 9h-2.5"/><path d="M8.5 12h7"/>`,
  },
  pin: {
    zh: '固定',
    lucide: 'pin',
    // 图钉：帽檐比钉身宽，钉身到底盘外扩，针在下。轮廓照 Lucide，只把角磨圆、比例放胖。
    line: `<path d="M7.75 3.5h8.5"/><path d="M9.5 3.5v5.5L6.5 12.25V14h11v-1.75L14.5 9V3.5"/><path d="M12 14v6.5"/>`,
    fillShape: `<path d="M9.5 3.5v5.5L6.5 12.25V14h11v-1.75L14.5 9V3.5z"/>`,
  },
  tag: {
    zh: '标签',
    lucide: 'tag',
    line: `<path d="M3.5 5.75v6.1a2.25 2.25 0 0 0 .66 1.6l7.4 7.4a2.25 2.25 0 0 0 3.18 0l5.6-5.6a2.25 2.25 0 0 0 0-3.18l-7.4-7.4a2.25 2.25 0 0 0-1.6-.66h-6.1a1.75 1.75 0 0 0-1.75 1.75z"/>${dot(8.25, 8.25)}`,
    fillShape: `<path d="M3.5 5.75v6.1a2.25 2.25 0 0 0 .66 1.6l7.4 7.4a2.25 2.25 0 0 0 3.18 0l5.6-5.6a2.25 2.25 0 0 0 0-3.18l-7.4-7.4a2.25 2.25 0 0 0-1.6-.66h-6.1a1.75 1.75 0 0 0-1.75 1.75z"/>`,
  },
  grip: { zh: '拖动', lucide: 'grip-vertical', line: `${dot(9.25, 6, 1.6)}${dot(14.75, 6, 1.6)}${dot(9.25, 12, 1.6)}${dot(14.75, 12, 1.6)}${dot(9.25, 18, 1.6)}${dot(14.75, 18, 1.6)}` },
  'page-break': {
    zh: '分页',
    lucide: 'separator-horizontal',
    line: `<path d="M3.5 12h17"/><path d="m8.5 6.5 3.5-3 3.5 3M8.5 17.5l3.5 3 3.5-3"/>`,
  },
  'qr-code': {
    zh: '扫码',
    lucide: 'qr-code',
    // 三个定位框各带中心点（二维码最可辨的特征），右下角三个模块点排成 L。
    line: `${rr(3, 3, 7.5, 7.5, 2.25)}${rr(13.5, 3, 7.5, 7.5, 2.25)}${rr(3, 13.5, 7.5, 7.5, 2.25)}${dot(6.75, 6.75, 1.4)}${dot(17.25, 6.75, 1.4)}${dot(6.75, 17.25, 1.4)}${dot(14.75, 14.75, 1.5)}${dot(19.5, 14.75, 1.5)}${dot(14.75, 19.5, 1.5)}${dot(19.5, 19.5, 1.5)}`,
  },
  sparkles: {
    zh: 'AI 推荐',
    lucide: 'sparkles',
    line: `<path d="M12.5 3.5c.55 4.8 3 7.2 7.5 7.75-4.5.55-6.95 2.95-7.5 7.75-.55-4.8-3-7.2-7.5-7.75 4.5-.55 6.95-2.95 7.5-7.75z"/>${dot(5, 18.5)}`,
    fillShape: `<path d="M12.5 3.5c.55 4.8 3 7.2 7.5 7.75-4.5.55-6.95 2.95-7.5 7.75-.55-4.8-3-7.2-7.5-7.75 4.5-.55 6.95-2.95 7.5-7.75z"/>`,
  },
  'grid-2x2': { zh: '趣味练习', lucide: 'grid-2x2', line: `${rr(3.5, 3.5, 17, 17, 4)}<path d="M12 3.5v17M3.5 12h17"/>`, fillShape: rr(3.5, 3.5, 17, 17, 4) },
  // 听写：音符头 r 2.9。符干右缘与头的右缘同一条竖线（x 20.2），右侧直接相切；
  // 左侧符干切在头顶点上会出现尖凹角，补一小段内圆角（class=joint 的填充片，线态/填充态都保留）把它接顺。
  'list-music': {
    zh: '听写 / 听力',
    lucide: 'list-music',
    line: `<path d="M3.5 6h9M3.5 12h9M3.5 18h5"/><path d="M18.825 16.25V4.5"/>${dot(17.3, 16.25, 2.9)}<path class="joint" d="M17.45 11C17.45 12.6 16.35 13.1 15.25 14.2L17.45 14.2Z"/>`,
  },
  'list-checks': {
    zh: '已听写',
    lucide: 'list-checks',
    line: `<path d="M11.5 6.5h9M11.5 12h9M11.5 17.5h9"/><path d="m3.5 6.75 1.75 1.75L8.75 5M3.5 17.75l1.75 1.75 3.5-3.5"/>`,
  },
  presentation: {
    zh: '讲评',
    lucide: 'presentation',
    line: `${rr(3, 4, 18, 11.5, 3.5)}<path d="M12 15.5v2.5M8.5 21l3.5-3 3.5 3"/>`,
    fillShape: rr(3, 4, 18, 11.5, 3.5),
  },
  'folder-plus': {
    zh: '新建词组',
    lucide: 'folder-plus',
    line: `<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.4a2 2 0 0 1 1.5.7L12.5 7.5H18a2.5 2.5 0 0 1 2.5 2.5v7a3.5 3.5 0 0 1-3.5 3.5H7a3.5 3.5 0 0 1-3.5-3.5z"/><path d="M12 10.5v6M9 13.5h6"/>`,
    fillShape: `<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.4a2 2 0 0 1 1.5.7L12.5 7.5H18a2.5 2.5 0 0 1 2.5 2.5v7a3.5 3.5 0 0 1-3.5 3.5H7a3.5 3.5 0 0 1-3.5-3.5z"/>`,
  },
  archive: {
    zh: '个人空间',
    lucide: 'archive',
    // 盖 + 箱 + 一条抽手。抽手是箱子该有的东西，点不是。
    line: `${rr(2.75, 4, 18.5, 5.5, 2.75)}<path d="M5 9.5v8.5a3.5 3.5 0 0 0 3.5 3.5h7a3.5 3.5 0 0 0 3.5-3.5V9.5"/><path d="M10 14.5h4"/>`,
    fillShape: `<path d="M5 9.5h14v8.5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 18z"/>`,
  },
}

// ───────── 领域层：一张卷 / 一本书 / 板 ─────────
export const domain = {
  paper: { zh: '卷 / 详情', lucide: 'file-text', line: `${sheet}<path d="M8.5 13.5h7M8.5 17.5h4"/>`, fillShape: sheetFill },
  'paper-student': { zh: '学生版', lucide: null, line: `${sheet}<path d="M11.75 16h3.75"/>${dot(8.5, 16, 1.6)}`, fillShape: sheetFill },
  'paper-check': { zh: '教师版 / 听写纸', lucide: 'file-check-2', line: `${sheet}<path d="m8.75 15.75 2 2 4.5-4.5"/>`, fillShape: sheetFill },
  'paper-download': { zh: '下载 PDF', lucide: 'file-down', line: `${sheet}<path d="M12 11.25v6M9.5 14.75 12 17.25l2.5-2.5"/>`, fillShape: sheetFill },
  papers: {
    zh: '相似篇章',
    lucide: 'files',
    // 两张圆角纸前后错开，前面那张不再切角：三条边少一条斜线，16px 下松很多。
    line: `${rr(4, 7, 13, 14.5, 3.5)}<path d="M8.5 3.5h8.25A3.25 3.25 0 0 1 20 6.75V15.5"/>`,
    fillShape: rr(4, 7, 13, 14.5, 3.5),
  },
  'board-check': {
    zh: '单词复习',
    lucide: 'clipboard-check',
    line: `${rr(4.5, 4.5, 15, 17, 3.5)}${rr(9, 2.5, 6, 4, 2)}<path d="m8.75 13.75 2.25 2.25 4.5-4.5"/>`,
    fillShape: rr(4.5, 4.5, 15, 17, 3.5),
  },
  // 草稿卷：回到「板」家族（原站 ClipboardList），板 + 两行草稿；和学生版（纸 + 点 + 短行）不再互为镜像。
  'board-list': {
    zh: '草稿卷',
    lucide: 'clipboard-list',
    line: `${rr(4.5, 4.5, 15, 17, 3.5)}${rr(9, 2.5, 6, 4, 2)}<path d="M8.75 11.75h6.5M8.75 16h4"/>`,
    fillShape: rr(4.5, 4.5, 15, 17, 3.5),
  },
  'book-open': { zh: '阅读解析', lucide: 'book-open', line: bookOpen, fillShape: bookOpenFill },
  // 单词卡：就是一张卡。横卡 + 一个词（短行），不再往开本书里塞勾。
  card: { zh: '单词卡', lucide: 'book-open-check', line: `${rr(2.75, 5, 18.5, 14, 4)}<path d="M7.5 10.25h9M7.5 14.25h4.5"/>`, fillShape: rr(2.75, 5, 18.5, 14, 4) },
  // 过生词：合上的书 + 书签带（从书顶垂下的一小条），代替原来的点。
  'book-marked': { zh: '过生词', lucide: 'book-marked', line: `${bookCover}<path d="M13.5 2.5v5.75l2-1.5 2 1.5V2.5"/>`, fillShape: bookFill },
  // 剪入 / 已剪入（整卷页把题组「剪」进草稿卷）：一把朝上张开的剪刀——两个指环在下，两片刀在上交叉。
  // 两环 r 2.9 各留 16px 下 1px 的孔（挖空法）；刀从环的外切点直线到刀尖，交点落在 (12, 9.4)。fill 变体填两个环 = 已剪入。
  scissors: {
    zh: '剪入 / 已剪入',
    lucide: 'scissors',
    line: `<circle cx="6.5" cy="17.5" r="2.9"/><circle cx="17.5" cy="17.5" r="2.9"/><path d="M8.13 15.1 16 3.5M15.87 15.1 8 3.5"/>`,
    fillShape: `<circle cx="6.5" cy="17.5" r="2.9"/><circle cx="17.5" cy="17.5" r="2.9"/>`,
  },
}

// ───────── 题型六个（篇章层，配题型六色） ─────────
export const passage = {
  // 阅读理解：一本摊开的书（Owner 选 B）。顶栏「篇章」改用 papers，避免同形。
  reading: { zh: '阅读理解', color: '#4199E3', line: `${bookOpen}<path d="M15 10.5h2.5"/>`, fillShape: bookOpenFill },
  cloze: { zh: '完形填空', color: '#A07DE5', line: `<path d="M4 6h16M15 12h5M4 18h10.5"/>${rr(4, 9.25, 7, 5.5, 2.75)}`, fillShape: rr(4, 9.25, 7, 5.5, 2.75) },
  // 七选五（Owner 定 B 归位）：上下两行正文夹着「一句话的位置」，位置上只剩左边一小截，一支箭头从右边把句子送回去。
  seven: { zh: '七选五', color: '#D86EB0', line: `<path d="M4 5.5h16M4 18.5h16M4 12h5.5"/><path d="M20 12h-6.5M16 9.5 13.5 12l2.5 2.5"/>` },
  // 语法填空（Owner：「xx.__」或「在__上」）：一段词 + 一条落在基线下的空线。空线比词低 4 单位，是「空」不是「行」。
  //   Owner 定 E：一行正文 + 词 + ⎵。上面那行正文给「卷面」上下文；⎵ 是「这里要填」。
  grammar: { zh: '语法填空', color: '#E56E66', line: `<path d="M4 6.5h16M4 15.5h3.5M12 12.5v3a1.75 1.75 0 0 0 1.75 1.75h4.5A1.75 1.75 0 0 0 20 15.5v-3"/>` },
  application: {
    zh: '应用文',
    color: '#D77A03',
    line: `${rr(2.75, 5, 18.5, 14, 4)}<path d="m3.5 8.75 7 4.75a2.6 2.6 0 0 0 3 0l7-4.75"/>`,
    fillShape: rr(2.75, 5, 18.5, 14, 4),
  },
  continuation: {
    zh: '读后续写',
    color: '#659B7B',
    line: `<path d="M4 6h16M4 11.5h11M4 17h4"/><path d="m13.5 20.75.5-3 5-5a1.9 1.9 0 0 1 2.7 2.7l-5 5-3.2.3z"/>`,
    fillShape: `<path d="m13.5 20.75.5-3 5-5a1.9 1.9 0 0 1 2.7 2.7l-5 5-3.2.3z"/>`,
  },
}

export const all = { ...generic, ...domain }
