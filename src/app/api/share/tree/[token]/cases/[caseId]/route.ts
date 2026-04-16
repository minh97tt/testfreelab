import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTreeShareToken } from '@/lib/share'

type Params = { params: Promise<{ token: string; caseId: string }> }

async function isFolderUnderFeature(projectId: string, featureId: string, folderId: string | null): Promise<boolean> {
  if (!folderId) return false

  let currentId: string | null = folderId
  while (currentId) {
    if (currentId === featureId) return true

    const parentFolderRecord: { parentId: string | null } | null = await prisma.folder.findFirst({
      where: { id: currentId, projectId },
      select: { parentId: true },
    })
    if (!parentFolderRecord) return false
    currentId = parentFolderRecord.parentId
  }

  return false
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { token, caseId } = await params
  const payload = await verifyTreeShareToken(token)
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const testCase = await prisma.testCase.findFirst({
    where: {
      id: caseId,
      projectId: payload.projectId,
      archived: false,
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
      tags: { include: { tag: { select: { id: true, name: true } } } },
      results: {
        orderBy: { executedAt: 'desc' },
        take: 10,
      },
    },
  })
  if (!testCase) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = await isFolderUnderFeature(payload.projectId, payload.featureId, testCase.folderId)
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: testCase })
}
