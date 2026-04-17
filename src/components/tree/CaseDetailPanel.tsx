'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { cn, statusConfig, severityConfig, formatRelativeTime, formatDateTime } from '@/lib/utils'
import type { TestCase, RunResult } from '@/types'
import EditCaseModal from '@/components/modals/EditCaseModal'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface CaseDetailPanelProps {
  projectId: string
  caseId: string
  featureRootId?: string
  readOnly?: boolean
  dataUrl?: string
  onClose: () => void
  onUpdate: () => void
}

export default function CaseDetailPanel({
  projectId,
  caseId,
  featureRootId,
  readOnly = false,
  dataUrl,
  onClose,
  onUpdate,
}: CaseDetailPanelProps) {
  const { data, mutate } = useSWR<{ data: TestCase & { results: RunResult[] } }>(
    dataUrl || `/api/projects/${projectId}/cases/${caseId}`,
    fetcher
  )
  const [showEditModal, setShowEditModal] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<TestCase['status'] | null>(null)
  const [statusError, setStatusError] = useState('')

  const tc = data?.data
  if (!tc) {
    return (
      <div className="w-full h-full bg-white border-l border-slate-100 flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-outline animate-spin">refresh</span>
      </div>
    )
  }

  const sev = severityConfig[tc.severity] || severityConfig.MEDIUM
  const sta = statusConfig[tc.status] || statusConfig.UNTESTED

  // Last 7 results for history chart
  const history = (tc.results || []).slice(0, 7).reverse()
  const lastExecuted = (tc.results || []).find(
    (result) => result.status === 'PASSED' || result.status === 'FAILED' || result.status === 'BLOCKED'
  )?.executedAt

  async function updateStatus(status: TestCase['status']) {
    if (readOnly || updatingStatus) return
    setUpdatingStatus(status)
    setStatusError('')

    try {
      const res = await fetch(`/api/projects/${projectId}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusError(json.error || 'Unable to update status')
        return
      }

      await mutate()
      onUpdate()
    } catch {
      setStatusError('Unable to update status')
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function duplicateCase() {
    if (readOnly || duplicating) return
    setDuplicating(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/cases/${caseId}/duplicate`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        window.alert(json.error || 'Unable to duplicate test case')
        return
      }

      onUpdate()
      onClose()
    } catch {
      window.alert('Unable to duplicate test case')
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className="h-full bg-white border-l border-slate-100 shadow-panel flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-50 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0 mr-3">
            <span className="text-[10px] font-label text-outline font-bold tracking-widest uppercase block mb-1">Test Case Details</span>
            <h2 className="text-lg font-black font-headline text-on-surface leading-snug">
              {tc.code}: {tc.title}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={cn('badge', sta.bg, sta.text)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', sta.dot, tc.status === 'FAILED' && 'animate-pulse')} />
            {sta.label}
          </span>
          <span className={cn('badge', sev.bg, sev.text)}>{sev.label}</span>
          {tc.folder && (
            <span className="badge bg-violet-50 text-violet-700">
              <span className="material-symbols-outlined text-xs">folder</span>
              {tc.folder.name}
            </span>
          )}
        </div>

        {tc.description && (
          <p className="text-sm text-outline leading-relaxed">{tc.description}</p>
        )}

        {tc.preconditions && (
          <div className="mt-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <p className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-1.5">Preconditions</p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{tc.preconditions}</p>
          </div>
        )}

        {tc.testData && (
          <div className="mt-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <p className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-1.5">Test Data</p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{tc.testData}</p>
          </div>
        )}

        {tc.finalExpectation && (
          <div className="mt-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <p className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-1.5">Expected Result</p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{tc.finalExpectation}</p>
          </div>
        )}

        {tc.actualResult && (
          <div className="mt-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <p className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-1.5">Actual Result</p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{tc.actualResult}</p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">

        {/* Steps */}
        {tc.steps && tc.steps.length > 0 && (
          <div>
            <h6 className="text-[11px] font-label font-bold text-outline uppercase tracking-wider mb-3">
              Execution Steps ({tc.steps.length})
            </h6>
            <ol className="space-y-2">
              {tc.steps.map((step, i) => (
                <li key={step.id} className="flex gap-3 p-3 bg-surface-container-low rounded-xl">
                  <span className="font-label font-bold text-primary text-xs w-5 flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Tags */}
        {tc.tags && tc.tags.length > 0 && (
          <div>
            <h6 className="text-[11px] font-label font-bold text-outline uppercase tracking-wider mb-2">Tags</h6>
            <div className="flex flex-wrap gap-1.5">
              {tc.tags.map(({ tag }) => (
                <span key={tag.id} className="badge bg-surface-container text-outline">{tag.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* History chart */}
        {history.length > 0 && (
          <div>
            <h6 className="text-[11px] font-label font-bold text-outline uppercase tracking-wider mb-3">
              Execution History ({history.length} runs)
            </h6>
            <div className="flex items-end gap-1.5 h-14 bg-slate-50 p-2.5 rounded-xl">
              {history.map((r) => (
                <div
                  key={r.id}
                  title={`${r.status} — ${formatRelativeTime(r.executedAt)}`}
                  className={cn('flex-1 rounded-t-sm transition-all', r.status === 'PASSED' ? 'bg-emerald-400' : r.status === 'FAILED' ? 'bg-pink-400' : 'bg-slate-300')}
                  style={{ height: `${r.status === 'PASSED' ? 85 : r.status === 'FAILED' ? 100 : 50}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1 px-1">
              <span className="text-[10px] text-outline font-label">Oldest</span>
              <span className="text-[10px] text-outline font-label">Latest</span>
            </div>
          </div>
        )}

        {!readOnly && (
          <div>
            <h6 className="text-[11px] font-label font-bold text-outline uppercase tracking-wider mb-2">Quick Update</h6>
            <div className="grid grid-cols-2 gap-2">
              {(['PASSED', 'FAILED', 'BLOCKED', 'UNTESTED'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void updateStatus(s)}
                  disabled={Boolean(updatingStatus)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:cursor-wait disabled:opacity-70',
                    tc.status === s
                      ? `${statusConfig[s].bg} ${statusConfig[s].text} ring-1 ring-offset-1 ring-current`
                      : 'bg-surface-container-low text-outline border-transparent hover:border-outline/15 hover:bg-surface-container'
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', statusConfig[s].dot, updatingStatus === s && 'animate-pulse')} />
                  {updatingStatus === s ? 'Updating...' : statusConfig[s].label}
                </button>
              ))}
            </div>
            {statusError && (
              <p className="mt-2 text-xs font-semibold text-error">{statusError}</p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div>
          <h6 className="text-[11px] font-label font-bold text-outline uppercase tracking-wider mb-2">Timeline</h6>
          <div className="bg-surface-container-low rounded-xl p-3 space-y-1.5">
            <p className="text-xs text-outline">
              Created: <span className="font-semibold text-on-surface">{formatDateTime(tc.createdAt)}</span>
            </p>
            <p className="text-xs text-outline">
              Modified: <span className="font-semibold text-on-surface">{formatDateTime(tc.updatedAt)}</span>
            </p>
            <p className="text-xs text-outline">
              Executed: <span className="font-semibold text-on-surface">{lastExecuted ? formatDateTime(lastExecuted) : 'Not executed yet'}</span>
            </p>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="p-5 flex-shrink-0 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-white text-slate-700 py-2.5 rounded-xl text-sm font-bold border border-slate-300 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void duplicateCase()}
              disabled={duplicating}
              className="bg-white text-primary py-2.5 rounded-xl text-sm font-bold border border-primary/25 hover:bg-primary-fixed/20 transition-all disabled:opacity-50"
            >
              {duplicating ? 'Duplicating...' : 'Duplicate'}
            </button>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="bg-primary text-white py-2.5 rounded-xl text-sm font-bold shadow-primary hover:opacity-90 transition-all"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {!readOnly && showEditModal && (
        <EditCaseModal
          projectId={projectId}
          testCase={tc}
          featureRootId={featureRootId}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false)
            mutate()
            onUpdate()
          }}
        />
      )}
    </div>
  )
}
