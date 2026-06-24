import type { Request, Response } from "express"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const user = getAuthUser(req)
  const { inviteRepo, memberRepo } = deps()
  const orgId = param(req, "orgId")
  const id = param(req, "id")

  const membership = await memberRepo.getMembership(orgId, user.id)
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    res.status(403).json({ error: "Only org owners and admins can revoke invites" })
    return
  }

  await inviteRepo.delete(orgId, id)
  res.status(204).end()
}
