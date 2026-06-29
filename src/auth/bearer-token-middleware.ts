import type { Client } from "cassandra-driver"
import type { NextFunction, Request, Response } from "express"

import type { TConfig } from "../config/index.js"
import { KEYSPACE } from "../db/schema.js"
import { deps } from "../deps.js"

// The shared auth-server is a pure IdP: introspection proves identity only
// (active, userId/sub, email). Authorization (role, org/company membership) is
// owned by gittan and resolved from gittan's own users table — never carried in
// the token. (Plan: decouple token introspection from any single product.)
type TIntrospectionResponse = {
  readonly active: boolean
  readonly sub?: string
  readonly scope?: string
  readonly userId?: string
}

type TUserAttributes = {
  readonly email: string
  readonly companyId: string
  readonly role: string
}

const resolveUserAttributes = async (
  db: Client,
  userId: string,
): Promise<TUserAttributes> => {
  const result = await db.execute(
    `SELECT email, role, org_id FROM ${KEYSPACE}.users WHERE id = ?`,
    [userId],
    { prepare: true },
  )
  const row = result.first()
  return {
    email: (row?.email as string) ?? "",
    companyId: (row?.org_id as string) ?? "",
    role: (row?.role as string) ?? "member",
  }
}

const UNPROTECTED_PREFIXES = [
  "/healthz",
  "/readyz",
  "/docs",
  "/api-definition",
  "/metrics",
  "/hooks/",
  "/cli/install",
  "/cli/dl/",
  "/cli/versions",
] as const

const isUnprotectedRoute = (path: string): boolean =>
  UNPROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))

const extractBearerToken = (
  authHeader: string | undefined,
): string | undefined => {
  if (!authHeader) return undefined
  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "Bearer" || !token) return undefined
  return token
}

const introspectToken = async (
  token: string,
  config: TConfig,
): Promise<TIntrospectionResponse> => {
  const url = `${config.oauth2Issuer}/oauth/introspect`

  const body = new URLSearchParams({
    token,
    client_id: config.oauth2ClientId,
    client_secret: config.oauth2ClientSecret,
  })

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Introspection request failed: ${response.status}`)
  }

  return (await response.json()) as TIntrospectionResponse
}

export const createBearerTokenMiddleware = (config: TConfig) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isUnprotectedRoute(req.path)) {
      next()
      return
    }

    const token = extractBearerToken(req.headers.authorization)
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header" })
      return
    }

    try {
      const result = await introspectToken(token, config)

      if (!result.active) {
        res.status(401).json({ error: "Token is inactive or expired" })
        return
      }

      const userId = result.userId ?? result.sub ?? ""
      const { email, companyId, role } = await resolveUserAttributes(
        deps().db,
        userId,
      )
      ;(req as unknown as Record<string, unknown>).user = {
        id: userId,
        email,
        companyId,
        role,
      }

      next()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Token validation failed"
      console.error("Bearer token introspection failed:", message)
      res.status(401).json({ error: "Token validation failed" })
    }
  }
}
