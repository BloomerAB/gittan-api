import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const limitParam = req.query["limit"]
  const limit = limitParam ? Math.min(Number(limitParam), 500) : 50

  const { auditRepo } = deps()
  const events = await auditRepo.list(param(req, "orgId"), { limit })
  res.json(events)
}
