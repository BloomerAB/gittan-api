import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TMemberRepo } from "../src/db/member-repo.js"
import type { TRepoMetadataRepo } from "../src/db/repo-metadata.js"
import { initDeps } from "../src/deps.js"
import { POST } from "../src/paths/hooks/push.js"

const createMockMemberRepo = (): TMemberRepo => ({
  addMember: vi.fn(),
  removeMember: vi.fn(),
  getMembers: vi.fn(),
  getUserOrgIds: vi.fn(),
  getMembership: vi.fn(),
})

const createMockNats = () => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
  drain: vi.fn(),
  isClosed: vi.fn().mockReturnValue(false),
})

const createMockRepoMetadata = (): TRepoMetadataRepo => ({
  create: vi.fn(),
  getById: vi.fn(),
  getByForgejoName: vi.fn(),
  listByTeam: vi.fn(),
})

const stubDeps = (
  nats: ReturnType<typeof createMockNats>,
  repoMetadata: TRepoMetadataRepo,
) => {
  initDeps({
    config: {} as any,
    db: {
      execute: vi.fn().mockResolvedValue({ rowLength: 0, first: () => ({}) }),
      batch: vi.fn(),
    } as any,
    nats: nats as any,
    orgRepo: {} as any,
    memberRepo: createMockMemberRepo(),
    teamRepo: {} as any,
    repoMetadata,
    usageRepo: { getPlan: async () => undefined, getUsage: async () => undefined, getEffectiveCiLimit: async () => 2000 } as any,
    stepRegistry: {} as any,
    policyRepo: {} as any,
    auditRepo: {} as any,
    forgejo: {} as any,
  })
}

const createTestApp = () => {
  const app = express()
  app.use(express.json())
  app.post("/hooks/push", POST as any)
  return app
}

const request = async (
  app: express.Express,
  body: unknown,
) => {
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/hooks/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return {
      status: res.status,
      body: text ? JSON.parse(text) : undefined,
    }
  } finally {
    server.close()
  }
}

const validPushEvent = {
  ref: "refs/heads/main",
  before: "a".repeat(40),
  after: "b".repeat(40),
  commits: [
    {
      id: "b".repeat(40),
      message: "feat: add feature",
      timestamp: "2026-06-12T14:30:00Z",
      author: { name: "Malin", email: "malin@gittan.com" },
    },
  ],
  pusher: { login: "malin" },
  repository: {
    name: "api-service",
    full_name: "bloomer/api-service",
  },
}

describe("POST /hooks/push", () => {
  let nats: ReturnType<typeof createMockNats>
  let repoMetadata: TRepoMetadataRepo
  let app: express.Express

  beforeEach(() => {
    nats = createMockNats()
    repoMetadata = createMockRepoMetadata()
    stubDeps(nats, repoMetadata)
    app = createTestApp()
  })

  it("publishes gated push event to NATS when branch is gated", async () => {
    vi.mocked(repoMetadata.getByForgejoName).mockResolvedValue({
      id: "repo-1",
      orgId: "org-1",
      teamId: "team-1",
      name: "api-service",
      forgejoFullName: "bloomer/api-service",
      cloneUrl: "http://localhost:3333/bloomer/api-service.git",
      sshUrl: "ssh://git@localhost:2223/bloomer/api-service.git",
      gatedBranches: ["main"],
      createdAt: "2026-06-12T10:00:00Z",
      updatedAt: "2026-06-12T10:00:00Z",
    })

    const { status, body } = await request(app, validPushEvent)

    expect(status).toBe(200)
    expect(body.gated).toBe(true)
    expect(body.branch).toBe("main")
    expect(nats.publish).toHaveBeenCalledWith(
      "gittan.push.gated",
      expect.any(Uint8Array),
    )
  })

  it("publishes standard push event for non-gated branch", async () => {
    vi.mocked(repoMetadata.getByForgejoName).mockResolvedValue({
      id: "repo-1",
      orgId: "org-1",
      teamId: "team-1",
      name: "api-service",
      forgejoFullName: "bloomer/api-service",
      cloneUrl: "",
      sshUrl: "",
      gatedBranches: ["main"],
      createdAt: "2026-06-12T10:00:00Z",
      updatedAt: "2026-06-12T10:00:00Z",
    })

    const featurePush = {
      ...validPushEvent,
      ref: "refs/heads/feat/new-auth",
    }

    const { status, body } = await request(app, featurePush)

    expect(status).toBe(200)
    expect(body.gated).toBe(false)
    expect(nats.publish).toHaveBeenCalledWith(
      "gittan.push.standard",
      expect.any(Uint8Array),
    )
  })

  it("handles push from unknown repo gracefully", async () => {
    vi.mocked(repoMetadata.getByForgejoName).mockResolvedValue(undefined)

    const { status, body } = await request(app, validPushEvent)

    expect(status).toBe(200)
    expect(body.gated).toBe(false)
    expect(nats.publish).toHaveBeenCalledWith(
      "gittan.push.standard",
      expect.any(Uint8Array),
    )
  })

  it("includes commit data in NATS message", async () => {
    vi.mocked(repoMetadata.getByForgejoName).mockResolvedValue(undefined)

    await request(app, validPushEvent)

    const publishedData = JSON.parse(
      new TextDecoder().decode(nats.publish.mock.calls[0][1]),
    )
    expect(publishedData.commits).toHaveLength(1)
    expect(publishedData.commits[0].sha).toBe("b".repeat(40))
    expect(publishedData.commits[0].author).toBe("Malin")
    expect(publishedData.pusher).toBe("malin")
  })

  it("rejects invalid push event", async () => {
    const { status } = await request(app, { invalid: true })

    expect(status).toBe(400)
    expect(nats.publish).not.toHaveBeenCalled()
  })
})
