import type { Request, Response } from "express"

import { getAuthUser, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { KEYSPACE } from "../../../db/schema.js"
import { checkResourceLimit } from "../../../limits.js"

export const POST = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { inviteRepo, memberRepo, orgRepo, usageRepo, db } = deps()
  const token = param(req, "token")

  const invite = await inviteRepo.getByToken(token)
  if (!invite) {
    res.status(404).json({ error: "Invite not found or expired" })
    return
  }

  const existing = await memberRepo.getMembership(invite.orgId, user.id)
  if (existing) {
    res.status(409).json({ error: "Already a member of this organization" })
    return
  }

  const org = await orgRepo.getById(invite.orgId)
  if (!org) {
    res.status(404).json({ error: "Organization not found" })
    return
  }

  const members = await memberRepo.getMembers(invite.orgId)
  const limitCheck = await checkResourceLimit(usageRepo, invite.orgId, "userLimit", members.length)
  if (!limitCheck.allowed) {
    res.status(403).json({ error: limitCheck.reason })
    return
  }

  await memberRepo.addMember(invite.orgId, user.id, invite.role)

  await db.batch(
    [
      {
        query: `INSERT INTO ${KEYSPACE}.users_by_org (org_id, user_id, email, name) VALUES (?, ?, ?, ?)`,
        params: [invite.orgId, user.id, user.email, user.email],
      },
    ],
    { prepare: true },
  )

  await inviteRepo.delete(invite.orgId, invite.id)

  res.json({
    orgId: invite.orgId,
    orgName: org.name,
    orgDisplayName: org.displayName,
    role: invite.role,
  })
}
