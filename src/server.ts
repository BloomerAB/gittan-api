import express, { type Express } from "express"

import type { TConfig } from "./config/index.js"
import type { TRepoMetadataRepo } from "./db/repo-metadata.js"
import type { TTeamRepo } from "./db/team-repo.js"
import type { TForgejoClient } from "./integrations/forgejo.js"
import {
  registerHealthRoutes,
  type THealthDependency,
} from "./paths/health.js"
import { registerRepoRoutes } from "./paths/repos.js"
import { registerTeamRoutes } from "./paths/teams.js"

export type TServerDeps = {
  readonly config: TConfig
  readonly healthDependencies: ReadonlyArray<THealthDependency>
  readonly teamRepo: TTeamRepo
  readonly repoMetadata: TRepoMetadataRepo
  readonly forgejo: TForgejoClient
}

export const createServer = (deps: TServerDeps): Express => {
  const app = express()

  app.use(express.json())

  const router = express.Router()
  registerHealthRoutes(router, deps.healthDependencies)
  registerTeamRoutes(router, deps.teamRepo)
  registerRepoRoutes(router, {
    repoMetadata: deps.repoMetadata,
    teamRepo: deps.teamRepo,
    forgejo: deps.forgejo,
    webhookBaseUrl: `http://localhost:${deps.config.port}`,
  })
  app.use(router)

  return app
}
