import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyTreeShareToken } from '@/lib/share'
import TreeViewClient from '@/app/projects/[projectId]/tree/TreeViewClient'
import type { Folder, TestCase } from '@/types'

type Props = { params: Promise<{ token: string }> }
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
    projectId: string
    archived: boolean
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

function serializeFolder(folder: FolderNode): {
  id: string
  name: string
  description: string | null
  projectId: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  testCases: {
    id: string
    code: string
    title: string
    projectId: string
    archived: boolean
    severity: string
    status: string
    type: string
    folderId: string | null
    createdAt: string
    updatedAt: string
  }[]
  _count: { children: number; testCases: number }
  children: ReturnType<typeof serializeFolder>[]
} {
  return {
    ...folder,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
    testCases: (folder.testCases || []).map((testCase) => ({
      ...testCase,
      projectId: folder.projectId,
      archived: false,
      createdAt: testCase.createdAt.toISOString(),
      updatedAt: testCase.updatedAt.toISOString(),
    })),
    children: (folder.children || []).map(serializeFolder),
  }
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const payload = await verifyTreeShareToken(token)
  if (!payload) return { title: 'Shared Tree' }

  const feature = await prisma.folder.findFirst({
    where: { id: payload.featureId, projectId: payload.projectId },
    select: { name: true, project: { select: { name: true } } },
  })

  return {
    title: feature ? `${feature.project.name} / ${feature.name} — Shared Tree` : 'Shared Tree',
  }
}

export default async function SharedTreePage({ params }: Props) {
  const { token } = await params
  const payload = await verifyTreeShareToken(token)
  if (!payload) notFound()

  const feature = await prisma.folder.findFirst({
    where: { id: payload.featureId, projectId: payload.projectId },
    select: {
      id: true,
      name: true,
      project: { select: { name: true } },
    },
  })
  if (!feature) notFound()

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
  const fullTree = buildTree(folders as FolderNode[])
  const scopedFeature = findFolderById(fullTree, payload.featureId)
  if (!scopedFeature) notFound()

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-outline/15 bg-white/85 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-primary">share</span>
          <p className="text-sm md:text-base font-bold text-on-surface truncate">
            Shared Tree: {feature.project.name} / {feature.name}
          </p>
        </div>
        <Link href="/login" className="text-xs font-bold text-primary hover:underline">
          Sign in
        </Link>
      </header>

      <main className="flex-1 overflow-hidden">
        <TreeViewClient
          projectId={payload.projectId}
          initialData={{
            tree: [serializeFolder(scopedFeature)] as unknown as Folder[],
            rootCases: [] as TestCase[],
          }}
          readOnly
          initialFeatureId={payload.featureId}
          lockFeatureSelection
        />
      </main>
    </div>
  )
}
