import { connect, type NatsConnection, StringCodec } from "nats"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { TRepoMetadataRepo } from "../src/db/repo-metadata.js"
import type { TTeamRepo } from "../src/db/team-repo.js"
import {
  createNotificationRouter,
  type TNotificationRouter,
  type TSlackSender,
} from "../src/notifications/router.js"

describe("notification router", () => {
  let nats: NatsConnection
  let slack: TSlackSender
  let router: TNotificationRouter
  const sc = StringCodec()

  const mockTeamRepo: TTeamRepo = {
    createTeam: vi.fn(),
    getTeam: vi.fn(),
    getTeamByName: vi.fn(),
    listTeams: vi.fn().mockResolvedValue([
      {
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
        slackChannel: "#platform-alerts",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      },
    ]),
    addMember: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
  }

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

  beforeAll(async () => {
    nats = await connect({ servers: "nats://localhost:4222" })
  })

  beforeEach(() => {
    slack = { send: vi.fn().mockResolvedValue(undefined) }
  })

  afterEach(() => {
    router?.stop()
  })

  afterAll(async () => {
    await nats.drain()
  })

  it("sends slack notification on pipeline failure", async () => {
    router = createNotificationRouter({
      nats,
      slack,
      teamRepo: mockTeamRepo,
      repoMetadata: mockRepoMetadata,
      config: {
        batchWindowMs: 50,
        cooldownMs: 0,
        escalateAfterMs: 600000,
      },
    })

    router.start()

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          repoId: "repo-1",
          branch: "main",
          status: "failed",
          steps: [
            {
              name: "test",
              status: "failed",
              error: "assertion failed",
              source: "repo",
            },
          ],
          durationMs: 5000,
          pusher: "malin",
        }),
      ),
    )

    await new Promise((r) => setTimeout(r, 200))
    await router.flushBatch()

    expect(slack.send).toHaveBeenCalledWith(
      "#platform-alerts",
      expect.stringContaining("✗"),
    )
    expect(slack.send).toHaveBeenCalledWith(
      "#platform-alerts",
      expect.stringContaining("test failed"),
    )
  })

  it("does not notify on success", async () => {
    router = createNotificationRouter({
      nats,
      slack,
      teamRepo: mockTeamRepo,
      repoMetadata: mockRepoMetadata,
      config: {
        batchWindowMs: 50,
        cooldownMs: 0,
        escalateAfterMs: 600000,
      },
    })

    router.start()

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          repoId: "repo-1",
          branch: "main",
          status: "passed",
          steps: [],
          durationMs: 3000,
        }),
      ),
    )

    await new Promise((r) => setTimeout(r, 200))
    await router.flushBatch()

    expect(slack.send).not.toHaveBeenCalled()
  })

  it("batches multiple failures in cooldown window", async () => {
    router = createNotificationRouter({
      nats,
      slack,
      teamRepo: mockTeamRepo,
      repoMetadata: mockRepoMetadata,
      config: {
        batchWindowMs: 100,
        cooldownMs: 0,
        escalateAfterMs: 600000,
      },
    })

    router.start()

    for (let i = 0; i < 3; i++) {
      nats.publish(
        "gittan.pipeline.result",
        sc.encode(
          JSON.stringify({
            repoId: "repo-1",
            branch: "main",
            status: "failed",
            steps: [{ name: `step-${i}`, status: "failed", source: "repo" }],
            durationMs: 1000,
            pusher: "malin",
          }),
        ),
      )
    }

    await new Promise((r) => setTimeout(r, 250))
    await router.flushBatch()

    expect(slack.send).toHaveBeenCalledTimes(1)
    expect(slack.send).toHaveBeenCalledWith(
      "#platform-alerts",
      expect.stringContaining("3 pipeline failures"),
    )
  })
})
