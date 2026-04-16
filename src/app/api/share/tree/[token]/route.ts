import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTreeShareToken } from '@/lib/share'

type Params = { params: Promise<{ token: string }> }

type FolderNode = {
  id: string
  name: string
  description: string | null
  projectId: string
  parentId: string | null
  createdAt: Date
  updatedAt: Date
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
  _count: { children: number; testCases: number }
  children?: FolderNode[]
}

function buildTree(folders: FolderNode[], parentId: string | null = null): FolderNode[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .map((folder) => ({
      ...folder,
      children: buildTree(folders, folder.id),
    }))
}

function findFolderById(folders: FolderNode[], id: string): FolderNode | null {
  for (const folder of folders) {
    if (folder.id === id) return folder
    const found = findFolderById(folder.children || [], id)
    if (found) return found
  }
  return null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const payload = await verifyTreeShareToken(token)
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const feature = await prisma.folder.findFirst({
    where: { id: payload.featureId, projectId: payload.projectId },
    select: { id: true },
  })
  if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const folders = await prisma.folder.findMany({
    where: { projectId: payload.projectId },
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

  const tree = buildTree(folders as FolderNode[])
  const scopedFeature = findFolderById(tree, payload.featureId)
  if (!scopedFeature) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      tree: [scopedFeature],
      rootCases: [],
      featureId: payload.featureId,
      projectId: payload.projectId,
    },
  })
}
