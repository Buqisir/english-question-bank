import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function fodt(text) {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:version="1.2"
 office:mimetype="application/vnd.oasis.opendocument.text">
 <office:body><office:text><text:p>${escaped}</text:p></office:text></office:body>
</office:document>
`
}

function convert(sourcePath, targetDirectory, format, profileDirectory) {
  mkdirSync(targetDirectory, { recursive: true })
  mkdirSync(profileDirectory, { recursive: true })
  execFileSync('soffice', [
    `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
    '--headless',
    '--convert-to',
    format,
    '--outdir',
    targetDirectory,
    sourcePath,
  ], { stdio: 'pipe', timeout: 60_000 })
}

function image(filePath, color, accent) {
  execFileSync('magick', [
    '-size', '96x144',
    `xc:${color}`,
    '-fill', accent,
    '-draw', 'rectangle 12,18 84,26 rectangle 12,42 72,48 rectangle 12,66 80,74',
    filePath,
  ], { stdio: 'pipe' })
}

export function makeSyntheticNck1SourceOnlyFixture(tempRoot) {
  const sourceDirectory = path.join(tempRoot, 'fixture-source')
  const docxDirectory = path.join(sourceDirectory, 'docx')
  const pdfDirectory = path.join(sourceDirectory, 'pdf')
  const imageDirectory = path.join(sourceDirectory, 'images')
  mkdirSync(imageDirectory, { recursive: true })

  const questionFodt = path.join(sourceDirectory, 'question.fodt')
  const answersFodt = path.join(sourceDirectory, 'answers.fodt')
  writeFileSync(
    questionFodt,
    fodt('Synthetic question-only source. 21. Choose one answer: A. One B. Two C. Three D. Four.'),
  )
  writeFileSync(
    answersFodt,
    fodt(
      'Synthetic compact authoritative key: 21-23ABC 24-27DABC 28-31BCDA '
        + '32-35CDAB 36-40ABCDE 41-45ABCDA 46-50BCDAB 51-55CDABC '
        + '56.walked 57.quickly 58.on 59.the 60.path 61.and 62.shared 63.a 64.kind 65.note.',
    ),
  )
  convert(
    questionFodt,
    docxDirectory,
    'docx',
    path.join(tempRoot, 'soffice-question-docx'),
  )
  convert(
    questionFodt,
    pdfDirectory,
    'pdf',
    path.join(tempRoot, 'soffice-question-pdf'),
  )
  convert(
    answersFodt,
    pdfDirectory,
    'pdf',
    path.join(tempRoot, 'soffice-answers-pdf'),
  )

  const questionImages = [
    path.join(imageDirectory, 'question-page-1.png'),
    path.join(imageDirectory, 'question-page-2.png'),
  ]
  const answerImages = [path.join(imageDirectory, 'answer-page-1.png')]
  image(questionImages[0], '#ffffff', '#263238')
  image(questionImages[1], '#f6f8fa', '#3949ab')
  image(answerImages[0], '#fffdf5', '#2e7d32')

  return {
    questionDocxPath: path.join(docxDirectory, 'question.docx'),
    questionPdfPath: path.join(pdfDirectory, 'question.pdf'),
    answerPdfPath: path.join(pdfDirectory, 'answers.pdf'),
    questionImages,
    answerImages,
  }
}
