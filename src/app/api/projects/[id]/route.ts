import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

async function assertAccess(projectId: string, userId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  return !!member
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')!
  if (!await assertAccess(id, userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: { select: { testCases: true, folders: true, runs: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
    },
  })
  return NextResponse.json({ data: project })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')!
  if (!await assertAccess(id, userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = await req.json()
  const schema = z.object({
    name: z.string().min(1).optional(),
    version: z.string().optional(),
    description: z.string().optional(),
  })
  const data = schema.parse(body)
  const project = await prisma.project.update({ where: { id }, data })
  return NextResponse.json({ data: project })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')!
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId: id } },
  })
  if (!member || member.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ data: { ok: true } })
}
