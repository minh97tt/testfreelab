import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

import { extractCsvTestCases, type CsvTestCase } from '@/lib/csv-import'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }
type Transaction = Prisma.TransactionClient

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let tempPath: string | null = null

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!isUploadedFile(file)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ error: 'Only .csv files are supported' }, { status: 400 })
    }

    const replace = formData.get('replace') !== 'false'
    const sheetName = cleanFolderName(formData.get('sheetName')) || 'CSV Import'
    const folderId = cleanFolderId(formData.get('folderId'))

    const tempDir = join(tmpdir(), 'testtree-imports')
    await mkdir(tempDir, { recursive: true })
    tempPath = join(tempDir, `${randomUUID()}-${safeFileName(file.name)}`)
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()))

    const extracted = extractCsvTestCases(tempPath, { sheetName })
    if (extracted.length === 0) {
      return NextResponse.json({ error: 'No valid test cases found in this CSV file' }, { status: 400 })
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true },
      })
      if (!folder) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
      }
    }

    const result = await importCsvCases({
      projectId,
      folderId,
      replace,
      extracted,
    })

    return NextResponse.json({
      data: {
        ...result,
        replace,
        totalExtracted: extracted.length,
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to import CSV file' }, { status: 500 })
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => undefined)
    }
  }
}

async function importCsvCases({
  projectId,
  folderId,
  replace,
  extracted,
}: {
  projectId: string
  folderId: string | null
  replace: boolean
  extracted: CsvTestCase[]
}) {
  return prisma.$transaction(async (tx) => {
    const sheetNames = [...new Set(extracted.map((testCase) => testCase.sheetName))]
    const replaceWhere: Prisma.TestCaseWhereInput = folderId
      ? { projectId, folderId }
      : {
          projectId,
          folder: {
            is: {
              parentId: null,
              name: { in: sheetNames },
            },
          },
        }

    const replacingCases = replace
      ? await tx.testCase.findMany({
          where: replaceWhere,
          select: { id: true },
        })
      : []
    const replacingCaseIds = replacingCases.map((testCase) => testCase.id)

    if (replacingCaseIds.length > 0) {
      await tx.runResult.deleteMany({
        where: { testCaseId: { in: replacingCaseIds } },
      })
    }

    const deletedCases = replacingCaseIds.length > 0
      ? (await tx.testCase.deleteMany({
          where: { id: { in: replacingCaseIds } },
        })).count
      : 0

    const existingCaseKeys = replace
      ? new Set<string>()
      : await getExistingCaseKeys(tx, projectId, folderId)
    const importable = extracted.filter((testCase) => {
      const key = folderId ? caseKeyWithoutFolder(testCase) : caseKey(testCase)
      return !existingCaseKeys.has(key)
    })

    const folderCache = new Map<string, string>()
    const createdFolders: string[] = []

    if (folderId) {
      for (const sheetName of sheetNames) folderCache.set(sheetName, folderId)
    } else {
      for (const sheetName of sheetNames) {
        const folder = await getOrCreateFolder(tx, {
          projectId,
          name: sheetName,
          parentId: null,
        })
        folderCache.set(sheetName, folder.id)
        if (folder.created) createdFolders.push(sheetName)
      }
    }

    let nextCodeNumber = await getNextCodeNumber(tx, projectId)
    let createdCases = 0

    for (const testCase of importable) {
      const folderId = folderCache.get(testCase.sheetName)
      if (!folderId) continue

      await tx.testCase.create({
        data: {
          code: formatTCCode(nextCodeNumber),
          title: testCase.title,
          description: testCase.description,
          preconditions: testCase.preconditions,
          finalExpectation: testCase.finalExpectation,
          actualResult: testCase.actualResult,
          severity: testCase.severity,
          type: testCase.type,
          status: testCase.status,
          projectId,
          folderId,
          steps: {
            create: testCase.steps,
          },
        },
      })

      nextCodeNumber += 1
      createdCases += 1
    }

    return {
      createdCases,
      deletedCases,
      createdFolders,
      skippedCases: extracted.length - importable.length,
      sheets: summarizeSheets(extracted, importable),
    }
  }, { timeout: 60_000 })
}

async function getOrCreateFolder(
  tx: Transaction,
  {
    projectId,
    name,
    parentId,
  }: {
    projectId: string
    name: string
    parentId: string | null
  }
) {
  const existing = await tx.folder.findFirst({
    where: { projectId, name, parentId },
    select: { id: true },
  })

  if (existing) return { id: existing.id, created: false }

  const folder = await tx.folder.create({
    data: { projectId, name, parentId },
    select: { id: true },
  })

  return { id: folder.id, created: true }
}

async function getExistingCaseKeys(tx: Transaction, projectId: string, folderId: string | null) {
  const existingCases = await tx.testCase.findMany({
    where: folderId ? { projectId, folderId } : { projectId },
    select: {
      title: true,
      preconditions: true,
      finalExpectation: true,
      folder: { select: { name: true } },
    },
  })

  return new Set(existingCases.map((testCase) => folderId ? caseKeyWithoutFolder(testCase) : caseKey(testCase)))
}

async function getNextCodeNumber(tx: Transaction, projectId: string) {
  const existingCodes = await tx.testCase.findMany({
    where: { projectId },
    select: { code: true },
  })
  let maxCodeNumber = 0

  for (const { code } of existingCodes) {
    const number = /^TC-(\d+)$/.exec(code)?.[1]
    if (number) maxCodeNumber = Math.max(maxCodeNumber, Number(number))
  }

  return maxCodeNumber + 1
}

function summarizeSheets(extracted: CsvTestCase[], importable: CsvTestCase[]) {
  const importableKeys = new Map<string, number>()

  for (const testCase of importable) {
    importableKeys.set(testCase.sheetName, (importableKeys.get(testCase.sheetName) || 0) + 1)
  }

  return [...new Set(extracted.map((testCase) => testCase.sheetName))].map((sheet) => ({
    sheet,
    total: extracted.filter((testCase) => testCase.sheetName === sheet).length,
    importable: importableKeys.get(sheet) || 0,
  }))
}

function caseKey(testCase: {
  title: string
  preconditions: string | null
  finalExpectation: string | null
  sheetName?: string
  folder?: { name: string } | null
}) {
  return [
    testCase.folder?.name || testCase.sheetName || '',
    testCase.title,
    testCase.preconditions || '',
    testCase.finalExpectation || '',
  ].join('\u001f')
}

function caseKeyWithoutFolder(testCase: {
  title: string
  preconditions: string | null
  finalExpectation: string | null
}) {
  return [
    testCase.title,
    testCase.preconditions || '',
    testCase.finalExpectation || '',
  ].join('\u001f')
}

function formatTCCode(number: number) {
  return `TC-${String(number).padStart(4, '0')}`
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    'name' in value &&
    typeof value.arrayBuffer === 'function'
  )
}

function safeFileName(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, '_') || 'import.csv'
}

function cleanFolderName(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanFolderId(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
