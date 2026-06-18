import type { Request, Response } from "express"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { stepRegistry, auditRepo } = deps()
  const orgId = param(req, "orgId")
  const name = param(req, "name")

  await stepRegistry.remove(orgId, name)

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "step.delete",
    resourceType: "step",
    resourceId: name,
    detail: `Deleted step "${name}"`,
  })

  res.status(204).end()
}
