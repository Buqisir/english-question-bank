# Ins 轮播封面 · 听力新讲法（2026-11-23）

- `cover3.png`：成品，1080×1440（3:4）。
- `L5.png`：现用底图，从 `L4.png` 只改光效：去掉彩虹流光，换成雾海色板（薄荷雾 #C4ECDD、青 #A9DFF0、白光束），提示词 `prompt-L5.txt`。
- `L4.png`：上一版底图，gpt-image-2.6-sunburst，从 `L1.png` 缩小獭獭、挪到左下（提示词 `prompt-L4.txt`）。`L1.png` 由 3D 母版 `ref-otter-3d.png` 和坐石全身像生成（`prompt-L1.txt`）。
- `cover3.html`：排版源文件。字体 Noto Sans SC（`npm pack @fontsource/noto-sans-sc@5`，替换 `FONTS_SANS`）和 Noto Serif SC（替换 `FONTS_SERIF`）；Playwright 1080×1440 截图。
- 獭獭在这张里是 3D 毛绒质感、坏笑表情，是给社媒的风格例外，不进界面。
