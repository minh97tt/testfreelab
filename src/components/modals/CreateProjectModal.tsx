'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props { variant?: 'primary' | 'outline' }

export default function CreateProjectModal({ variant = 'outline' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData, unknown, FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { version: '1.0.0' },
  })

  async function onSubmit(data: FormData) {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to create project'); return }
      reset(); setOpen(false)
      router.push(`/projects/${json.data.id}/tree`)
      router.refresh()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === 'primary'
          ? 'flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-primary hover:opacity-90 active:scale-95 transition-all'
          : 'flex items-center gap-2 bg-white text-primary border border-primary/30 px-5 py-2.5 rounded-xl font-bold text-sm hover:border-primary/60 transition-all shadow-sm hover:shadow-md'
        }
      >
        <span className="material-symbols-outlined">add</span>
        New Project
      </button>

      {open && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black font-headline text-on-surface">New Project</h2>
              <button onClick={() => setOpen(false)} className="p-2 hover:bg-slate-50 rounded-full"><span className="material-symbols-outlined text-outline">close</span></button>
            </div>
            {error && <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm">{error}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field label="Project Name" error={errors.name?.message}>
                <input {...register('name')} placeholder="e.g. Auth Service Tests" className="input-field" />
              </Field>
              <Field label="Version" error={errors.version?.message}>
                <input {...register('version')} placeholder="1.0.0" className="input-field" />
              </Field>
              <Field label="Description (optional)">
                <textarea {...register('description')} placeholder="What does this project test?" rows={3} className="input-field resize-none" />
              </Field>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-60">
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  )
}
