import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaTag: string | undefined
}

// Bump this tag when Prisma schema changes to force-refresh cached client in dev.
const PRISMA_SCHEMA_TAG = '2026-04-15-remove-module-add-actual-result'

function prepareSqliteUrlForVercel() {
  const databaseUrl = process.env.DATABASE_URL || ''
  const isSqlite = databaseUrl.startsWith('file:')
  const isVercelRuntime = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL)
  if (!isSqlite || !isVercelRuntime) return

  const targetPath = '/tmp/testtree.db'
  const sourceCandidates = [
    path.join(process.cwd(), 'prisma', 'dev.db'),
    path.join(process.cwd(), 'dev.db'),
  ]

  try {
    if (!fs.existsSync(targetPath)) {
      const source = sourceCandidates.find((candidate) => fs.existsSync(candidate))
      if (source) {
        fs.copyFileSync(source, targetPath)
      }
    }

    if (fs.existsSync(targetPath)) {
      process.env.DATABASE_URL = `file:${targetPath}`
    }
  } catch {
    // Keep original DATABASE_URL if fallback fails.
  }
}

prepareSqliteUrlForVercel()

const shouldReuse =
  globalForPrisma.prisma &&
  globalForPrisma.prismaSchemaTag === PRISMA_SCHEMA_TAG

let prismaClient: PrismaClient

if (!shouldReuse) {
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => undefined)
  }
  prismaClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
  globalForPrisma.prisma = prismaClient
  globalForPrisma.prismaSchemaTag = PRISMA_SCHEMA_TAG
} else {
  prismaClient = globalForPrisma.prisma as PrismaClient
}

export const prisma = prismaClient
