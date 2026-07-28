/**
 * usePaperExports — encapsulates supported Print HTML/PDF export state and actions.
 *
 * Delegates payload assembly to paperExportPayload.ts.
 * Delegates HTTP to services/questionGroups.ts.
 * Does NOT manage basket editing or block mutations.
 */

import { useState } from 'react'
import type { BasketItem, PaperBlock, VersionType } from '../domain/questionBank.ts'
import { buildDocxPayload } from './paperExportPayload.ts'
import {
  exportPrintHtml as fetchExportPrintHtml,
  exportPrintPdf as fetchExportPrintPdf,
} from '../services/questionGroups.ts'

export type ExportStatus = 'idle' | 'exporting' | 'exported' | 'error'

export type PaperExportStatuses = {
  printHtml: ExportStatus
  printHtmlError: string
  printPdf: ExportStatus
  printPdfError: string
}

export type UsePaperExportsInput = {
  basket: BasketItem[]
  paperBlocks: PaperBlock[]
  questionNumberStart: number
  paperExportStyle: 'exam' | 'handout'
  paperTitle: string
  versionType: VersionType
  onPdfExported?: () => void
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function usePaperExports(input: UsePaperExportsInput) {
  const [printHtmlStatus, setPrintHtmlStatus] = useState<ExportStatus>('idle')
  const [printHtmlError, setPrintHtmlError] = useState('')
  const [printPdfStatus, setPrintPdfStatus] = useState<ExportStatus>('idle')
  const [printPdfError, setPrintPdfError] = useState('')

  function getPayloadState() {
    return {
      basket: input.basket,
      paperBlocks: input.paperBlocks,
      questionNumberStart: input.questionNumberStart,
      paperExportStyle: input.paperExportStyle,
      paperTitle: input.paperTitle,
      versionType: input.versionType,
    }
  }

  async function exportPrintHtml() {
    if (input.basket.length === 0) return
    setPrintHtmlStatus('exporting')
    setPrintHtmlError('')
    try {
      const result = await fetchExportPrintHtml(buildDocxPayload(getPayloadState()))
      downloadBlob(result.blob, result.fileName)
      setPrintHtmlStatus('exported')
    } catch (error) {
      setPrintHtmlStatus('error')
      setPrintHtmlError(error instanceof Error ? error.message : String(error))
    }
  }

  async function exportPrintPdf() {
    if (input.basket.length === 0) return
    setPrintPdfStatus('exporting')
    setPrintPdfError('')
    try {
      const result = await fetchExportPrintPdf(buildDocxPayload(getPayloadState()))
      downloadBlob(result.blob, result.fileName)
      setPrintPdfStatus('exported')
      input.onPdfExported?.()
    } catch (error) {
      setPrintPdfStatus('error')
      setPrintPdfError(error instanceof Error ? error.message : String(error))
    }
  }

  function resetExportStatuses() {
    setPrintHtmlStatus('idle')
    setPrintHtmlError('')
    setPrintPdfStatus('idle')
    setPrintPdfError('')
  }

  return {
    statuses: {
      printHtml: printHtmlStatus,
      printHtmlError,
      printPdf: printPdfStatus,
      printPdfError,
    } as PaperExportStatuses,
    exportPrintHtml,
    exportPrintPdf,
    resetExportStatuses,
  }
}
