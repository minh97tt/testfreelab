import { Suspense } from 'react'
import ListViewClient from './ListViewClient'
type Props = { params: Promise<{ projectId: string }> }
export async function generateMetadata({ params }: Props) {
  await params
  return { title: `List View` }
}
export default async function ListViewPage({ params }: Props) {
  const { projectId } = await params
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-outline animate-spin">refresh</span></div>}>
      <ListViewClient projectId={projectId} />
    </Suspense>
  )
}
