import { Client as ScyllaClient } from "cassandra-driver"
import { connect as natsConnect } from "nats"

import { loadConfig } from "./config/index.js"
import { createAuditRepo } from "./db/audit-repo.js"
import { initializeSchema } from "./db/client.js"
import { createOrgRepo } from "./db/org-repo.js"
import { createPolicyRepo } from "./db/policy-repo.js"
import { createRepoMetadataRepo } from "./db/repo-metadata.js"
import { createStepRegistry } from "./db/step-registry.js"
import { createTeamRepo } from "./db/team-repo.js"
import { createUsageRepo } from "./db/usage-repo.js"
import { initDeps } from "./deps.js"
import { createForgejoClient } from "./integrations/forgejo.js"
import { startUsageSubscriber } from "./pipeline/usage-subscriber.js"
import { createServer } from "./server.js"

const main = async (): Promise<void> => {
  const config = loadConfig()

  await initializeSchema(config)

  const scylla = new ScyllaClient({
    contactPoints: config.scyllaHosts,
    localDataCenter: "datacenter1",
    keyspace: config.scyllaKeyspace,
  })

  const nats = await natsConnect({ servers: config.natsUrl })

  const orgRepo = createOrgRepo(scylla)
  const teamRepo = createTeamRepo(scylla)
  const repoMetadata = createRepoMetadataRepo(scylla)
  const usageRepo = createUsageRepo(scylla)
  const stepRegistry = createStepRegistry(scylla)
  const policyRepo = createPolicyRepo(scylla)
  const auditRepo = createAuditRepo(scylla)
  const forgejo = createForgejoClient(config)

  initDeps({
    config,
    db: scylla,
    nats,
    orgRepo,
    teamRepo,
    repoMetadata,
    usageRepo,
    stepRegistry,
    policyRepo,
    auditRepo,
    forgejo,
  })

  startUsageSubscriber({ nats, usageRepo })

  const app = await createServer(config, [
    {
      name: "scylladb",
      check: async () => {
        await scylla.execute("SELECT now() FROM system.local")
        return true
      },
    },
    {
      name: "nats",
      check: async () => !nats.isClosed(),
    },
    {
      name: "forgejo",
      check: () => forgejo.healthy(),
    },
  ])

  app.listen(config.port, config.host, () => {
    console.log(`gittan-api listening on ${config.host}:${config.port}`)
  })

  const shutdown = async (): Promise<void> => {
    console.log("Shutting down...")
    await nats.drain()
    await scylla.shutdown()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
