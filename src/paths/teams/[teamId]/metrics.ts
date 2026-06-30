import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { calculateTeamMetrics } from "../../../metrics/calculator.js"

const PERIOD_DAYS = 7
// Query enough runs to cover 7 days. Assuming 5 pushes/day per team on average,
// 200 should cover ~40 days of history with room for spikes.
const SUMMARY_LIMIT = 200

export const GET = async (req: Request, res: Response): Promise<void> => {
  const teamId = param(req, "teamId")
  const { pipelineRepo, db } = deps()

  try {
    // Verify team belongs to user's org
    const teamCheckResult = await db.execute(
      "SELECT id FROM gittan.teams WHERE org_id = ? AND id = ?",
      [(req as any).user.companyId, teamId],
      { prepare: true },
    )

    if (teamCheckResult.rowLength === 0) {
      res.status(403).json({ error: "Access denied to this team" })
      return
    }

    // Get pipeline run summaries for the team
    // Note: listByTeam returns results ordered by started_at DESC, so we get recent runs first
    const summaries = await pipelineRepo.listByTeam(teamId, SUMMARY_LIMIT)

    // Calculate 7-day cutoff
    const sevenDaysAgo = Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000

    // Filter to runs within 7 days and fetch full data
    const summariesIn7Days = summaries.filter(
      (s) => new Date(s.startedAt).getTime() > sevenDaysAgo,
    )

    const fullRuns = await Promise.all(
      summariesIn7Days.map(async (summary) => {
        try {
          const fullRun = await pipelineRepo.getById(summary.repoId, summary.runId)
          if (!fullRun) {
            console.warn(
              `Pipeline run not found: repo=${summary.repoId}, run=${summary.runId}`,
            )
            return undefined
          }
          return fullRun
        } catch (err) {
          console.error(
            `Error fetching pipeline run: repo=${summary.repoId}, run=${summary.runId}`,
            err,
          )
          return undefined
        }
      }),
    )

    // Filter out undefined/failed results and log
    const validRuns = fullRuns.filter((run) => run !== undefined)
    if (validRuns.length < fullRuns.length) {
      console.warn(
        `Metrics calculation: ${fullRuns.length - validRuns.length} of ${fullRuns.length} runs could not be fetched`,
      )
    }

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
