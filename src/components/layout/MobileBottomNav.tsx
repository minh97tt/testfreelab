'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  projectId: string
}

const NAV_ITEMS = [
  { href: 'tree',  label: 'Tree',      icon: 'account_tree' },
  { href: 'list',  label: 'List',      icon: 'list_alt' },
  { href: 'runs',  label: 'Runs',      icon: 'play_circle' },
]

export default function MobileBottomNav({ projectId }: MobileNavProps) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-white/80 backdrop-blur-2xl rounded-t-2xl z-50 shadow-[0_-4px_40px_rgba(30,39,52,0.08)] border-t border-slate-100/60">
      {NAV_ITEMS.map(item => {
        const href = `${base}/${item.href}`
        const active = pathname.startsWith(href)
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all duration-200 active:scale-95',
              active
                ? 'bg-gradient-to-tr from-violet-900 to-violet-700 text-white shadow-md scale-105'
                : 'text-slate-500 hover:text-violet-600'
            )}
          >
            <span className={cn('material-symbols-outlined', active && 'icon-fill')}>{item.icon}</span>
            <span className="text-[10px] font-label mt-0.5">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
