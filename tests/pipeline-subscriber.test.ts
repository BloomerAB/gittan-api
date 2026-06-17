import { connect, type NatsConnection, StringCodec } from "nats"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { TRepoMetadataRepo } from "../src/db/repo-metadata.js"
import type { TUsageRepo } from "../src/db/usage-repo.js"
import {
  startPipelineSubscriber,
  type TPipelineEvent,
  type TSubscriberDeps,
} from "../src/pipeline/subscriber.js"

const createMockUsageRepo = (overrides: Partial<TUsageRepo> = {}): TUsageRepo => ({
  getPlan: vi.fn().mockResolvedValue(undefined),
  setPlan: vi.fn(),
  recordPipelineUsage: vi.fn(),
  getUsage: vi.fn().mockResolvedValue(undefined),
  getUsageHistory: vi.fn().mockResolvedValue([]),
  getEffectiveCiLimit: vi.fn().mockResolvedValue(2000),
  updateCounts: vi.fn(),
  ...overrides,
})

describe("pipeline subscriber (integration)", () => {
  let nats: NatsConnection
  const sc = StringCodec()

  beforeAll(async () => {
    nats = await connect({ servers: "nats://localhost:4222" })
  })

  afterAll(async () => {
    await nats.drain()
  })

  it("resolves pipeline on push event and publishes result", async () => {
    const resolved: TPipelineEvent[] = []

    const mockRepoMetadata: TRepoMetadataRepo = {
      create: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "repo-1",
        orgId: "org-1",
        teamId: "team-1",
        name: "api-service",
        forgejoFullName: "org-1/api-service",
        cloneUrl: "",
        sshUrl: "",
        gatedBranches: ["main"],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }),
      getByForgejoName: vi.fn(),
      listByTeam: vi.fn(),
    }

    const deps: TSubscriberDeps = {
      nats,
      repoMetadata: mockRepoMetadata,
      usageRepo: createMockUsageRepo(),
      getPolicies: vi.fn().mockResolvedValue([
        {
          id: "p1",
          orgId: "org-1",
          name: "security-baseline",
          match: { files: ["package.json"] },
          inject: {
            after: [{ name: "trivy", use: "platform/trivy", timeout: "5m" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(undefined),
      getRepoFiles: vi.fn().mockResolvedValue(["package.json", "src/index.ts"]),
      getRepoConfig: vi.fn().mockResolvedValue({
        steps: [
          { name: "test", image: "node:22-slim", run: "npm test", timeout: "10m" },
        ],
      }),
      onPipelineResolved: vi.fn().mockImplementation(async (event: TPipelineEvent) => {
        resolved.push(event)
      }),
    }

    startPipelineSubscriber(deps)

    const resultSub = nats.subscribe("gittan.pipeline.resolved")
    const resultPromise = (async () => {
      for await (const msg of resultSub) {
        const data = JSON.parse(sc.decode(msg.data))
        resultSub.unsubscribe()
        return data
      }
    })()

    const pushEvent = {
      id: "push-test-123",
      orgId: "org-1",
      teamId: "team-1",
      repoId: "repo-1",
      repoName: "api-service",
      branch: "main",
      commits: [
        {
          sha: "a".repeat(40),
          message: "feat: test",
          author: "malin",
          timestamp: "2026-06-12T14:30:00Z",
        },
      ],
      pusher: "malin",
      timestamp: "2026-06-12T14:30:00Z",
      isGated: true,
    }

    nats.publish("gittan.push.gated", sc.encode(JSON.stringify(pushEvent)))

    const result = await resultPromise
    expect(result.pushEventId).toBe("push-test-123")
    expect(result.isGated).toBe(true)
    expect(result.resolved.steps).toHaveLength(2)
    expect(result.resolved.steps[0].name).toBe("test")
    expect(result.resolved.steps[0].source).toBe("repo")
    expect(result.resolved.steps[1].name).toBe("trivy")
    expect(result.resolved.steps[1].source).toBe("policy")
    expect(result.resolved.resolvedFrom.policies).toEqual(["security-baseline"])

    expect(resolved).toHaveLength(1)
    expect(resolved[0].pushEvent.id).toBe("push-test-123")
  })

  it("rejects pipeline when CI quota is exceeded", async () => {
    const mockRepoMetadata: TRepoMetadataRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      getByForgejoName: vi.fn(),
      listByTeam: vi.fn(),
    }

    const overQuotaUsageRepo = createMockUsageRepo({
      getEffectiveCiLimit: vi.fn().mockResolvedValue(2000),
      getUsage: vi.fn().mockResolvedValue({
        orgId: "org-quota",
        month: "2026-06",
        ciMinutesUsed: 2100,
        storageBytes: 0,
        userCount: 1,
        teamCount: 1,
        repoCount: 1,
        updatedAt: "2026-06-17T10:00:00Z",
      }),
    })

    const deps: TSubscriberDeps = {
      nats,
      repoMetadata: mockRepoMetadata,
      usageRepo: overQuotaUsageRepo,
      getPolicies: vi.fn(),
      getTemplate: vi.fn(),
      getRepoFiles: vi.fn(),
      getRepoConfig: vi.fn(),
      onPipelineResolved: vi.fn(),
    }

    startPipelineSubscriber(deps)

    const resultSub = nats.subscribe("gittan.pipeline.result")
    const resultPromise = (async () => {
      for await (const msg of resultSub) {
        const data = JSON.parse(sc.decode(msg.data))
        if (data.pushEventId === "push-quota-test") {
          resultSub.unsubscribe()
          return data
        }
      }
    })()

    nats.publish(
      "gittan.push.gated",
      sc.encode(
        JSON.stringify({
          id: "push-quota-test",
          orgId: "org-quota",
          teamId: "team-1",
          repoId: "repo-1",
          repoName: "my-repo",
          branch: "main",
          commits: [{ sha: "b".repeat(40), message: "fix: something", author: "malin", timestamp: "2026-06-17T10:00:00Z" }],
          pusher: "malin",
          timestamp: "2026-06-17T10:00:00Z",
          isGated: true,
        }),
      ),
    )

    const result = await resultPromise
    expect(result.status).toBe("failed")
    expect(result.steps[0].stepName).toBe("quota-check")
    expect(result.steps[0].error).toContain("quota exceeded")

    expect(mockRepoMetadata.getById).not.toHaveBeenCalled()
    expect(deps.onPipelineResolved).not.toHaveBeenCalled()
  })
})
