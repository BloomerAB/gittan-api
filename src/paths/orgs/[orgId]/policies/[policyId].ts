import type { Request, Response } from "express"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { policyRepo } = deps()
  const policy = await policyRepo.get(param(req, "orgId"), param(req, "policyId"))

  if (!policy) {
    res.status(404).json({ error: "Policy not found" })
    return
  }

  res.json(policy)
}

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { policyRepo, auditRepo } = deps()
  const orgId = param(req, "orgId")
  const policyId = param(req, "policyId")

  const existing = await policyRepo.get(orgId, policyId)
  if (!existing) {
    res.status(404).json({ error: "Policy not found" })
    return
  }

  await policyRepo.remove(orgId, policyId)

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "policy.delete",
    resourceType: "policy",
    resourceId: policyId,
    detail: `Deleted policy "${existing.name}"`,
  })

  res.status(204).end()
}
