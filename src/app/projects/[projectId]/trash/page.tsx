import { redirect } from 'next/navigation'
type Props = { params: Promise<{ projectId: string }> }
export default async function TrashPage({ params }: Props) {
  const { projectId } = await params
  redirect(`/projects/${projectId}/archive`)
}
