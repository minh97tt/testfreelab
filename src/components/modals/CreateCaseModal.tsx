'use client'
import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Field, ModalActions } from './CreateFolderModal'
import type { TestCase } from '@/types'

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const TYPES = ['E2E', 'INTEGRATION', 'API', 'UI', 'MANUAL'] as const

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  finalExpectation: z.string().min(1, 'Expected Result is required'),
  severity: z.enum(SEVERITIES),
  type: z.enum(TYPES),
  steps: z.array(z.object({
    action: z.string().min(1, 'Action is required'),
  })),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  testData: z.string().optional(),
  actualResult: z.string().optional(),
  tags: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId: string
  folderId: string
  folderOptions?: { id: string; name: string; depth: number }[]
  lockFolder?: boolean
  onClose: () => void
  onCreated: (tc: TestCase) => void
}

export default function CreateCaseModal({ projectId, folderId, folderOptions, lockFolder = false, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [targetFolderId, setTargetFolderId] = useState(folderId)

  useEffect(() => {
    setTargetFolderId(folderId)
  }, [folderId])

  const selectedFolderLabel = folderOptions?.find((f) => f.id === targetFolderId)?.name

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { severity: 'MEDIUM' as const, type: 'MANUAL' as const, steps: [] as { action: string }[] },
  })

  const { fields: steps, append: addStep, remove: removeStep } = useFieldArray({ control, name: 'steps' })

  async function onSubmit(data: FormData) {
    setLoading(true); setError('')
    try {
      const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const res = await fetch(`/api/projects/${projectId}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          folderId: targetFolderId,
          steps: data.steps.map((s, i) => ({ ...s, order: i + 1 })),
          tags,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to create'); return }
      onCreated(json.data)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="New Test Case" onClose={onClose} maxWidthClass="max-w-3xl">
      {error && <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm">{error}</div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {!!folderOptions?.length && !lockFolder && (
          <Field label="Feature / Folder Group">
            <div className="relative">
              <select
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                className="input-field appearance-none pr-10"
              >
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {`${'  '.repeat(folder.depth)}${folder.name}`}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">
                expand_more
              </span>
            </div>
          </Field>
        )}
        {lockFolder && (
          <Field label="Feature / Folder Group">
            <div className="input-field bg-surface-container-low text-on-surface">
              {selectedFolderLabel || 'Selected folder'}
            </div>
          </Field>
        )}

        <Field label="Title" error={errors.title?.message}>
          <input {...register('title')} placeholder="e.g. User login with valid credentials" className="input-field" autoFocus />
        </Field>

        <Field label="Actual Result (optional)">
          <textarea
            {...register('actualResult')}
            placeholder="Optional baseline actual result at test-case level"
            rows={3}
            className="input-field resize-y min-h-20"
          />
        </Field>

        <Field label="Expected Result" error={errors.finalExpectation?.message}>
          <textarea
            {...register('finalExpectation')}
            placeholder="E.g. Login succeeds, redirects to /dashboard, user name is visible"
            rows={4}
            className="input-field resize-y min-h-24"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Severity" error={errors.severity?.message}>
            <div className="relative">
              <select {...register('severity')} className="input-field appearance-none pr-10">
                {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">
                expand_more
              </span>
            </div>
          </Field>
          <Field label="Type" error={errors.type?.message}>
            <div className="relative">
              <select {...register('type')} className="input-field appearance-none pr-10">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">
                expand_more
              </span>
            </div>
          </Field>
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider">Steps</label>
            <button
              type="button"
              onClick={() => addStep({ action: '' })}
              className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
            >
              <span className="material-symbols-outlined text-sm">add</span> Add Step
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start bg-surface-container-low px-3 py-2 rounded-xl">
                <span className="text-sm font-label font-bold text-primary mt-2 w-5 flex-shrink-0">{index + 1}</span>
                <div className="flex-1 space-y-1.5">
                  <input
                    {...register(`steps.${index}.action`)}
                    placeholder="Action to perform"
                    className="w-full bg-white rounded-lg px-3 py-2 text-sm border border-outline-variant/20 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button type="button" onClick={() => removeStep(index)} className=" text-outline hover:text-error mt-1">
                  <span className="material-symbols-outlined text-lg!">delete</span>
                </button>
              </div>
            ))}
            {steps.length === 0 && (
              <button type="button" onClick={() => addStep({ action: '' })}
                className="w-full p-3 border-2 border-dashed border-outline-variant/30 rounded-xl text-xs text-outline hover:border-primary/30 hover:text-primary transition-all">
                + Add your first step
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-surface-container-high/60">
          <p className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-3">Optional Details</p>
          <div className="space-y-4">
            <Field label="Preconditions (optional)">
              <textarea
                {...register('preconditions')}
                placeholder={'- User account already exists\n- Server is running'}
                rows={3}
                className="input-field resize-y min-h-20"
              />
            </Field>

            <Field label="Test Data (optional)">
              <textarea
                {...register('testData')}
                placeholder={'- Email: test@gmail.com\n- Password: 123456'}
                rows={3}
                className="input-field resize-y min-h-20"
              />
            </Field>

            <Field label="Description (optional)">
              <textarea {...register('description')} placeholder="Describe what this test verifies" rows={2} className="input-field resize-none" />
            </Field>

            <Field label="Tags (comma-separated, optional)">
              <input {...register('tags')} placeholder="e.g. auth, regression, smoke" className="input-field" />
            </Field>
          </div>
        </div>

        <ModalActions onClose={onClose} loading={loading} submitLabel="Create Test Case" />
      </form>
    </Modal>
  )
}
