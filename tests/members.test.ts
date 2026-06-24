import express from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TInviteRepo } from "../src/db/invite-repo.js"
import type { TMemberRepo } from "../src/db/member-repo.js"
import type { TOrgRepo } from "../src/db/org-repo.js"
import { initDeps } from "../src/deps.js"
import { GET as GET_MEMBERS } from "../src/paths/orgs/[orgId]/members/index.js"
import { DELETE as DELETE_MEMBER } from "../src/paths/orgs/[orgId]/members/[userId].js"
import { GET as GET_INVITES, POST as POST_INVITE } from "../src/paths/orgs/[orgId]/invites/index.js"
import { DELETE as DELETE_INVITE } from "../src/paths/orgs/[orgId]/invites/[id].js"
import { POST as ACCEPT_INVITE } from "../src/paths/invites/[token]/accept.js"

const TEST_ORG = "org-1"
const TEST_USER_ID = "user-owner"

const createMockMemberRepo = (): TMemberRepo => ({
  addMember: vi.fn().mockResolvedValue({ orgId: TEST_ORG, userId: "new-user", role: "member", joinedAt: new Date().toISOString() }),
  removeMember: vi.fn().mockResolvedValue(undefined),
  getMembers: vi.fn().mockResolvedValue([]),
  getUserOrgIds: vi.fn().mockResolvedValue([{ orgId: TEST_ORG, role: "owner" }]),
  getMembership: vi.fn().mockResolvedValue({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: new Date().toISOString() }),
})

const createMockInviteRepo = (): TInviteRepo => ({
  create: vi.fn().mockResolvedValue({
    id: "inv-1",
    orgId: TEST_ORG,
    email: "new@test.com",
    role: "member",
    token: "tok-abc",
    invitedBy: TEST_USER_ID,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  }),
  getByOrg: vi.fn().mockResolvedValue([]),
  getByToken: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
})

const createMockOrgRepo = (): TOrgRepo => ({
  create: vi.fn() as any,
  getById: vi.fn().mockResolvedValue({ id: TEST_ORG, name: "test-org", displayName: "Test Org", mandatorySso: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
  update: vi.fn() as any,
  getByName: vi.fn() as any,
  getByUserId: vi.fn() as any,
})

const createMockDb = () => ({
  execute: vi.fn().mockResolvedValue({ rows: [], rowLength: 0, first: () => ({}) }),
  batch: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn(),
})

const stubDeps = (overrides: {
  memberRepo?: TMemberRepo
  inviteRepo?: TInviteRepo
  orgRepo?: TOrgRepo
  db?: ReturnType<typeof createMockDb>
} = {}) => {
  initDeps({
    config: {} as any,
    db: (overrides.db ?? createMockDb()) as any,
    nats: {} as any,
    orgRepo: overrides.orgRepo ?? createMockOrgRepo(),
    memberRepo: overrides.memberRepo ?? createMockMemberRepo(),
    teamRepo: {} as any,
    repoMetadata: {} as any,
    usageRepo: {} as any,
    stepRegistry: {} as any,
    policyRepo: {} as any,
    auditRepo: {} as any,
    inviteRepo: overrides.inviteRepo ?? createMockInviteRepo(),
    forgejo: {} as any,
  })
}

const injectUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  ;(req as any).user = { id: TEST_USER_ID, email: "owner@test.com", role: "admin" }
  next()
}

const createTestApp = () => {
  const app = express()
  app.use(express.json())
  app.use(injectUser)
  app.get("/orgs/:orgId/members", GET_MEMBERS as any)
  app.delete("/orgs/:orgId/members/:userId", DELETE_MEMBER as any)
  app.get("/orgs/:orgId/invites", GET_INVITES as any)
  app.post("/orgs/:orgId/invites", POST_INVITE as any)
  app.delete("/orgs/:orgId/invites/:id", DELETE_INVITE as any)
  app.post("/invites/:token/accept", ACCEPT_INVITE as any)
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

describe("GET /orgs/:orgId/members", () => {
  let memberRepo: TMemberRepo
  let mockDb: ReturnType<typeof createMockDb>
  let app: express.Express

  beforeEach(() => {
    memberRepo = createMockMemberRepo()
    mockDb = createMockDb()
    stubDeps({ memberRepo, db: mockDb })
    app = createTestApp()
  })

  it("returns enriched member list", async () => {
    vi.mocked(memberRepo.getMembers).mockResolvedValue([
      { orgId: TEST_ORG, userId: "u1", role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
      { orgId: TEST_ORG, userId: "u2", role: "member", joinedAt: "2026-02-01T00:00:00Z" },
    ])
    mockDb.execute.mockResolvedValue({
      rows: [
        { user_id: "u1", email: "alice@test.com", name: "Alice" },
        { user_id: "u2", email: "bob@test.com", name: "Bob" },
      ],
      rowLength: 2,
      first: () => ({}),
    })

    const { status, body } = await request(app, "GET", `/orgs/${TEST_ORG}/members`)

    expect(status).toBe(200)
    expect(body).toHaveLength(2)
    expect(body[0]).toEqual({
      userId: "u1",
      email: "alice@test.com",
      name: "Alice",
      role: "owner",
      joinedAt: "2026-01-01T00:00:00Z",
    })
    expect(body[1].email).toBe("bob@test.com")
  })

  it("returns empty array for org with no members", async () => {
    vi.mocked(memberRepo.getMembers).mockResolvedValue([])

    const { status, body } = await request(app, "GET", `/orgs/${TEST_ORG}/members`)

    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  it("returns 403 for non-member", async () => {
    vi.mocked(memberRepo.getMembership).mockResolvedValue(undefined)

    const { status } = await request(app, "GET", `/orgs/${TEST_ORG}/members`)

    expect(status).toBe(403)
  })
})

describe("DELETE /orgs/:orgId/members/:userId", () => {
  let memberRepo: TMemberRepo
  let mockDb: ReturnType<typeof createMockDb>
  let app: express.Express

  beforeEach(() => {
    memberRepo = createMockMemberRepo()
    mockDb = createMockDb()
    stubDeps({ memberRepo, db: mockDb })
    app = createTestApp()
  })

  it("removes a member", async () => {
    vi.mocked(memberRepo.getMembership)
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // assertOrgAccess
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // role check
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: "target-user", role: "member", joinedAt: "" }) // target lookup

    const { status } = await request(app, "DELETE", `/orgs/${TEST_ORG}/members/target-user`)

    expect(status).toBe(204)
    expect(memberRepo.removeMember).toHaveBeenCalledWith(TEST_ORG, "target-user")
  })

  it("prevents removing the owner", async () => {
    vi.mocked(memberRepo.getMembership)
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // assertOrgAccess
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // role check
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: "other-owner", role: "owner", joinedAt: "" }) // target lookup

    const { status, body } = await request(app, "DELETE", `/orgs/${TEST_ORG}/members/other-owner`)

    expect(status).toBe(400)
    expect(body.error).toContain("owner")
    expect(memberRepo.removeMember).not.toHaveBeenCalled()
  })

  it("returns 403 for non-admin", async () => {
    vi.mocked(memberRepo.getMembership)
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "member", joinedAt: "" }) // assertOrgAccess
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "member", joinedAt: "" }) // role check

    const { status } = await request(app, "DELETE", `/orgs/${TEST_ORG}/members/target-user`)

    expect(status).toBe(403)
  })

  it("returns 404 for non-existent member", async () => {
    vi.mocked(memberRepo.getMembership)
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // assertOrgAccess
      .mockResolvedValueOnce({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "owner", joinedAt: "" }) // role check
      .mockResolvedValueOnce(undefined) // target not found

    const { status } = await request(app, "DELETE", `/orgs/${TEST_ORG}/members/ghost`)

    expect(status).toBe(404)
  })
})

describe("POST /orgs/:orgId/invites", () => {
  let inviteRepo: TInviteRepo
  let memberRepo: TMemberRepo
  let app: express.Express

  beforeEach(() => {
    inviteRepo = createMockInviteRepo()
    memberRepo = createMockMemberRepo()
    stubDeps({ inviteRepo, memberRepo })
    app = createTestApp()
  })

  it("creates an invite", async () => {
    const { status, body } = await request(app, "POST", `/orgs/${TEST_ORG}/invites`, {
      email: "new@company.com",
      role: "member",
    })

    expect(status).toBe(201)
    expect(body.email).toBe("new@test.com")
    expect(body.token).toBe("tok-abc")
    expect(inviteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: TEST_ORG,
        email: "new@company.com",
        role: "member",
        invitedBy: TEST_USER_ID,
      }),
    )
  })

  it("defaults role to member", async () => {
    const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/invites`, {
      email: "x@y.com",
    })

    expect(status).toBe(201)
    expect(inviteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member" }),
    )
  })

  it("rejects invalid email", async () => {
    const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/invites`, {
      email: "not-an-email",
    })

    expect(status).toBe(400)
    expect(inviteRepo.create).not.toHaveBeenCalled()
  })

  it("rejects non-admin users", async () => {
    vi.mocked(memberRepo.getMembership).mockResolvedValue({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "member", joinedAt: "" })

    const { status } = await request(app, "POST", `/orgs/${TEST_ORG}/invites`, {
      email: "x@y.com",
    })

    expect(status).toBe(403)
  })
})

describe("GET /orgs/:orgId/invites", () => {
  it("lists pending invites", async () => {
    const inviteRepo = createMockInviteRepo()
    vi.mocked(inviteRepo.getByOrg).mockResolvedValue([
      { id: "i1", orgId: TEST_ORG, email: "a@b.com", role: "member", token: "tok", invitedBy: "u1", createdAt: "2026-01-01", expiresAt: "2026-01-08" },
    ])
    stubDeps({ inviteRepo })
    const app = createTestApp()

    const { status, body } = await request(app, "GET", `/orgs/${TEST_ORG}/invites`)

    expect(status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe("a@b.com")
    expect(body[0]).not.toHaveProperty("token")
  })
})

describe("DELETE /orgs/:orgId/invites/:id", () => {
  it("revokes an invite", async () => {
    const inviteRepo = createMockInviteRepo()
    stubDeps({ inviteRepo })
    const app = createTestApp()

    const { status } = await request(app, "DELETE", `/orgs/${TEST_ORG}/invites/inv-1`)

    expect(status).toBe(204)
    expect(inviteRepo.delete).toHaveBeenCalledWith(TEST_ORG, "inv-1")
  })

  it("rejects non-admin users", async () => {
    const inviteRepo = createMockInviteRepo()
    const memberRepo = createMockMemberRepo()
    vi.mocked(memberRepo.getMembership).mockResolvedValue({ orgId: TEST_ORG, userId: TEST_USER_ID, role: "member", joinedAt: "" })
    stubDeps({ inviteRepo, memberRepo })
    const app = createTestApp()

    const { status } = await request(app, "DELETE", `/orgs/${TEST_ORG}/invites/inv-1`)

    expect(status).toBe(403)
  })
})

describe("POST /invites/:token/accept", () => {
  let inviteRepo: TInviteRepo
  let memberRepo: TMemberRepo
  let orgRepo: TOrgRepo
  let mockDb: ReturnType<typeof createMockDb>
  let app: express.Express

  beforeEach(() => {
    inviteRepo = createMockInviteRepo()
    memberRepo = createMockMemberRepo()
    orgRepo = createMockOrgRepo()
    mockDb = createMockDb()
    stubDeps({ inviteRepo, memberRepo, orgRepo, db: mockDb })
    app = createTestApp()
  })

  it("accepts a valid invite", async () => {
    vi.mocked(inviteRepo.getByToken).mockResolvedValue({
      id: "inv-1",
      orgId: TEST_ORG,
      email: "new@test.com",
      role: "member",
      token: "valid-tok",
      invitedBy: "admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(memberRepo.getMembership).mockResolvedValue(undefined)

    const { status, body } = await request(app, "POST", "/invites/valid-tok/accept")

    expect(status).toBe(200)
    expect(body.orgId).toBe(TEST_ORG)
    expect(body.orgDisplayName).toBe("Test Org")
    expect(memberRepo.addMember).toHaveBeenCalledWith(TEST_ORG, TEST_USER_ID, "member")
    expect(inviteRepo.delete).toHaveBeenCalledWith(TEST_ORG, "inv-1")
  })

  it("returns 404 for invalid token", async () => {
    vi.mocked(inviteRepo.getByToken).mockResolvedValue(undefined)

    const { status } = await request(app, "POST", "/invites/bad-tok/accept")

    expect(status).toBe(404)
  })

  it("returns 409 if already a member", async () => {
    vi.mocked(inviteRepo.getByToken).mockResolvedValue({
      id: "inv-1",
      orgId: TEST_ORG,
      email: "existing@test.com",
      role: "member",
      token: "tok",
      invitedBy: "admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(memberRepo.getMembership).mockResolvedValue({
      orgId: TEST_ORG,
      userId: TEST_USER_ID,
      role: "member",
      joinedAt: "",
    })

    const { status } = await request(app, "POST", "/invites/tok/accept")

    expect(status).toBe(409)
  })
})
