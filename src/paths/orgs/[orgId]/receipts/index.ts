import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { receiptRepo } = deps()
  const receipts = await receiptRepo.list(param(req, "orgId"))

  res.json(receipts)
}
