'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Field, ModalActions } from './CreateFolderModal'
import { cn, severityConfig, statusConfig } from '@/lib/utils'
import type { TestCase, Folder } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const schema = z.object({
  name: z.string().min(1, 'Run name is required'),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId: string
  preselectedCaseIds?: string[]
  onClose: () => void
  onCreated: () => void
}

export default function CreateRunModal({ projectId, preselectedCaseIds = [], onClose, onCreated }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedCaseIds))
  const [q, setQ] = useState('')
  const [folderFilter, setFolderFilter] = useState('all')

  const { data } = useSWR<{ data: TestCase[] }>(
    `/api/projects/${projectId}/cases?pageSize=100`,
    fetcher
  )

  const { data: folderData } = useSWR<{ data: { tree: Folder[] } }>(
    `/api/projects/${projectId}/folders`,
    fetcher
  )

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: `Run #${Date.now().toString().slice(-6)}` },
  })

  const allFolders = flattenFolders(folderData?.data?.tree || [])
  const folderScopedCases = (data?.data || []).filter((tc) => {
    if (folderFilter === 'all') return true
    if (folderFilter === 'root') return !tc.folderId
    return tc.folderId === folderFilter
  })

  const cases = folderScopedCases.filter(tc =>
    !q || tc.title.toLowerCase().includes(q.toLowerCase()) || tc.code.toLowerCase().includes(q.toLowerCase())
  )

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() { setSelectedIds(new Set(cases.map(c => c.id))) }
  function clearAll() { setSelectedIds(new Set()) }

  async function onSubmit(data: FormData) {
    if (selectedIds.size === 0) { setError('Select at least one test case'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, caseIds: Array.from(selectedIds) }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed'); return }
      onCreated()
      router.push(`/projects/${projectId}/runs/${json.data.id}`)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Start New Run" onClose={onClose}>
      {error && <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm">{error}</div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Field label="Run Name" error={errors.name?.message}>
          <input {...register('name')} className="input-field" />
        </Field>

        {/* Case selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Test Cases ({selectedIds.size} selected)
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs font-bold text-primary hover:underline">All</button>
              <span className="text-outline">·</span>
              <button type="button" onClick={clearAll} className="text-xs font-bold text-outline hover:underline">None</button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter cases..." className="w-full pl-9 pr-3 py-2 bg-surface-container-low rounded-xl text-sm outline-none" />
          </div>

          <div className="relative mb-2">
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="w-full appearance-none bg-surface-container-low rounded-xl text-sm outline-none py-2 pl-3 pr-10 font-bold"
            >
              <option value="all">All folders</option>
              <option value="root">Root (no folder)</option>
              {allFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-sm pointer-events-none">expand_more</span>
          </div>

          <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-xl border border-outline-variant/20 divide-y divide-outline-variant/10">
            {cases.length === 0 && (
              <div className="p-4 text-center text-sm text-outline">No test cases found</div>
            )}
            {cases.map(tc => {
              const sev = severityConfig[tc.severity]
              const sta = statusConfig[tc.status]
              const checked = selectedIds.has(tc.id)
              return (
                <label key={tc.id} className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-container-low transition-colors', checked && 'bg-primary-fixed/30')}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(tc.id)} className="accent-primary w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-label text-outline font-bold">{tc.code}</span>
                      <span className={cn('badge', sev.bg, sev.text)}>{sev.label}</span>
                    </div>
                    <p className="text-sm truncate font-medium">{tc.title}</p>
                  </div>
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', sta.dot)} />
                </label>
              )
            })}
          </div>
        </div>

        <ModalActions onClose={onClose} loading={loading} submitLabel={`Start Run (${selectedIds.size} cases)`} />
      </form>
    </Modal>
  )
}

function flattenFolders(folders: Folder[]): Folder[] {
  const result: Folder[] = []
  function walk(folder: Folder) {
    result.push(folder)
    if (folder.children) folder.children.forEach(walk)
  }
  folders.forEach(walk)
  return result
}
