import express from "express"
import { describe, expect, it } from "vitest"

import {
  registerHealthRoutes,
  type THealthDependency,
} from "../src/paths/health.js"

const createTestApp = (deps: ReadonlyArray<THealthDependency>) => {
  const app = express()
  const router = express.Router()
  registerHealthRoutes(router, deps)
  app.use(router)
  return app
}

const request = async (app: express.Express, path: string) => {
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to get server address")
  }
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`)
    const body = await res.json()
    return { status: res.status, body }
  } finally {
    server.close()
  }
}

describe("GET /healthz", () => {
  it("returns healthy when all dependencies are up", async () => {
    const app = createTestApp([
      { name: "db", check: async () => true },
      { name: "queue", check: async () => true },
    ])

    const { status, body } = await request(app, "/healthz")
    expect(status).toBe(200)
    expect(body).toEqual({
      status: "healthy",
      dependencies: [
        { name: "db", healthy: true },
        { name: "queue", healthy: true },
      ],
    })
  })

  it("returns degraded when a dependency is down", async () => {
    const app = createTestApp([
      { name: "db", check: async () => true },
      { name: "queue", check: async () => false },
    ])

    const { status, body } = await request(app, "/healthz")
    expect(status).toBe(503)
    expect(body.status).toBe("degraded")
    expect(body.dependencies[1]).toEqual({ name: "queue", healthy: false })
  })

  it("catches exceptions from dependency checks", async () => {
    const app = createTestApp([
      {
        name: "db",
        check: async () => {
          throw new Error("connection refused")
        },
      },
    ])

    const { status, body } = await request(app, "/healthz")
    expect(status).toBe(503)
    expect(body.dependencies[0]).toEqual({ name: "db", healthy: false })
  })

  it("returns healthy with no dependencies", async () => {
    const app = createTestApp([])
    const { status, body } = await request(app, "/healthz")
    expect(status).toBe(200)
    expect(body.status).toBe("healthy")
  })
})
