import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { signTreeShareToken } from '@/lib/share'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    featureId: z.string().min(1),
  })

  try {
    const body = await req.json()
    const { featureId } = schema.parse(body)

    const feature = await prisma.folder.findFirst({
      where: { id: featureId, projectId },
      select: { id: true, name: true },
    })
    if (!feature) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
    }

    const token = await signTreeShareToken({
      type: 'TREE_FEATURE',
      projectId,
      featureId: feature.id,
    })

    const shareUrl = new URL(`/share/tree/${encodeURIComponent(token)}`, req.nextUrl.origin).toString()

    return NextResponse.json({
      data: {
        token,
        shareUrl,
        featureId: feature.id,
        featureName: feature.name,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
