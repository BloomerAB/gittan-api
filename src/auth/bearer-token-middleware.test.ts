import type { Request, Response } from "express"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TConfig } from "../config/index.js"
import type { TDeps } from "../deps.js"
import { initDeps } from "../deps.js"
import { createBearerTokenMiddleware } from "./bearer-token-middleware.js"

const config = {
  oauth2Issuer: "https://auth.gittan.eu",
  oauth2ClientId: "gittan-web",
  oauth2ClientSecret: "secret",
} as unknown as TConfig

const makeRes = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

const makeReq = (path: string): Request =>
  ({
    path,
    headers: { authorization: "Bearer rb_at_token" },
  }) as unknown as Request

const fakeFetch = (introspection: Record<string, unknown>) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => introspection,
  })

describe("createBearerTokenMiddleware — authz resolved locally (pure-IdP introspect)", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("resolves email + role + companyId from gittan's own users table, NOT from the introspection response", async () => {
    // introspection returns identity ONLY (validity + subject) — the pure-IdP contract.
    // It deliberately does NOT carry email/role/company.
    vi.stubGlobal("fetch", fakeFetch({ active: true, userId: "u1" }))

    const execute = vi.fn().mockResolvedValue({
      rowLength: 1,
      first: () => ({ email: "a@b.se", role: "admin", org_id: "org-123" }),
    })
    initDeps({ db: { execute } } as unknown as TDeps)

    const req = makeReq("/orgs/org-123/members")
    const res = makeRes()
    const next = vi.fn()

    await createBearerTokenMiddleware(config)(req, res, next as never)

    expect(next).toHaveBeenCalledOnce()
    const user = (req as unknown as Record<string, unknown>).user
    expect(user).toEqual({
      id: "u1",
      email: "a@b.se",
      companyId: "org-123",
      role: "admin",
    })
    // every user attribute came from gittan's own users table
    expect(execute).toHaveBeenCalledOnce()
    expect(String(execute.mock.calls[0][0])).toMatch(/FROM .*users WHERE id = \?/i)
    expect(execute.mock.calls[0][1]).toEqual(["u1"])
  })

  it("defaults role=member, email/companyId='' when the user row is absent", async () => {
    vi.stubGlobal("fetch", fakeFetch({ active: true, userId: "ghost" }))
    const execute = vi.fn().mockResolvedValue({ rowLength: 0, first: () => undefined })
    initDeps({ db: { execute } } as unknown as TDeps)

    const req = makeReq("/orgs/x/members")
    const res = makeRes()
    const next = vi.fn()

    await createBearerTokenMiddleware(config)(req, res, next as never)

    expect(next).toHaveBeenCalledOnce()
    expect((req as unknown as Record<string, unknown>).user).toEqual({
      id: "ghost",
      email: "",
      companyId: "",
      role: "member",
    })
  })

  it("401s on inactive token without touching the users table", async () => {
    vi.stubGlobal("fetch", fakeFetch({ active: false }))
    const execute = vi.fn()
    initDeps({ db: { execute } } as unknown as TDeps)

    const req = makeReq("/orgs/x/members")
    const res = makeRes()
    const next = vi.fn()

    await createBearerTokenMiddleware(config)(req, res, next as never)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(execute).not.toHaveBeenCalled()
  })

  it("skips auth for unprotected routes", async () => {
    const execute = vi.fn()
    initDeps({ db: { execute } } as unknown as TDeps)
    const req = makeReq("/healthz")
    const res = makeRes()
    const next = vi.fn()

    await createBearerTokenMiddleware(config)(req, res, next as never)

    expect(next).toHaveBeenCalledOnce()
    expect(execute).not.toHaveBeenCalled()
  })
})
