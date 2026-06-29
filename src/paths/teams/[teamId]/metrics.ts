import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { calculateTeamMetrics } from "../../../metrics/calculator.js"

const PERIOD_DAYS = 7

export const GET = async (req: Request, res: Response): Promise<void> => {
  const teamId = param(req, "teamId")
  const { pipelineRepo, db } = deps()

  try {
    // Verify team belongs to user's org
    const teamCheckResult = await db.execute(
      "SELECT id FROM gittan.teams WHERE org_id = ? AND id = ? ALLOW FILTERING",
      [(req as any).user.companyId, teamId],
      { prepare: true },
    )

    if (teamCheckResult.rowLength === 0) {
      res.status(403).json({ error: "Access denied to this team" })
      return
    }

    // Get pipeline run summaries for the team
    const summaries = await pipelineRepo.listByTeam(teamId, 50)

    // Calculate 7-day cutoff
    const sevenDaysAgo = Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000

    // Filter to runs within 7 days and fetch full data
    const fullRuns = await Promise.all(
      summaries
        .filter((s) => new Date(s.startedAt).getTime() > sevenDaysAgo)
        .map(async (summary) => {
          const fullRun = await pipelineRepo.getById(summary.repoId, summary.runId)
          return fullRun
        }),
    )

    // Filter out undefined results
    const validRuns = fullRuns.filter((run) => run !== undefined)

    // Calculate metrics
    const metrics = calculateTeamMetrics(validRuns, PERIOD_DAYS)

    res.json({
      teamId,
      period: "7d",
      ...metrics,
    })
  } catch (error) {
    console.error("Error fetching team metrics:", error)
    res.status(500).json({ error: "Failed to calculate metrics" })
  }
}
