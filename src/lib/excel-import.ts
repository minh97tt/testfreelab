import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const HEADER_LABELS = ['TestCase ID', 'Category', 'Test Execution', 'Test Inputs', 'Expected']

export type ExcelCaseStatus = 'UNTESTED' | 'PASSED' | 'FAILED' | 'BLOCKED'

export interface ExcelTestCase {
  sheetName: string
  excelId: string
  title: string
  description: string
  preconditions: string | null
  finalExpectation: string
  actualResult: string | null
  severity: 'MEDIUM'
  type: 'MANUAL'
  status: ExcelCaseStatus
  steps: { order: number; action: string }[]
}

export interface SkippedExcelSheet {
  sheet: string
  reason: string
}

export interface ExtractExcelTestCasesOptions {
  includeBackups?: boolean
}

export function extractExcelTestCases(filePath: string, options: ExtractExcelTestCasesOptions = {}) {
  const archive = readZipArchive(readFileSync(filePath))
  const { sheets, sharedStrings } = readWorkbook(archive)
  const extracted: ExcelTestCase[] = []
  const skipped: SkippedExcelSheet[] = []

  for (const sheet of sheets) {
    if (!sheet.path) {
      skipped.push({ sheet: sheet.name, reason: 'missing worksheet target' })
      continue
    }

    if (['Test Report', 'Sheet List'].includes(sheet.name)) {
      skipped.push({ sheet: sheet.name, reason: 'metadata sheet' })
      continue
    }

    if (!options.includeBackups && /_BK$/i.test(sheet.name)) {
      skipped.push({ sheet: sheet.name, reason: 'backup sheet' })
      continue
    }

    const rows = parseSheet(archive, sheet.path, sharedStrings)
    const headerIndex = findHeaderRow(rows)

    if (headerIndex === -1) {
      skipped.push({ sheet: sheet.name, reason: 'no standard test case header' })
      continue
    }

    for (const row of rows.slice(headerIndex + 1)) {
      const excelId = clean(row?.[0])
      const title = compact(row?.[2])
      const inputs = clean(row?.[3])
      const expected = clean(row?.[4])

      if (!/^ID_/i.test(excelId)) continue
      if (!title && !inputs && !expected) continue

      const browserStatus = [row?.[7], row?.[8], row?.[9]]
        .map((value, index) => value ? `${['Chrome', 'Firefox', 'IE'][index]}=${clean(value)}` : '')
        .filter(Boolean)
        .join(', ')

      extracted.push({
        sheetName: sheet.name,
        excelId,
        title: title || `${sheet.name} ${excelId}`,
        description: buildDescription({
          excelId,
          category: compact(row?.[1]),
          browserStatus,
          executedBy: compact(row?.[11]),
          notes: clean(row?.[12]),
        }),
        preconditions: inputs || null,
        finalExpectation: expected || 'N/A',
        actualResult: null,
        severity: 'MEDIUM',
        type: 'MANUAL',
        status: statusFromRow(row),
        steps: stepsFromInput(inputs),
      })
    }
  }

  return { extracted, skipped }
}

type ZipArchive = Map<string, Buffer>

function readWorkbook(archive: ZipArchive) {
  const workbookXml = unzipText(archive, 'xl/workbook.xml')
  const relsXml = unzipText(archive, 'xl/_rels/workbook.xml.rels')
  const sharedXml = safeUnzipText(archive, 'xl/sharedStrings.xml')

  const sharedStrings = Array.from(sharedXml.matchAll(/<si[\s\S]*?<\/si>/g))
    .map((match) => textFromXml(match[0]))

  const relMap = new Map(
    Array.from(relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g))
      .map((match) => {
        const id = getAttr(match[1], 'Id')
        const target = getAttr(match[1], 'Target')
        return id && target ? [id, normalizeWorkbookTarget(target)] as const : null
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
  )

  const sheets = Array.from(workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g))
    .map((match) => {
      const name = getAttr(match[1], 'name')
      const relId = getAttr(match[1], 'r:id')
      return name && relId ? { name: decodeXml(name), path: relMap.get(relId) } : null
    })
    .filter((sheet): sheet is { name: string; path: string | undefined } => sheet !== null)

  return { sheets, sharedStrings }
}

function unzipText(archive: ZipArchive, entryPath: string) {
  const entry = archive.get(entryPath)
  if (!entry) throw new Error(`Missing XLSX entry: ${entryPath}`)
  return entry.toString('utf8')
}

function safeUnzipText(archive: ZipArchive, entryPath: string) {
  try {
    return unzipText(archive, entryPath)
  } catch {
    return ''
  }
}

function normalizeWorkbookTarget(target: string) {
  if (target.startsWith('/')) return target.slice(1)
  if (target.startsWith('xl/')) return target
  return `xl/${target.replace(/^\.\//, '')}`
}

function getAttr(attrs: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escapedName}="([^"]*)"`).exec(attrs)?.[1]
}

function decodeXml(value = '') {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function textFromXml(xml: string) {
  return Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1]))
    .join('')
}

function colToIndex(column: string) {
  let index = 0
  for (const char of column) {
    index = index * 26 + char.charCodeAt(0) - 64
  }
  return index - 1
}

function cellRefToCoords(ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) return null
  return { col: colToIndex(match[1]), row: Number(match[2]) - 1 }
}

function parseRange(range: string) {
  const [startRef, endRef] = range.split(':')
  const start = cellRefToCoords(startRef)
  const end = cellRefToCoords(endRef || startRef)
  if (!start || !end) return null
  return { start, end }
}

function parseSheet(archive: ZipArchive, entryPath: string, sharedStrings: string[]) {
  const xml = unzipText(archive, entryPath)
  const rows: string[][] = []

  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(rowMatch[1]) - 1
    const row = rows[rowIndex] || []

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] || cellMatch[2]
      const body = cellMatch[3] || ''
      const ref = /r="([^"]+)"/.exec(attrs)?.[1]
      const coords = ref ? cellRefToCoords(ref) : null
      const colIndex = coords?.col ?? row.length
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      let value = ''

      if (type === 's') {
        const sharedIndex = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        value = sharedIndex == null ? '' : sharedStrings[Number(sharedIndex)] || ''
      } else if (type === 'inlineStr') {
        value = textFromXml(body)
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || '')
      }

      row[colIndex] = value
    }

    rows[rowIndex] = row
  }

  for (const mergeMatch of xml.matchAll(/<mergeCell ref="([^"]+)"/g)) {
    const range = parseRange(mergeMatch[1])
    if (!range) continue
    const sourceValue = rows[range.start.row]?.[range.start.col]
    if (!sourceValue) continue

    for (let row = range.start.row; row <= range.end.row; row += 1) {
      rows[row] ||= []
      for (let col = range.start.col; col <= range.end.col; col += 1) {
        if (!rows[row][col]) rows[row][col] = sourceValue
      }
    }
  }

  return rows
}

function clean(value: unknown) {
  return String(value || '').trim()
}

function compact(value: unknown) {
  return clean(value).replace(/\s+/g, ' ')
}

function findHeaderRow(rows: string[][]) {
  return rows.findIndex((row) => HEADER_LABELS.every((label, index) => clean(row?.[index]) === label))
}

function statusFromRow(row: string[]) {
  const browserStatuses = [row[7], row[8], row[9]]
    .map(normalizeExecutionStatus)

  if (browserStatuses.includes('F')) return 'FAILED'
  if (browserStatuses.includes('C')) return 'BLOCKED'
  if (browserStatuses.includes('P')) return 'PASSED'
  return 'UNTESTED'
}

function normalizeExecutionStatus(value: unknown) {
  const status = clean(value).toUpperCase()
  if (status === 'P' || status === 'F' || status === 'C') return status
  return ''
}

function buildDescription({
  excelId,
  category,
  browserStatus,
  executedBy,
  notes,
}: {
  excelId: string
  category: string
  browserStatus: string
  executedBy: string
  notes: string
}) {
  const lines = [
    `Excel ID: ${excelId}`,
    category && `Category: ${category}`,
    browserStatus && `Browser status: ${browserStatus}`,
    executedBy && `Executed by: ${executedBy}`,
    notes && `Notes: ${notes}`,
  ].filter(Boolean)

  return lines.join('\n')
}

function stepsFromInput(input: unknown) {
  const value = clean(input)
  if (!value) return []
  return [{ order: 1, action: value }]
}

function readZipArchive(buffer: Buffer) {
  const entries = new Map<string, Buffer>()
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  let cursor = centralDirectoryOffset
  const end = centralDirectoryOffset + centralDirectorySize

  while (cursor < end) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid XLSX central directory')
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const fileName = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength)

    if (!fileName.endsWith('/')) {
      entries.set(fileName, readZipEntry(buffer, localHeaderOffset, compressedSize, compressionMethod))
    }

    cursor += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557)

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }

  throw new Error('Invalid XLSX file')
}

function readZipEntry(
  buffer: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  compressionMethod: number
) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error('Invalid XLSX local file header')
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength
  const compressedData = buffer.subarray(dataStart, dataStart + compressedSize)

  if (compressionMethod === 0) return Buffer.from(compressedData)
  if (compressionMethod === 8) return inflateRawSync(compressedData)
  throw new Error(`Unsupported XLSX compression method: ${compressionMethod}`)
}
