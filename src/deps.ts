import type { Client } from "cassandra-driver"
import type { NatsConnection } from "nats"

import type { TConfig } from "./config/index.js"
import type { TAuditRepo } from "./db/audit-repo.js"
import type { TOrgRepo } from "./db/org-repo.js"
import type { TPolicyRepo } from "./db/policy-repo.js"
import type { TRepoMetadataRepo } from "./db/repo-metadata.js"
import type { TStepRegistry } from "./db/step-registry.js"
import type { TTeamRepo } from "./db/team-repo.js"
import type { TUsageRepo } from "./db/usage-repo.js"
import type { TForgejoClient } from "./integrations/forgejo.js"

export type TDeps = {
  readonly config: TConfig
  readonly db: Client
  readonly nats: NatsConnection
  readonly orgRepo: TOrgRepo
  readonly teamRepo: TTeamRepo
  readonly repoMetadata: TRepoMetadataRepo
  readonly usageRepo: TUsageRepo
  readonly stepRegistry: TStepRegistry
  readonly policyRepo: TPolicyRepo
  readonly auditRepo: TAuditRepo
  readonly forgejo: TForgejoClient
}

let instance: TDeps | undefined

export const initDeps = (deps: TDeps): void => {
  instance = deps
}

export const deps = (): TDeps => {
  if (!instance) {
    throw new Error("Dependencies not initialized — call initDeps() first")
  }
  return instance
}
