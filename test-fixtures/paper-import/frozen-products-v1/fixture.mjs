// Valid, deterministic PDFs with an independently constructed page tree. No
// browser renderer or implementation-under-test supplies the expected count.
export function productPdfBytes(pages, title) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`,
    ...Array.from({ length: pages }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents ${pages + 3} 0 R >>`),
    '<< /Length 0 >>\nstream\nendstream',
    `<< /Title (${title}) >>`,
  ]
  let text = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, i) => {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(text)
}
