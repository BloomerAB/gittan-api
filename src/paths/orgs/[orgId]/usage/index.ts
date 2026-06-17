import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const MonthParam = z.string().regex(/^\d{4}-\d{2}$/).optional()

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { usageRepo } = deps()
  const monthParsed = MonthParam.safeParse(req.query.month)
  if (!monthParsed.success) {
    res.status(400).json({ error: "Invalid month format, expected YYYY-MM" })
    return
  }

  const usage = await usageRepo.getUsage(param(req, "orgId"), monthParsed.data)
  const ciLimit = await usageRepo.getEffectiveCiLimit(param(req, "orgId"))

  if (!usage) {
    res.json({
      orgId: param(req, "orgId"),
      month: monthParsed.data ?? currentMonth(),
      ciMinutesUsed: 0,
      ciMinutesLimit: ciLimit,
      storageBytes: 0,
      userCount: 0,
      teamCount: 0,
      repoCount: 0,
    })
    return
  }

  res.json({
    ...usage,
    ciMinutesLimit: ciLimit,
  })
}
