import type { Router } from "express"

export type THealthDependency = {
  readonly name: string
  readonly check: () => Promise<boolean>
}

export const registerHealthRoutes = (
  router: Router,
  dependencies: ReadonlyArray<THealthDependency>,
): void => {
  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok" })
  })

  router.get("/readyz", async (_req, res) => {
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

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "ready" : "degraded",
      dependencies: results,
    })
  })
}
