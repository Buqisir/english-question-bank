export type DraftPaperPreviewSuggestion = { groupId: string; reason: string }

// draft-desk-a: values are system-generated ids / server-authored short reason
// strings, not raw end-user input — but they still get embedded into a live
// <script> tag inside the preview iframe, so guard against a value that
// happens to contain the literal sequence "</script>" (which would otherwise
// terminate the script early and corrupt the rest of the document) or an
// HTML comment opener that could confuse some parsers.
function embedJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

export function buildA4PreviewHtml(
  printHtml: string,
  groupIds: string[] = [],
  pageBreakSuggestions: DraftPaperPreviewSuggestion[] = [],
) {
  if (!printHtml) return ''
  const previewCss = `
@media screen {
  html {
    background: transparent;
    min-height: 100%;
  }

  body {
    background: transparent;
    box-sizing: border-box;
    margin: 0;
    min-height: 100vh;
    padding: 24px 0 36px;
    width: auto;
  }

  .preview-pages {
    display: grid;
    gap: 24px;
    justify-content: center;
  }

  .preview-page {
    background: #fff;
    border: 1px solid #bfb6a8;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 18px 36px rgba(41, 35, 27, 0.18),
      0 3px 10px rgba(41, 35, 27, 0.12);
    box-sizing: border-box;
    min-height: 297mm;
    overflow: hidden;
    padding: 20mm 18mm;
    position: relative;
    width: 210mm;
  }

  .preview-page-content {
    height: 257mm;
    overflow: visible;
  }

  .preview-page-footer {
    bottom: 7mm;
    color: #8a8175;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10px;
    left: 0;
    position: absolute;
    right: 0;
    text-align: center;
  }

  /* draft-desk-a 裁点2: 分页建议的安静标注 — 虚线夹一句灰字躺在块间，
     照 docs/cuts/draft-desk-a/prototype.html 的 .break-hint 样式；这段
     渲染在纸面内部（iframe 内容），色温法允许暖色出现在这里。点击本身
     由父层 (DraftPaperWorkbench.tsx) 监听 contentDocument 的 click 事件
     转调用现有 onTogglePageBreak，此处只负责结构与视觉。 */
  .break-hint {
    align-items: center;
    color: #a09a8a;
    cursor: pointer;
    display: flex;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11.5px;
    gap: 8px;
    margin: 4px 0 10px;
    user-select: none;
  }

  .break-hint::before,
  .break-hint::after {
    border-top: 1px dashed #d8d2c2;
    content: "";
    flex: 1;
  }

  .break-hint:hover {
    color: #7a7466;
  }

  .break-hint:hover::before,
  .break-hint:hover::after {
    border-top-color: #c2b8a0;
  }
}
`
  const previewScript = `
<script data-a4-preview-script>
(function paginateA4Preview() {
  var GROUP_IDS = ${embedJsonForScript(groupIds)}
  var BREAK_SUGGESTIONS = ${embedJsonForScript(pageBreakSuggestions)}

  // draft-desk-a: printHtml's .question-group sections carry no id of their
  // own (server/print-renderer.mjs stays untouched by this cut). Sections
  // appear in the same order as GROUP_IDS (the caller's non-groupMissing
  // items, in item order — matches server/draft-paper/draftPaperStore.mjs's
  // buildDraftPaperBlocks, which skips groupMissing items entirely so they
  // never reach a .question-group section here). Stamp each section
  // positionally before flattening spreads its children into the page flow.
  function tagGroupSections() {
    var sections = document.querySelectorAll('.question-group')
    sections.forEach(function (section, index) {
      var groupId = GROUP_IDS[index]
      if (groupId) section.setAttribute('data-group-id', groupId)
    })
  }

  function makePage(pageNumber) {
    const page = document.createElement('article')
    page.className = 'preview-page'
    const content = document.createElement('div')
    content.className = 'preview-page-content'
    const footer = document.createElement('div')
    footer.className = 'preview-page-footer'
    footer.textContent = '第 ' + pageNumber + ' 页'
    page.append(content, footer)
    return { page, content }
  }

  function flatten(nodes) {
    const flattened = []
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('.question-group')) {
        const groupId = node.getAttribute('data-group-id')
        const children = Array.from(node.childNodes)
        if (groupId) {
          children.forEach(function (child) {
            if (child.nodeType === Node.ELEMENT_NODE) child.setAttribute('data-group-id', groupId)
          })
        }
        flattened.push(...children)
      } else if (node.nodeType === Node.ELEMENT_NODE && node.matches('[data-a4-preview-script], .preview-pages')) {
        continue
      } else {
        flattened.push(node)
      }
    }
    return flattened
  }

  // draft-desk-a: insert the quiet break-hint marker right before the first
  // flattened node of the suggested group, so it takes part in the same
  // overflow-driven pagination as everything else (falls naturally onto the
  // page break it's suggesting). idx<=0 (not found, or the suggestion
  // targets the very first node in the whole document) is skipped — mirrors
  // the existing "first draft group can't take a leading page break" rule.
  function insertBreakHints(nodes) {
    BREAK_SUGGESTIONS.forEach(function (suggestion) {
      const idx = nodes.findIndex(function (node) {
        return node.nodeType === Node.ELEMENT_NODE && node.getAttribute && node.getAttribute('data-group-id') === suggestion.groupId
      })
      if (idx <= 0) return
      const hint = document.createElement('div')
      hint.className = 'break-hint'
      hint.setAttribute('data-break-hint-group-id', suggestion.groupId)
      hint.setAttribute('role', 'button')
      hint.setAttribute('tabindex', '0')
      hint.textContent = '建议在此前分页 · ' + suggestion.reason
      nodes.splice(idx, 0, hint)
    })
  }

  function run() {
    tagGroupSections()
    const sourceNodes = flatten(Array.from(document.body.childNodes))
      .filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim())
    insertBreakHints(sourceNodes)
    const pages = document.createElement('div')
    pages.className = 'preview-pages'
    document.body.textContent = ''
    document.body.appendChild(pages)

    let pageNumber = 1
    let current = makePage(pageNumber)
    pages.appendChild(current.page)

    for (const node of sourceNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('.page-break')) {
        pageNumber += 1
        current = makePage(pageNumber)
        pages.appendChild(current.page)
        continue
      }

      current.content.appendChild(node)
      if (current.content.scrollHeight > current.content.clientHeight && current.content.childNodes.length > 1) {
        current.content.removeChild(node)
        pageNumber += 1
        current = makePage(pageNumber)
        pages.appendChild(current.page)
        current.content.appendChild(node)
      }
    }

    if (current.content.childNodes.length === 0 && pages.children.length > 1) current.page.remove()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()
})()
</script>
`
  const withCss = printHtml.includes('</style>')
    ? printHtml.replace('</style>', `${previewCss}\n</style>`)
    : printHtml.replace('</head>', `<style>${previewCss}</style></head>`)
  return withCss.includes('</body>') ? withCss.replace('</body>', `${previewScript}\n</body>`) : `${withCss}${previewScript}`
}
