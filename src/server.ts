import type { Application, Request, Response } from "express"
import { setupApp } from "@bloomerab/npm-api-essentials"

import apiDoc from "./api-definition.js"
import type { TConfig } from "./config/index.js"

export type THealthDependency = {
  readonly name: string
  readonly check: () => Promise<boolean>
}

export const createServer = async (
  config: TConfig,
  healthDependencies: ReadonlyArray<THealthDependency>,
): Promise<Application> => {
  process.env.OAUTH2_INTROSPECTION_URL = `${config.oauth2Issuer}/oauth/introspect`
  process.env.OAUTH2_CLIENT_ID = config.oauth2ClientId
  process.env.OAUTH2_CLIENT_SECRET = config.oauth2ClientSecret

  const app = await setupApp({
    apiDoc: structuredClone(apiDoc),
    pathPrefix: "",
    paths: "paths",
    corsString: "http://localhost:5555",
  })

  app.get("/readyz", async (_req: Request, res: Response) => {
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
  })

  return app
}
