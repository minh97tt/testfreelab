'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@/types'

interface TopNavProps {
  user: User
  projectName?: string
  projectId?: string
}

export default function TopNav({ user, projectName, projectId }: TopNavProps) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <header className="bg-white/70 backdrop-blur-xl sticky top-0 z-50 shadow-xl shadow-slate-200/30 flex justify-between items-center px-4 md:px-6 py-3 w-full flex-shrink-0 border-b border-white/40">
      <div className="flex items-center gap-6">
        <Link href="/projects" className="text-xl font-black font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-900 to-pink-600 tracking-tight">
          TestTree
        </Link>
        {projectName && (
          <>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-label font-bold text-on-surface-variant truncate max-w-[200px]">
              {projectName}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {projectId && (
          <div className="relative hidden md:block mr-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
            <input
              placeholder="Search test cases..."
              className="bg-surface-container-low border-none rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none w-52 transition-all"
            />
          </div>
        )}
        <div className="relative group">
          <button className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-pink-500 flex items-center justify-center text-white text-xs font-bold font-label ring-2 ring-white shadow-md">
            {initials}
          </button>
          {/* Dropdown */}
          <div className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-outline/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-container-high">
              <p className="font-bold font-headline text-sm truncate">{user.name}</p>
              <p className="text-xs text-outline truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-error hover:bg-error-container/10 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
