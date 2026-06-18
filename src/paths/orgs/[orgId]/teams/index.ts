import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const CreateTeamBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(128),
  topology: z
    .enum(["stream-aligned", "platform", "enabling", "complicated-subsystem"])
    .default("stream-aligned"),
  slackChannel: z.string().optional(),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { teamRepo } = deps()
  const teams = await teamRepo.listTeams(param(req, "orgId"))
  res.json(teams)
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { teamRepo } = deps()
  const parsed = CreateTeamBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  try {
    const team = await teamRepo.createTeam({
      id: randomUUID(),
      orgId: param(req, "orgId"),
      ...parsed.data,
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
