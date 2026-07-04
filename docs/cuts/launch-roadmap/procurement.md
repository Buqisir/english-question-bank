# M1 采购操作清单（owner 亲自动手的部分，2026-07-04）

三样东西：云机（腾讯云）+ 域名 + R2 备份桶（后两样都在 Cloudflare，
一个账号搞定）。全部买完把「交付物」一节的四样东西发我，我接手部署。

## 1. 腾讯云轻量应用服务器（约 ¥40/月）

1. https://cloud.tencent.com → 登录/注册 + 实名认证（个人）。
2. 产品搜「轻量应用服务器」→ 新建：
   - 地域：**中国香港**；
   - 镜像：**Ubuntu 24.04 LTS**（纯净镜像，不选应用模板）；
   - 套餐：**2 核 2GB / 30GB SSD** 档（月付 ¥30-50 区间选最便宜的
     那档即可；带宽 30Mbps 峰值档足够）；
   - 时长：先买 1 个月或 3 个月，别一次买年（M1 验收过了再续长）。
3. 创建后在控制台「防火墙」页放行端口：**22、80、443**（默认一般
   已放行，确认即可）。其余端口一律不开。
4. 重置 root 密码或绑定 SSH 密钥（推荐密钥：控制台「密钥」页生成，
   下载 .pem 保存好）。

## 2. 域名（Cloudflare，约 $10/年）

1. https://dash.cloudflare.com → 注册账号（邮箱即可，无需实名）。
2. 左侧「Domain Registration → Register Domain」搜候选名（按顺序试，
   哪个能注册且顺眼就拍哪个）：
   - eqbank.cc / eqbank.net / eqbank.app
   - eqb.im / eqb.cc / eqb.ink
   - eqbank.xyz（最便宜兜底，~$1 首年）
   - 不喜欢就搜自己想的名字，注册商选 Cloudflare 就行（成本价，
     无续费坑）。
3. 买完不用做任何解析设置——把域名告诉我，DNS 记录我来配
   （就在同一个 Cloudflare 面板，我给你具体点哪几下，或你把
   账号临时借我操作一次）。

## 3. Cloudflare R2 备份桶（免费额度内，¥0）

1. 同一个 Cloudflare 账号 → 左侧「R2 Object Storage」→ 首次开通
   要绑一张卡（Visa/Mastercard 或 PayPal；只是开通门槛，
   10GB 存储 + 每日备份量在免费额度内，正常不会扣钱）。
   ※ 没有外币卡的话告诉我，备份改推腾讯云 COS（每月几块钱）。
2. 「Create bucket」：名字 `eqb-backup`，地域默认（Automatic）。
3. 「Manage R2 API Tokens」→ Create API Token → 权限选
   **Object Read & Write**，范围限定 `eqb-backup` 这一个桶 →
   生成后把 Access Key ID / Secret Access Key / 账户 Endpoint
   三样存下来（只显示一次）。

## 交付物（发给我这四样，部署就开工）

1. 云机公网 IP + SSH 方式（.pem 密钥文件路径，或 root 密码）；
2. 域名（哪个名字、已在 Cloudflare 账下）；
3. R2 的 Access Key ID / Secret / Endpoint（`.env` 用，不进 git）；
4. 你的 DeepSeek API key（服务器 `.env` 用，现有机制原样上云）。

安全提醒：密钥类（.pem / R2 Secret / DeepSeek key）别发到会留痕的
群聊，当面拷或用一次性渠道给我。
