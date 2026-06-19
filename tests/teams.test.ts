import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TAuditRepo } from "../src/db/audit-repo.js"
import type { TTeamRepo } from "../src/db/team-repo.js"
import { initDeps } from "../src/deps.js"
import { GET, POST } from "../src/paths/orgs/[orgId]/teams/index.js"
import { GET as GET_TEAM } from "../src/paths/orgs/[orgId]/teams/[teamId].js"
import { GET as GET_MEMBERS, POST as POST_MEMBER } from "../src/paths/teams/[teamId]/members/index.js"
import { DELETE as DELETE_MEMBER } from "../src/paths/teams/[teamId]/members/[userId].js"

const TEST_ORG = "org-1"

const createMockTeamRepo = (): TTeamRepo => ({
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  getTeam: vi.fn(),
  getTeamByName: vi.fn(),
  listTeams: vi.fn(),
  addMember: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
})

const createMockAuditRepo = (): TAuditRepo => ({
  log: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
})

const createMockDb = (orgId: string = TEST_ORG) => {
  const mock = {
    execute: vi.fn(),
    shutdown: vi.fn(),
  }
  mock.execute.mockImplementation(async (query: string, params?: unknown[]) => {
    if (typeof query === "string" && query.includes("gittan.users")) {
      return {
        rowLength: 1,
        first: () => ({ org_id: orgId }),
        rows: [{ org_id: orgId }],
      }
    }
    return { rows: [], rowLength: 0, first: () => ({}) }
  })
  return mock
}

const stubDeps = (teamRepo: TTeamRepo, auditRepo: TAuditRepo, db?: any) => {
  initDeps({
    config: {} as any,
    db: db ?? createMockDb(),
    nats: {} as any,
    orgRepo: {} as any,
    teamRepo,
    repoMetadata: {} as any,
    usageRepo: {} as any,
    stepRegistry: {} as any,
    policyRepo: {} as any,
    auditRepo,
    forgejo: {} as any,
  })
}

const injectUser = (orgId: string) =>
  (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: "test-user", companyId: orgId, email: "test@test.com", role: "member" }
    next()
  }

const createTestApp = () => {
  const app = express()
  app.use(express.json())
  app.use(injectUser(TEST_ORG))
  app.get("/orgs/:orgId/teams", GET as any)
  app.post("/orgs/:orgId/teams", POST as any)
  app.get("/orgs/:orgId/teams/:teamId", GET_TEAM as any)
  app.get("/teams/:teamId/members", GET_MEMBERS as any)
  app.post("/teams/:teamId/members", POST_MEMBER as any)
  app.delete("/teams/:teamId/members/:userId", DELETE_MEMBER as any)
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

const mockTeamExists = (db: ReturnType<typeof createMockDb>) => {
  db.execute.mockImplementation(async (query: string, params: unknown[]) => {
    if (typeof query === "string" && query.includes("gittan.users")) {
      return { rowLength: 1, first: () => ({ org_id: TEST_ORG }), rows: [{ org_id: TEST_ORG }] }
    }
    if (typeof query === "string" && query.includes("SELECT id FROM") && query.includes("teams WHERE org_id")) {
      return { rows: [{ id: (params as string[])[1] }], rowLength: 1, first: () => ({ id: (params as string[])[1] }) }
    }
    if (typeof query === "string" && query.includes("SELECT id, email FROM") && query.includes("users WHERE id = ?")) {
      return { rows: [], rowLength: 0, first: () => null }
    }
    return { rows: [], rowLength: 0, first: () => ({}) }
  })
}

const mockTeamNotExists = (db: ReturnType<typeof createMockDb>) => {
  db.execute.mockImplementation(async (query: string) => {
    if (typeof query === "string" && query.includes("gittan.users")) {
      return { rowLength: 1, first: () => ({ org_id: TEST_ORG }), rows: [{ org_id: TEST_ORG }] }
    }
    return { rows: [], rowLength: 0, first: () => ({}) }
  })
}

describe("team routes", () => {
  let repo: TTeamRepo
  let auditRepo: TAuditRepo
  let mockDb: ReturnType<typeof createMockDb>
  let app: express.Express

  beforeEach(() => {
    repo = createMockTeamRepo()
    auditRepo = createMockAuditRepo()
    mockDb = createMockDb()
    stubDeps(repo, auditRepo, mockDb)
    app = createTestApp()
  })

  describe("POST /orgs/:orgId/teams", () => {
    it("creates a team with explicit name", async () => {
      const created = {
        id: "generated-id",
        orgId: TEST_ORG,
        name: "platform",
        displayName: "Platform Team",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }
      vi.mocked(repo.createTeam).mockResolvedValue(created)

      const { status, body } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        name: "platform",
        displayName: "Platform Team",
      })

      expect(status).toBe(201)
      expect(body.name).toBe("platform")
      expect(repo.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: TEST_ORG,
          name: "platform",
          displayName: "Platform Team",
        }),
      )
    })

    it("auto-generates name from displayName when name is omitted", async () => {
      const created = {
        id: "generated-id",
        orgId: TEST_ORG,
        name: "checkout-flow",
        displayName: "Checkout Flow",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }
      vi.mocked(repo.createTeam).mockResolvedValue(created)

      const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        displayName: "Checkout Flow",
      })

      expect(status).toBe(201)
      expect(repo.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "checkout-flow",
          displayName: "Checkout Flow",
        }),
      )
    })

    it("slugifies special characters in auto-generated name", async () => {
      vi.mocked(repo.createTeam).mockResolvedValue({
        id: "id",
        orgId: TEST_ORG,
        name: "my-team",
        displayName: "My Team!!!",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })

      await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        displayName: "My Team!!!",
      })

      expect(repo.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my-team" }),
      )
    })

    it("rejects non-latin displayName that produces empty slug", async () => {
      const { status, body } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        displayName: "合成",
      })

      expect(status).toBe(400)
      expect(body.error).toContain("alphanumeric")
      expect(repo.createTeam).not.toHaveBeenCalled()
    })

    it("rejects invalid team name", async () => {
      const { status, body } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        name: "UPPER CASE",
        displayName: "Bad Name",
      })

      expect(status).toBe(400)
      expect(body.error).toBeDefined()
      expect(repo.createTeam).not.toHaveBeenCalled()
    })

    it("rejects missing display name", async () => {
      const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        name: "platform",
      })

      expect(status).toBe(400)
    })

    it("rejects empty body", async () => {
      const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {})

      expect(status).toBe(400)
    })

    it("returns 409 for duplicate team name", async () => {
      vi.mocked(repo.createTeam).mockRejectedValue(
        new Error('Team "platform" already exists in this org'),
      )

      const { status, body } = await request(app, "POST", `/orgs/${TEST_ORG}/teams`, {
        name: "platform",
        displayName: "Platform",
      })

      expect(status).toBe(409)
      expect(body.error).toContain("already exists")
    })
  })

  describe("GET /orgs/:orgId/teams", () => {
    it("returns list of teams", async () => {
      vi.mocked(repo.listTeams).mockResolvedValue([
        {
          id: "t1",
          orgId: TEST_ORG,
          name: "platform",
          displayName: "Platform",
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ])

      const { status, body } = await request(app, "GET", `/orgs/${TEST_ORG}/teams`)

      expect(status).toBe(200)
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe("platform")
    })
  })

  describe("GET /orgs/:orgId/teams/:teamId", () => {
    it("returns team by id", async () => {
      vi.mocked(repo.getTeam).mockResolvedValue({
        id: "t1",
        orgId: TEST_ORG,
        name: "platform",
        displayName: "Platform",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })

      const { status, body } = await request(app, "GET", `/orgs/${TEST_ORG}/teams/t1`)

      expect(status).toBe(200)
      expect(body.name).toBe("platform")
    })

    it("returns 404 for non-existent team", async () => {
      vi.mocked(repo.getTeam).mockResolvedValue(undefined)

      const { status } = await request(app, "GET", `/orgs/${TEST_ORG}/teams/nonexistent`)

      expect(status).toBe(404)
    })
  })

  describe("GET /teams/:teamId/members", () => {
    it("returns members with resolved emails", async () => {
      vi.mocked(repo.listMembers).mockResolvedValue([
        { teamId: "t1", userId: "user-1", role: "team-admin", addedAt: "2026-06-12T10:00:00Z", addedBy: "admin" },
        { teamId: "t1", userId: "user-2", role: "team-admin", addedAt: "2026-06-12T10:00:00Z", addedBy: "admin" },
      ])
      mockDb.execute.mockImplementation(async (query: string, params: unknown[]) => {
        if (query.includes("teams WHERE org_id")) {
          return { rows: [{ id: "t1" }], rowLength: 1 }
        }
        const userId = (params as string[])[0]
        const emails: Record<string, string> = {
          "user-1": "alice@example.com",
          "user-2": "bob@example.com",
        }
        const email = emails[userId]
        if (email) {
          const row = { id: userId, email }
          return { rows: [row], rowLength: 1, first: () => row }
        }
        return { rows: [], rowLength: 0, first: () => null }
      })

      const { status, body } = await request(app, "GET", "/teams/t1/members")

      expect(status).toBe(200)
      expect(body).toHaveLength(2)
      expect(body[0].email).toBe("alice@example.com")
      expect(body[1].email).toBe("bob@example.com")
      expect(body[0]).not.toHaveProperty("role")
    })

    it("returns null email for users not found in users table", async () => {
      vi.mocked(repo.listMembers).mockResolvedValue([
        { teamId: "t1", userId: "orphan", role: "team-admin", addedAt: "2026-06-12T10:00:00Z", addedBy: "admin" },
      ])
      mockDb.execute.mockImplementation(async (query: string) => {
        if (query.includes("teams WHERE org_id")) {
          return { rows: [{ id: "t1" }], rowLength: 1 }
        }
        return { rows: [], rowLength: 0, first: () => null }
      })

      const { status, body } = await request(app, "GET", "/teams/t1/members")

      expect(status).toBe(200)
      expect(body[0].email).toBeNull()
    })

    it("returns empty array for team with no members", async () => {
      mockTeamExists(mockDb)
      vi.mocked(repo.listMembers).mockResolvedValue([])

      const { status, body } = await request(app, "GET", "/teams/t1/members")

      expect(status).toBe(200)
      expect(body).toEqual([])
    })

    it("returns 403 when team belongs to different org", async () => {
      mockTeamNotExists(mockDb)

      const { status, body } = await request(app, "GET", "/teams/foreign-team/members")

      expect(status).toBe(403)
      expect(body.error).toContain("Access denied")
      expect(repo.listMembers).not.toHaveBeenCalled()
    })
  })

  describe("POST /teams/:teamId/members", () => {
    it("always assigns team-admin role", async () => {
      mockTeamExists(mockDb)
      vi.mocked(repo.addMember).mockResolvedValue({
        teamId: "t1",
        userId: "user-1",
        role: "team-admin",
        addedAt: "2026-06-12T10:00:00Z",
        addedBy: "test-user",
      })

      const { status, body } = await request(
        app,
        "POST",
        "/teams/t1/members",
        { userId: "user-1" },
      )

      expect(status).toBe(201)
      expect(body.role).toBe("team-admin")
      expect(repo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({ role: "team-admin" }),
      )
    })

    it("ignores client-provided role and uses team-admin", async () => {
      mockTeamExists(mockDb)
      vi.mocked(repo.addMember).mockResolvedValue({
        teamId: "t1",
        userId: "user-1",
        role: "team-admin",
        addedAt: "2026-06-12T10:00:00Z",
        addedBy: "test-user",
      })

      await request(app, "POST", "/teams/t1/members", {
        userId: "user-1",
        role: "writer",
      })

      expect(repo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({ role: "team-admin" }),
      )
    })

    it("rejects missing userId", async () => {
      mockTeamExists(mockDb)

      const { status } = await request(app, "POST", "/teams/t1/members", {})

      expect(status).toBe(400)
    })

    it("returns 403 when team belongs to different org", async () => {
      mockTeamNotExists(mockDb)

      const { status } = await request(app, "POST", "/teams/foreign-team/members", {
        userId: "user-1",
      })

      expect(status).toBe(403)
      expect(repo.addMember).not.toHaveBeenCalled()
    })
  })

  describe("DELETE /teams/:teamId/members/:userId", () => {
    it("removes a member", async () => {
      mockTeamExists(mockDb)
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      const { status } = await request(app, "DELETE", "/teams/t1/members/user-1")

      expect(status).toBe(204)
    })

    it("returns 403 when team belongs to different org", async () => {
      mockTeamNotExists(mockDb)

      const { status } = await request(app, "DELETE", "/teams/foreign-team/members/user-1")

      expect(status).toBe(403)
      expect(repo.removeMember).not.toHaveBeenCalled()
    })
  })
})
