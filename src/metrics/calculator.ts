import type { TPipelineRunRow } from "../db/pipeline-repo.js"

export type TPushMetrics = {
  readonly pushEventId: string
  readonly status: "success" | "failed"
  readonly leadTimeMs: number
  readonly isRecovered: boolean
  readonly recoveryTimeMs?: number
}

/**
 * Calculate team metrics from pipeline runs
 * @param runs - All pipeline runs for the team (unsorted)
 * @param periodDays - Number of days to calculate frequency over
 * @returns Team metrics
 */
export const calculateTeamMetrics = (runs: ReadonlyArray<TPipelineRunRow>, periodDays: number = 7) => {
  if (runs.length === 0) {
    return {
      totalPushes: 0,
      successfulPushes: 0,
      failedPushes: 0,
      pushFrequency: 0,
      avgPipelineLeadTimeMs: 0,
      pushRejectionRate: 0,
      avgRecoveryTimeMs: 0,
    }
  }

  // Build a map of pushEventId -> earliest startedAt for recovery time calculation
  const pushStartTimes = new Map<string, Date>()
  for (const run of runs) {
    const currentStart = pushStartTimes.get(run.pushEventId)
    const runStart = new Date(run.startedAt)
    if (!currentStart || runStart < currentStart) {
      pushStartTimes.set(run.pushEventId, runStart)
    }
  }

  // Group runs by pushEventId
  const pushGroups = new Map<string, TPipelineRunRow[]>()
  for (const run of runs) {
    if (!pushGroups.has(run.pushEventId)) {
      pushGroups.set(run.pushEventId, [])
    }
    pushGroups.get(run.pushEventId)!.push(run)
  }

  // Determine push status and metrics
  const pushMap = new Map<string, TPushMetrics>()

  for (const [pushEventId, runsForPush] of pushGroups.entries()) {
    // Find the latest run (by finishedAt time) for this push - use finish time not start time
    // since a run might have been started but not finished, we want the one that actually completed most recently
    let latestRun = runsForPush[0]!
    for (const run of runsForPush) {
      if (new Date(run.finishedAt).getTime() > new Date(latestRun.finishedAt).getTime()) {
        latestRun = run
      }
    }
    const leadTimeMs = new Date(latestRun.finishedAt).getTime() - new Date(latestRun.startedAt).getTime()

    // Check if ANY run for this push is successful
    const hasAnySuccess = runsForPush.some((r) => r.status === "success")
    const isSuccess = hasAnySuccess

    // Recovery time: if latest run has resolvedFrom, calculate recovery time
    let recoveryTimeMs: number | undefined
    if (latestRun.resolvedFrom) {
      const failureStartTime = pushStartTimes.get(latestRun.resolvedFrom)
      if (failureStartTime) {
        recoveryTimeMs = new Date(latestRun.finishedAt).getTime() - failureStartTime.getTime()
      }
    }

    pushMap.set(pushEventId, {
      pushEventId,
      status: isSuccess ? "success" : "failed",
      leadTimeMs,
      isRecovered: !!latestRun.resolvedFrom,
      recoveryTimeMs,
    })
  }

  const pushMetrics = Array.from(pushMap.values())
  const totalPushes = pushMetrics.length
  const successfulPushes = pushMetrics.filter((p) => p.status === "success").length
  const failedPushes = totalPushes - successfulPushes

  // Calculate averages
  const avgPipelineLeadTimeMs = pushMetrics.length > 0 ? Math.round(pushMetrics.reduce((sum, p) => sum + p.leadTimeMs, 0) / pushMetrics.length) : 0

  const recoveryTimes = pushMetrics.filter((p) => p.isRecovered && p.recoveryTimeMs !== undefined).map((p) => p.recoveryTimeMs ?? 0)
  const avgRecoveryTimeMs = recoveryTimes.length > 0 ? Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length) : 0

  const pushFrequency = totalPushes / periodDays
  const pushRejectionRate = totalPushes > 0 ? failedPushes / totalPushes : 0

  return {
    totalPushes,
    successfulPushes,
    failedPushes,
    pushFrequency,
    avgPipelineLeadTimeMs,
    pushRejectionRate,
    avgRecoveryTimeMs,
  }
}
