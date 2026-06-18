import type { Request, Response } from "express"
import { z } from "zod"

import { getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const AddMemberBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["team-admin", "writer", "reader"]),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo } = deps()
  const members = await teamRepo.listMembers(param(req, "teamId"))
  res.json(members)
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo, auditRepo } = deps()
  const parsed = AddMemberBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const teamId = param(req, "teamId")
  const user = getAuthUser(req)

  const member = await teamRepo.addMember({
    teamId,
    addedBy: user.id,
    ...parsed.data,
  })

  await auditRepo.log({
    orgId: user.orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.add",
    resourceType: "team_member",
    resourceId: `${teamId}/${parsed.data.userId}`,
    detail: `Added user ${parsed.data.userId} to team ${teamId} as ${parsed.data.role}`,
  })

  res.status(201).json(member)
}
