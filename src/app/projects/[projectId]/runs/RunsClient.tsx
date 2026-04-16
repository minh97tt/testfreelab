'use client'
import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { cn, runStatusConfig, formatRelativeTime, formatDuration } from '@/lib/utils'
import type { TestRun } from '@/types'
import CreateRunModal from '@/components/modals/CreateRunModal'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Props { projectId: string }

export default function RunsClient({ projectId }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '10',
  })
  if (dateFrom) query.set('dateFrom', dateFrom)
  if (dateTo) query.set('dateTo', dateTo)

  const { data, mutate } = useSWR<{ data: TestRun[]; total: number; totalPages: number }>(
    `/api/projects/${projectId}/runs?${query.toString()}`,
    fetcher,
    { refreshInterval: 5000 }
  )

  const runs = data?.data || []
  const total = data?.total || 0

  // Stats
  const passed = runs.filter(r => r.status === 'PASSED').length
  const failed = runs.filter(r => r.status === 'FAILED').length
  const running = runs.filter(r => r.status === 'RUNNING').length

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-6 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black font-headline tracking-tighter text-primary mb-1">Test Runs</h1>
          <p className="text-outline font-medium">{total} run{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-xl font-bold text-sm shadow-primary hover:opacity-90 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined">play_arrow</span>
          Start New Run
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Runs', value: total, color: 'text-primary', icon: 'play_circle' },
          { label: 'Passed', value: passed, color: 'text-emerald-600', icon: 'check_circle' },
          { label: 'Failed', value: failed, color: 'text-pink-600', icon: 'cancel' },
          { label: 'Running', value: running, color: 'text-amber-600', icon: 'pending' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-outline/5">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('material-symbols-outlined text-lg', stat.color)}>{stat.icon}</span>
              <p className="text-[11px] font-label font-black uppercase tracking-wider text-outline">{stat.label}</p>
            </div>
            <p className={cn('text-3xl font-black font-headline', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-label font-black uppercase tracking-[0.2em] text-outline mb-1.5">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="block text-[10px] font-label font-black uppercase tracking-[0.2em] text-outline mb-1.5">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
          className="h-10 px-3.5 rounded-xl border border-surface-container-high text-sm font-bold text-outline hover:bg-white transition-all"
        >
          Clear
        </button>
      </div>

      {/* Runs table */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-outline/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between">
          <h2 className="font-black font-headline text-lg">All Runs</h2>
          <button onClick={() => mutate()} className="p-2 text-outline hover:text-primary transition-colors rounded-lg hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-lg">refresh</span>
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="py-16 text-center text-outline">
            <span className="material-symbols-outlined text-5xl block mb-3">play_circle</span>
            <p className="font-headline font-bold text-lg mb-1">No runs yet</p>
            <p className="text-sm">Start a run to track test execution results.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-container-high/40">
            {runs.map(run => {
              const cfg = runStatusConfig[run.status] || runStatusConfig.QUEUED
              const passRate = run.passRate || 0
              return (
                <Link
                  key={run.id}
                  href={`/projects/${projectId}/runs/${run.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-surface-container-low transition-colors"
                >
                  {/* Status icon */}
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bg)}>
                    <span className={cn('material-symbols-outlined icon-fill', cfg.text, run.status === 'RUNNING' && 'animate-pulse')}>
                      {cfg.icon}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-sm text-on-surface">{run.name}</p>
                    <p className="text-xs text-outline mt-0.5">
                      {run.user?.name && `by ${run.user.name} · `}
                      {formatRelativeTime(run.createdAt)}
                      {run._count && ` · ${run._count.results} cases`}
                    </p>
                  </div>

                  {/* Pass rate bar */}
                  {passRate > 0 && (
                    <div className="hidden md:block w-24">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-label font-bold text-outline">{passRate}%</span>
                      </div>
                      <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status badge */}
                  <span className={cn('badge flex-shrink-0', cfg.bg, cfg.text)}>
                    {cfg.label}
                  </span>

                  {/* Duration */}
                  {run.startedAt && run.endedAt && (
                    <span className="text-xs text-outline font-label hidden lg:block flex-shrink-0">
                      {formatDuration(new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime())}
                    </span>
                  )}

                  <span className="material-symbols-outlined text-slate-200 flex-shrink-0">chevron_right</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {(data?.totalPages || 0) > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {Array.from({ length: data!.totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={cn('w-9 h-9 rounded-xl text-sm font-bold transition-all',
                page === p ? 'bg-primary text-white shadow-primary' : 'hover:bg-white text-outline')}>
              {p}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRunModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); mutate() }}
        />
      )}
    </div>
  )
}
