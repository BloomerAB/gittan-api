import type { Request, Response } from "express"

import { getAuthUser } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { orgRepo } = deps()

  const orgs = await orgRepo.getByUserId(user.id)

  const result = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    displayName: org.displayName,
    role: "owner",
    plan: "starter",
    oidcIssuer: org.oidcIssuer,
    mandatorySso: org.mandatorySso,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  }))

  res.json(result)
}
