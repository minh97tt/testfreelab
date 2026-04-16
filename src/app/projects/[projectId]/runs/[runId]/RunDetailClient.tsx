'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { cn, statusConfig, severityConfig, runStatusConfig, formatRelativeTime } from '@/lib/utils'
import type { TestRun, RunResult, StepResult } from '@/types'
import { AnimatePresence, motion } from 'framer-motion'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Props { projectId: string; runId: string }

export default function RunDetailClient({ projectId, runId }: Props) {
  const router = useRouter()
  const { data, mutate } = useSWR<{ data: TestRun & { results: (RunResult & { testCase: { id: string; code: string; title: string; severity: string; steps: { id: string; order: number; action: string }[] } })[] } }>(
    `/api/projects/${projectId}/runs/${runId}`,
    fetcher,
    { refreshInterval: 0 }
  )

  const [activeResultId, setActiveResultId] = useState<string | null>(null)
  const [stepResults, setStepResults] = useState<Record<string, StepResult[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actualErrors, setActualErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const runStatus = data?.data?.status

  useEffect(() => {
    if (!runStatus) return
    if (runStatus !== 'QUEUED' && runStatus !== 'RUNNING') return

    const es = new EventSource(`/api/projects/${projectId}/runs/${runId}/stream`)
    const handleUpdate = () => { void mutate() }
    const handleFinal = () => {
      void mutate()
      es.close()
    }

    es.addEventListener('run-update', handleUpdate)
    es.addEventListener('final', handleFinal)
    es.onerror = () => {
      es.close()
      void mutate()
    }

    return () => {
      es.removeEventListener('run-update', handleUpdate)
      es.removeEventListener('final', handleFinal)
      es.close()
    }
  }, [mutate, projectId, runId, runStatus])

  const run = data?.data
  if (!run) {
    return <div className="flex-1 flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-outline animate-spin">refresh</span></div>
  }

  const cfg = runStatusConfig[run.status] || runStatusConfig.QUEUED
  const results = run.results || []
  const passed = results.filter(r => r.status === 'PASSED').length
  const failed = results.filter(r => r.status === 'FAILED').length
  const total = results.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const progress = total > 0 ? Math.round(((passed + failed) / total) * 100) : 0

  async function startRun() {
    await fetch(`/api/projects/${projectId}/runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RUNNING' }),
    })
    mutate()
  }

  async function cancelRun() {
    if (!confirm('Cancel this run?')) return
    await fetch(`/api/projects/${projectId}/runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    router.push(`/projects/${projectId}/runs`)
  }

  async function markResult(result: RunResult & { testCase: { steps: { id: string }[] } }, status: 'PASSED' | 'FAILED') {
    const actualResult = (notes[result.id] ?? result.notes ?? '').trim()
    if (!actualResult) {
      setActualErrors(prev => ({ ...prev, [result.id]: 'Actual Result is required' }))
      return
    }

    setActualErrors(prev => {
      if (!prev[result.id]) return prev
      const next = { ...prev }
      delete next[result.id]
      return next
    })

    setSaving(result.id)
    const sr = stepResults[result.id] || result.testCase.steps.map(s => ({
      stepId: s.id, status: status === 'PASSED' ? 'PASSED' : 'UNTESTED' as const, actual: '',
    }))
    const res = await fetch(`/api/projects/${projectId}/runs/${runId}/results/${result.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, stepResults: sr, notes: actualResult }),
    })
    if (!res.ok) {
      setActualErrors(prev => ({ ...prev, [result.id]: 'Actual Result is required' }))
      setSaving(null)
      return
    }
    setSaving(null)
    mutate()
  }

  function updateStepResult(resultId: string, stepId: string, status: StepResult['status']) {
    setStepResults(prev => {
      const existing = prev[resultId] || []
      const updated = existing.filter(s => s.stepId !== stepId)
      updated.push({ stepId, status })
      return { ...prev, [resultId]: updated }
    })
  }

  function getStepStatus(resultId: string, stepId: string): StepResult['status'] {
    return stepResults[resultId]?.find(s => s.stepId === stepId)?.status || 'UNTESTED'
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: result list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
            <div>
              <button onClick={() => router.push(`/projects/${projectId}/runs`)} className="flex items-center gap-1 text-sm text-outline hover:text-primary mb-2">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Runs
              </button>
              <h1 className="text-2xl font-black font-headline">{run.name}</h1>
              <p className="text-sm text-outline mt-1">by {run.user?.name} · {formatRelativeTime(run.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              {run.status === 'QUEUED' && (
                <button onClick={startRun} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  Start Run
                </button>
              )}
              {(run.status === 'RUNNING' || run.status === 'QUEUED') && (
                <button onClick={cancelRun} className="flex items-center gap-2 border border-error/30 text-error px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-error-container/20 transition-all">
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-outline/5">
            <div className="flex items-center justify-between mb-3">
              <span className={cn('badge', cfg.bg, cfg.text)}>{cfg.label}</span>
              <span className="text-sm font-bold font-headline text-on-surface">{progress}% complete</span>
            </div>
            <div className="h-2 bg-surface-container-high rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-600 to-pink-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-black font-headline text-emerald-600">{passed}</p>
                <p className="text-[10px] font-label uppercase tracking-wide text-outline">Passed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-headline text-pink-600">{failed}</p>
                <p className="text-[10px] font-label uppercase tracking-wide text-outline">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-headline text-slate-400">{total - passed - failed}</p>
                <p className="text-[10px] font-label uppercase tracking-wide text-outline">Pending</p>
              </div>
              <div className="text-center ml-auto">
                <p className="text-2xl font-black font-headline text-primary">{passRate}%</p>
                <p className="text-[10px] font-label uppercase tracking-wide text-outline">Pass Rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results list */}
        <div className="space-y-2">
          {results.map((result) => {
            const sta = statusConfig[result.status] || statusConfig.UNTESTED
            const sev = severityConfig[result.testCase?.severity as keyof typeof severityConfig] || severityConfig.MEDIUM
            const isActive = result.id === activeResultId
            const isDisabled = run.status === 'QUEUED' || run.status === 'CANCELLED' || run.status === 'PASSED' || run.status === 'FAILED'
            const actualValue = notes[result.id] ?? result.notes ?? ''
            const hasActualValue = actualValue.trim().length > 0

            return (
              <div
                key={result.id}
                onClick={() => !isDisabled && setActiveResultId(isActive ? null : result.id)}
                className={cn(
                  'bg-white rounded-2xl p-4 shadow-sm ring-1 ring-outline/5 transition-all',
                  !isDisabled && 'cursor-pointer hover:shadow-card hover:ring-primary/20',
                  isActive && 'ring-2 ring-primary shadow-primary/10'
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Status indicator */}
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all', sta.bg)}>
                    <span className={cn('material-symbols-outlined text-sm icon-fill', sta.text, result.status === 'FAILED' && 'animate-pulse')}>
                      {sta.icon}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-label font-bold text-outline">{result.testCase?.code}</span>
                      <span className={cn('badge', sev.bg, sev.text)}>{sev.label}</span>
                    </div>
                    <p className="text-sm font-bold font-headline truncate">{result.testCase?.title}</p>
                  </div>

                  {result.status === 'PASSED' && (
                    <span className="text-emerald-500 material-symbols-outlined icon-fill flex-shrink-0">check_circle</span>
                  )}
                  {result.status === 'FAILED' && (
                    <span className="text-pink-500 material-symbols-outlined icon-fill flex-shrink-0">cancel</span>
                  )}

                  {!isDisabled && <span className="material-symbols-outlined text-slate-200 text-sm flex-shrink-0">expand_more</span>}
                </div>

                {/* Expandable step-by-step executor */}
                <AnimatePresence>
                  {isActive && run.status === 'RUNNING' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mt-4 border-t border-surface-container-high pt-4 space-y-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {(result.testCase as { id: string; code: string; title: string; severity: string; steps: { id: string; order: number; action: string }[] })?.steps?.map((step) => {
                        const stepStatus = getStepStatus(result.id, step.id)
                        return (
                          <div key={step.id} className="flex gap-3 items-start p-3 bg-surface-container-low rounded-xl">
                            <span className="text-xs font-label font-bold text-primary mt-1 w-5 flex-shrink-0">{step.order}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{step.action}</p>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {(['PASSED', 'FAILED', 'SKIPPED'] as const).map(s => (
                                <button
                                  key={s}
                                  onClick={() => updateStepResult(result.id, step.id, s)}
                                  className={cn(
                                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all',
                                    stepStatus === s
                                      ? s === 'PASSED' ? 'bg-emerald-500 text-white' : s === 'FAILED' ? 'bg-pink-500 text-white' : 'bg-slate-400 text-white'
                                      : 'bg-white border border-outline-variant/30 text-outline hover:border-primary/30'
                                  )}
                                  title={s}
                                >
                                  <span className="material-symbols-outlined text-xs icon-fill">
                                    {s === 'PASSED' ? 'check' : s === 'FAILED' ? 'close' : 'remove'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Actual result for this execution */}
                      <div>
                        <label className="text-xs font-label font-bold text-outline uppercase tracking-wide block mb-1">
                          Actual Result <span className="text-error">*</span>
                        </label>
                        <textarea
                          value={actualValue}
                          onChange={e => {
                            const value = e.target.value
                            setNotes(prev => ({ ...prev, [result.id]: value }))
                            if (value.trim()) {
                              setActualErrors(prev => {
                                if (!prev[result.id]) return prev
                                const next = { ...prev }
                                delete next[result.id]
                                return next
                              })
                            }
                          }}
                          placeholder="Enter the actual execution result..."
                          rows={2}
                          className="w-full text-xs bg-white border border-outline-variant/20 rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                        />
                        {actualErrors[result.id] && (
                          <p className="mt-1 text-xs text-error">{actualErrors[result.id]}</p>
                        )}
                      </div>

                      {/* Submit */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => markResult(result as Parameters<typeof markResult>[0], 'PASSED')}
                          disabled={saving === result.id || !hasActualValue}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                          <span className="material-symbols-outlined text-sm icon-fill">check_circle</span>
                          Mark Passed
                        </button>
                        <button
                          onClick={() => markResult(result as Parameters<typeof markResult>[0], 'FAILED')}
                          disabled={saving === result.id || !hasActualValue}
                          className="flex-1 py-2.5 bg-pink-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                          <span className="material-symbols-outlined text-sm icon-fill">cancel</span>
                          Mark Failed
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
