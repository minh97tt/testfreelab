import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { CaseStatus } from '@prisma/client'

type Params = { params: Promise<{ id: string; runId: string; resultId: string }> }

// Update a single run result (mark pass/fail/notes/step results)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, runId, resultId } = await params
  const userId = req.headers.get('x-user-id')!

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
    select: { id: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schema = z.object({
    status: z.nativeEnum(CaseStatus),
    notes: z.string().optional(),
    duration: z.number().int().optional(),
    stepResults: z.array(z.object({
      stepId: z.string(),
      status: z.enum(['PASSED', 'FAILED', 'SKIPPED', 'UNTESTED']),
      actual: z.string().optional(),
    })).optional(),
  }).superRefine((data, ctx) => {
    if ((data.status === 'PASSED' || data.status === 'FAILED') && !data.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Actual Result is required when marking Passed/Failed',
      })
    }
  })

  try {
    const body = await req.json()
    const { stepResults, ...data } = schema.parse(body)
    const trimmedNotes = data.notes?.trim()

    const existing = await prisma.runResult.findFirst({
      where: { id: resultId, runId },
      select: { id: true, testCaseId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const result = await prisma.runResult.update({
      where: { id: resultId },
      data: {
        ...data,
        notes: trimmedNotes,
        stepResults: stepResults ? JSON.stringify(stepResults) : undefined,
        executedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        testCase: { select: { id: true, code: true, title: true, severity: true } },
      },
    })

    // Update the test case's own status to reflect last result
    await prisma.testCase.update({
      where: { id: existing.testCaseId },
      data: {
        status: data.status,
        actualResult: trimmedNotes ?? undefined,
      },
    })

    // Check if all results for the run are done.
    const pending = await prisma.runResult.count({
      where: { runId, status: 'UNTESTED' },
    })

    if (pending === 0) {
      const failed = await prisma.runResult.count({ where: { runId, status: 'FAILED' } })
      await prisma.testRun.update({
        where: { id: runId },
        data: { status: failed > 0 ? 'FAILED' : 'PASSED', endedAt: new Date() },
      })
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation error', details: err.issues }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
