import type { NatsConnection } from "nats"
import { StringCodec } from "nats"

import type { TPipelineRepo, TPipelineRunRow } from "../db/pipeline-repo.js"

type TPipelineResultMessage = {
  readonly pushEventId: string
  readonly orgId: string
  readonly teamId: string
  readonly repoId: string
  readonly branch: string
  readonly isGated: boolean
  readonly status: string
  readonly steps: ReadonlyArray<{
    readonly stepName: string
    readonly status: string
    readonly durationMs: number
    readonly source?: string
    readonly exitCode?: number
    readonly output?: string
    readonly error?: string
  }>
  readonly startedAt: string
  readonly finishedAt: string
  readonly durationMs: number
}

export type TResultSubscriberDeps = {
  readonly nats: NatsConnection
  readonly pipelineRepo: TPipelineRepo
}

export const startResultSubscriber = (deps: TResultSubscriberDeps): void => {
  const sc = StringCodec()
  const sub = deps.nats.subscribe("gittan.pipeline.result")

  ;(async () => {
    for await (const msg of sub) {
      try {
        const result: TPipelineResultMessage = JSON.parse(sc.decode(msg.data))

        const run: TPipelineRunRow = {
          id: result.pushEventId,
          repoId: result.repoId,
          pushEventId: result.pushEventId,
          orgId: result.orgId,
          teamId: result.teamId,
          branch: result.branch,
          status: result.status,
          steps: result.steps,
          startedAt: new Date(result.startedAt).toISOString(),
          finishedAt: new Date(result.finishedAt).toISOString(),
        }

        await deps.pipelineRepo.save(run)
        console.log(`Pipeline result saved: ${result.repoId}/${result.pushEventId} → ${result.status}`)
      } catch (err) {
        console.error("Failed to save pipeline result:", err)
      }
    }
  })()
}
