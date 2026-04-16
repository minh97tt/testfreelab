import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import CreateProjectModal from '@/components/modals/CreateProjectModal'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [user, projects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, avatar: true, createdAt: true },
    }),
    prisma.project.findMany({
      where: { members: { some: { userId: session.userId } } },
      include: {
        _count: { select: { testCases: true, folders: true, runs: true } },
        members: { take: 5, include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  if (!user) redirect('/login')

  const initials = user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl sticky top-0 z-50 shadow-xl shadow-slate-200/30 border-b border-white/40 flex justify-between items-center px-6 py-3">
        <span className="text-xl font-black font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-900 to-pink-600 tracking-tight">
          TestTree
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-outline font-label hidden md:block">{user.email}</span>
          <div className="relative group cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-pink-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white">
              {initials}
            </div>
            <div className="absolute right-0 top-10 w-44 bg-white rounded-2xl shadow-xl ring-1 ring-outline/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden">
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-error hover:bg-error-container/10"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-black font-headline tracking-tighter text-primary mb-2">
              Your Projects
            </h1>
            <p className="text-outline text-lg font-medium">
              {projects.length} workspace{projects.length !== 1 ? 's' : ''} • Welcome back, {user.name.split(' ')[0]} 👋
            </p>
          </div>
          <CreateProjectModal />
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-20 h-20 bg-surface-container rounded-3xl flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-outline">account_tree</span>
            </div>
            <h2 className="text-2xl font-black font-headline text-on-surface mb-2">No projects yet</h2>
            <p className="text-outline mb-6 max-w-sm">Create your first project to start managing test cases in a visual tree.</p>
            <CreateProjectModal variant="primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/projects/${project.id}/tree`}
                className="group bg-white rounded-3xl p-6 shadow-card ring-1 ring-outline/5 hover:shadow-xl hover:ring-primary/20 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-pink-500 rounded-2xl flex items-center justify-center text-white font-black text-lg font-headline shadow-md">
                    {project.name[0].toUpperCase()}
                  </div>
                  <span className="text-[10px] font-label font-black uppercase tracking-wider text-outline bg-surface-container-low px-2 py-1 rounded-full">
                    {project.version}
                  </span>
                </div>
                <h2 className="font-black font-headline text-xl text-on-surface mb-1 group-hover:text-primary transition-colors">
                  {project.name}
                </h2>
                {project.description && (
                  <p className="text-sm text-outline mb-4 line-clamp-2">{project.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-surface-container-high">
                  <div className="flex flex-col">
                    <span className="text-lg font-black font-headline text-primary">{project._count.testCases}</span>
                    <span className="text-[10px] text-outline font-label uppercase tracking-wide">Cases</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-black font-headline text-secondary">{project._count.runs}</span>
                    <span className="text-[10px] text-outline font-label uppercase tracking-wide">Runs</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-black font-headline text-tertiary">{project._count.folders}</span>
                    <span className="text-[10px] text-outline font-label uppercase tracking-wide">Folders</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
