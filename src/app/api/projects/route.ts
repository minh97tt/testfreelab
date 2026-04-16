import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional().default('1.0.0'),
  description: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')!
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    include: {
      _count: { select: { testCases: true, folders: true, runs: true } },
      members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ data: projects })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')!
  try {
    const body = await req.json()
    const { name, version, description } = createSchema.parse(body)

    const project = await prisma.project.create({
      data: {
        name,
        version,
        description,
        members: { create: { userId, role: 'OWNER' } },
      },
      include: { _count: { select: { testCases: true, folders: true, runs: true } } },
    })
    return NextResponse.json({ data: project }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
