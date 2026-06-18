import type { NextFunction, Request, Response } from "express"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createBearerTokenMiddleware } from "../src/auth/bearer-token-middleware.js"
import type { TConfig } from "../src/config/index.js"

const createConfig = (overrides: Partial<TConfig> = {}): TConfig => ({
  port: 4000,
  host: "0.0.0.0",
  nodeEnv: "test",
  scyllaHosts: ["localhost:9043"],
  scyllaKeyspace: "gittan",
  natsUrl: "nats://localhost:4222",
  forgejoUrl: "http://localhost:3333",
  oauth2Issuer: "http://localhost:4400",
  oauth2ClientId: "gittan-client",
  oauth2ClientSecret: "gittan-secret",
  ...overrides,
})

const createMockReqResNext = (
  headers: Record<string, string> = {},
  path = "/user/orgs",
) => {
  const req = {
    headers,
    path,
  } as unknown as Request

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

  let nextCalled = false
  const next: NextFunction = () => {
    nextCalled = true
  }

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getBody: () => responseBody as Record<string, string>,
    wasNextCalled: () => nextCalled,
  }
}

describe("createBearerTokenMiddleware", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("unprotected routes", () => {
    const unprotectedPaths = [
      "/healthz",
      "/readyz",
      "/docs",
      "/api-definition",
      "/metrics",
      "/hooks/push",
    ]

    for (const path of unprotectedPaths) {
      it(`skips auth for ${path}`, async () => {
        const config = createConfig()
        const middleware = createBearerTokenMiddleware(config)
        const { req, res, next, wasNextCalled } = createMockReqResNext({}, path)

        await middleware(req, res, next)

        expect(wasNextCalled()).toBe(true)
      })
    }
  })

  describe("missing authorization", () => {
    it("returns 401 when no Authorization header", async () => {
      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, getBody, wasNextCalled } =
        createMockReqResNext({})

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
      expect(getBody().error).toContain("Missing")
    })

    it("returns 401 for non-Bearer scheme", async () => {
      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, wasNextCalled } =
        createMockReqResNext({ authorization: "Basic abc123" })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
    })

    it("returns 401 for Bearer without token", async () => {
      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, wasNextCalled } =
        createMockReqResNext({ authorization: "Bearer " })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
    })
  })

  describe("token introspection", () => {
    it("sets req.user and calls next for active token", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            active: true,
            sub: "user-42",
            userId: "user-42",
            email: "dev@gittan.eu",
            companyId: "org-bloomer",
            role: "admin",
            scope: "openid profile",
          }),
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, wasNextCalled } = createMockReqResNext({
        authorization: "Bearer valid-access-token",
      })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(true)
      const user = (req as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
      >
      expect(user.id).toBe("user-42")
      expect(user.email).toBe("dev@gittan.eu")
      expect(user.companyId).toBe("org-bloomer")
      expect(user.role).toBe("admin")
    })

    it("sends correct introspection request", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true, sub: "u1" }),
      })

      const config = createConfig({
        oauth2Issuer: "http://auth.example.com",
        oauth2ClientId: "my-client",
        oauth2ClientSecret: "my-secret",
      })
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next } = createMockReqResNext({
        authorization: "Bearer the-token",
      })

      await middleware(req, res, next)

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      expect(fetchMock).toHaveBeenCalledOnce()

      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe("http://auth.example.com/oauth/introspect")
      expect(options.method).toBe("POST")
      expect(options.headers["content-type"]).toBe(
        "application/x-www-form-urlencoded",
      )

      const body = new URLSearchParams(options.body as string)
      expect(body.get("token")).toBe("the-token")
      expect(body.get("client_id")).toBe("my-client")
      expect(body.get("client_secret")).toBe("my-secret")
    })

    it("returns 401 for inactive token", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: false }),
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, getBody, wasNextCalled } =
        createMockReqResNext({ authorization: "Bearer expired-token" })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
      expect(getBody().error).toContain("inactive")
    })

    it("returns 401 when introspection endpoint is unreachable", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Connection refused"))

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, getBody, wasNextCalled } =
        createMockReqResNext({ authorization: "Bearer some-token" })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
      expect(getBody().error).toContain("validation failed")
    })

    it("returns 401 when introspection returns non-200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, getStatus, wasNextCalled } =
        createMockReqResNext({ authorization: "Bearer some-token" })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(false)
      expect(getStatus()).toBe(401)
    })

    it("falls back to sub when userId is missing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            active: true,
            sub: "sub-user-99",
            email: "test@gittan.eu",
          }),
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, wasNextCalled } = createMockReqResNext({
        authorization: "Bearer valid-token",
      })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(true)
      const user = (req as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
      >
      expect(user.id).toBe("sub-user-99")
    })

    it("uses defaults for missing optional fields", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true, sub: "u1" }),
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, wasNextCalled } = createMockReqResNext({
        authorization: "Bearer minimal-token",
      })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(true)
      const user = (req as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
      >
      expect(user.email).toBe("")
      expect(user.companyId).toBe("")
      expect(user.role).toBe("member")
    })

    it("accepts tokens with rb_at_ prefix too", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            active: true,
            userId: "user-rb",
            email: "rb@test.com",
          }),
      })

      const config = createConfig()
      const middleware = createBearerTokenMiddleware(config)
      const { req, res, next, wasNextCalled } = createMockReqResNext({
        authorization: "Bearer rb_at_some-legacy-token",
      })

      await middleware(req, res, next)

      expect(wasNextCalled()).toBe(true)
      const user = (req as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
      >
      expect(user.id).toBe("user-rb")
    })
  })
})
