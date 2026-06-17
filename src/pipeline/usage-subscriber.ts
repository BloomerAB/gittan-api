import type { NatsConnection } from "nats"
import { StringCodec } from "nats"

import type { TUsageRepo } from "../db/usage-repo.js"

type TPipelineResultMessage = {
  readonly pushEventId: string
  readonly orgId: string
  readonly teamId: string
  readonly repoId: string
  readonly durationMs: number
  readonly status: string
}

export type TUsageSubscriberDeps = {
  readonly nats: NatsConnection
  readonly usageRepo: TUsageRepo
}

export const startUsageSubscriber = (deps: TUsageSubscriberDeps): void => {
  const sc = StringCodec()
  const sub = deps.nats.subscribe("gittan.pipeline.result")

  ;(async () => {
    for await (const msg of sub) {
      try {
        const result: TPipelineResultMessage = JSON.parse(sc.decode(msg.data))

        if (!result.orgId || !result.repoId || result.durationMs <= 0) {
          continue
        }

        await deps.usageRepo.recordPipelineUsage({
          orgId: result.orgId,
          pipelineRunId: result.pushEventId,
          teamId: result.teamId,
          repoId: result.repoId,
          durationMs: result.durationMs,
        })
      } catch (err) {
        console.error("Failed to record pipeline usage:", err)
      }
    }
  })()
}
