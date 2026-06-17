import express from "express"
import type { Request, Response } from "express"
import { describe, expect, it, vi } from "vitest"

import type { THealthDependency } from "../src/server.js"

const createReadyzHandler = (
  healthDependencies: ReadonlyArray<THealthDependency>,
) => {
  return async (_req: Request, res: Response): Promise<void> => {
    const results = await Promise.all(
      healthDependencies.map(async (dep) => {
        try {
          const healthy = await dep.check()
          return { name: dep.name, healthy }
        } catch {
          return { name: dep.name, healthy: false }
        }
      }),
    )

    const allHealthy = results.every((r) => r.healthy)

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "ready" : "degraded",
      dependencies: results,
    })
  }
}

const request = async (app: express.Express, path: string) => {
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`)
    const body = await res.json()
    return { status: res.status, body }
  } finally {
    server.close()
  }
}

describe("GET /readyz", () => {
  it("returns 200 when all dependencies healthy", async () => {
    const deps: THealthDependency[] = [
      { name: "scylla", check: vi.fn().mockResolvedValue(true) },
      { name: "nats", check: vi.fn().mockResolvedValue(true) },
      { name: "forgejo", check: vi.fn().mockResolvedValue(true) },
    ]
    const app = express()
    app.get("/readyz", createReadyzHandler(deps))

    const { status, body } = await request(app, "/readyz")

    expect(status).toBe(200)
    expect(body.status).toBe("ready")
    expect(body.dependencies).toHaveLength(3)
    expect(body.dependencies.every((d: { healthy: boolean }) => d.healthy)).toBe(true)
  })

  it("returns 503 when a dependency is unhealthy", async () => {
    const deps: THealthDependency[] = [
      { name: "scylla", check: vi.fn().mockResolvedValue(true) },
      { name: "nats", check: vi.fn().mockResolvedValue(false) },
      { name: "forgejo", check: vi.fn().mockResolvedValue(true) },
    ]
    const app = express()
    app.get("/readyz", createReadyzHandler(deps))

    const { status, body } = await request(app, "/readyz")

    expect(status).toBe(503)
    expect(body.status).toBe("degraded")
    expect(body.dependencies[1]).toEqual({ name: "nats", healthy: false })
  })

  it("returns 503 when a dependency check throws", async () => {
    const deps: THealthDependency[] = [
      { name: "scylla", check: vi.fn().mockRejectedValue(new Error("connection lost")) },
    ]
    const app = express()
    app.get("/readyz", createReadyzHandler(deps))

    const { status, body } = await request(app, "/readyz")

    expect(status).toBe(503)
    expect(body.status).toBe("degraded")
    expect(body.dependencies[0]).toEqual({ name: "scylla", healthy: false })
  })

  it("returns 200 with empty dependencies", async () => {
    const app = express()
    app.get("/readyz", createReadyzHandler([]))

    const { status, body } = await request(app, "/readyz")

    expect(status).toBe(200)
    expect(body.status).toBe("ready")
    expect(body.dependencies).toEqual([])
  })
})
