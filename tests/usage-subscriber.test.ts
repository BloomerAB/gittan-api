import { connect, type NatsConnection, StringCodec } from "nats"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { TUsageRepo } from "../src/db/usage-repo.js"
import { startUsageSubscriber } from "../src/pipeline/usage-subscriber.js"

describe("usage subscriber (integration)", () => {
  let nats: NatsConnection
  const sc = StringCodec()

  beforeAll(async () => {
    nats = await connect({ servers: "nats://localhost:4222" })
  })

  afterAll(async () => {
    await nats.drain()
  })

  it("records CI minutes from pipeline result", async () => {
    const recordedUsage: Array<Record<string, unknown>> = []

    const mockUsageRepo: TUsageRepo = {
      getPlan: vi.fn(),
      setPlan: vi.fn(),
      recordPipelineUsage: vi.fn().mockImplementation(async (input) => {
        recordedUsage.push(input)
      }),
      getUsage: vi.fn(),
      getUsageHistory: vi.fn(),
      getEffectiveCiLimit: vi.fn(),
      updateCounts: vi.fn(),
    }

    startUsageSubscriber({ nats, usageRepo: mockUsageRepo })

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-1",
          orgId: "org-1",
          teamId: "team-1",
          repoId: "repo-1",
          branch: "main",
          isGated: true,
          status: "passed",
          steps: [],
          startedAt: "2026-06-17T10:00:00Z",
          finishedAt: "2026-06-17T10:02:30Z",
          durationMs: 150_000,
        }),
      ),
    )

    await new Promise((r) => setTimeout(r, 200))

    expect(mockUsageRepo.recordPipelineUsage).toHaveBeenCalledWith({
      orgId: "org-1",
      pipelineRunId: "push-1",
      teamId: "team-1",
      repoId: "repo-1",
      durationMs: 150_000,
    })
  })

  it("skips pipeline results with zero duration", async () => {
    const mockUsageRepo: TUsageRepo = {
      getPlan: vi.fn(),
      setPlan: vi.fn(),
      recordPipelineUsage: vi.fn(),
      getUsage: vi.fn(),
      getUsageHistory: vi.fn(),
      getEffectiveCiLimit: vi.fn(),
      updateCounts: vi.fn(),
    }

    startUsageSubscriber({ nats, usageRepo: mockUsageRepo })

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-2",
          orgId: "org-1",
          teamId: "team-1",
          repoId: "repo-1",
          branch: "main",
          isGated: false,
          status: "passed",
          steps: [],
          startedAt: "2026-06-17T10:00:00Z",
          finishedAt: "2026-06-17T10:00:00Z",
          durationMs: 0,
        }),
      ),
    )

    await new Promise((r) => setTimeout(r, 200))

    expect(mockUsageRepo.recordPipelineUsage).not.toHaveBeenCalled()
  })
})
