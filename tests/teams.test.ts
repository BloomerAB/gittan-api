import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TAuditRepo } from "../src/db/audit-repo.js"
import type { TTeamRepo } from "../src/db/team-repo.js"
import { initDeps } from "../src/deps.js"
import { GET, POST } from "../src/paths/orgs/[orgId]/teams/index.js"
import { GET as GET_TEAM } from "../src/paths/orgs/[orgId]/teams/[teamId].js"
import { POST as POST_MEMBER } from "../src/paths/teams/[teamId]/members/index.js"
import { DELETE as DELETE_MEMBER } from "../src/paths/teams/[teamId]/members/[userId].js"

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

const stubDeps = (teamRepo: TTeamRepo, auditRepo: TAuditRepo) => {
  initDeps({
    config: {} as any,
    db: {} as any,
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
  app.use(injectUser("org-1"))
  app.get("/orgs/:orgId/teams", GET as any)
  app.post("/orgs/:orgId/teams", POST as any)
  app.get("/orgs/:orgId/teams/:teamId", GET_TEAM as any)
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

describe("team routes", () => {
  let repo: TTeamRepo
  let auditRepo: TAuditRepo
  let app: express.Express

  beforeEach(() => {
    repo = createMockTeamRepo()
    auditRepo = createMockAuditRepo()
    stubDeps(repo, auditRepo)
    app = createTestApp()
  })

  describe("POST /orgs/:orgId/teams", () => {
    it("creates a team with valid input", async () => {
      const created = {
        id: "generated-id",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }
      vi.mocked(repo.createTeam).mockResolvedValue(created)

      const { status, body } = await request(app, "POST", "/orgs/org-1/teams", {
        name: "platform",
        displayName: "Platform Team",
      })

      expect(status).toBe(201)
      expect(body.name).toBe("platform")
      expect(repo.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "org-1",
          name: "platform",
          displayName: "Platform Team",
        }),
      )
    })

    it("rejects invalid team name", async () => {
      const { status, body } = await request(app, "POST", "/orgs/org-1/teams", {
        name: "UPPER CASE",
        displayName: "Bad Name",
      })

      expect(status).toBe(400)
      expect(body.error).toBeDefined()
      expect(repo.createTeam).not.toHaveBeenCalled()
    })

    it("rejects missing display name", async () => {
      const { status } = await request(app, "POST", "/orgs/org-1/teams", {
        name: "platform",
      })

      expect(status).toBe(400)
    })

    it("returns 409 for duplicate team name", async () => {
      vi.mocked(repo.createTeam).mockRejectedValue(
        new Error('Team "platform" already exists in this org'),
      )

      const { status, body } = await request(app, "POST", "/orgs/org-1/teams", {
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
          orgId: "org-1",
          name: "platform",
          displayName: "Platform",
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ])

      const { status, body } = await request(app, "GET", "/orgs/org-1/teams")

      expect(status).toBe(200)
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe("platform")
    })
  })

  describe("GET /orgs/:orgId/teams/:teamId", () => {
    it("returns team by id", async () => {
      vi.mocked(repo.getTeam).mockResolvedValue({
        id: "t1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })

      const { status, body } = await request(
        app,
        "GET",
        "/orgs/org-1/teams/t1",
      )

      expect(status).toBe(200)
      expect(body.name).toBe("platform")
    })

    it("returns 404 for non-existent team", async () => {
      vi.mocked(repo.getTeam).mockResolvedValue(undefined)

      const { status } = await request(
        app,
        "GET",
        "/orgs/org-1/teams/nonexistent",
      )

      expect(status).toBe(404)
    })
  })

  describe("POST /teams/:teamId/members", () => {
    it("adds a member", async () => {
      vi.mocked(repo.addMember).mockResolvedValue({
        teamId: "t1",
        userId: "user-1",
        role: "writer",
        addedAt: "2026-06-12T10:00:00Z",
        addedBy: "test-user",
      })

      const { status, body } = await request(
        app,
        "POST",
        "/teams/t1/members",
        { userId: "user-1", role: "writer" },
      )

      expect(status).toBe(201)
      expect(body.userId).toBe("user-1")
      expect(body.role).toBe("writer")
    })

    it("rejects invalid role", async () => {
      const { status } = await request(app, "POST", "/teams/t1/members", {
        userId: "user-1",
        role: "superadmin",
      })

      expect(status).toBe(400)
    })
  })

  describe("DELETE /teams/:teamId/members/:userId", () => {
    it("removes a member", async () => {
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      const { status } = await request(
        app,
        "DELETE",
        "/teams/t1/members/user-1",
      )

      expect(status).toBe(204)
    })
  })
})
