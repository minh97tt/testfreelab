#!/usr/bin/env node

const path = require('path')
const { readFileSync } = require('node:fs')
const { PrismaClient } = require('@prisma/client')

const DEFAULT_FILE = 'seed_excel/DigiRetails_Testcase_Portal_Báo giá_Quotation(Quotation_Create).csv'
const DEFAULT_ROOT_FOLDER = 'Quotation_Create'
const DEFAULT_PROJECT_ID = 'cmo2b46ym0000kz04j75myjy8'

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const projectIdArg = getArgValue('--project')
const rootFolderArg = getArgValue('--root-folder')
const fileArg = args.find((arg) => !arg.startsWith('--')) || DEFAULT_FILE
const filePath = path.resolve(process.cwd(), fileArg)
const projectId = projectIdArg || DEFAULT_PROJECT_ID
const rootFolderName = rootFolderArg || DEFAULT_ROOT_FOLDER

const prisma = new PrismaClient()

function getArgValue(flag) {
  const index = args.findIndex((arg) => arg === flag)
  if (index === -1) return null
  return args[index + 1] || null
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseCsv(content) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]

    if (inQuotes) {
      if (char === '"') {
        const next = content[i + 1]
        if (next === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (char === '\r') {
      if (content[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((value) => value !== '')) rows.push(row)

  return rows
}

function clean(value) {
  return String(value || '').trim()
}

function compact(value) {
  return clean(value).replace(/\s+/g, ' ')
}

function normalizeHeader(value) {
  return clean(value).toLowerCase()
}

function findHeaderRow(rows) {
  const required = ['testcase id', 'category', 'test execution', 'test inputs', 'expected']
  return rows.findIndex((row) => required.every((label, index) => normalizeHeader(row?.[index]) === label))
}

function mapHeaders(row) {
  const map = new Map()
  row.forEach((value, index) => {
    const key = normalizeHeader(value)
    if (key) map.set(key, index)
  })
  return map
}

function getCell(row, headerMap, key) {
  const index = headerMap.get(key)
  return index == null ? '' : row?.[index]
}

function normalizeStatus(value) {
  const status = clean(value).toUpperCase()
  if (!status) return ''
  if (status === 'F' || status === 'FAILED') return 'FAILED'
  if (status === 'P' || status === 'PASSED') return 'PASSED'
  if (status === 'C' || status === 'CANCELLED' || status === 'CANCELED') return 'BLOCKED'
  if (status === 'NY' || status === 'NOT TESTED' || status === 'NOTTESTED' || status === 'NT') return 'UNTESTED'
  return ''
}

function statusFromRow(row, headerMap) {
  const browserKeys = ['chrome', 'firefox', 'ie']
  const statuses = browserKeys
    .map((key) => normalizeStatus(getCell(row, headerMap, key)))
    .filter(Boolean)

  if (statuses.includes('FAILED')) return 'FAILED'
  if (statuses.includes('BLOCKED')) return 'BLOCKED'
  if (statuses.includes('PASSED')) return 'PASSED'
  return 'UNTESTED'
}

function parseSteps(input) {
  const value = clean(input)
  if (!value) return []
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const numbered = []

  for (const line of lines) {
    const match = /^\s*(\d+)[\.\)]\s*(.+)$/.exec(line)
    if (match) numbered.push(match[2].trim())
  }

  const items = numbered.length > 0 ? numbered : [value]
  return items.map((action, index) => ({ order: index + 1, action }))
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

function extractCases(csvContent) {
  const rows = parseCsv(stripBom(csvContent))
  const headerIndex = findHeaderRow(rows)

  if (headerIndex === -1) {
    throw new Error('Header row not found. Expected columns: TestCase ID, Category, Test Execution, Test Inputs, Expected.')
  }

  const headerMap = mapHeaders(rows[headerIndex])
  const extracted = []

  for (const row of rows.slice(headerIndex + 1)) {
    const excelId = clean(getCell(row, headerMap, 'testcase id'))
    if (!/^ID_/i.test(excelId)) continue

    const category = compact(getCell(row, headerMap, 'category'))
    const testExecution = clean(getCell(row, headerMap, 'test execution'))
    const testInputs = clean(getCell(row, headerMap, 'test inputs'))
    const expected = clean(getCell(row, headerMap, 'expected'))
    const executedBy = compact(getCell(row, headerMap, 'excuted by')) || compact(getCell(row, headerMap, 'executed by'))
    const notes = clean(getCell(row, headerMap, 'notes'))

    const browserStatus = ['chrome', 'firefox', 'ie']
      .map((key) => {
        const value = clean(getCell(row, headerMap, key))
        return value ? `${key.toUpperCase()}=${value}` : ''
      })
      .filter(Boolean)
      .join(', ')

    if (!testExecution && !testInputs && !expected) continue

    const titleLine = testExecution.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0]
    const title = compact(titleLine || testExecution || excelId)

    extracted.push({
      excelId,
      title,
      description: buildDescription({
        excelId,
        category,
        browserStatus,
        executedBy,
        notes,
      }),
      preconditions: testInputs || null,
      finalExpectation: expected || 'N/A',
      actualResult: null,
      severity: 'MEDIUM',
      type: 'MANUAL',
      status: statusFromRow(row, headerMap),
      steps: parseSteps(testInputs),
    })
  }

  return extracted
}

function generateCode(value) {
  return value
}

async function getOrCreateFolder({ projectId: targetProjectId, name, parentId }) {
  const existing = await prisma.folder.findFirst({
    where: { projectId: targetProjectId, name, parentId },
    select: { id: true },
  })

  if (existing) return { id: existing.id, created: false }

  const folder = await prisma.folder.create({
    data: { projectId: targetProjectId, name, parentId },
    select: { id: true },
  })

  return { id: folder.id, created: true }
}

async function main() {
  if (!projectId) throw new Error('Missing projectId. Pass --project <id> or edit DEFAULT_PROJECT_ID.')

  const csv = readFileSync(filePath, 'utf8')
  const extracted = extractCases(csv)

  const existingCodes = await prisma.testCase.findMany({
    where: { projectId },
    select: { code: true },
  })
  const existingCodeSet = new Set(existingCodes.map((row) => row.code))
  const importable = extracted.filter((testCase) => !existingCodeSet.has(testCase.excelId))

  console.log(JSON.stringify({
    mode: isApply ? 'apply' : 'dry-run',
    file: filePath,
    projectId,
    rootFolder: rootFolderName,
    totalExtracted: extracted.length,
    totalImportable: importable.length,
    skippedExisting: extracted.length - importable.length,
  }, null, 2))

  if (!isApply) {
    console.log('\nDry run only. Re-run with --apply to write to the database.')
    return
  }

  const rootFolder = await getOrCreateFolder({ projectId, name: rootFolderName, parentId: null })
  const rootFolderId = rootFolder.id

  let createdCases = 0

  for (const testCase of importable) {
    const code = generateCode(testCase.excelId)

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
        projectId,
        folderId: rootFolderId,
        steps: {
          create: testCase.steps,
        },
      },
    })

    createdCases += 1
  }

  console.log(JSON.stringify({
    createdFolders: rootFolder.created ? [rootFolderName] : [],
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
