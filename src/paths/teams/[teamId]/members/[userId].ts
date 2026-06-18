import type { Request, Response } from "express"

import { getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo, auditRepo } = deps()
  const teamId = param(req, "teamId")
  const userId = param(req, "userId")
  const user = getAuthUser(req)

  await teamRepo.removeMember(teamId, userId)

  await auditRepo.log({
    orgId: user.orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.remove",
    resourceType: "team_member",
    resourceId: `${teamId}/${userId}`,
    detail: `Removed user ${userId} from team ${teamId}`,
  })

  res.status(204).end()
}
