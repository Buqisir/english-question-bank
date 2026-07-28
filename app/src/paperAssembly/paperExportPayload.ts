/**
 * Paper Export Payload — assembles save and supported Print request payloads.
 *
 * Delegates numbering and block conversion to paperLayout domain module.
 * Does NOT duplicate any layout logic.
 */

import type { BasketItem, CreatePaperSetInput, PaperBlock, PrintExportInput, VersionType } from '../domain/questionBank.ts'
import { toPaperExportBlocks, buildPaperSetLayout } from '../domain/paperLayout.ts'

export type PaperAssemblyState = {
  basket: BasketItem[]
  paperBlocks: PaperBlock[]
  questionNumberStart: number
  paperExportStyle: 'exam' | 'handout'
  paperTitle: string
  versionType: VersionType
}

export function buildSavePayload(state: PaperAssemblyState): CreatePaperSetInput {
  return {
    title: state.paperTitle.trim() || '未命名题集',
    items: state.basket.map((item) => ({
      questionGroupId: item.id,
      score: item.score,
      sectionTitle: item.sectionTitle,
      note: item.note,
    })),
    layout: buildPaperSetLayout(state.paperBlocks, state.questionNumberStart, state.paperExportStyle),
  }
}

export function buildPrintPayload(state: PaperAssemblyState): PrintExportInput {
  const basketLookup = (gid: string) => state.basket.find((i) => i.id === gid)
  return {
    title: state.paperTitle.trim() || '未命名题集',
    versionType: state.versionType,
    printStyle: state.paperExportStyle,
    items: state.basket.map((item) => ({
      questionGroupId: item.id,
      score: item.score,
      sectionTitle: item.sectionTitle,
      note: item.note,
    })),
    questionNumberStart: state.questionNumberStart,
    blocks: toPaperExportBlocks(state.paperBlocks, basketLookup),
  }
}
