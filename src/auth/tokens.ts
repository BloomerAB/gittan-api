import { createHmac } from "node:crypto"

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set (min 32 chars). Generate: openssl rand -hex 32")
}

export type TTokenPayload = {
  readonly userId: string
  readonly email: string
  readonly orgId?: string
  readonly role?: string
}

export const createToken = (payload: TTokenPayload): string => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 }),
  ).toString("base64url")
  const signature = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url")
  return `${header}.${body}.${signature}`
}

export const verifyToken = (token: string): TTokenPayload | undefined => {
  const [header, body, signature] = token.split(".")
  if (!header || !body || !signature) return undefined

  const expected = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url")
  if (signature !== expected) return undefined

  const payload = JSON.parse(Buffer.from(body, "base64url").toString())
  if (payload.exp < Math.floor(Date.now() / 1000)) return undefined

  return payload
}
