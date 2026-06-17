import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { usageRepo } = deps()
  const months = Math.min(parseInt(String(req.query.months ?? "6"), 10), 24)
  const history = await usageRepo.getUsageHistory(param(req, "orgId"), months)

  res.json(history)
}
