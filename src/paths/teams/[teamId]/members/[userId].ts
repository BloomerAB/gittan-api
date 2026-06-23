import type { Request, Response } from "express"

import { getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { KEYSPACE } from "../../../../db/schema.js"

const assertTeamInUserOrg = async (
  req: Request,
  res: Response,
): Promise<string | false> => {
  const { db, memberRepo } = deps()
  const user = getAuthUser(req)
  const teamId = param(req, "teamId")

  const memberships = await memberRepo.getUserOrgIds(user.id)

  for (const m of memberships) {
    const result = await db.execute(
      `SELECT id FROM ${KEYSPACE}.teams WHERE org_id = ? AND id = ?`,
      [m.orgId, teamId],
      { prepare: true },
    )
    if (result.rowLength > 0) return m.orgId
  }

  res.status(403).json({ error: "Access denied to this team" })
  return false
}

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  const orgId = await assertTeamInUserOrg(req, res)
  if (orgId === false) return

  const { teamRepo, auditRepo } = deps()
  const teamId = param(req, "teamId")
  const userId = param(req, "userId")
  const user = getAuthUser(req)

  await teamRepo.removeMember(teamId, userId)

  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.remove",
    resourceType: "team_member",
    resourceId: `${teamId}/${userId}`,
    detail: `Removed user ${userId} from team ${teamId}`,
  })

  res.status(204).end()
}
