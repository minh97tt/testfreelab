import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client';

type Params = { params: Promise<{ id: string; caseId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId, caseId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const testCase = await prisma.testCase.findFirst({
    where: { id: caseId, projectId },
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
      tags: { include: { tag: { select: { id: true, name: true } } } },
      results: {
        orderBy: { executedAt: 'desc' },
        take: 10,
      },
    },
  })
  if (!testCase) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: testCase })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, caseId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.testCase.findFirst({
    where: { id: caseId, projectId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    testData: z.string().optional(),
    finalExpectation: z.string().min(1).optional(),
    actualResult: z.string().optional(),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    type: z.enum(['MANUAL', 'AUTOMATED']).optional(),
    status: z.enum(['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED']).optional(),
    folderId: z.string().min(1).optional(),
    archived: z.boolean().optional(),
    steps: z.array(z.object({
      id: z.string().optional(),
      order: z.number().int(),
      action: z.string().min(1),
      expected: z.string().optional(),
    })).optional(),
  })

  try {
    const body = await req.json()
    const { steps, folderId, ...data } = schema.parse(body)

    let nextFolderId: string | null | undefined = undefined

    if (typeof folderId !== 'undefined') {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true },
      })

      if (!folder) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 400 })
      }

      nextFolderId = folder.id
    }

    const updateData: Prisma.TestCaseUpdateInput = {
      ...data,
    }

    if (typeof nextFolderId !== 'undefined') {
      updateData.folder = nextFolderId
        ? { connect: { id: nextFolderId } }
        : { disconnect: true }
    }

    if (steps) {
      updateData.steps = {
        deleteMany: {},
        create: steps.map((s) => ({
          order: s.order,
          action: s.action,
          ...(typeof s.expected !== 'undefined' ? { expected: s.expected } : {}),
        })),
      }
    }

    const testCase = await prisma.testCase.update({
      where: { id: caseId },
      data: updateData,
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

    return NextResponse.json({ data: testCase })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: err.issues },
        { status: 400 }
      )
    }

    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: projectId, caseId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft delete by default
  const result = await prisma.testCase.updateMany({
    where: { id: caseId, projectId },
    data: { archived: true },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: { ok: true } })
}
