import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TMemberRepo } from "../src/db/member-repo.js"
import type { TUsageRepo } from "../src/db/usage-repo.js"
import { initDeps } from "../src/deps.js"
import { GET as GET_PLAN, PUT as PUT_PLAN } from "../src/paths/orgs/[orgId]/plan.js"
import { GET as GET_USAGE } from "../src/paths/orgs/[orgId]/usage/index.js"
import { GET as GET_HISTORY } from "../src/paths/orgs/[orgId]/usage/history.js"

const createMockMemberRepo = (): TMemberRepo => ({
  addMember: vi.fn(),
  removeMember: vi.fn(),
  getMembers: vi.fn(),
  getUserOrgIds: vi.fn(),
  getMembership: vi.fn().mockResolvedValue({ orgId: "org-1", userId: "test-user", role: "owner", joinedAt: new Date().toISOString() }),
})

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

const mockDb = {
  execute: vi.fn().mockResolvedValue({
    rowLength: 1,
    first: () => ({ org_id: "org-1" }),
  }),
  batch: vi.fn(),
} as any

const stubDeps = (usageRepo: TUsageRepo) => {
  initDeps({
    config: {} as any,
    db: mockDb,
    nats: {} as any,
    orgRepo: {} as any,
    memberRepo: createMockMemberRepo(),
    teamRepo: {} as any,
    repoMetadata: {} as any,
    usageRepo,
    stepRegistry: {} as any,
    policyRepo: {} as any,
    auditRepo: {} as any,
    forgejo: {} as any,
  })
}

const createTestApp = () => {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: "test-user", companyId: "org-1", email: "test@test.com", role: "member" }
    next()
  })
  app.get("/orgs/:orgId/plan", GET_PLAN as any)
  app.put("/orgs/:orgId/plan", PUT_PLAN as any)
  app.get("/orgs/:orgId/usage", GET_USAGE as any)
  app.get("/orgs/:orgId/usage/history", GET_HISTORY as any)
  return app
}

const request = async (
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
) => {
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
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

describe("usage routes", () => {
  let repo: TUsageRepo
  let app: express.Express

  beforeEach(() => {
    repo = createMockUsageRepo()
    stubDeps(repo)
    app = createTestApp()
  })

  describe("GET /orgs/:orgId/plan", () => {
    it("returns starter defaults when no plan set", async () => {
      const { status, body } = await request(app, "GET", "/orgs/org-1/plan")

      expect(status).toBe(200)
      expect(body.plan).toBe("starter")
      expect(body.ciMinutesLimit).toBe(2000)
      expect(body.storageLimitGb).toBe(20)
      expect(body.userLimit).toBe(2)
    })

    it("returns plan with effective CI limit including blocks", async () => {
      repo = createMockUsageRepo({
        getPlan: vi.fn().mockResolvedValue({
          orgId: "org-1",
          plan: "team",
          ciBlocks: 2,
          createdAt: "2026-06-17T10:00:00Z",
          updatedAt: "2026-06-17T10:00:00Z",
        }),
      })
      stubDeps(repo)
      app = createTestApp()

      const { status, body } = await request(app, "GET", "/orgs/org-1/plan")

      expect(status).toBe(200)
      expect(body.plan).toBe("team")
      expect(body.ciMinutesLimit).toBe(30_000)
    })
  })

  describe("PUT /orgs/:orgId/plan", () => {
    it("sets a plan", async () => {
      const setPlan = vi.fn().mockResolvedValue({
        orgId: "org-1",
        plan: "team",
        ciBlocks: 1,
        createdAt: "2026-06-17T10:00:00Z",
        updatedAt: "2026-06-17T10:00:00Z",
      })
      repo = createMockUsageRepo({ setPlan })
      stubDeps(repo)
      app = createTestApp()

      const { status } = await request(app, "PUT", "/orgs/org-1/plan", {
        plan: "team",
        ciBlocks: 1,
      })

      expect(status).toBe(200)
      expect(setPlan).toHaveBeenCalledWith("org-1", "team", 1)
    })

    it("rejects invalid plan type", async () => {
      const { status } = await request(app, "PUT", "/orgs/org-1/plan", {
        plan: "enterprise",
      })

      expect(status).toBe(400)
    })
  })

  describe("GET /orgs/:orgId/usage", () => {
    it("returns zero usage when no data", async () => {
      const { status, body } = await request(app, "GET", "/orgs/org-1/usage")

      expect(status).toBe(200)
      expect(body.ciMinutesUsed).toBe(0)
      expect(body.ciMinutesLimit).toBe(2000)
    })

    it("returns usage for specific month", async () => {
      repo = createMockUsageRepo({
        getUsage: vi.fn().mockResolvedValue({
          orgId: "org-1",
          month: "2026-06",
          ciMinutesUsed: 450,
          storageBytes: 5_000_000_000,
          userCount: 2,
          teamCount: 1,
          repoCount: 3,
          updatedAt: "2026-06-17T10:00:00Z",
        }),
        getEffectiveCiLimit: vi.fn().mockResolvedValue(10_000),
      })
      stubDeps(repo)
      app = createTestApp()

      const { status, body } = await request(app, "GET", "/orgs/org-1/usage?month=2026-06")

      expect(status).toBe(200)
      expect(body.ciMinutesUsed).toBe(450)
      expect(body.ciMinutesLimit).toBe(10_000)
    })

    it("rejects bad month format", async () => {
      const { status } = await request(app, "GET", "/orgs/org-1/usage?month=june")

      expect(status).toBe(400)
    })
  })

  describe("GET /orgs/:orgId/usage/history", () => {
    it("returns usage history", async () => {
      const history = [
        { orgId: "org-1", month: "2026-06", ciMinutesUsed: 100 },
        { orgId: "org-1", month: "2026-05", ciMinutesUsed: 200 },
      ]
      repo = createMockUsageRepo({
        getUsageHistory: vi.fn().mockResolvedValue(history),
      })
      stubDeps(repo)
      app = createTestApp()

      const { status, body } = await request(app, "GET", "/orgs/org-1/usage/history")

      expect(status).toBe(200)
      expect(body).toHaveLength(2)
    })
  })
})
