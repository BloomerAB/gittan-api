import type { Router } from "express"

export type THealthDependency = {
  readonly name: string
  readonly check: () => Promise<boolean>
}

type THealthStatus = {
  readonly status: "healthy" | "degraded"
  readonly dependencies: ReadonlyArray<{
    readonly name: string
    readonly healthy: boolean
  }>
}

export const registerHealthRoutes = (
  router: Router,
  dependencies: ReadonlyArray<THealthDependency>,
): void => {
  router.get("/healthz", async (_req, res) => {
    const results = await Promise.all(
      dependencies.map(async (dep) => {
        try {
          const healthy = await dep.check()
          return { name: dep.name, healthy }
        } catch {
          return { name: dep.name, healthy: false }
        }
      }),
    )

    const allHealthy = results.every((r) => r.healthy)

    const body: THealthStatus = {
      status: allHealthy ? "healthy" : "degraded",
      dependencies: results,
    }

    res.status(allHealthy ? 200 : 503).json(body)
  })
}
