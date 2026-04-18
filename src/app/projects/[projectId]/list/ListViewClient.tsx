'use client'
import { Fragment, useState, useEffect, useRef, type ChangeEvent } from 'react'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { cn, severityConfig, statusConfig, formatRelativeTime } from '@/lib/utils'
import type { TestCase, CaseFilters, Folder } from '@/types'
import CreateCaseModal from '@/components/modals/CreateCaseModal'
import EditCaseModal from '@/components/modals/EditCaseModal'
import CreateFolderModal from '@/components/modals/CreateFolderModal'
import CaseDetailPanel from '@/components/tree/CaseDetailPanel'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SEVERITIES = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const STATUSES = ['', 'PASSED', 'FAILED', 'BLOCKED', 'UNTESTED'] as const
const PAGE_SIZE = 20
type SortField = 'code' | 'title' | 'severity' | 'status' | 'updatedAt'
type ExcelImportSummary = {
  createdCases: number
  deletedCases: number
  createdFolders: string[]
  skippedCases: number
  totalExtracted: number
  skipped: { sheet: string; reason: string }[]
  sheets: { sheet: string; total: number; importable: number }[]
}

interface Props { projectId: string }

export default function ListViewClient({ projectId }: Props) {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<CaseFilters>({
    q: '', severity: '', status: '', folderId: '', sortBy: 'code', sortDir: 'asc', page: 1, pageSize: PAGE_SIZE,
  })
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null)
  const [showCreate, setShowCreate] = useState(searchParams.get('action') === 'new')
  const [editCase, setEditCase] = useState<TestCase | null>(null)
  const [showCreateFeature, setShowCreateFeature] = useState(false)
  const [duplicatingCaseId, setDuplicatingCaseId] = useState<string | null>(null)
  const [importingExcel, setImportingExcel] = useState(false)
  const [importSummary, setImportSummary] = useState<ExcelImportSummary | null>(null)
  const [importError, setImportError] = useState('')
  const excelInputRef = useRef<HTMLInputElement | null>(null)

  // Build query string
  const qs = Object.entries(filters)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

  const shouldLoadCases = Boolean(filters.folderId)
  const { data, mutate } = useSWR<{ data: TestCase[]; total: number; totalPages: number }>(
    shouldLoadCases ? `/api/projects/${projectId}/cases?${qs}` : null,
    fetcher,
    { keepPreviousData: true }
  )

  const { data: folderData, mutate: mutateFolders } = useSWR<{ data: { tree: Folder[]; rootCases: TestCase[] } }>(
    `/api/projects/${projectId}/folders`,
    fetcher
  )

  // Debounced search
  const [rawQ, setRawQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, q: rawQ, page: 1 })), 300)
    return () => clearTimeout(t)
  }, [rawQ])
  useEffect(() => {
    if (!filters.folderId) {
      setSelectedCase(null)
      setEditCase(null)
      setShowCreate(false)
    }
  }, [filters.folderId])

  function setFilter<K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) {
    setFilters(f => ({ ...f, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }))
  }

  function toggleSort(field: SortField) {
    setFilters(prev => {
      const isSameField = prev.sortBy === field
      return {
        ...prev,
        sortBy: field,
        sortDir: isSameField && prev.sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      }
    })
  }

  function getSortIcon(field: SortField) {
    if (filters.sortBy !== field) return 'unfold_more'
    return filters.sortDir === 'asc' ? 'north' : 'south'
  }

  const cases = data?.data || []
  const groupedCases = groupCasesByFeature(cases)
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  const featureTree = folderData?.data?.tree || []
  const featureOptions = featureTree.map((folder) => ({ id: folder.id, name: folder.name }))
  const selectedFeature = filters.folderId ? findFolderById(featureTree, filters.folderId) : null
  const createFolderOptions = selectedFeature ? flattenFolderOptions([selectedFeature]) : []

  function exportCSV() {
    const headers = ['Code', 'Title', 'Folder', 'Severity', 'Type', 'Status', 'Created']
    const rows = cases.map(tc => [
      tc.code, tc.title, tc.folder?.name || '', tc.severity, tc.type, tc.status,
      new Date(tc.createdAt).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'test-cases.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function duplicateCase(testCase: TestCase) {
    if (duplicatingCaseId) return
    setDuplicatingCaseId(testCase.id)

    try {
      const res = await fetch(`/api/projects/${projectId}/cases/${testCase.id}/duplicate`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        window.alert(json.error || 'Unable to duplicate test case')
        return
      }

      setSelectedCase(null)
      void mutate()
    } catch {
      window.alert('Unable to duplicate test case')
    } finally {
      setDuplicatingCaseId(null)
    }
  }

  async function handleExcelImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || importingExcel) return

    setImportingExcel(true)
    setImportError('')
    setImportSummary(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('replace', 'true')
      formData.append('rootFolderName', 'Quotation')

      const res = await fetch(`/api/projects/${projectId}/imports/excel`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setImportError(json.error || 'Unable to import Excel file')
        return
      }

      setImportSummary(json.data)
      setFilters(f => ({ ...f, page: 1 }))
      void mutate()
      void mutateFolders()
    } catch {
      setImportError('Unable to import Excel file')
    } finally {
      setImportingExcel(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 md:p-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-black font-headline tracking-tighter text-primary mb-1">Repository Matrix</h1>
            <p className="text-outline font-medium">
              {shouldLoadCases ? `${total} test case${total !== 1 ? 's' : ''} found` : 'Select a feature to load test cases'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleExcelImport}
            />
            <button
              onClick={() => excelInputRef.current?.click()}
              disabled={importingExcel}
              className="flex items-center gap-2 bg-white text-primary border border-outline/20 hover:border-primary/40 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Import Excel and replace matching Quotation sheet folders"
            >
              <span className={cn('material-symbols-outlined text-lg', importingExcel && 'animate-pulse')}>upload_file</span>
              {importingExcel ? 'Importing...' : 'Import excel'}
            </button>
            <button
              onClick={() => setShowCreateFeature(true)}
              className="flex items-center gap-2 bg-white text-primary border border-outline/20 hover:border-primary/40 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-lg">create_new_folder</span>
              New Feature
            </button>
            <button
              disabled={!filters.folderId}
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-xl font-bold text-sm shadow-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">add</span>
              New Test Case
            </button>
          </div>
        </div>

        {(importingExcel || importSummary || importError) && (
          <div className={cn(
            'mb-6 flex items-start justify-between gap-4 rounded-xl px-4 py-3 ring-1',
            importError
              ? 'bg-red-50 text-red-700 ring-red-100'
              : 'bg-emerald-50 text-emerald-800 ring-emerald-100'
          )}>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-lg mt-0.5">
                {importError ? 'error' : importingExcel ? 'hourglass_empty' : 'check_circle'}
              </span>
              <div>
                <p className="text-sm font-black">
                  {importError ? 'Import failed' : importingExcel ? 'Importing Excel...' : 'Excel imported'}
                </p>
                {importError && <p className="text-sm mt-0.5">{importError}</p>}
                {importSummary && (
                  <p className="text-sm mt-0.5">
                    Created {importSummary.createdCases} test cases
                    {importSummary.deletedCases > 0 ? `, replaced ${importSummary.deletedCases}` : ''}
                    {importSummary.createdFolders.length > 0 ? `, added ${importSummary.createdFolders.length} folders` : ''}.
                    {importSummary.skipped.length > 0 ? ` Skipped ${importSummary.skipped.length} sheets.` : ''}
                  </p>
                )}
              </div>
            </div>
            {!importingExcel && (
              <button
                type="button"
                onClick={() => { setImportSummary(null); setImportError('') }}
                className="rounded-lg p-1 hover:bg-white/60 transition-colors"
                aria-label="Dismiss import message"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
            <input
              value={rawQ}
              onChange={e => setRawQ(e.target.value)}
              placeholder="Search test cases..."
              className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          {/* Feature filter */}
          <div className="relative">
            <select
              value={filters.folderId}
              onChange={e => setFilter('folderId', e.target.value)}
              className="appearance-none bg-surface-container-low border-none rounded-xl px-4 py-2.5 pr-10 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">Select Feature (Required)</option>
              {featureOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">expand_more</span>
          </div>

          {/* Severity */}
          <div className="relative">
            <select
              value={filters.severity}
              onChange={e => setFilter('severity', e.target.value as CaseFilters['severity'])}
              className="appearance-none bg-surface-container-low border-none rounded-xl px-4 py-2.5 pr-10 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {SEVERITIES.map(s => <option key={s} value={s}>{s || 'Severity: All'}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">expand_more</span>
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={filters.status}
              onChange={e => setFilter('status', e.target.value as CaseFilters['status'])}
              className="appearance-none bg-surface-container-low border-none rounded-xl px-4 py-2.5 pr-10 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s ? statusConfig[s as keyof typeof statusConfig].label : 'Status: All'}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-sm">expand_more</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={!filters.folderId}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-primary px-3 py-2.5 rounded-xl hover:bg-surface-container-low transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">download</span>
              Export CSV
            </button>
          </div>
        </div>

        {!filters.folderId && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-outline/5 p-10 text-center">
            <span className="material-symbols-outlined text-5xl text-outline block mb-3">folder_open</span>
            <p className="text-lg font-bold text-on-surface mb-1">Please choose a feature first</p>
            <p className="text-sm text-outline">
              Test cases are locked until a feature is selected.
            </p>
          </div>
        )}

        {filters.folderId && (
          <>
            {selectedFeature && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-xl bg-primary-fixed text-on-primary-fixed-variant px-3 py-2 text-xs font-bold">
                <span className="material-symbols-outlined text-sm">filter_alt</span>
                Feature: {selectedFeature.name}
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-outline/5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 border-b border-surface-container-high">
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline">
                  <button type="button" onClick={() => toggleSort('code')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                    ID
                    <span className="material-symbols-outlined text-sm">{getSortIcon('code')}</span>
                  </button>
                </th>
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline">
                  <button type="button" onClick={() => toggleSort('title')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                    Title
                    <span className="material-symbols-outlined text-sm">{getSortIcon('title')}</span>
                  </button>
                </th>
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline hidden lg:table-cell">Feature</th>
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline">
                  <button type="button" onClick={() => toggleSort('severity')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                    Severity
                    <span className="material-symbols-outlined text-sm">{getSortIcon('severity')}</span>
                  </button>
                </th>
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                    Status
                    <span className="material-symbols-outlined text-sm">{getSortIcon('status')}</span>
                  </button>
                </th>
                <th className="px-5 py-4 font-label text-[11px] font-black uppercase tracking-[0.2em] text-outline hidden xl:table-cell">
                  <button type="button" onClick={() => toggleSort('updatedAt')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                    Updated
                    <span className="material-symbols-outlined text-sm">{getSortIcon('updatedAt')}</span>
                  </button>
                </th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high/40">
              {cases.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-outline">
                  <span className="material-symbols-outlined text-4xl block mb-2">search_off</span>
                  No test cases match your filters
                </td></tr>
              )}
              {groupedCases.map(group => (
                <Fragment key={group.key}>
                  <tr className="bg-surface-container-low/30 border-y border-surface-container-high/40">
                    <td colSpan={7} className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-violet-500">folder</span>
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-outline">{group.label}</span>
                        <span className="text-[11px] font-semibold text-outline">({group.cases.length})</span>
                      </div>
                    </td>
                  </tr>
                  {group.cases.map(tc => {
                    const sev = severityConfig[tc.severity] || severityConfig.MEDIUM
                    const sta = statusConfig[tc.status] || statusConfig.UNTESTED
                    const isSelected = selectedCase?.id === tc.id
                    return (
                      <tr
                        key={tc.id}
                        onClick={() => setSelectedCase(isSelected ? null : tc)}
                        className={cn(
                          'group cursor-pointer transition-colors',
                          isSelected ? 'bg-primary-fixed/20' : 'hover:bg-surface-container-low/60'
                        )}
                      >
                        <td className="px-5 py-4 font-label text-sm font-bold text-outline whitespace-nowrap">{tc.code}</td>
                        <td className="px-5 py-4">
                          <p className="font-headline font-bold text-on-surface text-sm">{tc.title}</p>
                          {tc.description && <p className="text-xs text-outline mt-0.5 truncate max-w-xs">{tc.description}</p>}
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          {tc.folder
                            ? <span className="flex items-center gap-1 text-sm text-slate-600"><span className="material-symbols-outlined text-sm text-violet-400">folder</span>{tc.folder.name}</span>
                            : <span className="text-xs text-outline italic">No Feature</span>}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={cn('badge', sev.bg, sev.text)}>{sev.label}</span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', sta.dot, tc.status === 'FAILED' && 'animate-pulse')} />
                            <span className={cn('text-sm font-semibold', sta.text)}>{sta.label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden xl:table-cell text-xs text-outline whitespace-nowrap">{formatRelativeTime(tc.updatedAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); void duplicateCase(tc) }}
                              disabled={duplicatingCaseId === tc.id}
                              className="p-1.5 text-outline hover:text-primary hover:bg-primary-fixed/30 rounded-lg transition-all disabled:opacity-50"
                              title="Duplicate test case"
                            >
                              <span className="material-symbols-outlined text-sm">content_copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setEditCase(tc) }}
                              className="p-1.5 text-outline hover:text-primary hover:bg-primary-fixed/30 rounded-lg transition-all"
                              title="Edit test case"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-outline font-medium">
            Showing <span className="text-on-surface font-bold">{cases.length}</span> of <span className="text-on-surface font-bold">{total}</span> test cases
          </p>
          <div className="flex items-center gap-1.5">
            <button
              disabled={filters.page === 1}
              onClick={() => setFilter('page', (filters.page || 1) - 1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-surface-container-high hover:bg-white transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1
              return (
                <button
                  key={page}
                  onClick={() => setFilter('page', page)}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center rounded-xl text-sm font-bold transition-all',
                    filters.page === page ? 'bg-primary text-white shadow-primary' : 'hover:bg-white text-outline'
                  )}
                >
                  {page}
                </button>
              )
            })}
            <button
              disabled={filters.page === totalPages || totalPages === 0}
              onClick={() => setFilter('page', (filters.page || 1) + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-surface-container-high hover:bg-white transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[120] bg-primary/20 backdrop-blur-sm p-4 md:p-6 flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedCase(null)
            }}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-3xl h-[88vh] rounded-2xl overflow-hidden shadow-2xl"
            >
              <CaseDetailPanel
                projectId={projectId}
                caseId={selectedCase.id}
                featureRootId={filters.folderId || undefined}
                onClose={() => setSelectedCase(null)}
                onUpdate={() => {
                  void mutate()
                  void mutateFolders()
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {showCreate && filters.folderId && (
        <CreateCaseModal
          projectId={projectId}
          folderId={filters.folderId}
          folderOptions={createFolderOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => { mutate(); setShowCreate(false) }}
        />
      )}
      {editCase && (
        <EditCaseModal
          projectId={projectId}
          testCase={editCase}
          featureRootId={filters.folderId || undefined}
          onClose={() => setEditCase(null)}
          onSaved={() => { mutate(); setEditCase(null); setSelectedCase(null) }}
        />
      )}
      {showCreateFeature && (
        <CreateFolderModal
          projectId={projectId}
          parentId={null}
          onClose={() => setShowCreateFeature(false)}
          onCreated={(folder) => {
            void mutateFolders()
            setShowCreateFeature(false)
            setFilter('folderId', folder.id)
          }}
        />
      )}
    </div>
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

function groupCasesByFeature(cases: TestCase[]) {
  const grouped = new Map<string, { key: string; label: string; cases: TestCase[] }>()

  for (const testCase of cases) {
    const key = testCase.folder?.id || 'root'
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: testCase.folder?.name || 'No Feature',
        cases: [],
      })
    }
    grouped.get(key)!.cases.push(testCase)
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.key === 'root' && b.key !== 'root') return 1
    if (b.key === 'root' && a.key !== 'root') return -1
    return a.label.localeCompare(b.label)
  })
}
