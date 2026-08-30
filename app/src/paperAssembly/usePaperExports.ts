/**
 * usePaperExports — encapsulates supported Print HTML/PDF export state and actions.
 *
 * Delegates payload assembly to paperExportPayload.ts.
 * Delegates HTTP to services/questionGroups.ts.
 * Does NOT manage basket editing or block mutations.
 */

import { useState } from 'react'
import type { BasketItem, PaperBlock, VersionType } from '../domain/questionBank.ts'
import { buildPrintPayload } from './paperExportPayload.ts'
import {
  exportPrintHtml as fetchExportPrintHtml,
  exportPrintPdf as fetchExportPrintPdf,
} from '../services/questionGroups.ts'
import {
  prepareFileSaveTarget,
  saveBlobToTarget,
  type FileSaveMode,
} from '../services/fileDownload.ts'

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

  async function exportPrintHtml(mode: FileSaveMode = 'download') {
    if (input.basket.length === 0) return
    setPrintHtmlStatus('idle')
    setPrintHtmlError('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${input.paperTitle || '英语试卷'}-精排.html`,
        mimeType: 'text/html',
      })
      if (!target) return
      setPrintHtmlStatus('exporting')
      const result = await fetchExportPrintHtml(buildPrintPayload(getPayloadState()))
      await saveBlobToTarget(result.blob, result.fileName, target)
      setPrintHtmlStatus('exported')
    } catch (error) {
      setPrintHtmlStatus('error')
      setPrintHtmlError(error instanceof Error ? error.message : String(error))
    }
  }

  async function exportPrintPdf(mode: FileSaveMode = 'download') {
    if (input.basket.length === 0) return
    setPrintPdfStatus('idle')
    setPrintPdfError('')
    try {
      const target = await prepareFileSaveTarget({
        mode,
        suggestedName: `${input.paperTitle || '英语试卷'}-精排.pdf`,
        mimeType: 'application/pdf',
      })
      if (!target) return
      setPrintPdfStatus('exporting')
      const result = await fetchExportPrintPdf(buildPrintPayload(getPayloadState()))
      await saveBlobToTarget(result.blob, result.fileName, target)
      setPrintPdfStatus('exported')
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
