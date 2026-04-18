'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import useSWR from 'swr'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BaseEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Folder, TestCase } from '@/types'
import { cn, severityConfig, statusConfig } from '@/lib/utils'
import CaseDetailPanel from '@/components/tree/CaseDetailPanel'
import CreateFolderModal from '@/components/modals/CreateFolderModal'
import CreateCaseModal from '@/components/modals/CreateCaseModal'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// Tree spacing tuning for large case sets:
// - tighter case rows vertically
// - wider parent/child distance horizontally
const HORIZONTAL_GAP = 630
const VERTICAL_GAP = 70
const STATUS_FILTERS = ['', 'FAILED', 'BLOCKED', 'UNTESTED', 'PASSED'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : ''
}

interface TreeData {
  tree: Folder[]
  rootCases: TestCase[]
}

interface TreeViewClientProps {
  projectId: string
  dataUrl?: string
  initialData?: TreeData
  readOnly?: boolean
  initialFeatureId?: string
  lockFeatureSelection?: boolean
  shareToken?: string
}

interface FolderOption {
  id: string
  name: string
  depth: number
}

type TreeNodeData = {
  kind: 'folder' | 'case'
  label: string
  subtitle?: string
  count?: number
  hasChildren?: boolean
  isFeatureRoot?: boolean
  folderId?: string
  testCase?: TestCase
  currentFolderId?: string | null
  selected?: boolean
  isExpanded?: boolean
  onToggleFolder?: (folderId: string) => void
  onSelectCase?: (testCase: TestCase) => void
  onCreateCase?: (folderId: string) => void
  onCreateSubFolder?: (folderId: string) => void
  onMoveCase?: (caseId: string, toFolderId: string) => void
}

type TreeNode = Node<TreeNodeData>

const nodeTypes = {
  folderNode: FolderNode,
  caseNode: CaseNode,
}

const edgeTypes = {
  curvedDashed: CurvedDashedEdge,
}

export default function TreeViewClient({
  projectId,
  dataUrl,
  initialData,
  readOnly = false,
  initialFeatureId = '',
  lockFeatureSelection = false,
  shareToken,
}: TreeViewClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { data, mutate } = useSWR<{ data: TreeData }>(
    initialData ? null : (dataUrl || `/api/projects/${projectId}/folders`),
    fetcher,
    { refreshInterval: readOnly ? 0 : 10000 }
  )

  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [createCaseFolder, setCreateCaseFolder] = useState<string | undefined>(undefined)
  const [lockCreateCaseFolder, setLockCreateCaseFolder] = useState(false)
  const [parentFolderId, setParentFolderId] = useState<string | null>(null)
  const [featureScopeId, setFeatureScopeId] = useState(initialFeatureId)
  const [shareLoading, setShareLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusFilter(searchParams.get('status')))

  const tree = initialData || data?.data
  const featureOptions = (tree?.tree || []).map((folder) => ({ id: folder.id, name: folder.name }))
  const lockedFeatureId = lockFeatureSelection
    ? (initialFeatureId || tree?.tree?.[0]?.id || '')
    : ''
  const effectiveFeatureId = lockFeatureSelection ? lockedFeatureId : featureScopeId
  const scopedFeature = effectiveFeatureId ? findFolderById(tree?.tree || [], effectiveFeatureId) : null
  const activeFeature = lockFeatureSelection ? (scopedFeature || tree?.tree?.[0] || null) : scopedFeature
  const createCaseFolderOptions = activeFeature ? flattenFolderOptions([activeFeature]) : []

  const featureQuery = searchParams.get('feature') || ''
  const statusQuery = searchParams.get('status') || ''

  useEffect(() => {
    if (lockFeatureSelection) return
    if (featureQuery) {
      setFeatureScopeId(featureQuery)
      return
    }
    if (initialFeatureId) {
      setFeatureScopeId((prev) => prev || initialFeatureId)
    }
  }, [featureQuery, initialFeatureId, lockFeatureSelection])

  useEffect(() => {
    if (lockFeatureSelection) return
    if (featureScopeId) return
    if (!tree?.tree?.length) return
    if (tree.tree.length === 1) {
      setFeatureScopeId(tree.tree[0].id)
    }
  }, [featureScopeId, tree, lockFeatureSelection])

  useEffect(() => {
    if (lockFeatureSelection) return
    if (!featureScopeId) return
    if (!tree) return
    if (scopedFeature) return

    const params = new URLSearchParams(searchParams.toString())
    params.delete('feature')
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
    setFeatureScopeId('')
  }, [featureScopeId, scopedFeature, searchParams, router, pathname, tree, lockFeatureSelection])

  useEffect(() => {
    const nextStatus = parseStatusFilter(statusQuery)
    setStatusFilter((current) => current === nextStatus ? current : nextStatus)
  }, [statusQuery])

  function changeFeatureScope(nextFeatureId: string) {
    setFeatureScopeId(nextFeatureId)
    setSelectedCase(null)

    const params = new URLSearchParams(searchParams.toString())
    if (nextFeatureId) {
      params.set('feature', nextFeatureId)
      setExpandedFolders(prev => {
        const next = new Set(prev)
        next.add(nextFeatureId)
        return next
      })
    } else {
      params.delete('feature')
    }

    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  function changeStatusFilter(nextStatus: StatusFilter) {
    setStatusFilter(nextStatus)
    setSelectedCase(null)

    const params = new URLSearchParams(searchParams.toString())
    if (nextStatus) {
      params.set('status', nextStatus)
    } else {
      params.delete('status')
    }

    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  function toggleFolder(folderId: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const moveCaseToFolder = useCallback(async (caseId: string, toFolderId: string) => {
    if (readOnly) return
    const res = await fetch(`/api/projects/${projectId}/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: toFolderId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      window.alert(json.error || 'Unable to move test case')
      return
    }
    setSelectedCase(null)
    void mutate()
  }, [projectId, mutate, readOnly])

  async function shareFeature() {
    if (!effectiveFeatureId || shareLoading) return
    setShareLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId: effectiveFeatureId }),
      })
      const json = await res.json()
      if (!res.ok || !json?.data?.shareUrl) {
        window.alert(json?.error || 'Unable to create share link')
        return
      }

      const shareUrl = new URL(json.data.shareUrl as string)
      if (statusFilter) shareUrl.searchParams.set('status', statusFilter)
      const shareUrlText = shareUrl.toString()
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrlText)
        window.alert('Share link copied to clipboard')
        return
      }
      window.prompt('Copy share link', shareUrlText)
    } catch {
      window.alert('Unable to create share link')
    } finally {
      setShareLoading(false)
    }
  }

  const visibleRootCases = useMemo(() => [], [])
  const visibleFolders = useMemo(() => {
    if (lockFeatureSelection) {
      return activeFeature ? [activeFeature] : []
    }
    return effectiveFeatureId ? (scopedFeature ? [scopedFeature] : []) : []
  }, [lockFeatureSelection, activeFeature, effectiveFeatureId, scopedFeature])
  const filteredVisibleFolders = useMemo(
    () => filterFoldersByStatus(visibleFolders, statusFilter),
    [visibleFolders, statusFilter]
  )

  const selectedCaseId = selectedCase?.id

  useEffect(() => {
    if (!readOnly) return
    if (!filteredVisibleFolders.length) return
    setExpandedFolders((prev) => {
      if (prev.size > 0) return prev
      const next = new Set<string>()
      for (const folder of filteredVisibleFolders) {
        next.add(folder.id)
      }
      return next
    })
  }, [readOnly, filteredVisibleFolders])

  const { nodes, edges } = useMemo(() => {
    return buildHorizontalTreeGraph({
      folders: filteredVisibleFolders,
      rootCases: visibleRootCases,
      expandedFolders,
      selectedCaseId,
      onToggleFolder: toggleFolder,
      onSelectCase: setSelectedCase,
      onCreateCase: readOnly ? undefined : (folderId) => {
        setLockCreateCaseFolder(true)
        setCreateCaseFolder(folderId)
      },
      onCreateSubFolder: readOnly ? undefined : (folderId) => {
        setParentFolderId(folderId)
        setShowCreateFolder(true)
      },
      onMoveCase: readOnly ? undefined : moveCaseToFolder,
    })
  }, [filteredVisibleFolders, visibleRootCases, expandedFolders, selectedCaseId, moveCaseToFolder, readOnly])

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 p-4 md:p-6 bg-slate-50/40 dotted-canvas">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-black font-headline tracking-tighter text-primary mb-1">Horizontal Tree</h1>
            <p className="text-outline font-medium">
              {readOnly ? 'Shared read-only view of folder/test case tree' : 'Folder/Test Case nodes, expand folders to reveal their children'}
            </p>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setParentFolderId(null)
                  setShowCreateFolder(true)
                }}
                className="flex items-center gap-2 bg-white text-primary border border-outline/20 hover:border-primary/40 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all"
              >
                <span className="material-symbols-outlined text-lg">account_tree</span>
                New Feature
              </button>
              <button
                disabled={!effectiveFeatureId}
                onClick={() => {
                  if (!effectiveFeatureId) return
                  setParentFolderId(effectiveFeatureId)
                  setShowCreateFolder(true)
                }}
                className="flex items-center gap-2 bg-white text-primary border border-outline/20 hover:border-primary/40 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">folder</span>
                New Folder
              </button>
              <button
                disabled={!effectiveFeatureId}
                onClick={() => {
                  if (effectiveFeatureId) {
                    setLockCreateCaseFolder(false)
                    setCreateCaseFolder(effectiveFeatureId)
                  }
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold shadow-primary hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                New Test Case
              </button>
              <button
                disabled={!effectiveFeatureId || shareLoading}
                onClick={shareFeature}
                className="flex items-center gap-2 bg-white text-primary border border-outline/20 hover:border-primary/40 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">share</span>
                {shareLoading ? 'Creating...' : 'Share Feature'}
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center gap-3 flex-wrap">
          {!lockFeatureSelection && (
            <div className="relative">
              <select
                value={effectiveFeatureId}
                onChange={(e) => changeFeatureScope(e.target.value)}
                className="appearance-none bg-white border border-outline/20 rounded-xl px-3 py-2 pr-10 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">Select Feature (Required)</option>
                {featureOptions.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.name}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-sm pointer-events-none">
                expand_more
              </span>
            </div>
          )}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                changeStatusFilter(parseStatusFilter(e.target.value))
              }}
              className="appearance-none bg-white border border-outline/20 rounded-xl px-3 py-2 pr-10 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status || 'ALL'} value={status}>
                  {status ? `Status: ${statusConfig[status].label}` : 'Status: All'}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-sm pointer-events-none">
              expand_more
            </span>
          </div>

          {activeFeature && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary-fixed text-on-primary-fixed-variant px-3 py-2 text-xs font-bold">
              <span className="material-symbols-outlined text-sm">filter_alt</span>
              Feature: {activeFeature.name}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 rounded-2xl bg-white/80 ring-1 ring-outline/10 overflow-hidden shadow-sm relative">
          {!filteredVisibleFolders.length && (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <div>
                <span className="material-symbols-outlined text-5xl text-outline block mb-3">folder_open</span>
                <p className="text-lg font-bold text-on-surface mb-1">Please choose a feature first</p>
                <p className="text-sm text-outline">Tree view is locked until a feature is selected.</p>
              </div>
            </div>
          )}
          {!!filteredVisibleFolders.length && readOnly && nodes.length === 0 && (
            <ReadOnlyTreeView folders={filteredVisibleFolders} />
          )}
          {!!filteredVisibleFolders.length && (!readOnly || nodes.length > 0) && (
            <ReactFlowProvider>
              <HorizontalTreeCanvas nodes={nodes} edges={edges} graphKey={`${nodes.length}-${edges.length}`} />
            </ReactFlowProvider>
          )}
        </div>
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
                featureRootId={featureScopeId || undefined}
                readOnly={readOnly}
                dataUrl={
                  readOnly && shareToken
                    ? `/api/share/tree/${encodeURIComponent(shareToken)}/cases/${selectedCase.id}`
                    : undefined
                }
                onClose={() => setSelectedCase(null)}
                onUpdate={() => {
                  void mutate()
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!readOnly && showCreateFolder && (
        <CreateFolderModal
          projectId={projectId}
          parentId={parentFolderId}
          onClose={() => setShowCreateFolder(false)}
          onCreated={(folder) => {
            void (async () => {
              await mutate()
              setShowCreateFolder(false)
              if (folder.parentId) {
                setExpandedFolders(prev => {
                  const next = new Set(prev)
                  next.add(folder.parentId!)
                  next.add(folder.id)
                  return next
                })
                return
              }
              changeFeatureScope(folder.id)
            })()
          }}
        />
      )}

      {!readOnly && createCaseFolder !== undefined && (
        <CreateCaseModal
          projectId={projectId}
          folderId={createCaseFolder}
          folderOptions={createCaseFolderOptions}
          lockFolder={lockCreateCaseFolder}
          onClose={() => {
            setCreateCaseFolder(undefined)
            setLockCreateCaseFolder(false)
          }}
          onCreated={() => {
            void mutate()
            setCreateCaseFolder(undefined)
            setLockCreateCaseFolder(false)
          }}
        />
      )}
    </div>
  )
}

function HorizontalTreeCanvas({ nodes, edges, graphKey }: { nodes: TreeNode[]; edges: Edge[]; graphKey: string }) {
  const { fitView, zoomIn, zoomOut } = useReactFlow<TreeNode, Edge>()

  useEffect(() => {
    const timers = [60, 220, 700].map((delay) =>
      setTimeout(() => {
        void fitView({ padding: 0.2, duration: 280 })
      }, delay)
    )
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [fitView, graphKey, nodes.length, edges.length])

  return (
    <div className="w-full h-full relative">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl bg-white/95 border border-outline/15 shadow-sm p-1">
        <button
          type="button"
          onClick={() => void zoomOut({ duration: 120 })}
          className="w-8 h-8 rounded-lg hover:bg-surface-container-low flex items-center justify-center"
          title="Zoom out"
        >
          <span className="material-symbols-outlined text-base">remove</span>
        </button>
        <button
          type="button"
          onClick={() => void fitView({ padding: 0.2, duration: 200 })}
          className="px-2 h-8 rounded-lg text-xs font-bold hover:bg-surface-container-low"
          title="Fit view"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => void zoomIn({ duration: 120 })}
          className="w-8 h-8 rounded-lg hover:bg-surface-container-low flex items-center justify-center"
          title="Zoom in"
        >
          <span className="material-symbols-outlined text-base">add</span>
        </button>
      </div>

      <ReactFlow<TreeNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={{ x: 20, y: 20, zoom: 0.9 }}
        onInit={(instance) => {
          void instance.fitView({ padding: 0.2, duration: 240 })
          setTimeout(() => {
            void instance.fitView({ padding: 0.2, duration: 240 })
          }, 280)
        }}
        onNodeClick={(_, node) => {
          if (node.type === 'folderNode' && node.data.folderId) {
            node.data.onToggleFolder?.(node.data.folderId)
            return
          }
          if (node.type === 'caseNode' && node.data.testCase) {
            node.data.onSelectCase?.(node.data.testCase)
          }
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll
        zoomOnScroll
        minZoom={0.05}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="#e6edf5" />
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          style={{ height: 104, width: 188 }}
          bgColor="#ffffff"
          maskColor="rgba(52, 0, 117, 0.11)"
          nodeStrokeColor={(node) => (node.type === 'caseNode' ? '#0f766e' : '#5b21b6')}
          nodeColor={(node) => (node.type === 'caseNode' ? '#99f6e4' : '#ddd6fe')}
          nodeBorderRadius={8}
          nodeStrokeWidth={2}
          className="!border !border-outline/20 !rounded-xl overflow-hidden!"
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}

function FolderNode({ data }: NodeProps<Node<TreeNodeData>>) {
  const [isDragOver, setIsDragOver] = useState(false)
  const canExpand = Boolean((data.count || 0) > 0 || data.hasChildren)
  const folderIcon = data.isFeatureRoot ? 'account_tree' : (data.isExpanded ? 'folder_open' : 'folder')
  const toggleFolder = (e?: MouseEvent<HTMLElement>) => {
    e?.stopPropagation()
    if (data.folderId) data.onToggleFolder?.(data.folderId)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!data.folderId || !data.onMoveCase) return
    e.preventDefault()
    setIsDragOver(false)
    const caseId = e.dataTransfer.getData('application/x-test-case-id')
    const sourceFolderId = e.dataTransfer.getData('application/x-source-folder-id')
    if (!caseId) return
    if (sourceFolderId && sourceFolderId === data.folderId) return
    data.onMoveCase(caseId, data.folderId)
  }

  return (
    <div
      onDragOver={(e) => {
        if (!data.folderId || !data.onMoveCase) return
        if (!e.dataTransfer.types.includes('application/x-test-case-id')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'w-[300px] rounded-xl border bg-white shadow-sm px-3 py-2.5',
        data.isExpanded ? 'border-primary/25 ring-2 ring-primary/10' : 'border-slate-200',
        isDragOver && 'ring-2 ring-emerald-300 border-emerald-400 bg-emerald-50/70'
      )}
    >
      {!data.isFeatureRoot && (
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-0 !bg-slate-400" />
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-0 !bg-slate-400" />

      <div className="flex items-center gap-2">
      
        <button
          type="button"
          onClick={(e) => toggleFolder(e)}
          disabled={!canExpand}
          className="min-w-0 flex-1 flex items-center gap-2 text-left rounded-md px-1 py-0.5 hover:bg-slate-50 !border-none !ring-0"
        >
          <span className="material-symbols-outlined text-violet-600 text-[20px]">{folderIcon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{data.label}</p>
            <p className="text-[10px] font-semibold text-outline">{data.count || 0} cases</p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {data.onCreateSubFolder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (data.folderId) data.onCreateSubFolder?.(data.folderId)
              }}
              className="size-6 rounded-md hover:bg-slate-100 text-primary flex items-center justify-center"
              title="New subfolder"
            >
              <span className="material-symbols-outlined text-lg!">create_new_folder</span>
            </button>
          )}
          {data.onCreateCase && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (data.folderId) data.onCreateCase?.(data.folderId)
              }}
              className="size-6 rounded-md hover:bg-slate-100 text-primary flex items-center justify-center"
              title="New test case"
            >
              <span className="material-symbols-outlined text-lg!">lab_profile</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CurvedDashedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.7,
  })

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: '#7b8794',
        strokeWidth: 1.6,
        strokeDasharray: '6 6',
      }}
    />
  )
}

function CaseNode({ data }: NodeProps<Node<TreeNodeData>>) {
  const testCase = data.testCase
  if (!testCase) return null

  const sev = severityConfig[testCase.severity] || severityConfig.MEDIUM
  const sta = statusConfig[testCase.status] || statusConfig.UNTESTED

  return (
    <button
      type="button"
      draggable={Boolean(data.onMoveCase)}
      onDragStart={(e) => {
        if (!data.onMoveCase) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/x-test-case-id', testCase.id)
        e.dataTransfer.setData('application/x-source-folder-id', testCase.folderId || '')
      }}
      onClick={(e) => {
        e.stopPropagation()
        data.onSelectCase?.(testCase)
      }}
      className={cn('w-80 text-left rounded-xl border bg-white shadow-sm px-3 py-2.5 transition-all hover:shadow-md', data.selected ? 'border-primary/30 ring-2 ring-primary/10' : 'border-slate-200')}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-0 !bg-slate-400" />

      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] text-sky-600 mt-0.5">description</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-label font-bold text-outline">{testCase.code}</span>
            <span className={cn('text-[10px] font-black uppercase tracking-wider', sta.text)}>{sta.label}</span>
          </div>
          <p className="text-sm font-bold text-on-surface truncate">{testCase.title}</p>
        </div>

        <span className={cn('badge shrink-0', sev.bg, sev.text)}>{sev.label}</span>
      </div>
    </button>
  )
}

function buildHorizontalTreeGraph({
  folders,
  rootCases,
  expandedFolders,
  selectedCaseId,
  onToggleFolder,
  onSelectCase,
  onCreateCase,
  onCreateSubFolder,
  onMoveCase,
}: {
  folders: Folder[]
  rootCases: TestCase[]
  expandedFolders: Set<string>
  selectedCaseId?: string
  onToggleFolder: (folderId: string) => void
  onSelectCase?: (testCase: TestCase) => void
  onCreateCase?: (folderId: string) => void
  onCreateSubFolder?: (folderId: string) => void
  onMoveCase?: (caseId: string, toFolderId: string) => void
}): { nodes: Node<TreeNodeData>[]; edges: Edge[] } {
  const nodes: TreeNode[] = []
  const edges: Edge[] = []
  let yCursor = 0

  function nextLeafY() {
    const y = yCursor
    yCursor += VERTICAL_GAP
    return y
  }

  function addCaseNode(testCase: TestCase, depth: number, parentId: string | null): number {
    const y = nextLeafY()
    const id = `case-${testCase.id}`

    nodes.push({
      id,
      type: 'caseNode',
      position: { x: depth * HORIZONTAL_GAP, y },
      width: 320,
      height: 78,
      data: {
        kind: 'case',
        label: testCase.title,
        testCase,
        selected: selectedCaseId === testCase.id,
        currentFolderId: testCase.folderId,
        onSelectCase,
        onMoveCase,
      },
    })

    if (parentId) {
      edges.push(createTreeEdge(parentId, id))
    }
    return y
  }

  function addFolderNode(folder: Folder, depth: number, parentId: string | null): number {
    const id = `folder-${folder.id}`
    const isExpanded = expandedFolders.has(folder.id)
    const childYs: number[] = []

    if (isExpanded) {
      for (const child of folder.children || []) {
        childYs.push(addFolderNode(child, depth + 1, id))
      }
      for (const testCase of folder.testCases || []) {
        childYs.push(addCaseNode(testCase, depth + 1, id))
      }
    }

    const ownY = childYs.length > 0 ? avg(childYs) : nextLeafY()

    nodes.push({
      id,
      type: 'folderNode',
      position: { x: depth * HORIZONTAL_GAP, y: ownY },
      width: 300,
      height: 86,
      data: {
        kind: 'folder',
        label: folder.name,
        folderId: folder.id,
        count: folder._count?.testCases || folder.testCases?.length || 0,
        hasChildren: Boolean(folder.children?.length),
        isFeatureRoot: depth === 0,
        isExpanded,
        onToggleFolder,
        onCreateCase,
        onCreateSubFolder,
        onMoveCase,
      },
    })

    if (parentId) {
      edges.push(createTreeEdge(parentId, id))
    }
    return ownY
  }

  for (const folder of folders) {
    addFolderNode(folder, 0, null)
  }

  for (const testCase of rootCases) {
    addCaseNode(testCase, 0, null)
  }

  return { nodes, edges }
}

function createTreeEdge(source: string, target: string): Edge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: 'curvedDashed',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  }
}

function flattenFolderOptions(folders: Folder[], depth = 0): FolderOption[] {
  const options: FolderOption[] = []
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

function filterFoldersByStatus(
  folders: Folder[],
  status: StatusFilter
): Folder[] {
  if (!status) return folders

  function walk(folder: Folder, keepWhenEmpty = false): Folder | null {
    const filteredChildren = (folder.children || [])
      .map((child) => walk(child))
      .filter((child): child is Folder => Boolean(child))
    const filteredCases = (folder.testCases || []).filter((testCase) => testCase.status === status)
    const filteredCaseCount = filteredCases.length + filteredChildren.reduce(
      (total, child) => total + (child._count?.testCases || child.testCases?.length || 0),
      0
    )

    if (!keepWhenEmpty && filteredChildren.length === 0 && filteredCases.length === 0) {
      return null
    }

    return {
      ...folder,
      children: filteredChildren,
      testCases: filteredCases,
      _count: {
        children: filteredChildren.length,
        testCases: filteredCaseCount,
      },
    }
  }

  return folders
    .map((folder) => walk(folder, true))
    .filter((folder): folder is Folder => Boolean(folder))
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function ReadOnlyTreeView({ folders }: { folders: Folder[] }) {
  return (
    <div className="h-full overflow-auto scrollbar-thin p-4 md:p-6">
      <div className="space-y-3">
        {folders.map((folder) => (
          <ReadOnlyFolderNode key={folder.id} folder={folder} depth={0} />
        ))}
      </div>
    </div>
  )
}

function ReadOnlyFolderNode({ folder, depth }: { folder: Folder; depth: number }) {
  const childFolders = folder.children || []
  const cases = folder.testCases || []
  const totalCases = folder._count?.testCases ?? cases.length

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm',
          depth > 0 && 'ml-4'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-violet-600 text-[20px]">
            {depth === 0 ? 'account_tree' : 'folder'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{folder.name}</p>
            <p className="text-[10px] font-semibold text-outline">{totalCases} cases</p>
          </div>
        </div>
      </div>

      {childFolders.length > 0 && (
        <div className={cn('space-y-2 border-l-2 border-dashed border-outline/30 pl-3', depth > 0 && 'ml-4')}>
          {childFolders.map((child) => (
            <ReadOnlyFolderNode key={child.id} folder={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {cases.length > 0 && (
        <div className={cn('space-y-1.5 border-l-2 border-dashed border-outline/20 pl-3', depth > 0 && 'ml-4')}>
          {cases.map((testCase) => {
            const sev = severityConfig[testCase.severity] || severityConfig.MEDIUM
            const sta = statusConfig[testCase.status] || statusConfig.UNTESTED
            return (
              <div key={testCase.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-sky-600 mt-0.5">description</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-label font-bold text-outline">{testCase.code}</p>
                    <p className="text-sm font-semibold text-on-surface truncate">{testCase.title}</p>
                  </div>
                  <span className={cn('badge shrink-0', sev.bg, sev.text)}>{sev.label}</span>
                  <span className={cn('text-[10px] font-black uppercase tracking-wider shrink-0', sta.text)}>{sta.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
