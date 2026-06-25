import type { Request, Response } from "express"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TMemberRepo } from "../src/db/member-repo.js"
import {
  assertOrgAccess,
  assertPlatformAdmin,
  getAuthUser,
  param,
} from "../src/auth/helpers.js"
import { initDeps } from "../src/deps.js"

const createMockMemberRepo = (overrides: Partial<TMemberRepo> = {}): TMemberRepo => ({
  addMember: vi.fn(),
  removeMember: vi.fn(),
  getMembers: vi.fn(),
  getUserOrgIds: vi.fn().mockResolvedValue([]),
  getMembership: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

const stubDeps = (memberRepo?: TMemberRepo) => {
  initDeps({
    config: {} as any,
    db: { execute: vi.fn(), batch: vi.fn() } as any,
    nats: {} as any,
    orgRepo: {} as any,
    memberRepo: memberRepo ?? createMockMemberRepo(),
    teamRepo: {} as any,
    repoMetadata: {} as any,
    usageRepo: { getPlan: async () => undefined, getUsage: async () => undefined, getEffectiveCiLimit: async () => 2000 } as any,
    stepRegistry: {} as any,
    policyRepo: {} as any,
    auditRepo: {} as any,
    forgejo: {} as any,
  })
}

const createMockReqRes = (
  user: Record<string, unknown> | undefined,
  params: Record<string, string> = {},
) => {
  const req = { params, user } as unknown as Request

  let statusCode = 200
  let responseBody: unknown
  const res = {
    status(code: number) {
      statusCode = code
      return res
    },
    json(body: unknown) {
      responseBody = body
      return res
    },
  } as unknown as Response

  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => responseBody as Record<string, string>,
  }
}

describe("param()", () => {
  it("extracts a string param", () => {
    const req = { params: { orgId: "org-1" } } as unknown as Request
    expect(param(req, "orgId")).toBe("org-1")
  })

  it("returns first element when param is an array", () => {
    const req = { params: { orgId: ["org-1", "org-2"] } } as unknown as Request
    expect(param(req, "orgId")).toBe("org-1")
  })

  it("returns empty string for missing param", () => {
    const req = { params: {} } as unknown as Request
    expect(param(req, "orgId")).toBe("")
  })
})

describe("getAuthUser()", () => {
  it("maps bearer token fields to token user", () => {
    const req = {
      user: {
        id: "user-123",
        email: "malin@gittan.dev",
        role: "admin",
      },
    } as unknown as Request

    const user = getAuthUser(req)

    expect(user).toEqual({
      id: "user-123",
      email: "malin@gittan.dev",
      role: "admin",
    })
  })

  it("throws when no user on request", () => {
    const req = {} as unknown as Request
    expect(() => getAuthUser(req)).toThrow("No authenticated user")
  })

  it("uses defaults for missing fields", () => {
    const req = { user: {} } as unknown as Request
    const user = getAuthUser(req)

    expect(user.id).toBe("")
    expect(user.email).toBe("")
    expect(user.role).toBe("member")
  })
})

describe("assertOrgAccess()", () => {
  beforeEach(() => {
    stubDeps(createMockMemberRepo({
      getMembership: vi.fn().mockResolvedValue({ orgId: "org-1", userId: "u1", role: "owner", joinedAt: new Date().toISOString() }),
    }))
  })

  it("returns true when user is a member of requested org", async () => {
    const { req, res } = createMockReqRes(
      { id: "u1", email: "m@test.com", role: "member" },
      { orgId: "org-1" },
    )
    expect(await assertOrgAccess(req, res)).toBe(true)
  })

  it("returns false and 403 when user is not a member of requested org", async () => {
    stubDeps(createMockMemberRepo({
      getMembership: vi.fn().mockResolvedValue(undefined),
    }))
    const { req, res, getStatus, getBody } = createMockReqRes(
      { id: "u1", email: "m@test.com", role: "member" },
      { orgId: "org-1" },
    )
    expect(await assertOrgAccess(req, res)).toBe(false)
    expect(getStatus()).toBe(403)
    expect(getBody().error).toContain("Access denied")
  })

  it("allows access when no org param in request", async () => {
    const { req, res } = createMockReqRes(
      { id: "u1", email: "m@test.com", role: "member" },
      {},
    )
    expect(await assertOrgAccess(req, res)).toBe(true)
  })

  it("uses custom paramName", async () => {
    stubDeps(createMockMemberRepo({
      getMembership: vi.fn().mockResolvedValue(undefined),
    }))
    const { req, res, getStatus } = createMockReqRes(
      { id: "u1", email: "m@test.com", role: "member" },
      { customOrg: "org-2" },
    )
    expect(await assertOrgAccess(req, res, "customOrg")).toBe(false)
    expect(getStatus()).toBe(403)
  })

  it("returns false when user has no membership", async () => {
    stubDeps(createMockMemberRepo({
      getMembership: vi.fn().mockResolvedValue(undefined),
    }))
    const { req, res, getStatus } = createMockReqRes(
      { id: "u1", email: "m@test.com", role: "member" },
      { orgId: "org-1" },
    )
    expect(await assertOrgAccess(req, res)).toBe(false)
    expect(getStatus()).toBe(403)
  })
})

describe("assertPlatformAdmin()", () => {
  it("returns true for bloomer org member", async () => {
    stubDeps(createMockMemberRepo({
      getUserOrgIds: vi.fn().mockResolvedValue([{ orgId: "bloomer", role: "owner" }]),
    }))
    const { req, res } = createMockReqRes({
      id: "u1",
      email: "admin@bloomer.se",
      role: "admin",
    })
    expect(await assertPlatformAdmin(req, res)).toBe(true)
  })

  it("returns false and 403 for non-platform org", async () => {
    stubDeps(createMockMemberRepo({
      getUserOrgIds: vi.fn().mockResolvedValue([{ orgId: "customer-org", role: "member" }]),
    }))
    const { req, res, getStatus, getBody } = createMockReqRes({
      id: "u1",
      email: "m@test.com",
      role: "admin",
    })
    expect(await assertPlatformAdmin(req, res)).toBe(false)
    expect(getStatus()).toBe(403)
    expect(getBody().error).toContain("Platform admin")
  })
})
