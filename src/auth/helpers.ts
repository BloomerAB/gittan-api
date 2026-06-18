import type { Request, Response } from "express"

import { deps } from "../deps.js"

const PLATFORM_ORG_ID = "bloomer"

export type TTokenUser = {
  readonly id: string
  readonly email: string
  readonly role: string
}

export type TGittanUser = TTokenUser & {
  readonly orgId: string
}

export const param = (req: Request, name: string): string => {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : (val ?? "")
}

export const getAuthUser = (req: Request): TTokenUser => {
  const user = (req as unknown as Record<string, unknown>).user as
    | Record<string, unknown>
    | undefined

  if (!user) {
    throw new Error("No authenticated user on request")
  }

  return {
    id: (user.id as string) ?? "",
    email: (user.email as string) ?? "",
    role: (user.role as string) ?? "member",
  }
}

export const getUserOrgId = async (userId: string): Promise<string> => {
  const { db } = deps()
  const result = await db.execute(
    "SELECT org_id FROM gittan.users WHERE id = ?",
    [userId],
    { prepare: true },
  )
  return result.rowLength > 0
    ? (result.first().org_id as string | null) ?? ""
    : ""
}

export const assertOrgAccess = async (
  req: Request,
  res: Response,
  paramName = "orgId",
): Promise<boolean> => {
  const user = getAuthUser(req)
  const requestedOrg = param(req, paramName)

  if (!requestedOrg) return true

  const userOrgId = await getUserOrgId(user.id)

  if (userOrgId !== requestedOrg) {
    res.status(403).json({ error: "Access denied to this organization" })
    return false
  }

  return true
}

export const assertPlatformAdmin = async (
  req: Request,
  res: Response,
): Promise<boolean> => {
  const user = getAuthUser(req)
  const userOrgId = await getUserOrgId(user.id)

  if (userOrgId !== PLATFORM_ORG_ID) {
    res.status(403).json({ error: "Platform admin access required" })
    return false
  }

  return true
}
