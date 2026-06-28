import type { Request, Response } from "express"
import type { NatsConnection, Subscription } from "nats"
import { StringCodec } from "nats"

import { getAuthUser } from "../auth/helpers.js"

type TStepProgressEvent = {
  readonly pushEventId: string
  readonly repoId: string
  readonly stepName: string
  readonly description?: string
  readonly status: string
  readonly durationMs: number
  readonly exitCode?: number
  readonly output?: string
  readonly error?: string
  readonly source?: string
}

type TPipelineResultEvent = {
  readonly pushEventId: string
  readonly repoId: string
  readonly status: string
  readonly steps: ReadonlyArray<unknown>
  readonly startedAt: string
  readonly finishedAt: string
  readonly durationMs: number
  readonly branch?: string
  readonly commitSha?: string
  readonly commitMessage?: string
  readonly pusher?: string
}

const sendEvent = (res: Response, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export const createPipelineSseHandler = (nats: NatsConnection) =>
  (req: Request, res: Response): void => {
    const user = getAuthUser(req)
    if (!user) {
      res.status(401).json({ error: "Not authenticated" })
      return
    }

    const repoId = Array.isArray(req.params.repoId)
      ? req.params.repoId[0]
      : req.params.repoId

    if (!repoId) {
      res.status(400).json({ error: "Missing repoId" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })

    sendEvent(res, "connected", { repoId })

    const sc = StringCodec()
    const subscriptions: Subscription[] = []

    const stepSub = nats.subscribe("gittan.pipeline.step-progress")
    subscriptions.push(stepSub)

    const resultSub = nats.subscribe("gittan.pipeline.result")
    subscriptions.push(resultSub)

    const consume = async (sub: Subscription, eventName: string): Promise<void> => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(sc.decode(msg.data)) as { repoId?: string }
          if (data.repoId !== repoId) continue
          sendEvent(res, eventName, data)
        } catch {
          // skip malformed messages
        }
      }
    }

    consume(stepSub, "step")
    consume(resultSub, "complete")

    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n")
    }, 15_000)

    const cleanup = (): void => {
      clearInterval(heartbeat)
      for (const sub of subscriptions) {
        sub.unsubscribe()
      }
    }

    req.on("close", cleanup)
    req.on("error", cleanup)
  }
