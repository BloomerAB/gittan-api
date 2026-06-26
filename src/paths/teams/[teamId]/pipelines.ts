import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { pipelineRepo } = deps()
  const teamId = param(req, "teamId")
  const limit = Math.min(Number(req.query.limit) || 50, 200)

  const runs = await pipelineRepo.listByTeam(teamId, limit)
  res.json(runs)
}
