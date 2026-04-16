import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TopNav from '@/components/layout/TopNav'
import Sidebar from '@/components/layout/Sidebar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

type Props = { params: Promise<{ projectId: string }>; children: React.ReactNode }

export default async function ProjectLayout({ params, children }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { projectId } = await params

  const [user, project] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, avatar: true, createdAt: true },
    }),
    prisma.project.findFirst({
      where: {
        id: projectId,
        members: { some: { userId: session.userId } },
      },
    }),
  ])

  if (!user || !project) notFound()

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopNav
        user={{ ...user, createdAt: user.createdAt.toISOString() }}
        projectName={project.name}
        projectId={projectId}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar projectId={projectId} projectName={project.name} version={project.version} />
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
      <MobileBottomNav projectId={projectId} />
    </div>
  )
}
