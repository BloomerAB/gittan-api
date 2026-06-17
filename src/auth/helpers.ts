import type { Request, Response } from "express"

const PLATFORM_ORG_ID = "bloomer"

export type TGittanUser = {
  readonly id: string
  readonly email: string
  readonly orgId: string
  readonly role: string
}

export const param = (req: Request, name: string): string => {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : (val ?? "")
}

export const getAuthUser = (req: Request): TGittanUser => {
  const user = (req as unknown as Record<string, unknown>).user as
    | Record<string, unknown>
    | undefined

  if (!user) {
    throw new Error("No authenticated user on request")
  }

  return {
    id: (user.id as string) ?? "",
    email: (user.email as string) ?? "",
    orgId: (user.companyId as string) ?? "",
    role: (user.role as string) ?? "member",
  }
}

export const assertOrgAccess = (
  req: Request,
  res: Response,
  paramName = "orgId",
): boolean => {
  const user = getAuthUser(req)
  const requestedOrg = param(req, paramName)

  if (!requestedOrg) return true

  if (user.orgId !== requestedOrg) {
    res.status(403).json({ error: "Access denied to this organization" })
    return false
  }

  return true
}

export const assertPlatformAdmin = (
  req: Request,
  res: Response,
): boolean => {
  const user = getAuthUser(req)

  if (user.orgId !== PLATFORM_ORG_ID) {
    res.status(403).json({ error: "Platform admin access required" })
    return false
  }

  return true
}
