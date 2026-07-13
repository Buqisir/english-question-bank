# draft-desk-b — 步4 CR-lite(DP-2 步间闸,主代理冷读)

- 日期:2026-07-13
- 对象:PR #285 @ 8600564(SW-D fixture 前置修,独立 commit)+ c45f533(换线主体)
- 复核方式:主代理冷读全 diff(12 文件)+ 亲手重跑 verify(不采信 DEV 自报绿)
- 结论:**过闸,0 Must Fix**;2 条新挂账 SW-J/SW-K + 1 nit。CI 见下。

## 亲手复跑(全部原始退出码 0)

print-pdf-export-flow 37 · cache-trigger 14 · dom-contract 32 · renderer 25 ·
perf 2(暖 ~690-740ms)· c8-contracts 50 · render-model 35 · error-copy 18
(describeError 计数稳在 12,SW-I 复用既有错误状态未加调用点)· my-space 84 ·
user-scope 50(真 HTTP 跨用户 404,含 B 借 A draftId 走 my-space 存档路)·
visual-unify 20 · tsc 0 错。PR CI:push 后主代理确认双绿再宣过闸。

## 冷读判定

- **SW-5 退役落实完整**,退役映射表六项(preferRecent / recentDraftPdfExports /
  draftPaperPrintSignature / clearRecentDraftPdfExport / outputPath /
  reusedRecent)每项都有下落且语义保真:reusedRecentPdf API 字段外义不变
  (「没重渲」),来源换成分页签名缓存命中——比 30s TTL 更强。模块内**只剩一套
  缓存一个签名函数**,双缓存静默失真面按拍板铲除。
- **ownership 闸保留**:M0-4 的「B 借 A 的 draftId」防线移进
  getDraftPaperPagination 内层 getDraftPaper(id,user_id)闸,行为由 user-scope
  真 HTTP 断言证实;draftPaginationCache 键不带 user 的豁免论证(上游闸先行)
  照旧成立。
- **last_printed_at 语义保真**:只在真导出时 bump,预览取分页绝不碰——单独短
  连接实现,注释写明为何不能折进 getDraftPaperPagination。判断正确。
- **浏览器打印并线**(owner 拍板落实):document.write(paginatedHtml),三出口
  (预览/PDF/打印)同源单次渲染,第三台分页引擎退役。printHtml 字段留在 API
  面(本刀不动 API 契约)。
- **SW-D 修法正确**:修 fixture 不放断言(挖空标记 __25__ __26__ __27__ 连续
  编号贴真实卷),与 draft-numbering-style 刀「数据真实性教训」同款处置。
- **export-flow verify 37 条断言换线后零改动全过**——行为闸(真服务真 API)的
  回报,「行为断言优于源码正则」惯例实证。
- **verify 断言三处换向**(render-model×2、my-space×1)全部是诚实 turnover:
  新断言锚定新管线的等价证明点,原始关切(共用 builder 不复制 / 存档不重渲)
  未放松。
- **SW-I 落实**:error 徽章复用 loading 徽章壳 + --eqb-color-danger token(不撞
  visual-unify hex 白名单),旧预览可见时失败不再静默。
- **工厂签名收窄**(exportDir/rootDir 出参):调用方多传属性无害,api.mjs 零
  改动——收敛与不扩散的折中,接受。
- **DEV 流程偏差(公开申报,接受)**:未打 pre-QA checkpoint commit——实现+
  QA 一气呵成零返工,拆分只会产出空提交。偏差有理且如实上报,不立案。

## 新挂账(Should Watch)

- **SW-J(步5 或后续刀)**:两处导出路由的错误码映射仍查 'vivliostyle' 子串
  (已死);真·渲染中途 Chromium/pagedjs 崩溃会落 generic 400 而非 5xx。与旧线
  同级的不精确,非回归;顺手清时把死子串一并摘。
- **SW-K(后续清理刀)**:Workbench ~199-212 的 versionType 切换重取 printHtml
  的 effect 成了死流量(printHtml 客户端消费点归零,发请求无人读)。DEV 按
  「不做没要求的事」留置并申报——处置正确;归后续 printHtml 面收缩刀(连带
  评估 API 字段要不要瘦身)。
- **nit(不开账)**:browserPrint 在 paginatedHtml 未就绪时静默 return——按钮
  可考虑 disabled 态;DP-3 QA 顺眼看一下即可。

## Forbidden 复核

print-renderer.mjs / exportImplementation.mjs / schema / buildPageBreakSuggestions
+ print-ready-gate 魔法数字 / A4A3:全部未触碰(diff 文件清单证实)。
forbidden-scope 门的 SW-E 既有噪音照旧,步5 处置。

## 浏览器 QA(DEV,真 Chrome via claude-in-chrome,localhost)

7 页真卷:分页预览零 console 错;打印路径 hook window.open 截获写入 HTML 验明
= 服务器分页 DOM(.pagedjs_page ×7 与预览一致、零 script、@page+counter 页脚),
未触发原生打印对话框;PDF 真点下载(195680 字节,%PDF-1.4,/Type /Page 数=7
与预览完全一致——parity 实证而非仅构造论证);SW-I 徽章用 fetch 注错实测
(旧预览可见+红徽章),恢复后无残留。owner 产品 QA 留 DP-3。
