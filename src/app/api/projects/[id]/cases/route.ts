import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateTCCode } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!
  const { searchParams } = req.nextUrl

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const q = searchParams.get('q') || ''
  const featureQ = searchParams.get('featureQ') || ''
  const severity = searchParams.get('severity') || ''
  const status = searchParams.get('status') || ''
  const folderId = searchParams.get('folderId') || ''
  const type = searchParams.get('type') || ''
  const archived = searchParams.get('archived') === 'true'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20'))
  const sortByParam = searchParams.get('sortBy') || 'code'
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const sortableFields = new Set(['code', 'title', 'severity', 'status', 'updatedAt'])
  const sortBy = sortableFields.has(sortByParam) ? sortByParam : 'code'
  const orderBy = [
    { [sortBy]: sortDir },
    ...(sortBy === 'code' ? [] : [{ code: 'asc' as const }]),
  ] as unknown as { [key: string]: 'asc' | 'desc' }[]

  let scopedFolderIds: string[] | undefined
  if (folderId) {
    const folders = await prisma.folder.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    })
    const byParent = new Map<string | null, string[]>()
    for (const folder of folders) {
      const key = folder.parentId ?? null
      const bucket = byParent.get(key) || []
      bucket.push(folder.id)
      byParent.set(key, bucket)
    }
    const allIds = new Set(folders.map((f) => f.id))
    if (!allIds.has(folderId)) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 400 })
    }

    const queue = [folderId]
    const collected = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()!
      if (collected.has(current)) continue
      collected.add(current)
      for (const childId of byParent.get(current) || []) {
        queue.push(childId)
      }
    }
    scopedFolderIds = Array.from(collected)
  }

  const where = {
    projectId,
    archived,
    ...(q && { OR: [
      { title: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
      { preconditions: { contains: q } },
      { testData: { contains: q } },
      { finalExpectation: { contains: q } },
      { actualResult: { contains: q } },
    ]}),
    ...(severity && { severity }),
    ...(status && { status }),
    ...(type && { type }),
    ...(featureQ && { folder: { is: { name: { contains: featureQ } } } }),
    ...(scopedFolderIds && { folderId: { in: scopedFolderIds } }),
  }

  const [total, cases] = await Promise.all([
    prisma.testCase.count({ where }),
    prisma.testCase.findMany({
      where,
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        preconditions: true,
        testData: true,
        finalExpectation: true,
        actualResult: true,
        severity: true,
        type: true,
        status: true,
        projectId: true,
        folderId: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        steps: { orderBy: { order: 'asc' } },
        results: {
          where: { status: { in: ['PASSED', 'FAILED', 'IN_PROGRESS'] } },
          select: { executedAt: true },
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const casesWithExecution = cases.map((testCase) => ({
    ...testCase,
    lastExecutedAt: testCase.results[0]?.executedAt ?? null,
  }))

  return NextResponse.json({
    data: casesWithExecution,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    testData: z.string().optional(),
    finalExpectation: z.string().min(1),
    actualResult: z.string().optional(),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
    type: z.enum(['E2E', 'INTEGRATION', 'API', 'UI', 'MANUAL']).default('MANUAL'),
    folderId: z.string().min(1, 'Feature is required'),
    steps: z.array(z.object({
      order: z.number().int(),
      action: z.string().min(1),
    })).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
  })

  try {
    const body = await req.json()
    const { title, description, preconditions, testData, finalExpectation, actualResult, severity, type, folderId, steps, tags } = schema.parse(body)

    const folder = await prisma.folder.findFirst({
      where: { id: folderId, projectId },
      select: { id: true },
    })
    if (!folder) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 400 })
    }

    // Auto-generate TC code
    const count = await prisma.testCase.count({ where: { projectId } })
    const code = generateTCCode(count)

    const testCase = await prisma.testCase.create({
      data: {
        code,
        title,
        description,
        preconditions,
        testData,
        finalExpectation,
        actualResult,
        severity,
        type,
        status: 'UNTESTED',
        projectId,
        folderId: folder.id,
        steps: {
          create: steps.map(s => ({
            order: s.order,
            action: s.action,
          })),
        },
        tags: {
          create: await Promise.all(tags.map(async (name) => {
            const tag = await prisma.tag.upsert({
              where: { name },
              update: {},
              create: { name },
            })
            return { tagId: tag.id }
          })),
        },
      },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        preconditions: true,
        testData: true,
        finalExpectation: true,
        actualResult: true,
        severity: true,
        type: true,
        status: true,
        projectId: true,
        folderId: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true } },
        steps: { orderBy: { order: 'asc' } },
        tags: { include: { tag: true } },
      },
    })
    return NextResponse.json({ data: testCase }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
