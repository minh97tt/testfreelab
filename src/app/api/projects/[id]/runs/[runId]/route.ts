import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; runId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId, runId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      results: {
        include: {
          testCase: {
            select: { id: true, code: true, title: true, severity: true, steps: { orderBy: { order: 'asc' } } },
          },
        },
        orderBy: { testCase: { code: 'asc' } },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: run })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, runId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existingRun = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
    select: { id: true },
  })
  if (!existingRun) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    status: z.enum(['RUNNING', 'CANCELLED']).optional(),
    name: z.string().min(1).optional(),
  })
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const updates: Record<string, unknown> = { ...data }
    if (data.status === 'RUNNING') updates.startedAt = new Date()
    if (data.status === 'CANCELLED') updates.endedAt = new Date()

    const run = await prisma.testRun.update({
      where: { id: runId },
      data: updates,
    })
    return NextResponse.json({ data: run })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
