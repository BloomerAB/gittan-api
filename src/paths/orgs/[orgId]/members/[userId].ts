import type { Request, Response } from "express"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { KEYSPACE } from "../../../../db/schema.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const user = getAuthUser(req)
  const { memberRepo, db } = deps()
  const orgId = param(req, "orgId")
  const userId = param(req, "userId")

  const membership = await memberRepo.getMembership(orgId, user.id)
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    res.status(403).json({ error: "Only org owners and admins can remove members" })
    return
  }

  const target = await memberRepo.getMembership(orgId, userId)
  if (!target) {
    res.status(404).json({ error: "Member not found" })
    return
  }

  if (target.role === "owner") {
    res.status(400).json({ error: "Cannot remove the org owner" })
    return
  }

  await memberRepo.removeMember(orgId, userId)

  await db.execute(
    `DELETE FROM ${KEYSPACE}.users_by_org WHERE org_id = ? AND user_id = ?`,
    [orgId, userId],
    { prepare: true },
  )

  res.status(204).end()
}
