import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ data: { ok: true } })
}
