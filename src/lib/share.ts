import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'testtree-dev-secret'
)

export interface TreeSharePayload {
  type: 'TREE_FEATURE'
  projectId: string
  featureId: string
}

export async function signTreeShareToken(payload: TreeSharePayload, expiry: string = '30d'): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(SECRET)
}

export async function verifyTreeShareToken(token: string): Promise<TreeSharePayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (payload.type !== 'TREE_FEATURE') return null
    if (typeof payload.projectId !== 'string' || typeof payload.featureId !== 'string') return null
    return {
      type: 'TREE_FEATURE',
      projectId: payload.projectId,
      featureId: payload.featureId,
    }
  } catch {
    return null
  }
}
