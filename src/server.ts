import express, { type Express } from "express"

import type { TConfig } from "./config/index.js"
import type { TTeamRepo } from "./db/team-repo.js"
import {
  registerHealthRoutes,
  type THealthDependency,
} from "./paths/health.js"
import { registerTeamRoutes } from "./paths/teams.js"

export type TServerDeps = {
  readonly config: TConfig
  readonly healthDependencies: ReadonlyArray<THealthDependency>
  readonly teamRepo: TTeamRepo
}

export const createServer = (deps: TServerDeps): Express => {
  const app = express()

  app.use(express.json())

  const router = express.Router()
  registerHealthRoutes(router, deps.healthDependencies)
  registerTeamRoutes(router, deps.teamRepo)
  app.use(router)

  return app
}
