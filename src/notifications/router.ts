import type { NatsConnection } from "nats"
import { StringCodec } from "nats"

import type { TTeamRepo } from "../db/team-repo.js"
import type { TRepoMetadataRepo } from "../db/repo-metadata.js"
import {
  formatFailureCompact,
  formatFailureDetailed,
  formatReviewNeeded,
  type TPipelineNotification,
  type TReviewNotification,
} from "./formatter.js"

export type TSlackSender = {
  readonly send: (channel: string, message: string) => Promise<void>
}

export type TNotificationConfig = {
  readonly batchWindowMs: number
  readonly cooldownMs: number
  readonly escalateAfterMs: number
}

type TPendingNotification = {
  readonly notification: TPipelineNotification
  readonly teamSlackChannel?: string
  readonly receivedAt: number
}

export type TRouterDeps = {
  readonly nats: NatsConnection
  readonly slack: TSlackSender
  readonly teamRepo: TTeamRepo
  readonly repoMetadata: TRepoMetadataRepo
  readonly config: TNotificationConfig
}

export const createNotificationRouter = (deps: TRouterDeps) => {
  const sc = StringCodec()
  const pendingBatch = new Map<string, TPendingNotification[]>()
  const lastNotified = new Map<string, number>()
  let batchTimer: ReturnType<typeof setTimeout> | undefined

  const getTeamSlackChannel = async (teamId: string): Promise<string | undefined> => {
    const teams = await deps.teamRepo.listTeams("")
    const team = teams.find((t) => t.id === teamId)
    return team?.slackChannel
  }

  const shouldNotify = (channelKey: string): boolean => {
    const lastTime = lastNotified.get(channelKey)
    if (!lastTime) return true
    return Date.now() - lastTime >= deps.config.cooldownMs
  }

  const flushBatch = async (): Promise<void> => {
    for (const [channelKey, notifications] of pendingBatch.entries()) {
      if (notifications.length === 0) continue
      if (!shouldNotify(channelKey)) continue

      const channel = notifications[0].teamSlackChannel
      if (!channel) continue

      const latest = notifications[notifications.length - 1]
      const template = notifications.length > 1 ? "detailed" : "compact"

      const message =
        template === "compact"
          ? formatFailureCompact(latest.notification)
          : [
              `${notifications.length} pipeline failures:`,
              ...notifications.map((n) =>
                formatFailureCompact(n.notification),
              ),
            ].join("\n\n")

      await deps.slack.send(channel, message)
      lastNotified.set(channelKey, Date.now())
    }

    pendingBatch.clear()
  }

  const handlePipelineResult = async (data: Uint8Array): Promise<void> => {
    const result = JSON.parse(sc.decode(data))

    if (result.status === "passed") return

    const repoMeta = await deps.repoMetadata.getById(
      result.orgId ?? "",
      result.repoId,
    )

    const notification: TPipelineNotification = {
      repoName: repoMeta?.name ?? result.repoId,
      branch: result.branch,
      commitSha: result.steps?.[0]?.sha ?? "0000000",
      pusher: result.pusher ?? "unknown",
      status: result.status,
      steps: result.steps ?? [],
      durationMs: result.durationMs ?? 0,
      isCascade: result.isCascade ?? false,
      sourceRepo: result.sourceRepoId,
    }

    const teamId = repoMeta?.teamId ?? "unknown"
    const channel = await getTeamSlackChannel(teamId)

    if (channel) {
      const channelKey = `${channel}:${teamId}`
      const existing = pendingBatch.get(channelKey) ?? []
      pendingBatch.set(channelKey, [
        ...existing,
        {
          notification,
          teamSlackChannel: channel,
          receivedAt: Date.now(),
        },
      ])

      if (!batchTimer) {
        batchTimer = setTimeout(async () => {
          batchTimer = undefined
          await flushBatch()
        }, deps.config.batchWindowMs)
      }
    }
  }

  const start = (): void => {
    const sub = deps.nats.subscribe("gittan.pipeline.result")
    ;(async () => {
      for await (const msg of sub) {
        try {
          await handlePipelineResult(msg.data)
        } catch (err) {
          console.error("Notification router error:", err)
        }
      }
    })()
  }

  const stop = (): void => {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = undefined
    }
  }

  return { start, stop, flushBatch }
}

export type TNotificationRouter = ReturnType<typeof createNotificationRouter>
