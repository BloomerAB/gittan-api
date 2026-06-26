import type { Request, Response } from "express"

import { deps } from "../deps.js"

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

export const assertOrgAccess = async (
  req: Request,
  res: Response,
  paramName = "orgId",
): Promise<boolean> => {
  const user = getAuthUser(req)
  const requestedOrg = param(req, paramName)

  if (!requestedOrg) return true

  const { memberRepo } = deps()
  const membership = await memberRepo.getMembership(requestedOrg, user.id)

  if (!membership) {
    res.status(403).json({ error: "Access denied to this organization" })
    return false
  }

  return true
}

export const assertOrgOwner = async (
  req: Request,
  res: Response,
  paramName = "orgId",
): Promise<boolean> => {
  const user = getAuthUser(req)
  const orgId = param(req, paramName)

  const { memberRepo } = deps()
  const membership = await memberRepo.getMembership(orgId, user.id)

  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Organization owner access required" })
    return false
  }

  return true
}

export const assertPlatformAdmin = async (
  req: Request,
  res: Response,
): Promise<boolean> => {
  const user = getAuthUser(req)
  const { memberRepo } = deps()

  const memberships = await memberRepo.getUserOrgIds(user.id)
  const isBloomerOwner = memberships.some((m) => m.orgId === "bloomer" && m.role === "owner")

  if (!isBloomerOwner) {
    res.status(403).json({ error: "Platform admin access required" })
    return false
  }

  return true
}
