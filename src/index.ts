import { Client as ScyllaClient } from "cassandra-driver"
import { connect as natsConnect } from "nats"

import { loadConfig } from "./config/index.js"
import { createAuditRepo } from "./db/audit-repo.js"
import { createInviteRepo } from "./db/invite-repo.js"
import { initializeSchema } from "./db/client.js"
import { createMemberRepo } from "./db/member-repo.js"
import { createOrgRepo } from "./db/org-repo.js"
import { createPolicyRepo } from "./db/policy-repo.js"
import { createRepoMetadataRepo } from "./db/repo-metadata.js"
import { createStepRegistry } from "./db/step-registry.js"
import { createTeamRepo } from "./db/team-repo.js"
import { createUsageRepo } from "./db/usage-repo.js"
import { initDeps } from "./deps.js"
import { createForgejoClient } from "./integrations/forgejo.js"
import { startUsageSubscriber } from "./pipeline/usage-subscriber.js"
import { KEYSPACE } from "./db/schema.js"
import { createServer } from "./server.js"

const backfillOrgMembers = async (scylla: ScyllaClient): Promise<void> => {
  const users = await scylla.execute(
    `SELECT id, email, org_id, role FROM ${KEYSPACE}.users`,
  )

  for (const row of users.rows) {
    const userId = row.id as string
    const orgId = row.org_id as string | null
    if (!orgId) continue

    const existing = await scylla.execute(
      `SELECT user_id FROM ${KEYSPACE}.org_members WHERE org_id = ? AND user_id = ?`,
      [orgId, userId],
      { prepare: true },
    )

    if (existing.rowLength > 0) continue

    const role = (row.role as string) === "admin" ? "owner" : "member"
    const now = new Date()

    await scylla.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.org_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
          params: [orgId, userId, role, now],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.user_orgs (user_id, org_id, role, joined_at) VALUES (?, ?, ?, ?)`,
          params: [userId, orgId, role, now],
        },
      ],
      { prepare: true },
    )

    console.log(`Backfilled org_members: ${userId} → ${orgId} (${role})`)
  }
}

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
  const memberRepo = createMemberRepo(scylla)
  const teamRepo = createTeamRepo(scylla)
  const repoMetadata = createRepoMetadataRepo(scylla)
  const usageRepo = createUsageRepo(scylla)
  const stepRegistry = createStepRegistry(scylla)
  const policyRepo = createPolicyRepo(scylla)
  const auditRepo = createAuditRepo(scylla)
  const inviteRepo = createInviteRepo(scylla)
  const forgejo = createForgejoClient(config)

  initDeps({
    config,
    db: scylla,
    nats,
    orgRepo,
    memberRepo,
    teamRepo,
    repoMetadata,
    usageRepo,
    stepRegistry,
    policyRepo,
    auditRepo,
    inviteRepo,
    forgejo,
  })

  await backfillOrgMembers(scylla)

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
