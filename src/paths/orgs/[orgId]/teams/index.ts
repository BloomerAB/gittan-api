import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { checkResourceLimit } from "../../../../limits.js"

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const CreateTeamBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  displayName: z.string().min(1).max(128),
  slackChannel: z.string().optional(),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { teamRepo } = deps()
  const teams = await teamRepo.listTeams(param(req, "orgId"))
  res.json(teams)
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { teamRepo, usageRepo, auditRepo } = deps()
  const parsed = CreateTeamBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const orgId = param(req, "orgId")
  const name = parsed.data.name ?? slugify(parsed.data.displayName)

  if (!name) {
    res.status(400).json({ error: "Display name must contain at least one alphanumeric character" })
    return
  }

  const existingTeams = await teamRepo.listTeams(orgId)
  const limitCheck = await checkResourceLimit(usageRepo, orgId, "teamLimit", existingTeams.length)
  if (!limitCheck.allowed) {
    res.status(403).json({ error: limitCheck.reason })
    return
  }

  try {
    const team = await teamRepo.createTeam({
      id: randomUUID(),
      orgId,
      name,
      displayName: parsed.data.displayName,
      slackChannel: parsed.data.slackChannel,
    })

    const user = getAuthUser(req)
    await auditRepo.log({
      orgId,
      actorId: user.id,
      actorEmail: user.email,
      action: "team.create",
      resourceType: "team",
      resourceId: team.id,
      detail: `Created team "${team.displayName}"`,
    })

    res.status(201).json(team)
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      res.status(409).json({ error: err.message })
      return
    }
    throw err
  }
}
