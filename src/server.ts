import express from "express"
import type { Application, Request, Response } from "express"
import type { OpenAPIV3 } from "openapi-types"

import { setupApp } from "@bloomerab/npm-api-essentials"

import apiDoc from "./api-definition.js"
import { createBearerTokenMiddleware } from "./auth/bearer-token-middleware.js"
import type { TConfig } from "./config/index.js"
import { generateInstallScript, resolveLatestCliVersion, listCliVersions } from "./cli/distribution.js"

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

  app.get("/cli/install", (_req: Request, res: Response) => {
    const baseUrl = config.cliBaseUrl ?? "https://cli.gittan.eu"
    const script = generateInstallScript(baseUrl)
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.send(script)
  })

  app.get("/cli/dl/:version/:filename", async (req: Request, res: Response) => {
    if (!config.forgejoAdminToken) {
      res.status(503).json({ error: "CLI downloads not configured" })
      return
    }

    const version = Array.isArray(req.params.version)
      ? req.params.version[0]
      : req.params.version
    const filename = Array.isArray(req.params.filename)
      ? req.params.filename[0]
      : req.params.filename

    if (!version || !filename) {
      res.status(400).json({ error: "Missing version or filename" })
      return
    }

    const SEMVER = /^(latest|v?\d+\.\d+\.\d+(-[\w.]+)?)$/
    if (!SEMVER.test(version)) {
      res.status(400).json({ error: "Invalid version format" })
      return
    }

    if (!/^gittan-[\w-]+\.tar\.gz$/.test(filename)) {
      res.status(400).json({ error: "Invalid filename" })
      return
    }

    const resolvedVersion = version === "latest"
      ? await resolveLatestCliVersion(config)
      : version.replace(/^v/, "")

    if (!resolvedVersion || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(resolvedVersion)) {
      res.status(404).json({ error: "No CLI versions found" })
      return
    }

    const forgejoUrl = `${config.forgejoUrl}/api/packages/gittan/generic/cli/${resolvedVersion}/${filename}`

    try {
      const upstream = await fetch(forgejoUrl, {
        headers: { Authorization: `token ${config.forgejoAdminToken}` },
      })

      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({
          error: upstream.status === 404
            ? `Version ${resolvedVersion} not found`
            : "Failed to fetch binary",
        })
        return
      }

      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
      res.setHeader("Content-Type", "application/gzip")
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`)

      const body = upstream.body
      if (body) {
        const { Readable } = await import("node:stream")
        const readable = Readable.fromWeb(body as never)
        readable.pipe(res)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error("CLI download proxy failed:", message)
      if (!res.headersSent) {
        res.status(502).json({ error: "Failed to proxy binary download" })
      }
    }
  })

  app.get("/cli/versions", async (_req: Request, res: Response) => {
    if (!config.forgejoAdminToken) {
      res.status(503).json({ error: "CLI downloads not configured" })
      return
    }

    try {
      const versions = await listCliVersions(config)
      res.json({ versions })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error("CLI version listing failed:", message)
      res.status(502).json({ error: "Failed to list versions" })
    }
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
