import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; runId: string }> }

const encoder = new TextEncoder()

function sse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId, runId } = await params
  const userId = req.headers.get('x-user-id')

  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let lastFingerprint = ''
      let interval: ReturnType<typeof setInterval> | null = null

      const close = () => {
        if (closed) return
        closed = true
        if (interval) {
          clearInterval(interval)
          interval = null
        }
        controller.close()
      }

      const pushSnapshot = async () => {
        if (closed) return
        const run = await prisma.testRun.findFirst({
          where: { id: runId, projectId },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            startedAt: true,
            endedAt: true,
            _count: { select: { results: true } },
            results: { select: { id: true, status: true, updatedAt: true } },
          },
        })

        if (!run) {
          controller.enqueue(sse('error', { error: 'Run not found' }))
          close()
          return
        }

        const passed = run.results.filter((r) => r.status === 'PASSED').length
        const failed = run.results.filter((r) => r.status === 'FAILED').length
        const completed = run.results.filter((r) => r.status === 'PASSED' || r.status === 'FAILED').length
        const total = run._count.results
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0
        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
        const latestResultUpdate = run.results.reduce(
          (latest, result) => (result.updatedAt > latest ? result.updatedAt : latest),
          run.updatedAt
        )

        const payload = {
          runId: run.id,
          status: run.status,
          passed,
          failed,
          total,
          progress,
          passRate,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          updatedAt: run.updatedAt,
        }

        const fingerprint = `${run.status}:${run.updatedAt.toISOString()}:${latestResultUpdate.toISOString()}`
        if (fingerprint !== lastFingerprint) {
          controller.enqueue(sse('run-update', payload))
          lastFingerprint = fingerprint
        }

        if (run.status === 'PASSED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
          controller.enqueue(sse('final', payload))
          close()
        }
      }

      controller.enqueue(sse('connected', { runId }))
      await pushSnapshot()
      interval = setInterval(() => {
        void pushSnapshot()
      }, 1000)

      req.signal.addEventListener('abort', close)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
