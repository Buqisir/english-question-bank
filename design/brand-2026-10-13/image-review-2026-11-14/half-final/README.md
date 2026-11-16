# 半身像 · 定稿候选（2026-11-14）

状态：提案 · 单一来源 · Owner 还没看。`mascot/` 没改，`half-round1/` 到 `half-round5/` 原样没动。

这四张的身体是同一份，都是从定稿坐姿 `mascot/otter-sit.svg` 原样裁出来的。

- 「找题中」（抱圆墩石头）、「递出结果」（抱扇贝，和爪子之间留浅色细缝）、「登录页」（不露爪尖），以及底稿 `otter-half.svg`：从 `half-round4/` 原样拷来，逐字节相同。
- 「没找到」：就是第四轮的空手底稿，两爪合在胸前，手里什么都不拿。路径、水面（y 670）、viewBox（`294 12 494 715`）都没动，只换了标题和注释。

Owner 2026-11-14 定的（第 115 条）：半身从坐姿裁；「没找到」空着手；登录页不露爪尖。

| 文件 | 来源 |
| --- | --- |
| `otter-half.svg` | `half-round4/otter-half.svg` 原样 |
| `state-searching.svg` | `half-round4/` 原样 |
| `state-offer.svg` | `half-round4/` 原样 |
| `state-login.svg` | `half-round4/` 原样（不带爪尖） |
| `state-not-found.svg` | `half-round4/otter-half.svg`，只换了标题和注释 |
| `states.png` | 四张各 400 像素宽，下面 96、64 像素小样，排法同第四轮 |

脚本：`node scripts/brand/half-final.mjs`，负责拷文件和出图。

## 还不好

- 剪影往左歪：坐姿原图身体本来就偏，裁成半身以后左肩低、右边直。
- 头占可见高度 0.29，比想要的小。
- 64 像素下扇贝只剩一团，认不出；石头也只是一块灰色。
