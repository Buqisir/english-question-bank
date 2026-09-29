import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { usePersonalPaperLayout } from './usePersonalPaperLayout'

// Layout pages are measured server-side in mm; the iframe renders them at
// CSS 96dpi, so every mm value converts with this factor (page box checks and
// the per-page overlay mount points below share it).
const MM_TO_PX = 96 / 25.4
// 版式核对容差：Paged.js 的 mm→px 取整与服务器测量的两位小数舍入，累计
// 不应超过 2px。超过即视为渲染结果与批注基准不一致，宁可报错不将错就错。
const GEOMETRY_TOLERANCE_PX = 2

// 显示层修饰（思路同 server 侧 servePaperFontsFromAppOrigin，但在前端做）：
// 给 srcdoc 注入一段仅屏幕生效的样式——整卷纸的 Sheet 阴影（DESIGN.md §4
// owner 验收标准）、页间留白、页面栈底透明（桌面底色透出来）。box-shadow 与
// margin 不改变 .pagedjs_page 的页面盒尺寸与分页几何（版式核对的 2px 容差
// 断言不受影响）；这段样式不进 layoutRef，第 5 阶段 PDF 合成用的是服务端
// 原始 paginatedHtml，不经过这里。
const PAPER_SHEET_SCREEN_STYLE = `<style data-eqb-paper-screen-only>
@media screen {
  html, body { background: transparent; }
  .pagedjs_pages { background: transparent; }
  .pagedjs_page {
    background: #fff;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08);
  }
  .pagedjs_page + .pagedjs_page { margin-top: 24px; }
}
</style>`

// escapeHtml 转义过正文里的 `<`，第一个 `</head>` 恒为真实的 head 收口。
function injectScreenSheetStyle(paginatedHtml: string): string {
  return paginatedHtml.includes('</head>')
    ? paginatedHtml.replace('</head>', `${PAPER_SHEET_SCREEN_STYLE}</head>`)
    : `${paginatedHtml}${PAPER_SHEET_SCREEN_STYLE}`
}

type PageFrame = {
  pageId: string
  leftPx: number
  topPx: number
  widthMm: number
  heightMm: number
}

type GeometryState =
  | { status: 'pending' }
  | { status: 'ok'; frames: PageFrame[]; contentWidthPx: number; contentHeightPx: number }
  | { status: 'failed' }

export type PaperEditingViewProps = {
  paperId: string
  /** Host's current personal-layer source revision; null keeps the view loading. */
  sourceRevision: string | null
  /** 'fit' or a fixed factor. View state only — never persisted. */
  zoom: number | 'fit'
}

type PaperCanvasStyle = CSSProperties & Record<`--${string}`, string | number>

export function PaperEditingView({ paperId, sourceRevision, zoom }: PaperEditingViewProps): ReactNode {
  const { state, reload } = usePersonalPaperLayout({
    paperId,
    sourceRevision,
    enabled: sourceRevision != null,
  })
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [geometry, setGeometry] = useState<GeometryState>({ status: 'pending' })
  const [measuredLayoutId, setMeasuredLayoutId] = useState<string | null>(null)
  const layout = state.status === 'ready' ? state.layout : null
  // 整卷 HTML 是 MB 级字符串，srcdoc 注入按 layout 记一次，不逐渲染重算。
  const screenSrcDoc = useMemo(
    () => (layout ? injectScreenSheetStyle(layout.paginatedHtml) : null),
    [layout],
  )

  // A new layout (revision refresh / retry) invalidates the previous
  // measurement — the React render-time adjustment pattern, no effect needed.
  if (layout && measuredLayoutId !== layout.layoutId) {
    setMeasuredLayoutId(layout.layoutId)
    setGeometry({ status: 'pending' })
  }

  const measureIframe = useCallback((): boolean => {
    const iframe = iframeRef.current
    if (!iframe || !layout) return false
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) return false
    const rendered = [...doc.querySelectorAll('.pagedjs_page')]
    if (rendered.length !== layout.pages.length) return false
    const frames: PageFrame[] = []
    for (const [index, element] of rendered.entries()) {
      const meta = layout.pages[index]
      const box = element.getBoundingClientRect()
      if (Math.abs(box.width - meta.widthMm * MM_TO_PX) > GEOMETRY_TOLERANCE_PX) return false
      frames.push({
        pageId: meta.pageId,
        // Document-relative offsets (viewport rect + scroll), so the overlay
        // layer lines up with the iframe's own page stack at scale 1.
        leftPx: box.left + win.scrollX,
        topPx: box.top + win.scrollY,
        widthMm: meta.widthMm,
        heightMm: meta.heightMm,
      })
    }
    setGeometry({
      status: 'ok',
      frames,
      contentWidthPx: Math.ceil(doc.documentElement.scrollWidth),
      contentHeightPx: Math.ceil(doc.documentElement.scrollHeight),
    })
    return true
  }, [layout])

  const handleIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (measureIframe()) {
      // 页面盒尺寸由 @page 固定不随字体变，但字体加载会改变页内偏移的
      // 计量时机——字体就绪后再核一次，失败才算真失败。
      void doc?.fonts.ready.then(() => {
        if (!measureIframe()) setGeometry({ status: 'failed' })
      }).catch(() => {})
      return
    }
    setGeometry({ status: 'failed' })
  }, [measureIframe])

  // fit-width needs the live container width; ResizeObserver fires once on
  // observe, which also seeds the initial value.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(container)
    return (): void => observer.disconnect()
  }, [])

  const pageWidthPx = layout ? layout.pages[0].widthMm * MM_TO_PX : 0
  const fitScale = containerWidth > 0 && pageWidthPx > 0
    ? Math.min(3, Math.max(0.5, containerWidth / pageWidthPx))
    : 1
  const scale = zoom === 'fit' ? fitScale : zoom

  const pageHeightSumPx = layout
    ? layout.pages.reduce((sum, page) => sum + page.heightMm * MM_TO_PX, 0)
    : 0
  const contentWidthPx = geometry.status === 'ok' ? geometry.contentWidthPx : Math.ceil(pageWidthPx)
  const contentHeightPx = geometry.status === 'ok' ? geometry.contentHeightPx : Math.ceil(pageHeightSumPx)

  if (state.status === 'error') {
    return (
      <div className="paper-personal-paper-view" ref={containerRef}>
        <div className="paper-personal-paper-state paper-personal-paper-state--error" role="alert">
          <p>{state.message}</p>
          {state.canRetry && (
            <button type="button" className="paper-personal-retry" onClick={reload}>重试</button>
          )}
        </div>
      </div>
    )
  }
  if (state.status !== 'ready') {
    return (
      <div className="paper-personal-paper-view" ref={containerRef}>
        <div className="paper-personal-paper-state" role="status" aria-live="polite">纸张生成中…</div>
      </div>
    )
  }

  return (
    <div className="paper-personal-paper-view" ref={containerRef}>
      {geometry.status === 'failed' ? (
        <div className="paper-personal-paper-state paper-personal-paper-state--error" role="alert">
          <p>版式核对失败：渲染出的页面与批注基准不一致，纸张版不能安全打开。</p>
          <button type="button" className="paper-personal-retry" onClick={reload}>重试</button>
        </div>
      ) : (
        <div
          className="paper-personal-paper-zoom"
          style={{ width: contentWidthPx * scale, height: contentHeightPx * scale }}
        >
          <div
            className="paper-personal-paper-canvas"
            style={
              {
                width: contentWidthPx,
                height: contentHeightPx,
                // 缩放只发生在这一层：iframe 恒按 100% 布局宽度渲染，
                // 绝不因缩放重新排版。
                transform: `scale(${scale})`,
              } satisfies PaperCanvasStyle
            }
          >
            {/*
              sandbox 最小权限：只授 allow-same-origin，让父页面能核对页面
              盒尺寸（srcdoc 天生与 app 同源，/fonts/paper/ 字体可直接加载）。
              不授 allow-scripts（分页 HTML 本就无脚本），表单、弹窗等随之
              全部关闭。
            */}
            <iframe
              ref={iframeRef}
              title="整卷纸张"
              className="paper-personal-paper-iframe"
              sandbox="allow-same-origin"
              srcDoc={screenSrcDoc ?? ''}
              style={{ width: contentWidthPx, height: contentHeightPx }}
              onLoad={handleIframeLoad}
            />
            {geometry.status === 'ok' && (
              <div className="paper-personal-paper-overlays">
                {geometry.frames.map((frame) => (
                  <div
                    key={frame.pageId}
                    className="paper-personal-paper-page-overlay"
                    data-paper-page-overlay={frame.pageId}
                    style={{
                      left: frame.leftPx,
                      top: frame.topPx,
                      width: frame.widthMm * MM_TO_PX,
                      height: frame.heightMm * MM_TO_PX,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
