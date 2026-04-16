'use client'
import useSWR from 'swr'
import { cn, severityConfig, statusConfig } from '@/lib/utils'
import type { TestCase } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function ArchiveClient({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<{ data: TestCase[] }>(
    `/api/projects/${projectId}/cases?archived=true&pageSize=100`,
    fetcher
  )

  async function restore(id: string) {
    await fetch(`/api/projects/${projectId}/cases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    mutate()
  }

  const cases = data?.data || []

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
      <h1 className="text-4xl font-black font-headline tracking-tighter text-primary mb-2">Archive</h1>
      <p className="text-outline mb-8">Archived test cases — restore them to make them active again.</p>
      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-outline text-center">
          <span className="material-symbols-outlined text-5xl mb-3">archive</span>
          <p className="font-headline font-bold text-lg mb-1">Archive is empty</p>
          <p className="text-sm">Archived test cases will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-outline/5 divide-y divide-surface-container-high/40">
          {cases.map(tc => {
            const sev = severityConfig[tc.severity]
            const sta = statusConfig[tc.status]
            return (
              <div key={tc.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-label font-bold text-outline">{tc.code}</span>
                    <span className={cn('badge', sev.bg, sev.text)}>{sev.label}</span>
                  </div>
                  <p className="text-sm font-bold font-headline">{tc.title}</p>
                </div>
                <span className={cn('badge', sta.bg, sta.text)}>{sta.label}</span>
                <button
                  onClick={() => restore(tc.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary-fixed text-primary rounded-xl text-xs font-bold hover:bg-primary/10 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">restore</span>
                  Restore
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
