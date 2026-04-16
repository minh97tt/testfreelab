import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!
  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(50, parseInt(searchParams.get('pageSize') || '10'))
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const createdAt: { gte?: Date; lte?: Date } = {}
  if (dateFrom) {
    const from = new Date(dateFrom)
    if (!Number.isNaN(from.getTime())) createdAt.gte = from
  }
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59.999`)
    if (!Number.isNaN(to.getTime())) createdAt.lte = to
  }
  const where = {
    projectId,
    ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
  }

  const [total, runs] = await Promise.all([
    prisma.testRun.count({ where }),
    prisma.testRun.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Compute pass rates
  const runsWithStats = await Promise.all(runs.map(async (run) => {
    const passed = await prisma.runResult.count({ where: { runId: run.id, status: 'PASSED' } })
    const total = await prisma.runResult.count({ where: { runId: run.id } })
    return { ...run, passRate: total > 0 ? Math.round((passed / total) * 100) : 0 }
  }))

  return NextResponse.json({ data: runsWithStats, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!
  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    name: z.string().min(1),
    caseIds: z.array(z.string()).min(1, 'Select at least one test case'),
  })

  try {
    const body = await req.json()
    const { name, caseIds } = schema.parse(body)

    const run = await prisma.testRun.create({
      data: {
        name,
        projectId,
        userId,
        status: 'QUEUED',
        results: {
          create: caseIds.map(testCaseId => ({
            testCaseId,
            status: 'UNTESTED',
          })),
        },
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { results: true } },
      },
    })
    return NextResponse.json({ data: run }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
