import { Suspense } from 'react'
import ArchiveClient from './ArchiveClient'
type Props = { params: Promise<{ projectId: string }> }
export default async function ArchivePage({ params }: Props) {
  const { projectId } = await params
  return <Suspense fallback={null}><ArchiveClient projectId={projectId} /></Suspense>
}
