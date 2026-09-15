// 样例字形（提案笔触）。24 网格，按 3–21 起稿、样张放大 1.06 到活区 2.5–21.5，描边 2.25，圆头圆角。
// 这里只是方向样张，不是正式图标库；正式源件在 Figma，导出后走 svgo → 生成组件。

function gear({ teeth = 8, outer = 9.2, root = 7.2, toothFrac = 0.42 } = {}) {
  const pts = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step
    const half = (step * toothFrac) / 2
    const gap = (step * (1 - toothFrac)) / 2
    const seq = [
      [root, a0 - half - gap],
      [root, a0 - half - gap * 0.35],
      [outer, a0 - half * 0.75],
      [outer, a0 + half * 0.75],
      [root, a0 + half + gap * 0.35],
    ]
    for (const [r, a] of seq) pts.push([12 + r * Math.cos(a), 12 + r * Math.sin(a)])
  }
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('') + 'Z'
  return d
}

// key → { line: svg inner markup, fill?: extra markup for 填充/活动态 }
export const icons = {
  'book-marked': {
    zh: '过生词',
    line: `<path d="M6.5 3H19a1.5 1.5 0 0 1 1.5 1.5V21H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z"/><path d="M4 18.5A2.5 2.5 0 0 0 6.5 21H20.5"/><path d="M10 3v7l2.5-1.8L15 10V3"/>`,
    fillShape: `<path d="M6.5 3H19a1.5 1.5 0 0 1 1.5 1.5V17H6.5A2.5 2.5 0 0 0 4 19.5v-14A2.5 2.5 0 0 1 6.5 3z"/>`,
  },
  archive: {
    zh: '个人空间',
    line: `<rect x="3" y="4" width="18" height="5" rx="2"/><path d="M5 9v9.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V9"/><path d="M10 13.5h4"/>`,
    fillShape: `<rect x="3" y="4" width="18" height="5" rx="2"/><path d="M5 9v9.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V9z"/>`,
  },
  settings: {
    zh: '管理',
    line: `<path d="${gear()}"/><circle cx="12" cy="12" r="2.6"/>`,
    fillShape: `<path d="${gear()}"/>`,
  },
  'clipboard-list': {
    zh: '草稿卷',
    line: `<path d="M9 5H7.5A2.5 2.5 0 0 0 5 7.5v11A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 16.5 5H15"/><rect x="9" y="3" width="6" height="4" rx="1.5"/><path d="M9 12h6M9 16h3.5"/>`,
    fillShape: `<path d="M7.5 5h9A2.5 2.5 0 0 1 19 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-11A2.5 2.5 0 0 1 7.5 5z"/>`,
  },
  'sliders-horizontal': {
    zh: '筛选',
    line: `<path d="M4 7h3M12.5 7H20M4 12h9M18.5 12H20M4 17h1.5M11 17h9"/><circle cx="9.5" cy="7" r="2.5"/><circle cx="15.5" cy="12" r="2.5"/><circle cx="8" cy="17" r="2.5"/>`,
  },
  'arrow-right': {
    zh: '前往',
    line: `<path d="M5 12h13"/><path d="M12.5 6.5 18 12l-5.5 5.5"/>`,
  },
  'arrow-left': {
    zh: '返回',
    line: `<path d="M19 12H6"/><path d="M11.5 6.5 6 12l5.5 5.5"/>`,
  },
  plus: {
    zh: '加入',
    line: `<path d="M12 5.5v13M5.5 12h13"/>`,
  },
  ellipsis: {
    zh: '更多',
    line: `<circle class="dot" cx="5" cy="12" r="1.9"/><circle class="dot" cx="12" cy="12" r="1.9"/><circle class="dot" cx="19" cy="12" r="1.9"/>`,
  },
  'chevron-down': {
    zh: '展开',
    line: `<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>`,
  },
  'chevron-right': {
    zh: '进入',
    line: `<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>`,
  },
  search: {
    zh: '搜索',
    line: `<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>`,
    fillShape: `<circle cx="11" cy="11" r="6.5"/>`,
  },
  check: {
    zh: '确认',
    line: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  },
  x: {
    zh: '关闭',
    line: `<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>`,
  },
  printer: {
    zh: '打印',
    line: `<path d="M7 8V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V8"/><path d="M7 16H5.5A2.5 2.5 0 0 1 3 13.5v-3A2.5 2.5 0 0 1 5.5 8h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H17"/><rect x="7" y="13" width="10" height="8" rx="1.5"/>`,
    fillShape: `<path d="M5.5 8h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 13.5v-3A2.5 2.5 0 0 1 5.5 8z"/>`,
  },
  download: {
    zh: '下载',
    line: `<path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"/><path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/>`,
  },
  eye: {
    zh: '查看',
    line: `<path d="M3 12c2.4-4.3 5.4-6.5 9-6.5s6.6 2.2 9 6.5c-2.4 4.3-5.4 6.5-9 6.5S5.4 16.3 3 12z"/><circle cx="12" cy="12" r="2.8"/>`,
    fillShape: `<path d="M3 12c2.4-4.3 5.4-6.5 9-6.5s6.6 2.2 9 6.5c-2.4 4.3-5.4 6.5-9 6.5S5.4 16.3 3 12z"/>`,
  },
  'trash-2': {
    zh: '删除',
    line: `<path d="M4.5 7h15"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="m6.5 7 .8 11.6A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/>`,
  },
  pencil: {
    zh: '编辑',
    line: `<path d="M4 20l4.2-.9L19.5 7.8a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 0-2.8 0L4.9 15.8 4 20z"/><path d="m14.5 6.5 3 3"/>`,
  },
  sparkles: {
    zh: 'AI 建议',
    line: `<path d="M11 3c.55 4.6 2.9 6.95 7.5 7.5-4.6.55-6.95 2.9-7.5 7.5-.55-4.6-2.9-6.95-7.5-7.5C8.1 9.95 10.45 7.6 11 3z"/><path d="M18.5 15.5c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8z"/>`,
    fillShape: `<path d="M11 3c.55 4.6 2.9 6.95 7.5 7.5-4.6.55-6.95 2.9-7.5 7.5-.55-4.6-2.9-6.95-7.5-7.5C8.1 9.95 10.45 7.6 11 3z"/>`,
  },
}

// 题型六色字形：篇章层专用，配 DESIGN.md 的 passage-* 色。
export const passageIcons = {
  reading: {
    zh: '阅读理解',
    color: '#4199E3',
    line: `<path d="M12 6.5C10.3 5 8 4.5 4 4.5v13c4 0 6.3.5 8 2 1.7-1.5 4-2 8-2v-13c-4 0-6.3.5-8 2z"/><path d="M12 6.5v13"/>`,
    fillShape: `<path d="M12 6.5C10.3 5 8 4.5 4 4.5v13c4 0 6.3.5 8 2 1.7-1.5 4-2 8-2v-13c-4 0-6.3.5-8 2z"/>`,
  },
  cloze: {
    zh: '完形填空',
    color: '#A07DE5',
    line: `<path d="M4 6h16M4 18h8"/><path d="M4 12h3M17 12h3"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.8"/>`,
    fillShape: `<rect x="8.5" y="8.5" width="7" height="7" rx="1.8"/>`,
  },
  seven: {
    zh: '七选五',
    color: '#D86EB0',
    line: `<path d="M4 5h16M4 8.5h16M4 15.5h16M4 19h16"/><path d="M4 12h16" stroke-dasharray="2.6 2.6"/>`,
  },
  grammar: {
    zh: '语法填空',
    color: '#E56E66',
    line: `<path d="M4 17h4.5M15.5 17H20"/><path d="M9.5 7c-1.7 1.6-1.7 8.4 0 10M14.5 7c1.7 1.6 1.7 8.4 0 10"/><circle class="dot" cx="12" cy="14.2" r="1.5"/>`,
  },
  application: {
    zh: '应用文',
    color: '#D77A03',
    line: `<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="m3.5 8.5 7.2 5a2.3 2.3 0 0 0 2.6 0l7.2-5"/>`,
    fillShape: `<rect x="3" y="5.5" width="18" height="13" rx="3"/>`,
  },
  continuation: {
    zh: '读后续写',
    color: '#659B7B',
    line: `<path d="M4 6h16M4 10h16M4 14h7"/><path d="m14 20 .6-3 4.4-4.4a1.7 1.7 0 0 1 2.4 2.4L17 19.4l-3 .6z"/>`,
    fillShape: `<path d="m14 20 .6-3 4.4-4.4a1.7 1.7 0 0 1 2.4 2.4L17 19.4l-3 .6z"/>`,
  },
}
