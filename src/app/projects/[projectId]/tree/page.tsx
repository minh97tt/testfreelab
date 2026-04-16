import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TreeViewClient from './TreeViewClient'

type Props = { params: Promise<{ projectId: string }> }

export async function generateMetadata({ params }: Props) {
  const { projectId } = await params
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  return { title: `${project?.name || 'Project'} — Tree View` }
}

export default async function TreeViewPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { projectId } = await params
  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: session.userId } } },
  })
  if (!project) redirect('/projects')

  return (
    <TreeViewClient projectId={projectId} />
  )
}
