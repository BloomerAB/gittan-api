import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../../auth/helpers.js"
import { deps } from "../../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { pipelineRepo } = deps()
  const repoId = param(req, "repoId")
  const limit = Math.min(Number(req.query.limit) || 20, 100)

  const runs = await pipelineRepo.listByRepo(repoId, limit)
  res.json(runs)
}
