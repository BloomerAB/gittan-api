import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { teamRepo } = deps()
  const team = await teamRepo.getTeam(param(req, "orgId"), param(req, "teamId"))

  if (!team) {
    res.status(404).json({ error: "Team not found" })
    return
  }

  res.json(team)
}

const UpdateTeamBody = z.object({
  displayName: z.string().min(1).max(128).optional(),
  topology: z.enum(["stream-aligned", "platform", "enabling", "complicated-subsystem"]).optional(),
  slackChannel: z.string().nullable().optional(),
})

export const PUT = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const parsed = UpdateTeamBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const { teamRepo, auditRepo } = deps()
  const orgId = param(req, "orgId")
  const teamId = param(req, "teamId")

  const team = await teamRepo.updateTeam(orgId, teamId, parsed.data)
  if (!team) {
    res.status(404).json({ error: "Team not found" })
    return
  }

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "team.update",
    resourceType: "team",
    resourceId: teamId,
    detail: `Updated team "${team.name}"`,
  })

  res.json(team)
}
