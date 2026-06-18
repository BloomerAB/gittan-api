import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../../auth/helpers.js"
import { deps } from "../../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { teamRepo } = deps()
  const team = await teamRepo.getTeamByName(param(req, "orgId"), param(req, "name"))

  if (!team) {
    res.status(404).json({ error: "Team not found" })
    return
  }

  res.json(team)
}
