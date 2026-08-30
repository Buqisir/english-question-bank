export type FileSaveMode = 'download' | 'save-as'

type FileSystemWritableFileStreamLike = {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>
}

type FileSystemDirectoryHandleLike = {
  getFileHandle(name: string, options: { create: true }): Promise<FileSystemFileHandleLike>
}

type SaveFilePickerOptionsLike = {
  suggestedName?: string
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>
}

export type FileSaveTarget =
  | { kind: 'download'; fallbackFromSaveAs: boolean }
  | { kind: 'file'; handle: FileSystemFileHandleLike }
  | { kind: 'directory'; handle: FileSystemDirectoryHandleLike }

export type PrepareFileSaveTargetOptions = {
  mode: FileSaveMode
  suggestedName: string
  mimeType: string
  multiple?: boolean
}

const DOWNLOAD_TARGET: FileSaveTarget = { kind: 'download', fallbackFromSaveAs: false }

function pickerType(mimeType: string, fileName: string): SaveFilePickerOptionsLike['types'] {
  const extension = fileName.match(/\.[^.]+$/u)?.[0]?.toLowerCase()
  if (!extension) return undefined
  const descriptions: Record<string, string> = {
    'application/pdf': 'PDF 文件',
    'application/zip': 'ZIP 压缩包',
    'text/html': 'HTML 文件',
  }
  return [{
    description: descriptions[mimeType] || '文件',
    accept: { [mimeType]: [extension] },
  }]
}

function isPickerCancellation(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function normalizeDownloadFileName(fileName: string, fallback = '下载文件') {
  const withoutControlCharacters = [...fileName]
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
  const normalized = withoutControlCharacters
    .trim()
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/u, '')
  return normalized || fallback
}

export function directDownloadTarget(): FileSaveTarget {
  return DOWNLOAD_TARGET
}

export async function prepareFileSaveTarget({
  mode,
  suggestedName,
  mimeType,
  multiple = false,
}: PrepareFileSaveTargetOptions): Promise<FileSaveTarget | null> {
  if (mode === 'download') return DOWNLOAD_TARGET

  const pickerWindow = window as FilePickerWindow
  try {
    if (multiple) {
      if (typeof pickerWindow.showDirectoryPicker !== 'function') {
        return { kind: 'download', fallbackFromSaveAs: true }
      }
      return {
        kind: 'directory',
        handle: await pickerWindow.showDirectoryPicker({ mode: 'readwrite' }),
      }
    }

    if (typeof pickerWindow.showSaveFilePicker !== 'function') {
      return { kind: 'download', fallbackFromSaveAs: true }
    }
    const normalizedName = normalizeDownloadFileName(suggestedName)
    return {
      kind: 'file',
      handle: await pickerWindow.showSaveFilePicker({
        suggestedName: normalizedName,
        types: pickerType(mimeType, normalizedName),
      }),
    }
  } catch (error) {
    if (isPickerCancellation(error)) return null
    throw error
  }
}

async function writeToHandle(handle: FileSystemFileHandleLike, blob: Blob) {
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = normalizeDownloadFileName(fileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function saveBlobToTarget(blob: Blob, fileName: string, target: FileSaveTarget = DOWNLOAD_TARGET) {
  if (target.kind === 'file') {
    await writeToHandle(target.handle, blob)
    return
  }
  if (target.kind === 'directory') {
    const handle = await target.handle.getFileHandle(normalizeDownloadFileName(fileName), { create: true })
    await writeToHandle(handle, blob)
    return
  }
  triggerBrowserDownload(blob, fileName)
}
