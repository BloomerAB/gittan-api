import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TPipelineRepo } from "../src/db/pipeline-repo.js"
import type { TTeamRepo } from "../src/db/team-repo.js"
import type { TMemberRepo } from "../src/db/member-repo.js"
import { initDeps } from "../src/deps.js"
import { GET } from "../src/paths/teams/[teamId]/metrics.js"

const TEST_ORG = "org-1"
const TEST_TEAM = "team-1"

const createMockPipelineRepo = (): TPipelineRepo => ({
  save: vi.fn(),
  listByRepo: vi.fn(),
  getById: vi.fn(),
  listByTeam: vi.fn(),
})

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

const createMockMemberRepo = (): TMemberRepo => ({
  addMember: vi.fn(),
  removeMember: vi.fn(),
  getMembers: vi.fn(),
  getUserOrgIds: vi.fn().mockResolvedValue([{ orgId: TEST_ORG, role: "member" }]),
  getMembership: vi.fn().mockResolvedValue({ orgId: TEST_ORG, userId: "test-user", role: "member", joinedAt: new Date().toISOString() }),
})

const createMockDb = () => {
  const mock = {
    execute: vi.fn(),
    shutdown: vi.fn(),
  }
  mock.execute.mockImplementation(async (query: string, params?: unknown[]) => {
    if (typeof query === "string" && query.includes("teams WHERE org_id")) {
      return { rows: [{ id: TEST_TEAM }], rowLength: 1, first: () => ({ id: TEST_TEAM }) }
    }
    return { rows: [], rowLength: 0, first: () => ({}) }
  })
  return mock
}

const stubDeps = (pipelineRepo: TPipelineRepo, teamRepo: TTeamRepo, memberRepo: TMemberRepo, db?: any) => {
  initDeps({
    config: {} as any,
    db: db ?? createMockDb(),
    nats: {} as any,
    orgRepo: {} as any,
    memberRepo,
    teamRepo,
    repoMetadata: {} as any,
    usageRepo: {} as any,
    stepRegistry: {} as any,
    pipelineRepo,
    policyRepo: {} as any,
    auditRepo: {} as any,
    inviteRepo: {} as any,
    receiptRepo: {} as any,
    alertRepo: {} as any,
    forgejo: {} as any,
    email: {} as any,
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
  app.get("/teams/:teamId/metrics", GET as any)
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

// Helper to create realistic pipeline run dates within 7 days
const daysAgo = (days: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

describe("team metrics endpoint", () => {
  let pipelineRepo: TPipelineRepo
  let teamRepo: TTeamRepo
  let memberRepo: TMemberRepo
  let mockDb: ReturnType<typeof createMockDb>
  let app: express.Express

  beforeEach(() => {
    pipelineRepo = createMockPipelineRepo()
    teamRepo = createMockTeamRepo()
    memberRepo = createMockMemberRepo()
    mockDb = createMockDb()
    stubDeps(pipelineRepo, teamRepo, memberRepo, mockDb)
    app = createTestApp()
  })

  describe("GET /teams/:teamId/metrics", () => {
    it("returns all-zero metrics for team with no runs", async () => {
      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([])

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body).toMatchObject({
        teamId: TEST_TEAM,
        period: "7d",
        pushFrequency: 0,
        avgPipelineLeadTimeMs: 0,
        pushRejectionRate: 0,
        avgRecoveryTimeMs: 0,
        totalPushes: 0,
        successfulPushes: 0,
        failedPushes: 0,
      })
    })

    it("calculates metrics for single successful push", async () => {
      const startedAt = daysAgo(1)
      const finishedAt = new Date(startedAt.getTime() + 60000) // 60 seconds later

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockResolvedValue({
        id: "run-1",
        repoId: "repo-1",
        pushEventId: "push-1",
        orgId: TEST_ORG,
        teamId: TEST_TEAM,
        branch: "main",
        status: "success",
        steps: [],
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.totalPushes).toBe(1)
      expect(body.successfulPushes).toBe(1)
      expect(body.failedPushes).toBe(0)
      expect(body.pushRejectionRate).toBe(0)
      expect(body.pushFrequency).toBeCloseTo(1 / 7, 2)
      expect(body.avgPipelineLeadTimeMs).toBe(60000)
    })

    it("counts multiple runs under same pushEventId as single push", async () => {
      const startedAt1 = daysAgo(2)
      const finishedAt1 = new Date(startedAt1.getTime() + 120000)
      const startedAt2 = daysAgo(1.9)
      const finishedAt2 = new Date(startedAt2.getTime() + 90000)

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "failed",
          startedAt: startedAt1.toISOString(),
        },
        {
          runId: "run-2",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt2.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-1") {
          return {
            id: "run-1",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "failed",
            steps: [],
            startedAt: startedAt1.toISOString(),
            finishedAt: finishedAt1.toISOString(),
          }
        }
        if (runId === "run-2") {
          return {
            id: "run-2",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: startedAt2.toISOString(),
            finishedAt: finishedAt2.toISOString(),
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.totalPushes).toBe(1)
      expect(body.successfulPushes).toBe(1)
      expect(body.failedPushes).toBe(0)
      expect(body.pushRejectionRate).toBe(0)
    })

    it("calculates rejection rate for failed pushes", async () => {
      const startedAt1 = daysAgo(3)
      const finishedAt1 = new Date(startedAt1.getTime() + 60000)
      const startedAt2 = daysAgo(2)
      const finishedAt2 = new Date(startedAt2.getTime() + 60000)

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt1.toISOString(),
        },
        {
          runId: "run-2",
          repoId: "repo-1",
          branch: "main",
          status: "failed",
          startedAt: startedAt2.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-1") {
          return {
            id: "run-1",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: startedAt1.toISOString(),
            finishedAt: finishedAt1.toISOString(),
          }
        }
        if (runId === "run-2") {
          return {
            id: "run-2",
            repoId: "repo-1",
            pushEventId: "push-2",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "failed",
            steps: [],
            startedAt: startedAt2.toISOString(),
            finishedAt: finishedAt2.toISOString(),
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.totalPushes).toBe(2)
      expect(body.successfulPushes).toBe(1)
      expect(body.failedPushes).toBe(1)
      expect(body.pushRejectionRate).toBeCloseTo(0.5, 2)
    })

    it("calculates recovery time for resolved failures", async () => {
      const failureStartedAt = daysAgo(3)
      const failureFinishedAt = new Date(failureStartedAt.getTime() + 60000)
      const recoveryStartedAt = daysAgo(2.9)
      const recoveryFinishedAt = new Date(recoveryStartedAt.getTime() + 90000)
      const recoveryDuration = recoveryFinishedAt.getTime() - failureStartedAt.getTime()

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "failed",
          startedAt: failureStartedAt.toISOString(),
        },
        {
          runId: "run-2",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: recoveryStartedAt.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-1") {
          return {
            id: "run-1",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "failed",
            steps: [],
            startedAt: failureStartedAt.toISOString(),
            finishedAt: failureFinishedAt.toISOString(),
          }
        }
        if (runId === "run-2") {
          return {
            id: "run-2",
            repoId: "repo-1",
            pushEventId: "push-2",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: recoveryStartedAt.toISOString(),
            finishedAt: recoveryFinishedAt.toISOString(),
            resolvedFrom: "push-1",
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.failedPushes).toBe(1)
      expect(body.avgRecoveryTimeMs).toBe(recoveryDuration)
    })

    it("excludes runs outside 7-day window", async () => {
      const oldRun = new Date()
      oldRun.setDate(oldRun.getDate() - 10)
      const recentRun = daysAgo(1)
      const finishedAt = new Date(recentRun.getTime() + 60000)

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-old",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: oldRun.toISOString(),
        },
        {
          runId: "run-recent",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: recentRun.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-old") {
          return {
            id: "run-old",
            repoId: "repo-1",
            pushEventId: "push-old",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: oldRun.toISOString(),
            finishedAt: new Date(oldRun.getTime() + 60000).toISOString(),
          }
        }
        if (runId === "run-recent") {
          return {
            id: "run-recent",
            repoId: "repo-1",
            pushEventId: "push-recent",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: recentRun.toISOString(),
            finishedAt: finishedAt.toISOString(),
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.totalPushes).toBe(1)
      expect(body.successfulPushes).toBe(1)
      expect(body.pushFrequency).toBeCloseTo(1 / 7, 2)
    })

    it("returns 403 when user lacks access to team", async () => {
      mockDb.execute.mockImplementation(async (query: string) => {
        if (typeof query === "string" && query.includes("teams WHERE org_id")) {
          return { rows: [], rowLength: 0, first: () => null }
        }
        return { rows: [], rowLength: 0, first: () => ({}) }
      })

      const { status, body } = await request(app, "GET", `/teams/foreign-team/metrics`)

      expect(status).toBe(403)
      expect(body.error).toContain("Access denied")
      expect(pipelineRepo.listByTeam).not.toHaveBeenCalled()
    })

    it("calculates correct average lead time for multiple runs", async () => {
      const startedAt1 = daysAgo(2)
      const finishedAt1 = new Date(startedAt1.getTime() + 30000) // 30 seconds
      const startedAt2 = daysAgo(1)
      const finishedAt2 = new Date(startedAt2.getTime() + 90000) // 90 seconds

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt1.toISOString(),
        },
        {
          runId: "run-2",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt2.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-1") {
          return {
            id: "run-1",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: startedAt1.toISOString(),
            finishedAt: finishedAt1.toISOString(),
          }
        }
        if (runId === "run-2") {
          return {
            id: "run-2",
            repoId: "repo-1",
            pushEventId: "push-2",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: startedAt2.toISOString(),
            finishedAt: finishedAt2.toISOString(),
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      expect(body.avgPipelineLeadTimeMs).toBe((30000 + 90000) / 2)
    })

    it("handles runs with same pushEventId but only counts latest for lead time", async () => {
      const startedAt1 = daysAgo(2)
      const finishedAt1 = new Date(startedAt1.getTime() + 30000)
      const startedAt2 = daysAgo(1.9)
      const finishedAt2 = new Date(startedAt2.getTime() + 120000)

      vi.mocked(pipelineRepo.listByTeam).mockResolvedValue([
        {
          runId: "run-1",
          repoId: "repo-1",
          branch: "main",
          status: "failed",
          startedAt: startedAt1.toISOString(),
        },
        {
          runId: "run-2",
          repoId: "repo-1",
          branch: "main",
          status: "success",
          startedAt: startedAt2.toISOString(),
        },
      ])

      vi.mocked(pipelineRepo.getById).mockImplementation(async (repoId, runId) => {
        if (runId === "run-1") {
          return {
            id: "run-1",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "failed",
            steps: [],
            startedAt: startedAt1.toISOString(),
            finishedAt: finishedAt1.toISOString(),
          }
        }
        if (runId === "run-2") {
          return {
            id: "run-2",
            repoId: "repo-1",
            pushEventId: "push-1",
            orgId: TEST_ORG,
            teamId: TEST_TEAM,
            branch: "main",
            status: "success",
            steps: [],
            startedAt: startedAt2.toISOString(),
            finishedAt: finishedAt2.toISOString(),
          }
        }
        return undefined
      })

      const { status, body } = await request(app, "GET", `/teams/${TEST_TEAM}/metrics`)

      expect(status).toBe(200)
      // Should use the latest run's lead time for this push
      expect(body.avgPipelineLeadTimeMs).toBe(120000)
    })
  })
})
