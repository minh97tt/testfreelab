import { redirect } from 'next/navigation'
type Props = { params: Promise<{ projectId: string }> }
export default async function ProjectRoot({ params }: Props) {
  const { projectId } = await params
  redirect(`/projects/${projectId}/tree`)
}
