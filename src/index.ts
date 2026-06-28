import { Client as ScyllaClient } from "cassandra-driver"
import { connect as natsConnect } from "nats"

import { loadConfig } from "./config/index.js"
import { createAlertRepo } from "./db/alert-repo.js"
import { createAuditRepo } from "./db/audit-repo.js"
import { createDependencyRepo } from "./db/dependency-repo.js"
import { createInviteRepo } from "./db/invite-repo.js"
import { initializeSchema } from "./db/client.js"
import { createMemberRepo } from "./db/member-repo.js"
import { createOrgRepo } from "./db/org-repo.js"
import { createPipelineRepo } from "./db/pipeline-repo.js"
import { createPolicyRepo } from "./db/policy-repo.js"
import { createReceiptRepo } from "./db/receipt-repo.js"
import { createRepoMetadataRepo } from "./db/repo-metadata.js"
import { createStepRegistry } from "./db/step-registry.js"
import { createTeamRepo } from "./db/team-repo.js"
import { createUsageRepo } from "./db/usage-repo.js"
import { initDeps } from "./deps.js"
import { createEmailClient } from "./integrations/email.js"
import { createForgejoClient } from "./integrations/forgejo.js"
import { startCascadeSubscriber } from "./pipeline/cascade.js"
import { startResultSubscriber } from "./pipeline/result-subscriber.js"
import { startPipelineSubscriber } from "./pipeline/subscriber.js"
import { startUsageSubscriber } from "./pipeline/usage-subscriber.js"
import { KEYSPACE } from "./db/schema.js"
import { createServer } from "./server.js"

const backfillOrgMembers = async (scylla: ScyllaClient): Promise<void> => {
  const users = await scylla.execute(
    `SELECT id, email, name, org_id, role FROM ${KEYSPACE}.users`,
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

    const email = row.email as string
    const name = (row.get("name") as string) ?? ""

    // Always ensure users_by_org is populated
    await scylla.execute(
      `INSERT INTO ${KEYSPACE}.users_by_org (org_id, user_id, email, name) VALUES (?, ?, ?, ?)`,
      [orgId, userId, email, name],
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
  const pipelineRepo = createPipelineRepo(scylla)
  const usageRepo = createUsageRepo(scylla)
  const stepRegistry = createStepRegistry(scylla)
  const policyRepo = createPolicyRepo(scylla)
  const auditRepo = createAuditRepo(scylla)
  const inviteRepo = createInviteRepo(scylla)
  const receiptRepo = createReceiptRepo(scylla)
  const dependencyRepo = createDependencyRepo(scylla)
  const alertRepo = createAlertRepo(scylla)
  const forgejo = createForgejoClient(config)
  const email = createEmailClient(config)

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
    pipelineRepo,
    policyRepo,
    auditRepo,
    inviteRepo,
    receiptRepo,
    alertRepo,
    forgejo,
    email,
  })

  await backfillOrgMembers(scylla)

  startUsageSubscriber({ nats, usageRepo })
  startResultSubscriber({ nats, pipelineRepo })
  startCascadeSubscriber({ nats, dependencyRepo, repoMetadata })
  startPipelineSubscriber({
    nats,
    repoMetadata,
    usageRepo,
    alertRepo,
    email,
    forgejo,
    stepRegistry,
    policyRepo,
    getOrgName: async (orgId) => {
      const org = await orgRepo.getById(orgId)
      return org?.name ?? orgId
    },
    getReceiptEmail: async (orgId) => {
      const plan = await usageRepo.getPlan(orgId)
      return plan?.receiptEmail
    },
    getPolicies: async (orgId) => {
      const policies = await policyRepo.list(orgId)
      return policies.map((p) => ({
        id: p.id,
        orgId: p.orgId,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        enabled: true,
        match: {
          name: p.matchName,
          files: p.matchFiles ? [p.matchFiles] : undefined,
          team: p.matchTeam,
        },
        inject: {
          before: p.steps.filter((s) => s.position === "before").map((s) => ({ name: s.name, use: s.use, timeout: "10m" })),
          after: p.steps.filter((s) => s.position === "after").map((s) => ({ name: s.name, use: s.use, timeout: "10m" })),
        },
      }))
    },
    getTemplate: async () => undefined,
    getRepoFiles: async (forgejoFullName) => {
      try {
        const [orgName, repoName] = forgejoFullName.split("/")
        const entries = await forgejo.listDirectory(orgName, repoName, "")
        return entries.map((e) => e.name)
      } catch {
        return []
      }
    },
    getRepoConfig: async (forgejoFullName) => {
      try {
        const [orgName, repoName] = forgejoFullName.split("/")
        const content = await forgejo.getFileContent(orgName, repoName, ".gittan.yaml")
        if (!content) return undefined
        const { parse } = await import("yaml")
        const config = parse(content)
        if (!config?.steps) return undefined
        return {
          steps: config.steps,
          depends: config.depends as Array<{ repo: string; cascade: boolean; contractTest: boolean }> | undefined,
        }
      } catch {
        return undefined
      }
    },
    syncDependencies: async (repoId, repoName, repoOrgId, depends) => {
      const org = await orgRepo.getById(repoOrgId)
      if (!org) {
        console.warn(`cascade: org ${repoOrgId} not found, skipping dependency sync`)
        return
      }
      await dependencyRepo.removeDependencies(repoId)
      for (const dep of depends) {
        const depMeta = await repoMetadata.getByForgejoName(`${org.name}/${dep.repo}`)
        if (!depMeta) {
          console.warn(`cascade: dependency repo "${dep.repo}" not found in org ${repoOrgId}`)
          continue
        }
        await dependencyRepo.register({
          repoId,
          repoName,
          dependsOnRepoId: depMeta.id,
          dependsOnRepoName: dep.repo,
          cascade: dep.cascade ?? false,
          contractTest: dep.contractTest ?? false,
        })
      }
      console.info(`Synced ${depends.length} dependencies for ${repoName}`)
    },
    onPipelineResolved: async (event) => {
      console.info(`Pipeline resolved for ${event.pushEvent.repoName} (${event.resolved.steps.length} steps)`)
    },
  })

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
  ], nats)

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
