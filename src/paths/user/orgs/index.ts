import type { Request, Response } from "express"

import { getAuthUser } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { orgRepo, memberRepo } = deps()

  const memberships = await memberRepo.getUserOrgIds(user.id)

  if (memberships.length === 0) {
    res.json([])
    return
  }

  const orgs = await Promise.all(
    memberships.map(async (m) => {
      const org = await orgRepo.getById(m.orgId)
      if (!org) return null
      return {
        id: org.id,
        name: org.name,
        displayName: org.displayName,
        role: m.role,
        plan: "starter" as const,
        pipelineScope: org.pipelineScope,
        oidcIssuer: org.oidcIssuer,
        mandatorySso: org.mandatorySso,
        ssoEmailDomain: org.ssoEmailDomain,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      }
    }),
  )

  res.json(orgs.filter(Boolean))
}
