import { readFileSync } from 'node:fs'

export interface CsvTestCase {
  sheetName: string
  excelId: string
  title: string
  description: string
  preconditions: string | null
  finalExpectation: string
  actualResult: string | null
  severity: 'MEDIUM'
  type: 'MANUAL'
  status: 'UNTESTED' | 'PASSED' | 'FAILED' | 'BLOCKED'
  steps: { order: number; action: string }[]
}

export function extractCsvTestCases(filePath: string, options: { sheetName?: string } = {}) {
  const content = readFileSync(filePath, 'utf8')
  const rows = parseCsv(stripBom(content))
  const headerIndex = findHeaderRow(rows)

  if (headerIndex === -1) {
    throw new Error('CSV header not found')
  }

  const headerMap = mapHeaders(rows[headerIndex])
  const sheetName = options.sheetName || 'CSV Import'
  const extracted: CsvTestCase[] = []

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
      sheetName,
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

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseCsv(content: string) {
  const rows: string[][] = []
  let row: string[] = []
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

function clean(value: unknown) {
  return String(value || '').trim()
}

function compact(value: unknown) {
  return clean(value).replace(/\s+/g, ' ')
}

function normalizeHeader(value: unknown) {
  return clean(value).toLowerCase()
}

function findHeaderRow(rows: string[][]) {
  const required = ['testcase id', 'category', 'test execution', 'test inputs', 'expected']
  return rows.findIndex((row) => required.every((label, index) => normalizeHeader(row?.[index]) === label))
}

function mapHeaders(row: string[]) {
  const map = new Map<string, number>()
  row.forEach((value, index) => {
    const key = normalizeHeader(value)
    if (key) map.set(key, index)
  })
  return map
}

function getCell(row: string[], headerMap: Map<string, number>, key: string) {
  const index = headerMap.get(key)
  return index == null ? '' : row?.[index]
}

function normalizeStatus(value: unknown) {
  const status = clean(value).toUpperCase()
  if (!status) return ''
  if (status === 'F' || status === 'FAILED') return 'FAILED'
  if (status === 'P' || status === 'PASSED') return 'PASSED'
  if (status === 'C' || status === 'CANCELLED' || status === 'CANCELED') return 'BLOCKED'
  if (status === 'NY' || status === 'NOT TESTED' || status === 'NOTTESTED' || status === 'NT') return 'UNTESTED'
  return ''
}

function statusFromRow(row: string[], headerMap: Map<string, number>) {
  const browserKeys = ['chrome', 'firefox', 'ie']
  const statuses = browserKeys
    .map((key) => normalizeStatus(getCell(row, headerMap, key)))
    .filter(Boolean)

  if (statuses.includes('FAILED')) return 'FAILED'
  if (statuses.includes('BLOCKED')) return 'BLOCKED'
  if (statuses.includes('PASSED')) return 'PASSED'
  return 'UNTESTED'
}

function parseSteps(input: string) {
  const value = clean(input)
  if (!value) return []
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const numbered: string[] = []

  for (const line of lines) {
    const match = /^\s*(\d+)[\.\)]\s*(.+)$/.exec(line)
    if (match) numbered.push(match[2].trim())
  }

  const items = numbered.length > 0 ? numbered : [value]
  return items.map((action, index) => ({ order: index + 1, action }))
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
