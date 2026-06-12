import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TRepoMetadataRepo } from "../src/db/repo-metadata.js"
import type { TTeamRepo } from "../src/db/team-repo.js"
import type { TForgejoClient } from "../src/integrations/forgejo.js"
import { registerRepoRoutes, type TRepoDeps } from "../src/paths/repos.js"

const createMockForgejoClient = (): TForgejoClient => ({
  createOrg: vi.fn(),
  getOrg: vi.fn(),
  createRepo: vi.fn(),
  getRepo: vi.fn(),
  listRepos: vi.fn(),
  deleteRepo: vi.fn(),
  createWebhook: vi.fn(),
  listWebhooks: vi.fn(),
  healthy: vi.fn(),
})

const createMockRepoMetadata = (): TRepoMetadataRepo => ({
  create: vi.fn(),
  getById: vi.fn(),
  listByTeam: vi.fn(),
})

const createMockTeamRepo = (): TTeamRepo => ({
  createTeam: vi.fn(),
  getTeam: vi.fn(),
  getTeamByName: vi.fn(),
  listTeams: vi.fn(),
  addMember: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
})

const createTestApp = (deps: TRepoDeps) => {
  const app = express()
  app.use(express.json())
  const router = express.Router()
  registerRepoRoutes(router, deps)
  app.use(router)
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

describe("repo routes", () => {
  let forgejo: TForgejoClient
  let repoMetadata: TRepoMetadataRepo
  let teamRepo: TTeamRepo
  let deps: TRepoDeps
  let app: express.Express

  beforeEach(() => {
    forgejo = createMockForgejoClient()
    repoMetadata = createMockRepoMetadata()
    teamRepo = createMockTeamRepo()
    deps = {
      forgejo,
      repoMetadata,
      teamRepo,
      webhookBaseUrl: "http://localhost:4000",
    }
    app = createTestApp(deps)
  })

  describe("POST /orgs/:orgId/repos", () => {
    it("creates a repo, forgejo org, forgejo repo, and webhook", async () => {
      vi.mocked(teamRepo.getTeam).mockResolvedValue({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })
      vi.mocked(forgejo.getOrg).mockResolvedValue(undefined)
      vi.mocked(forgejo.createOrg).mockResolvedValue({ id: 1, name: "org-1" })
      vi.mocked(forgejo.createRepo).mockResolvedValue({
        id: 1,
        name: "api-service",
        fullName: "org-1/api-service",
        cloneUrl: "http://localhost:3333/org-1/api-service.git",
        sshUrl: "ssh://git@localhost:2223/org-1/api-service.git",
        empty: false,
        defaultBranch: "main",
      })
      vi.mocked(forgejo.createWebhook).mockResolvedValue({
        id: 1,
        url: "http://localhost:4000/hooks/push",
        active: true,
        events: ["push"],
      })
      vi.mocked(repoMetadata.create).mockImplementation(async (input) => ({
        ...input,
        tags: input.tags ?? [],
        gatedBranches: input.gatedBranches ?? ["main"],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }))

      const { status, body } = await request(
        app,
        "POST",
        "/orgs/org-1/repos",
        {
          name: "api-service",
          teamId: "team-1",
          description: "Main API service",
        },
      )

      expect(status).toBe(201)
      expect(body.name).toBe("api-service")
      expect(body.teamId).toBe("team-1")
      expect(body.gatedBranches).toEqual(["main"])
      expect(forgejo.createOrg).toHaveBeenCalledWith("org-1")
      expect(forgejo.createRepo).toHaveBeenCalledWith("org-1", {
        name: "api-service",
        description: "Main API service",
        private: true,
      })
      expect(forgejo.createWebhook).toHaveBeenCalledWith(
        "org-1",
        "api-service",
        "http://localhost:4000/hooks/push",
        ["push"],
      )
    })

    it("reuses existing forgejo org", async () => {
      vi.mocked(teamRepo.getTeam).mockResolvedValue({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })
      vi.mocked(forgejo.getOrg).mockResolvedValue({ id: 1, name: "org-1" })
      vi.mocked(forgejo.createRepo).mockResolvedValue({
        id: 1,
        name: "api",
        fullName: "org-1/api",
        cloneUrl: "http://localhost:3333/org-1/api.git",
        sshUrl: "ssh://git@localhost:2223/org-1/api.git",
        empty: false,
        defaultBranch: "main",
      })
      vi.mocked(forgejo.createWebhook).mockResolvedValue({
        id: 1, url: "", active: true, events: ["push"],
      })
      vi.mocked(repoMetadata.create).mockImplementation(async (input) => ({
        ...input,
        tags: input.tags ?? [],
        gatedBranches: input.gatedBranches ?? ["main"],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }))

      await request(app, "POST", "/orgs/org-1/repos", {
        name: "api",
        teamId: "team-1",
      })

      expect(forgejo.createOrg).not.toHaveBeenCalled()
    })

    it("returns 404 when team does not exist", async () => {
      vi.mocked(teamRepo.getTeam).mockResolvedValue(undefined)

      const { status, body } = await request(
        app,
        "POST",
        "/orgs/org-1/repos",
        { name: "api-service", teamId: "nonexistent" },
      )

      expect(status).toBe(404)
      expect(body.error).toBe("Team not found")
    })

    it("rejects invalid repo name", async () => {
      const { status } = await request(app, "POST", "/orgs/org-1/repos", {
        name: "INVALID NAME",
        teamId: "team-1",
      })

      expect(status).toBe(400)
    })

    it("rejects missing teamId", async () => {
      const { status } = await request(app, "POST", "/orgs/org-1/repos", {
        name: "api-service",
      })

      expect(status).toBe(400)
    })
  })

  describe("GET /orgs/:orgId/repos/:repoId", () => {
    it("returns repo metadata", async () => {
      vi.mocked(repoMetadata.getById).mockResolvedValue({
        id: "repo-1",
        orgId: "org-1",
        teamId: "team-1",
        name: "api-service",
        forgejoFullName: "org-1/api-service",
        cloneUrl: "http://localhost:3333/org-1/api-service.git",
        sshUrl: "ssh://git@localhost:2223/org-1/api-service.git",
        tags: ["production"],
        gatedBranches: ["main"],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      })

      const { status, body } = await request(
        app,
        "GET",
        "/orgs/org-1/repos/repo-1",
      )

      expect(status).toBe(200)
      expect(body.name).toBe("api-service")
      expect(body.teamId).toBe("team-1")
    })

    it("returns 404 for non-existent repo", async () => {
      vi.mocked(repoMetadata.getById).mockResolvedValue(undefined)

      const { status } = await request(
        app,
        "GET",
        "/orgs/org-1/repos/nonexistent",
      )

      expect(status).toBe(404)
    })
  })

  describe("GET /teams/:teamId/repos", () => {
    it("lists repos by team", async () => {
      vi.mocked(repoMetadata.listByTeam).mockResolvedValue([
        {
          id: "repo-1",
          orgId: "org-1",
          teamId: "team-1",
          name: "api-service",
          forgejoFullName: "org-1/api-service",
          cloneUrl: "http://localhost:3333/org-1/api-service.git",
          sshUrl: "ssh://git@localhost:2223/org-1/api-service.git",
          tags: [],
          gatedBranches: ["main"],
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ])

      const { status, body } = await request(
        app,
        "GET",
        "/teams/team-1/repos",
      )

      expect(status).toBe(200)
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe("api-service")
    })
  })
})
