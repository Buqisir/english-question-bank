async function writeClipboardText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back to a selected textarea when Clipboard API permission is unavailable.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }
  if (!copied) throw new Error('copy_failed')
}

function announce(scope, message) {
  const feedback = scope.querySelector('[data-copy-feedback]')
  if (!feedback) return
  feedback.textContent = ''
  window.requestAnimationFrame(() => {
    feedback.textContent = message
  })
}

export function bindClipboardButtons(scope = document) {
  scope.querySelectorAll('[data-copy-text]').forEach((button) => {
    button.addEventListener('click', async () => {
      const originalLabel = button.textContent
      const copyName = button.dataset.copyName || '内容'
      button.disabled = true
      try {
        await writeClipboardText(button.dataset.copyText || '')
        button.textContent = '已复制'
        announce(scope, `${copyName}已复制`)
      } catch {
        button.textContent = '复制失败'
        announce(scope, `${copyName}复制失败，请手动选择复制`)
      }
      window.setTimeout(() => {
        if (!button.isConnected) return
        button.textContent = originalLabel
        button.disabled = false
      }, 1_600)
    })
  })
}
