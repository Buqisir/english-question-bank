// 第二版字形：胖在形体，不胖在描边。
// 24 网格，直接画在活区 2.5–21.5，描边 2.25（= 16px 时 1.5px，与 14px/500 中文的竖笔同重）。
// 三条规则：
//   1. 封闭圆角轮廓优先于开放笔画；内部细节线在 16 级一律删掉（垃圾桶不画两道竖线）。
//   2. 每个字形 ≤ 2 个形 + ≤ 1 个实心点；任何两笔之间净空 ≥ 2 单位（16px 时 ≥ 1.3px），不用虚线。
//   3. 全套只有一个「点」（r 1.75 实心）：省略号、瞳孔、选项、齿轮心、当前位置——它是这套图标的家族标记，也是「可爱」唯一的载体。
// 领域字形不借通用隐喻，直接用卷面上的五个原语拼：横线（正文）、药丸空（待填）、折角（一张卷）、插入号（改）、点（选中）。

function gear({ teeth = 6, outer = 9.6, root = 7.1, toothFrac = 0.5 } = {}) {
  const pts = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step - Math.PI / 2
    const half = (step * toothFrac) / 2
    const gap = (step * (1 - toothFrac)) / 2
    const seq = [
      [root, a0 - half - gap],
      [root, a0 - half - gap * 0.3],
      [outer, a0 - half * 0.7],
      [outer, a0 + half * 0.7],
      [root, a0 + half + gap * 0.3],
    ]
    for (const [r, a] of seq) pts.push([12 + r * Math.cos(a), 12 + r * Math.sin(a)])
  }
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('') + 'Z'
}

const dot = (cx, cy, r = 1.75) => `<circle class="dot" cx="${cx}" cy="${cy}" r="${r}"/>`
// 一张卷：折角纸。所有「卷 / 篇章 / 题组 / 版本」字形共用这个外形，只换里面的一个标记。
const sheet = `<path d="M7 2.5h6.5L20 9v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5.5a3 3 0 0 1 3-3z"/><path d="M13.5 2.5V9H20"/>`
const sheetFill = `<path d="M7 2.5h6.5L20 9v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5.5a3 3 0 0 1 3-3z"/>`

// 通用层（对应 Lucide 名）。
export const iconsV2 = {
  search: {
    zh: '搜索',
    line: `<circle cx="10.5" cy="10.5" r="6.75"/><path d="M15.5 15.5 20.5 20.5"/>`,
    fillShape: `<circle cx="10.5" cy="10.5" r="6.75"/>`,
  },
  plus: { zh: '加入', line: `<path d="M12 5v14M5 12h14"/>` },
  check: { zh: '确认', line: `<path d="m4.5 12.5 4.75 4.75L19.5 7"/>` },
  x: { zh: '关闭', line: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>` },
  'chevron-right': { zh: '展开', line: `<path d="m9 5.5 6.5 6.5L9 18.5"/>` },
  'arrow-right': { zh: '前往', line: `<path d="M4.5 12h15"/><path d="M13 6l6.5 6-6.5 6"/>` },
  ellipsis: { zh: '更多', line: `${dot(5.25, 12)}${dot(12, 12)}${dot(18.75, 12)}` },
  eye: {
    zh: '预览',
    line: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>${dot(12, 12, 2.5)}`,
    fillShape: `<path d="M2.75 12c2.6-4.7 5.7-7 9.25-7s6.65 2.3 9.25 7c-2.6 4.7-5.7 7-9.25 7S5.35 16.7 2.75 12z"/>`,
  },
  'trash-2': {
    zh: '删除',
    line: `<path d="M4.5 7.5h15"/><path d="M6.25 7.5 7 19a2.5 2.5 0 0 0 2.5 2.5h5A2.5 2.5 0 0 0 17 19l.75-11.5"/><path d="M9.25 7.5V5.25a1.75 1.75 0 0 1 1.75-1.75h2a1.75 1.75 0 0 1 1.75 1.75V7.5"/>`,
    fillShape: `<path d="M6.25 7.5h11.5L17 19a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 19z"/>`,
  },
  printer: {
    zh: '打印',
    line: `<rect x="2.75" y="8.5" width="18.5" height="9" rx="3"/><path d="M7 8.5V4.75a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5V8.5"/><path d="M7.5 17.5v3.25h9V17.5"/>${dot(17.25, 12.75)}`,
    fillShape: `<rect x="2.75" y="8.5" width="18.5" height="9" rx="3"/>`,
  },
  download: {
    zh: '下载',
    line: `<path d="M3.5 15.5v3A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5v-3"/><path d="M12 3.5V15"/><path d="m7.25 10.5 4.75 4.75 4.75-4.75"/>`,
  },
  settings: {
    zh: '管理',
    line: `<path d="${gear()}"/>${dot(12, 12, 2)}`,
    fillShape: `<path d="${gear()}"/>`,
  },
  'book-marked': {
    zh: '过生词',
    line: `<path d="M4.5 5.5a3 3 0 0 1 3-3h12v15.5H7.5a3 3 0 0 0-3 3z"/><path d="M4.5 18.5a3 3 0 0 0 3 3h12"/>${dot(14, 8)}`,
    fillShape: `<path d="M4.5 5.5a3 3 0 0 1 3-3h12v15.5H7.5a3 3 0 0 0-3 3z"/>`,
  },
  archive: {
    zh: '个人空间',
    line: `<rect x="2.75" y="4" width="18.5" height="5.5" rx="2.5"/><path d="M5 9.5v9A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-9"/>${dot(12, 14.75)}`,
    fillShape: `<path d="M5 9.5h14v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5z"/>`,
  },
}

// 领域层 · 「一张卷」家族：同一张折角纸，只换里面那个标记。
export const sheetFamily = {
  paper: { zh: '卷', line: `${sheet}<path d="M8 13.5h8M8 17.5h5"/>`, fillShape: sheetFill },
  'paper-student': { zh: '学生版', line: `${sheet}<path d="M11.5 15.5H16"/>${dot(8.25, 15.5)}`, fillShape: sheetFill },
  'paper-teacher': { zh: '教师版', line: `${sheet}<path d="m8 15.25 2.5 2.5L15.5 12.5"/>`, fillShape: sheetFill },
  'paper-draft': { zh: '草稿卷', line: `${sheet}<path d="M8 16h4"/>${dot(15.5, 16)}`, fillShape: sheetFill },
}

// 领域层 · 题型六个：不画书、不画信封以外的隐喻，只用卷面原语。
// 完形 = 正文行里一个「短药丸空」（词级）；七选五 = 整行换成「长药丸空」（句级）——两者天然是一家。
// 语法填空 = 药丸空里已经给了一个点（括号里的提示词）；阅读 = 正文 + 一个被选中的点；续写 = 正文断在半途，笔接着写。
export const passageIconsV2 = {
  reading: {
    zh: '阅读理解',
    color: '#4199E3',
    line: `<path d="M4 6h16M4 11.5h16M10 17h10"/>${dot(5.25, 17)}`,
  },
  cloze: {
    zh: '完形填空',
    color: '#A07DE5',
    line: `<path d="M4 6h16M14 12h6M4 18h10.5"/><rect x="4" y="9.25" width="7" height="5.5" rx="2.75"/>`,
    fillShape: `<rect x="4" y="9.25" width="7" height="5.5" rx="2.75"/>`,
  },
  seven: {
    zh: '七选五',
    color: '#D86EB0',
    line: `<path d="M4 5.5h16M4 18.5h16"/><rect x="4" y="9.5" width="16" height="5" rx="2.5"/>`,
    fillShape: `<rect x="4" y="9.5" width="16" height="5" rx="2.5"/>`,
  },
  grammar: {
    zh: '语法填空',
    color: '#E56E66',
    line: `<path d="M4 6h16M4 18h9"/><rect x="6.5" y="9.25" width="11" height="5.5" rx="2.75"/>${dot(12, 12)}`,
    fillShape: `<rect x="6.5" y="9.25" width="11" height="5.5" rx="2.75"/>`,
  },
  application: {
    zh: '应用文',
    color: '#D77A03',
    line: `<rect x="2.75" y="5" width="18.5" height="14" rx="3.5"/><path d="m3.5 8.75 7 4.75a2.6 2.6 0 0 0 3 0l7-4.75"/>`,
    fillShape: `<rect x="2.75" y="5" width="18.5" height="14" rx="3.5"/>`,
  },
  continuation: {
    zh: '读后续写',
    color: '#659B7B',
    line: `<path d="M4 6h16M4 11.5h16M4 17h5.5"/><path d="m13 20.5.5-3 5-5a1.9 1.9 0 0 1 2.7 2.7l-5 5-3.2.3z"/>`,
    fillShape: `<path d="m13 20.5.5-3 5-5a1.9 1.9 0 0 1 2.7 2.7l-5 5-3.2.3z"/>`,
  },
}

// 五个卷面原语，单独展示用。
export const primitives = {
  rule: { zh: '正文行', line: `<path d="M4 8h16M4 13h16M4 18h9"/>` },
  blank: { zh: '药丸空', line: `<rect x="5" y="9.25" width="14" height="5.5" rx="2.75"/>` },
  sheet: { zh: '折角纸', line: sheet },
  caret: { zh: '插入号', line: `<path d="m7 17.5 5-6 5 6"/>` },
  dot: { zh: '点', line: dot(12, 12, 2.5) },
}
