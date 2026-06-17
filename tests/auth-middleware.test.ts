import type { Request, Response } from "express"
import { describe, expect, it } from "vitest"

import {
  assertOrgAccess,
  assertPlatformAdmin,
  getAuthUser,
  param,
} from "../src/auth/helpers.js"

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
  it("maps bearer token fields to gittan user", () => {
    const req = {
      user: {
        id: "user-123",
        email: "malin@gittan.dev",
        companyId: "org-1",
        role: "admin",
      },
    } as unknown as Request

    const user = getAuthUser(req)

    expect(user).toEqual({
      id: "user-123",
      email: "malin@gittan.dev",
      orgId: "org-1",
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
    expect(user.orgId).toBe("")
    expect(user.role).toBe("member")
  })
})

describe("assertOrgAccess()", () => {
  it("returns true when user org matches request org", () => {
    const { req, res } = createMockReqRes(
      { id: "u1", companyId: "org-1", email: "m@test.com", role: "member" },
      { orgId: "org-1" },
    )
    expect(assertOrgAccess(req, res)).toBe(true)
  })

  it("returns false and 403 when org mismatch", () => {
    const { req, res, getStatus, getBody } = createMockReqRes(
      { id: "u1", companyId: "org-2", email: "m@test.com", role: "member" },
      { orgId: "org-1" },
    )
    expect(assertOrgAccess(req, res)).toBe(false)
    expect(getStatus()).toBe(403)
    expect(getBody().error).toContain("Access denied")
  })

  it("allows access when no org param in request", () => {
    const { req, res } = createMockReqRes(
      { id: "u1", companyId: "org-1", email: "m@test.com", role: "member" },
      {},
    )
    expect(assertOrgAccess(req, res)).toBe(true)
  })

  it("uses custom paramName", () => {
    const { req, res, getStatus } = createMockReqRes(
      { id: "u1", companyId: "org-1", email: "m@test.com", role: "member" },
      { customOrg: "org-2" },
    )
    expect(assertOrgAccess(req, res, "customOrg")).toBe(false)
    expect(getStatus()).toBe(403)
  })
})

describe("assertPlatformAdmin()", () => {
  it("returns true for bloomer org", () => {
    const { req, res } = createMockReqRes({
      id: "u1",
      companyId: "bloomer",
      email: "admin@bloomer.se",
      role: "admin",
    })
    expect(assertPlatformAdmin(req, res)).toBe(true)
  })

  it("returns false and 403 for non-platform org", () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      id: "u1",
      companyId: "customer-org",
      email: "m@test.com",
      role: "admin",
    })
    expect(assertPlatformAdmin(req, res)).toBe(false)
    expect(getStatus()).toBe(403)
    expect(getBody().error).toContain("Platform admin")
  })
})
