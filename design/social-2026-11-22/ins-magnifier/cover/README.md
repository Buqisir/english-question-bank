# Ins 轮播封面 · 完形填空新讲法（2026-11-22）

- `cover.png`：成品，1500×2000（3:4），和 5 张内页同比例。
- `C1.png`：底图，gpt-image-2.6-sunburst 从 E4 编辑重出（1536×2048），提示词见 `prompt-C1.txt`。
- `cover.html`：排版源文件。字体是 Noto Serif SC（`npm pack @fontsource/noto-serif-sc@5`，把 `FONTS` 换成解包后的 `package/files` 路径）和 Liberation Serif；用 Playwright 1500×2000 截图出图。
