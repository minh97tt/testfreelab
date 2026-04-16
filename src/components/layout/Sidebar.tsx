'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarProps {
  projectId: string
  projectName: string
  version: string
}

const NAV_ITEMS = [
  { href: 'tree',  label: 'Tree View',  icon: 'account_tree' },
  { href: 'list',  label: 'List View',  icon: 'list_alt' },
  { href: 'runs',  label: 'Runs',       icon: 'play_circle' },
]

const BOTTOM_ITEMS = [
  { href: 'archive', label: 'Archive', icon: 'archive' },
  { href: 'trash',   label: 'Trash',   icon: 'delete' },
]

export default function Sidebar({ projectId, projectName, version }: SidebarProps) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`

  return (
    <aside className="hidden md:flex bg-slate-50/80 h-full w-60 flex-shrink-0 flex-col p-4 gap-1 border-r border-slate-100/60 overflow-y-auto scrollbar-thin">
      {/* Project header */}
      <div className="mb-6 px-2 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-pink-500 flex items-center justify-center text-white shadow-primary/30 shadow-md">
            <span className="material-symbols-outlined text-sm icon-fill">account_tree</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black font-headline text-on-surface truncate">{projectName}</p>
            <p className="text-[10px] text-outline font-label tracking-widest uppercase">{version}</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map(item => {
          const href = `${base}/${item.href}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                active
                  ? 'nav-link-active font-bold'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:translate-x-0.5'
              )}
            >
              <span className={cn('material-symbols-outlined', active && 'icon-fill')}>{item.icon}</span>
              <span className="font-body">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* New test case button */}
      <Link
        href={`${base}/list?action=new`}
        className="flex items-center justify-center gap-2 bg-primary text-white py-3 px-4 rounded-xl font-bold text-sm shadow-primary hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 my-2"
      >
        <span className="material-symbols-outlined">add</span>
        New Test Case
      </Link>

      {/* Bottom items */}
      <div className="pt-3 border-t border-slate-200/60 flex flex-col gap-0.5">
        {BOTTOM_ITEMS.map(item => (
          <Link
            key={item.href}
            href={`${base}/${item.href}`}
            className="flex items-center gap-3 px-4 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-200/60 transition-all"
          >
            <span className="material-symbols-outlined text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  )
}
