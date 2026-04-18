#!/usr/bin/env node

const { execFileSync } = require('child_process')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const DEFAULT_FILE = 'seed_excel/DigiRetails_Testcase_Portal_Báo giá_Quotation.xlsx'
const HEADER_LABELS = ['TestCase ID', 'Category', 'Test Execution', 'Test Inputs', 'Expected']

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const includeBackups = args.includes('--include-bk')
const fileArg = args.find((arg) => !arg.startsWith('--')) || DEFAULT_FILE
const filePath = path.resolve(process.cwd(), fileArg)
const prisma = new PrismaClient()

function unzipText(entryPath) {
  return execFileSync('unzip', ['-p', filePath, entryPath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
}

function decodeXml(value = '') {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function textFromXml(xml) {
  return Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1]))
    .join('')
}

function colToIndex(column) {
  let index = 0
  for (const char of column) {
    index = index * 26 + char.charCodeAt(0) - 64
  }
  return index - 1
}

function cellRefToCoords(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) return null
  return { col: colToIndex(match[1]), row: Number(match[2]) - 1 }
}

function parseRange(range) {
  const [startRef, endRef] = range.split(':')
  const start = cellRefToCoords(startRef)
  const end = cellRefToCoords(endRef || startRef)
  if (!start || !end) return null
  return { start, end }
}

function readWorkbook() {
  const workbookXml = unzipText('xl/workbook.xml')
  const relsXml = unzipText('xl/_rels/workbook.xml.rels')
  const sharedXml = unzipText('xl/sharedStrings.xml')

  const sharedStrings = Array.from(sharedXml.matchAll(/<si[\s\S]*?<\/si>/g))
    .map((match) => textFromXml(match[0]))

  const relMap = new Map(
    Array.from(relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))
      .map((match) => [match[1], `xl/${match[2]}`])
  )

  const sheets = Array.from(
    workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)
  ).map((match) => ({
    name: decodeXml(match[1]),
    path: relMap.get(match[2]),
  }))

  return { sheets, sharedStrings }
}

function parseSheet(entryPath, sharedStrings) {
  const xml = unzipText(entryPath)
  const rows = []

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

function clean(value) {
  return String(value || '').trim()
}

function compact(value) {
  return clean(value).replace(/\s+/g, ' ')
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => HEADER_LABELS.every((label, index) => clean(row?.[index]) === label))
}

function statusFromRow(row) {
  const browserStatuses = [row[7], row[8], row[9]].map(normalizeExecutionStatus)

  if (browserStatuses.includes('F')) return 'FAILED'
  if (browserStatuses.includes('C')) return 'BLOCKED'
  if (browserStatuses.includes('P')) return 'PASSED'
  return 'UNTESTED'
}

function normalizeExecutionStatus(value) {
  const status = clean(value).toUpperCase()
  if (status === 'P' || status === 'F' || status === 'C') return status
  return ''
}

function buildDescription({ excelId, category, browserStatus, executedBy, notes }) {
  const lines = [
    `Excel ID: ${excelId}`,
    category && `Category: ${category}`,
    browserStatus && `Browser status: ${browserStatus}`,
    executedBy && `Executed by: ${executedBy}`,
    notes && `Notes: ${notes}`,
  ].filter(Boolean)

  return lines.join('\n')
}

function stepsFromInput(input) {
  const value = clean(input)
  if (!value) return []
  return [{ order: 1, action: value }]
}

function extractCases() {
  const { sheets, sharedStrings } = readWorkbook()
  const extracted = []
  const skipped = []

  for (const sheet of sheets) {
    if (!sheet.path) {
      skipped.push({ sheet: sheet.name, reason: 'missing worksheet target' })
      continue
    }

    if (['Test Report', 'Sheet List'].includes(sheet.name)) {
      skipped.push({ sheet: sheet.name, reason: 'metadata sheet' })
      continue
    }

    if (!includeBackups && /_BK$/i.test(sheet.name)) {
      skipped.push({ sheet: sheet.name, reason: 'backup sheet, pass --include-bk to import' })
      continue
    }

    const rows = parseSheet(sheet.path, sharedStrings)
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

function generateCode(index) {
  return `TC-${String(index + 1).padStart(4, '0')}`
}

async function getOrCreateFolder({ projectId, name, parentId }) {
  const existing = await prisma.folder.findFirst({
    where: { projectId, name, parentId },
    select: { id: true },
  })

  if (existing) return { id: existing.id, created: false }

  const folder = await prisma.folder.create({
    data: { projectId, name, parentId },
    select: { id: true },
  })

  return { id: folder.id, created: true }
}

async function main() {
  const { extracted, skipped } = extractCases()
  const project = await prisma.project.findFirst({
    where: { name: 'DigiRetails' },
    select: { id: true, name: true },
  })

  if (!project) throw new Error('Project "DigiRetails" not found')

  const rootFolder = await prisma.folder.findFirst({
    where: { projectId: project.id, name: 'Quotation', parentId: null },
    select: { id: true },
  })

  const existingFolders = await prisma.folder.findMany({
    where: { projectId: project.id, parentId: rootFolder?.id || null },
    select: { name: true },
  })

  const existingCases = await prisma.testCase.findMany({
    where: { projectId: project.id },
    select: {
      title: true,
      preconditions: true,
      finalExpectation: true,
      folder: { select: { name: true } },
    },
  })

  const caseKey = (testCase) => [
    testCase.folder?.name || testCase.sheetName || '',
    testCase.title,
    testCase.preconditions || '',
    testCase.finalExpectation || '',
  ].join('\u001f')

  const existingCaseKeys = new Set(existingCases.map(caseKey))
  const importable = extracted.filter((testCase) => !existingCaseKeys.has(caseKey(testCase)))
  const bySheet = new Map()

  for (const testCase of extracted) {
    const summary = bySheet.get(testCase.sheetName) || { total: 0, importable: 0 }
    summary.total += 1
    if (!existingCaseKeys.has(caseKey(testCase))) summary.importable += 1
    bySheet.set(testCase.sheetName, summary)
  }

  console.log(JSON.stringify({
    mode: isApply ? 'apply' : 'dry-run',
    file: filePath,
    project: project.name,
    rootFolder: rootFolder ? 'Quotation' : 'Quotation (will be created)',
    existingChildFolders: existingFolders.map((folder) => folder.name),
    sheets: Array.from(bySheet.entries()).map(([sheet, summary]) => ({ sheet, ...summary })),
    skipped,
    totalExtracted: extracted.length,
    totalImportable: importable.length,
  }, null, 2))

  if (!isApply) {
    console.log('\nDry run only. Re-run with --apply to write to the database.')
    return
  }

  const root = rootFolder || await getOrCreateFolder({ projectId: project.id, name: 'Quotation', parentId: null })
  const rootFolderId = root.id
  const folderCache = new Map()
  const createdFolderNames = []

  for (const sheetName of new Set(importable.map((testCase) => testCase.sheetName))) {
    const folder = await getOrCreateFolder({ projectId: project.id, name: sheetName, parentId: rootFolderId })
    folderCache.set(sheetName, folder.id)
    if (folder.created) createdFolderNames.push(sheetName)
  }

  let nextIndex = await prisma.testCase.count({ where: { projectId: project.id } })
  let createdCases = 0

  for (const testCase of importable) {
    const folderId = folderCache.get(testCase.sheetName)
    const code = generateCode(nextIndex)
    nextIndex += 1

    await prisma.testCase.create({
      data: {
        code,
        title: testCase.title,
        description: testCase.description,
        preconditions: testCase.preconditions,
        finalExpectation: testCase.finalExpectation,
        actualResult: testCase.actualResult,
        severity: testCase.severity,
        type: testCase.type,
        status: testCase.status,
        projectId: project.id,
        folderId,
        steps: {
          create: testCase.steps,
        },
      },
    })
    createdCases += 1
  }

  console.log(JSON.stringify({
    createdFolders: createdFolderNames,
    createdCases,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
