import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  res.json({
    teamId: param(req, "teamId"),
    period: "7d",
    pushFrequency: 0,
    avgPipelineLeadTimeMs: 0,
    pushRejectionRate: 0,
    avgRecoveryTimeMs: 0,
    totalPushes: 0,
    successfulPushes: 0,
    failedPushes: 0,
    repos: [],
  })
}
