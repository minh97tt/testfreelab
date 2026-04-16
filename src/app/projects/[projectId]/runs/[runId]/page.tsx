import { Suspense } from 'react'
import RunDetailClient from './RunDetailClient'
type Props = { params: Promise<{ projectId: string; runId: string }> }
export default async function RunDetailPage({ params }: Props) {
  const { projectId, runId } = await params
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-outline animate-spin">refresh</span></div>}>
      <RunDetailClient projectId={projectId} runId={runId} />
    </Suspense>
  )
}
