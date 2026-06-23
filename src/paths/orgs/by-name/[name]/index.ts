import type { Request, Response } from "express"

import { getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  getAuthUser(req)
  const { orgRepo } = deps()

  const name = param(req, "name")
  const org = await orgRepo.getByName(name)

  if (!org) {
    res.status(404).json({ error: "Organization not found" })
    return
  }

  res.json({
    id: org.id,
    name: org.name,
    displayName: org.displayName,
    oidcIssuer: org.oidcIssuer,
    mandatorySso: org.mandatorySso,
    ssoEmailDomain: org.ssoEmailDomain,
  })
}
