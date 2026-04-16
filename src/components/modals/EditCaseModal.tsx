'use client'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal, Field } from './CreateFolderModal'
import type { Folder, TestCase } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const TYPES = ['E2E', 'INTEGRATION', 'API', 'UI', 'MANUAL'] as const

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  finalExpectation: z.string().min(1, 'Expected Result is required'),
  severity: z.enum(SEVERITIES),
  type: z.enum(TYPES),
  steps: z.array(z.object({
    id: z.string().optional(),
    action: z.string().min(1, 'Action required'),
  })),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  testData: z.string().optional(),
  actualResult: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId: string
  testCase: TestCase
  featureRootId?: string
  onClose: () => void
  onSaved: () => void
}

export default function EditCaseModal({ projectId, testCase, featureRootId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [targetFolderId, setTargetFolderId] = useState(testCase.folderId || '')

  const { data: folderData } = useSWR<{ data: { tree: Folder[] } }>(
    `/api/projects/${projectId}/folders`,
    fetcher
  )
  const folderTree = useMemo(
    () => folderData?.data?.tree || [],
    [folderData?.data?.tree]
  )
  const scopedFolderTree = useMemo(() => {
    if (!featureRootId) return folderTree
    const featureRoot = findFolderById(folderTree, featureRootId)
    return featureRoot ? [featureRoot] : []
  }, [folderTree, featureRootId])
  const folderOptions = useMemo(
    () => flattenFolderOptions(scopedFolderTree),
    [scopedFolderTree]
  )

  useEffect(() => {
    if (folderOptions.length === 0) return
    const folderStillValid = targetFolderId && folderOptions.some((folder) => folder.id === targetFolderId)
    if (folderStillValid) return
    setTargetFolderId(folderOptions[0].id)
  }, [targetFolderId, folderOptions])

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: testCase.title,
      description: testCase.description || '',
      preconditions: testCase.preconditions || '',
      testData: testCase.testData || '',
      actualResult: testCase.actualResult || '',
      finalExpectation: testCase.finalExpectation || '',
      severity: testCase.severity,
      type: testCase.type,
      steps: (testCase.steps || []).map(s => ({ id: s.id, action: s.action })),
    },
  })

  const { fields: steps, append: addStep, remove: removeStep } = useFieldArray({ control, name: 'steps' })

  async function onSubmit(data: FormData) {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/cases/${testCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          folderId: targetFolderId,
          steps: data.steps.map((s, i) => ({ ...s, order: i + 1 })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to save'); return }
      onSaved()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function archiveCase() {
    await fetch(`/api/projects/${projectId}/cases/${testCase.id}`, {
      method: 'DELETE',
    })
    onSaved()
  }

  return (
    <Modal title={`Edit ${testCase.code}`} onClose={onClose} maxWidthClass="max-w-3xl">
      {error && <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm">{error}</div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {!!folderOptions.length && (
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

        <Field label="Title" error={errors.title?.message}>
          <input {...register('title')} className="input-field" />
        </Field>
        <Field label="Actual Result (optional)">
          <textarea
            {...register('actualResult')}
            rows={3}
            className="input-field resize-y min-h-20"
          />
        </Field>
        <Field label="Expected Result" error={errors.finalExpectation?.message}>
          <textarea
            {...register('finalExpectation')}
            rows={4}
            className="input-field resize-y min-h-24"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Severity">
            <div className="relative">
              <select {...register('severity')} className="input-field appearance-none pr-10">
                {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0)+s.slice(1).toLowerCase()}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">
                expand_more
              </span>
            </div>
          </Field>
          <Field label="Type">
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
              <button
                type="button"
                onClick={() => addStep({ action: '' })}
                className="w-full p-3 border-2 border-dashed border-outline-variant/30 rounded-xl text-xs text-outline hover:border-primary/30 hover:text-primary transition-all"
              >
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
                rows={3}
                className="input-field resize-y min-h-20"
              />
            </Field>
            <Field label="Test Data (optional)">
              <textarea
                {...register('testData')}
                rows={3}
                className="input-field resize-y min-h-20"
              />
            </Field>
            <Field label="Description (optional)">
              <textarea {...register('description')} rows={2} className="input-field resize-none" />
            </Field>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 -mx-8 px-8 py-4 bg-white/95 backdrop-blur border-t border-slate-100 flex gap-3">
          <button type="button" onClick={archiveCase} className="px-4 py-3 rounded-xl border border-error/30 text-error text-sm font-bold hover:bg-error-container/20 transition-all">
            Archive
          </button>
          <div className="flex-1 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" disabled={loading || !targetFolderId} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-60">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function flattenFolderOptions(folders: Folder[], depth = 0): { id: string; name: string; depth: number }[] {
  const options: { id: string; name: string; depth: number }[] = []
  for (const folder of folders) {
    options.push({ id: folder.id, name: folder.name, depth })
    if (folder.children?.length) {
      options.push(...flattenFolderOptions(folder.children, depth + 1))
    }
  }
  return options
}

function findFolderById(folders: Folder[], id: string): Folder | null {
  for (const folder of folders) {
    if (folder.id === id) return folder
    const found = findFolderById(folder.children || [], id)
    if (found) return found
  }
  return null
}
