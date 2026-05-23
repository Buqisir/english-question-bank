export function buildA4PreviewHtml(printHtml: string) {
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
}
`
  const previewScript = `
<script data-a4-preview-script>
(function paginateA4Preview() {
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
        flattened.push(...Array.from(node.childNodes))
      } else if (node.nodeType === Node.ELEMENT_NODE && node.matches('[data-a4-preview-script], .preview-pages')) {
        continue
      } else {
        flattened.push(node)
      }
    }
    return flattened
  }

  function run() {
    const sourceNodes = flatten(Array.from(document.body.childNodes))
      .filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim())
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
