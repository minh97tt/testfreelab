import crypto from 'node:crypto'
import { jwtVerify } from 'jose'

const RAW_SECRET = process.env.JWT_SECRET || 'testtree-dev-secret'
const SECRET = new TextEncoder().encode(RAW_SECRET)
const ENC_KEY = crypto.createHash('sha256').update(RAW_SECRET).digest()
const TOKEN_PREFIX = 'st_'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export interface TreeSharePayload {
  type: 'TREE_FEATURE'
  projectId: string
  featureId: string
}

interface TreeShareEnvelope extends TreeSharePayload {
  iat: number
  exp: number
  v: 1
}

function expiryToMs(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry.trim())
  if (!match) return 30 * 24 * 60 * 60 * 1000
  const value = Number(match[1])
  const unit = match[2]
  if (!Number.isFinite(value) || value <= 0) return 30 * 24 * 60 * 60 * 1000
  if (unit === 's') return value * 1000
  if (unit === 'm') return value * 60 * 1000
  if (unit === 'h') return value * 60 * 60 * 1000
  return value * 24 * 60 * 60 * 1000
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = normalized.length % 4
  const padded = padLength === 0 ? normalized : `${normalized}${'='.repeat(4 - padLength)}`
  return Buffer.from(padded, 'base64')
}

export async function signTreeShareToken(payload: TreeSharePayload, expiry: string = '30d'): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Math.floor(expiryToMs(expiry) / 1000)
  const envelope: TreeShareEnvelope = {
    ...payload,
    iat,
    exp,
    v: 1,
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(envelope), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${TOKEN_PREFIX}${base64UrlEncode(Buffer.concat([iv, tag, ciphertext]))}`
}

export async function verifyTreeShareToken(token: string): Promise<TreeSharePayload | null> {
  if (token.startsWith(TOKEN_PREFIX)) {
    try {
      const raw = base64UrlDecode(token.slice(TOKEN_PREFIX.length))
      if (raw.length <= IV_LENGTH + TAG_LENGTH) return null

      const iv = raw.subarray(0, IV_LENGTH)
      const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
      const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH)

      const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
      decipher.setAuthTag(tag)
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
      const parsed = JSON.parse(plaintext) as Partial<TreeShareEnvelope>

      if (parsed.type !== 'TREE_FEATURE') return null
      if (typeof parsed.projectId !== 'string' || typeof parsed.featureId !== 'string') return null
      if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) return null

      return {
        type: 'TREE_FEATURE',
        projectId: parsed.projectId,
        featureId: parsed.featureId,
      }
    } catch {
      return null
    }
  }

  // Backward compatibility for existing shared links signed as JWT.
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
