import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; folderId: string }> }

async function assertAccess(projectId: string, userId: string) {
  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  return !!access
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, folderId } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await assertAccess(projectId, userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, projectId },
    select: { id: true },
  })
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    parentId: z.string().nullable().optional(),
  })
  try {
    const body = await req.json()
    const data = schema.parse(body)

    if (data.parentId === folderId) {
      return NextResponse.json({ error: 'Folder cannot be its own parent' }, { status: 400 })
    }

    if (data.parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: data.parentId, projectId },
        select: { id: true, parentId: true },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent folder not found in this project' }, { status: 400 })
      }

      // Prevent cycles by walking up from the target parent.
      let cursor: string | null = parent.parentId
      while (cursor) {
        if (cursor === folderId) {
          return NextResponse.json({ error: 'Cannot move folder into its own subtree' }, { status: 400 })
        }
        const next = await prisma.folder.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        })
        cursor = next?.parentId ?? null
      }
    }

    const folder = await prisma.folder.update({
      where: { id: folderId },
      data,
      include: { _count: { select: { children: true, testCases: true } } },
    })
    return NextResponse.json({ data: folder })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: projectId, folderId } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await assertAccess(projectId, userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, projectId },
    select: { id: true },
  })
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allFolders = await prisma.folder.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  })

  const descendants = new Set<string>()
  const queue = [folderId]
  while (queue.length > 0) {
    const current = queue.shift()!
    descendants.add(current)
    for (const item of allFolders) {
      if (item.parentId === current && !descendants.has(item.id)) queue.push(item.id)
    }
  }

  const folderIds = Array.from(descendants)

  const testCaseCount = await prisma.testCase.count({
    where: { folderId: { in: folderIds } },
  })
  if (testCaseCount > 0) {
    return NextResponse.json({
      error: 'Cannot delete folder that still contains test cases. Move them to another feature first.',
    }, { status: 400 })
  }

  const byId = new Map(allFolders.map((item) => [item.id, item]))
  const sortedByDepth = folderIds
    .map((id) => {
      let depth = 0
      let cursor = byId.get(id)?.parentId
      while (cursor && descendants.has(cursor)) {
        depth += 1
        cursor = byId.get(cursor)?.parentId ?? null
      }
      return { id, depth }
    })
    .sort((a, b) => b.depth - a.depth)

  for (const item of sortedByDepth) {
    await prisma.folder.delete({ where: { id: item.id } })
  }

  return NextResponse.json({ data: { ok: true } })
}
