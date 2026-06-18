import express from "express"
import type { Application, Request, Response } from "express"
import type { OpenAPIV3 } from "openapi-types"

import { setupApp } from "@bloomerab/npm-api-essentials"

import apiDoc from "./api-definition.js"
import { createBearerTokenMiddleware } from "./auth/bearer-token-middleware.js"
import type { TConfig } from "./config/index.js"

export type THealthDependency = {
  readonly name: string
  readonly check: () => Promise<boolean>
}

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "options",
  "head",
] as const

/**
 * Removes security requirements from all operations in the API doc.
 * This prevents npm-api-essentials' built-in bearerTokenHandler from running,
 * allowing us to use our own OAuth2 introspection middleware instead.
 *
 * The openapi-backend library reads operation.security at request time from
 * the same objects stored in the definition, so mutating them post-init works.
 */
const stripOperationSecurity = (
  doc: OpenAPIV3.Document,
): void => {
  for (const pathItem of Object.values(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method]
      if (op && typeof op === "object" && "security" in op) {
        delete (op as Record<string, unknown>).security
      }
    }
  }
}

export const createServer = async (
  config: TConfig,
  healthDependencies: ReadonlyArray<THealthDependency>,
): Promise<Application> => {
  process.env.OAUTH2_INTROSPECTION_URL = `${config.oauth2Issuer}/oauth/introspect`
  process.env.OAUTH2_CLIENT_ID = config.oauth2ClientId
  process.env.OAUTH2_CLIENT_SECRET = config.oauth2ClientSecret

  // Use a mutable clone so we can strip security from auto-discovered operations
  // after setupApp populates the paths via auto-discovery.
  const mutableApiDoc = structuredClone(apiDoc)

  const innerApp = await setupApp({
    apiDoc: mutableApiDoc,
    pathPrefix: "",
    paths: "paths",
    corsString: "http://localhost:5555",
  })

  // Strip security from all operations so npm-api-essentials' bearerTokenHandler
  // (which requires rb_at_ prefix) is never invoked. Our middleware handles auth.
  stripOperationSecurity(mutableApiDoc)

  // Wrap the inner app with our own auth middleware.
  // Express runs middleware in registration order, so our bearer token check
  // executes before the OpenAPI backend's request handler.
  const app = express()
  app.use(createBearerTokenMiddleware(config))
  app.use(innerApp)

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
