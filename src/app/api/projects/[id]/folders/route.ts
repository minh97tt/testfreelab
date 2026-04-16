import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

// Build nested folder tree from flat list
function buildTree(folders: {
  id: string; name: string; description: string | null; projectId: string;
  parentId: string | null; createdAt: Date; updatedAt: Date;
  testCases: {
    id: string
    code: string
    title: string
    severity: string
    status: string
    type: string
    folderId: string | null
    createdAt: Date
    updatedAt: Date
  }[]
  _count: { children: number; testCases: number };
}[], parentId: string | null = null): unknown[] {
  return folders
    .filter(f => f.parentId === parentId)
    .map(f => ({
      ...f,
      children: buildTree(folders, f.id),
    }))
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const folders = await prisma.folder.findMany({
    where: { projectId },
    include: {
      testCases: {
        where: { archived: false },
        select: {
          id: true,
          code: true,
          title: true,
          severity: true,
          status: true,
          type: true,
          folderId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { code: 'asc' },
      },
      _count: { select: { children: true, testCases: true } },
    },
    orderBy: { name: 'asc' },
  })

  // Also get root-level test cases (no folder)
  const rootCases = await prisma.testCase.findMany({
    where: { projectId, folderId: null, archived: false },
    select: {
      id: true,
      code: true,
      title: true,
      severity: true,
      status: true,
      type: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { code: 'asc' },
  })

  return NextResponse.json({
    data: {
      tree: buildTree(folders),
      rootCases,
    },
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
    name: z.string().min(1),
    description: z.string().optional(),
    parentId: z.string().nullable().optional(),
  })

  try {
    const body = await req.json()
    const { name, description, parentId } = schema.parse(body)

    const folder = await prisma.folder.create({
      data: { name, description, projectId, parentId: parentId ?? null },
      include: { _count: { select: { children: true, testCases: true } } },
    })
    return NextResponse.json({ data: folder }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
