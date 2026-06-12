import express, { type Express } from "express"

import type { TConfig } from "./config/index.js"
import {
  registerHealthRoutes,
  type THealthDependency,
} from "./paths/health.js"

export type TServerDeps = {
  readonly config: TConfig
  readonly healthDependencies: ReadonlyArray<THealthDependency>
}

export const createServer = (deps: TServerDeps): Express => {
  const app = express()

  app.use(express.json())

  const router = express.Router()
  registerHealthRoutes(router, deps.healthDependencies)
  app.use(router)

  return app
}
