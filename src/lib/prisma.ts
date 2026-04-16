import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaTag: string | undefined
}

// Bump this tag when Prisma schema changes to force-refresh cached client in dev.
const PRISMA_SCHEMA_TAG = '2026-04-15-remove-module-add-actual-result'

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
