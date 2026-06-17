import type { Request, Response } from "express"

import { assertPlatformAdmin } from "../../auth/helpers.js"
import { deps } from "../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertPlatformAdmin(req, res)) return

  const { usageRepo } = deps()
  const allUsage = await usageRepo.listAllOrgUsage()

  const totalRevenue = allUsage.reduce((sum, o) => sum + o.monthlyRevenue, 0)
  const totalCiMinutes = allUsage.reduce((sum, o) => sum + o.ciMinutesUsed, 0)
  const blocked = allUsage.filter((o) => o.quotaStatus === "blocked").length
  const warning = allUsage.filter((o) => o.quotaStatus === "warning").length

  res.json({
    summary: {
      totalOrgs: allUsage.length,
      totalRevenue,
      totalCiMinutes,
      blocked,
      warning,
    },
    orgs: allUsage,
  })
}
