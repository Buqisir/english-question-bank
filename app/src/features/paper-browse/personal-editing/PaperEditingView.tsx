import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { orderAppendixEntries, printDomRangeToSegments, type PersonalHighlightColor, type PersonalUnderlineInk } from '../../../../../shared/personal-paper-layer/index.mjs'
import { frameAtPoint, MM_TO_PX, pxToMm, type PaperPageFrame } from './paperPlacement'
import { PaperAppendixLayer, type AppendixPlanEntry } from './PaperAppendixLayer'
import { PaperAppendixPreview } from './PaperAppendixPreview'
import { PaperMarkLayer } from './PaperMarkLayer'
import { PaperNoteLayer, type PenNoteRequest } from './PaperNoteLayer'
import { mappedSegmentsToAnchorInput } from './anchorDomRange'
import { PaperTextBoxLayer } from './PaperTextBoxLayer'
import type { PaperTool } from './PaperToolPalette'
import { usePaperAnchorGeometry } from './usePaperAnchorGeometry'
import { PersonalExportControl } from './PersonalExportControl'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'
import { usePersonalPaperLayout } from './usePersonalPaperLayout'

// 版式核对容差：Paged.js 的 mm→px 取整与服务器测量的两位小数舍入，累计
// 不应超过 2px。超过即视为渲染结果与批注基准不一致，宁可报错不将错就错。
const GEOMETRY_TOLERANCE_PX = 2

// 整卷纸的 Sheet 阴影（DESIGN.md §4 owner 验收标准）；附页预览的纸用同一条。
export const PAPER_SHEET_BOX_SHADOW = '0 1px 0 rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08)'

// 显示层修饰（思路同 server 侧 servePaperFontsFromAppOrigin，但在前端做）：
// 给 srcdoc 注入一段仅屏幕生效的样式——整卷纸的 Sheet 阴影、页间留白、页面
// 栈底透明（桌面底色透出来）。box-shadow 与 margin 不改变 .pagedjs_page 的
// 页面盒尺寸与分页几何（版式核对的 2px 容差断言不受影响）；这段样式不进
// layoutRef，第 5 阶段 PDF 合成用的是服务端原始 paginatedHtml，不经过这里。
const PAPER_SHEET_SCREEN_STYLE = `<style data-eqb-paper-screen-only>
@media screen {
  html, body { background: transparent; }
  .pagedjs_pages { background: transparent; }
  .pagedjs_page {
    background: #fff;
    box-shadow: ${PAPER_SHEET_BOX_SHADOW};
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

type GeometryState =
  | { status: 'pending' }
  | { status: 'ok'; frames: PaperPageFrame[]; contentWidthPx: number; contentHeightPx: number }
  | { status: 'failed' }

export type PaperEditingViewProps = {
  paperId: string
  /** Host's current personal-layer source revision; null keeps the view loading. */
  sourceRevision: string | null
  /** 'fit' or a fixed factor. View state only — never persisted. */
  zoom: number | 'fit'
  /** Host's personal-layer api; the text-box layer reads objects and applies edits through it. */
  api: PersonalAnnotationsApi
  /** Active annotation tool: pen tools keep their state (sticky) until the host resets them. */
  tool: PaperTool
  /** Remembered pen colors for this page session. */
  highlightColor: PersonalHighlightColor
  underlineInk: PersonalUnderlineInk
  /** Host toolbar slot for the quiet text-box notices, outside the zoom transform. */
  noticeTarget: HTMLElement | null
  /** Host toolbar slot for the 「导出我的批注版」 button (left button group). */
  exportTarget: HTMLElement | null
}

type PaperCanvasStyle = CSSProperties & Record<`--${string}`, string | number>

// 附页条目的排序输入：plan 条目去掉编号（编号由 orderAppendixEntries 给出）。
type AppendixOrderInput = Omit<AppendixPlanEntry, 'number'>

export function PaperEditingView({ paperId, sourceRevision, zoom, api, tool, highlightColor, underlineInk, noticeTarget, exportTarget }: PaperEditingViewProps): ReactNode {
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
    const frames: PaperPageFrame[] = []
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

  const measured = layout != null && geometry.status === 'ok'

  // 笔式工具（高亮/下划线/批注）的 iframe 选区翻译：mouseup 落定一次非塌陷
  // 选区就立即成标注（笔不逐次询问）——高亮/下划线用记忆色直接创建、不开弹
  // 层，批注照常打开旁注编辑器；译不出的选区给一条 5 秒的静默提示。
  const penTool = tool === 'highlight' || tool === 'underline' || tool === 'note' ? tool : null
  const penActive = penTool != null && api.canEdit
  const [penNotice, setPenNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!penNotice) return undefined
    const timer = window.setTimeout(() => setPenNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [penNotice])

  const { createMark, source: layerSource } = api
  const [penNoteRequest, setPenNoteRequest] = useState<PenNoteRequest | null>(null)
  useEffect(() => {
    if (!penActive || !penTool || !layerSource || geometry.status !== 'ok') return undefined
    const doc = iframeRef.current?.contentDocument
    if (!doc) return undefined
    const onMouseUp = () => {
      const selection = doc.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
      const range = selection.getRangeAt(0)
      const segments = printDomRangeToSegments(doc, layerSource, range)
      if (!segments) {
        setPenNotice('这段文字不能标记')
        return
      }
      if (penTool === 'note') {
        const textAnchor = mappedSegmentsToAnchorInput(layerSource, segments)
        setPenNoteRequest((current) => ({ seq: (current?.seq ?? 0) + 1, textAnchor }))
      } else {
        createMark(penTool, segments, { x: 0, y: 0 },
          penTool === 'highlight' ? { color: highlightColor } : { ink: underlineInk },
          { openPopover: false })
      }
      selection.removeAllRanges()
    }
    doc.addEventListener('mouseup', onMouseUp)
    return () => doc.removeEventListener('mouseup', onMouseUp)
  }, [createMark, geometry.status, highlightColor, penActive, penTool, underlineInk, layerSource])

  const anchorGeometry = usePaperAnchorGeometry(
    api.objects,
    api.source,
    measured ? iframeRef.current : null,
    measured ? `${layout.layoutId}:${geometry.frames.map((frame) => `${frame.leftPx},${frame.topPx}`).join('|')}` : '',
  )

  // 附页编号与落点（#489 §8）：一次计算，纸面标记与附页预览共用，编号恒一致。
  // 旁注按锚点首行定位；文字框按 origin（仅限当前 layout）；算不出位置的排
  // 最后（orderAppendixEntries），不画标记。
  const appendixEntries = useMemo<AppendixPlanEntry[]>(() => {
    if (!layout || geometry.status !== 'ok') return []
    const frames = geometry.frames
    const raw = api.objects.flatMap<AppendixOrderInput>((object) => {
      const unpositioned: AppendixOrderInput = {
        id: object.id, pageIndex: null, yMm: null, xMm: null, anchorRect: null, origin: null,
      }
      if (object.type === 'anchored-note' && object.placement.kind === 'appendix') {
        const rects = anchorGeometry.rectsByObjectId.get(object.id)
        const first = rects ? [...rects].sort((a, b) => a.top - b.top || a.left - b.left)[0] ?? null : null
        const frame = first ? frameAtPoint(frames, first.left + 1, first.top + 1) : null
        if (!first || !frame) return [unpositioned]
        return [{
          id: object.id,
          pageIndex: frames.indexOf(frame),
          yMm: pxToMm(first.top - frame.topPx),
          xMm: pxToMm(first.left - frame.leftPx),
          anchorRect: { left: first.left, top: first.top },
          origin: null,
        }]
      }
      if (object.type === 'text-box' && object.placement.kind === 'appendix') {
        const origin = object.placement.origin
        if (!origin || origin.layoutId !== layout.layoutId) return [unpositioned]
        const pageIndex = frames.findIndex((frame) => frame.pageId === origin.pageId)
        if (pageIndex < 0) return [unpositioned]
        return [{
          id: object.id,
          pageIndex,
          yMm: origin.yMm,
          xMm: origin.xMm,
          anchorRect: null,
          origin: { pageId: origin.pageId, xMm: origin.xMm, yMm: origin.yMm },
        }]
      }
      return []
    })
    return orderAppendixEntries(raw).map((id, index) => ({ ...raw.find((entry) => entry.id === id)!, number: index + 1 }))
  }, [api.objects, anchorGeometry, geometry, layout])

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
                '--paper-zoom': scale,
              } as PaperCanvasStyle
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
            {layout && geometry.status === 'ok' && (
              <div className="paper-personal-paper-overlays">
                {/* Marks sit under text boxes: marks are paper ink, boxes are
                 * interactive chrome that must stay clickable on top. */}
                <PaperMarkLayer
                  api={api}
                  anchorGeometry={anchorGeometry}
                  iframe={iframeRef.current}
                  noticeTarget={noticeTarget}
                />
                <PaperNoteLayer
                  api={api}
                  anchorGeometry={anchorGeometry}
                  frames={geometry.frames}
                  layoutId={layout.layoutId}
                  iframe={iframeRef.current}
                  noticeTarget={noticeTarget}
                  penNoteRequest={penNoteRequest}
                />
                <PaperAppendixLayer
                  api={api}
                  iframe={iframeRef.current}
                  frames={geometry.frames}
                  entries={appendixEntries}
                />
                <PaperTextBoxLayer
                  api={api}
                  frames={geometry.frames}
                  layoutId={layout.layoutId}
                  armed={tool === 'text' && api.canEdit}
                  noticeTarget={noticeTarget}
                />
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
      {/* 笔式工具译不出选区的静默提示：挂在工具条中段槽，5 秒自清。 */}
      {penNotice && noticeTarget ? createPortal(
        <p className="paper-personal-paper-notice" role="status">{penNotice}</p>,
        noticeTarget,
      ) : null}
      {/* 附页预览与纸张同宽同缩放，左缘对齐纸张页面；没有转附页对象时不渲染。 */}
      <PaperAppendixPreview
        api={api}
        entries={appendixEntries}
        contentWidthPx={contentWidthPx}
        pageWidthPx={pageWidthPx}
        leftPx={geometry.status === 'ok' ? geometry.frames[0]?.leftPx ?? 0 : 0}
        scale={scale}
      />
      {/* 导出入口与它的提示经 portal 挂进工具条；layout 就绪才挂（导出要带 layoutId）。 */}
      {layout ? (
        <PersonalExportControl
          api={api}
          paperId={paperId}
          layoutId={layout.layoutId}
          sourceRevision={layout.sourceRevision}
          reloadLayout={reload}
          buttonTarget={exportTarget}
          noticeTarget={noticeTarget}
        />
      ) : null}
    </div>
  )
}
