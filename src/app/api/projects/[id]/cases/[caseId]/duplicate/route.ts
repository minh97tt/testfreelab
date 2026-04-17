import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { generateTCCode } from '@/lib/utils'

type Params = { params: Promise<{ id: string; caseId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId, caseId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const source = await prisma.testCase.findFirst({
      where: { id: caseId, projectId },
      select: {
        title: true,
        description: true,
        preconditions: true,
        testData: true,
        finalExpectation: true,
        actualResult: true,
        severity: true,
        type: true,
        folderId: true,
        steps: {
          select: {
            order: true,
            action: true,
            expected: true,
          },
          orderBy: { order: 'asc' },
        },
        tags: {
          select: {
            tagId: true,
          },
        },
      },
    })

    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const count = await prisma.testCase.count({ where: { projectId } })
    const code = generateTCCode(count)

    const testCase = await prisma.testCase.create({
      data: {
        code,
        title: `${source.title} (Copy)`,
        description: source.description,
        preconditions: source.preconditions,
        testData: source.testData,
        finalExpectation: source.finalExpectation,
        actualResult: source.actualResult,
        severity: source.severity,
        type: source.type,
        status: 'UNTESTED',
        projectId,
        folderId: source.folderId,
        steps: {
          create: source.steps.map((step) => ({
            order: step.order,
            action: step.action,
            ...(typeof step.expected !== 'undefined' ? { expected: step.expected } : {}),
          })),
        },
        tags: {
          create: source.tags.map(({ tagId }) => ({ tagId })),
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
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
