import { Suspense } from 'react'
import RunsClient from './RunsClient'
type Props = { params: Promise<{ projectId: string }> }
export default async function RunsPage({ params }: Props) {
  const { projectId } = await params
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-outline animate-spin">refresh</span></div>}>
      <RunsClient projectId={projectId} />
    </Suspense>
  )
}
