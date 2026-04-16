'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Folder } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Folder name is required'),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId: string
  parentId: string | null
  onClose: () => void
  onCreated: (folder: Folder) => void
}

export default function CreateFolderModal({ projectId, parentId, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isFeatureMode = parentId === null

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, parentId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed'); return }
      onCreated(json.data as Folder)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title={isFeatureMode ? 'New Feature' : 'New Folder'} onClose={onClose}>
      {error && <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm">{error}</div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={isFeatureMode ? 'Feature Name' : 'Folder Name'} error={errors.name?.message}>
          <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-violet-500">folder</span>
            <input
              {...register('name')}
              placeholder={isFeatureMode ? 'e.g. Quotation' : 'e.g. Header Cases'}
              className="flex-1 bg-transparent text-sm outline-none"
              autoFocus
            />
          </div>
        </Field>
        <Field label="Description (optional)">
          <textarea
            {...register('description')}
            placeholder={isFeatureMode ? 'Describe this feature' : "What's in this folder?"}
            rows={2}
            className="input-field resize-none"
          />
        </Field>
        <ModalActions onClose={onClose} loading={loading} submitLabel={isFeatureMode ? 'Create Feature' : 'Create Folder'} />
      </form>
    </Modal>
  )
}

// ── Shared modal primitives ───────────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  maxWidthClass = 'max-w-md',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidthClass?: string
}) {
  return (
    <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${maxWidthClass} animate-fade-in max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-white flex-shrink-0">
          <h2 className="text-xl font-black font-headline text-on-surface">{title}</h2>
          <button onClick={onClose} className="size-7 items-center hover:bg-slate-50 rounded-full"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-8 pt-6">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  )
}

export function ModalActions({ onClose, loading, submitLabel }: { onClose: () => void; loading: boolean; submitLabel: string }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-8 px-8 py-4 bg-white/95 backdrop-blur border-t border-slate-100 flex gap-3">
      <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">Cancel</button>
      <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-60">
        {loading ? 'Saving...' : submitLabel}
      </button>
    </div>
  )
}
