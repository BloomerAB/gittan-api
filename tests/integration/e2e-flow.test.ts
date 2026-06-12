import { Client } from "cassandra-driver"
import { connect, type NatsConnection, StringCodec } from "nats"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config/index.js"
import { createDependencyRepo } from "../../src/db/dependency-repo.js"
import { createRepoMetadataRepo } from "../../src/db/repo-metadata.js"
import { createTeamRepo } from "../../src/db/team-repo.js"
import { createForgejoClient } from "../../src/integrations/forgejo.js"
import { createGittanYamlLoader } from "../../src/integrations/gittan-yaml.js"
import { startCascadeSubscriber } from "../../src/pipeline/cascade.js"
import { resolvePipeline } from "../../src/pipeline/resolver.js"
import { cleanupTestDb, setupTestDb } from "./db-setup.js"

const TOKEN = "ade423c36770237493edd2ff0eb7dd26ee909138"
const E2E_ORG = "e2e-org"
const sc = StringCodec()

async function createOrUpdateFile(
  forgejoUrl: string,
  token: string,
  org: string,
  repo: string,
  path: string,
  content: string,
): Promise<void> {
  const existing = await fetch(
    `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
    { headers: { Authorization: `token ${token}` } },
  )

  const body: Record<string, unknown> = {
    content: Buffer.from(content).toString("base64"),
    message: `create ${path}`,
  }

  if (existing.ok) {
    const data = (await existing.json()) as { sha: string }
    body.sha = data.sha
    await fetch(
      `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )
  } else {
    await fetch(
      `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )
  }
}

describe("end-to-end flow", () => {
  let db: Client
  let nats: NatsConnection
  let config: ReturnType<typeof loadConfig>

  beforeAll(async () => {
    config = { ...loadConfig(), forgejoAdminToken: TOKEN }
    db = await setupTestDb()
    nats = await connect({ servers: config.natsUrl })
  })

  afterAll(async () => {
    await cleanupTestDb(db)
    await db.shutdown()
    await nats.drain()
  })

  it("full flow: team → repo → .gittan.yaml → resolve → cascade", async () => {
    const teamRepo = createTeamRepo(db)
    const repoMetadata = createRepoMetadataRepo(db)
    const dependencyRepo = createDependencyRepo(db)
    const forgejo = createForgejoClient(config)
    const yamlLoader = createGittanYamlLoader(config)

    // 1. Create team
    const team = await teamRepo.createTeam({
      id: "e2e-team-1",
      orgId: E2E_ORG,
      name: "platform",
      displayName: "Platform Team",
      slackChannel: "#platform-alerts",
    })
    expect(team.name).toBe("platform")

    // 2. Create Forgejo org + repos
    let forgejoOrg = await forgejo.getOrg(E2E_ORG)
    if (!forgejoOrg) {
      forgejoOrg = await forgejo.createOrg(E2E_ORG)
    }

    let typesForgejoRepo = await forgejo.getRepo(E2E_ORG, "shared-types")
    if (!typesForgejoRepo) {
      typesForgejoRepo = await forgejo.createRepo(E2E_ORG, {
        name: "shared-types",
        description: "Shared type definitions",
      })
    }

    let apiForgejoRepo = await forgejo.getRepo(E2E_ORG, "api-service")
    if (!apiForgejoRepo) {
      apiForgejoRepo = await forgejo.createRepo(E2E_ORG, {
        name: "api-service",
        description: "Main API service",
      })
    }

    // 3. Save repo metadata
    const typesRepo = await repoMetadata.create({
      id: "e2e-types-repo",
      orgId: E2E_ORG,
      teamId: team.id,
      name: "shared-types",
      forgejoFullName: typesForgejoRepo.fullName,
      cloneUrl: typesForgejoRepo.cloneUrl,
      sshUrl: typesForgejoRepo.sshUrl,
      tags: ["shared"],
      gatedBranches: ["main"],
    })

    const apiRepo = await repoMetadata.create({
      id: "e2e-api-repo",
      orgId: E2E_ORG,
      teamId: team.id,
      name: "api-service",
      forgejoFullName: apiForgejoRepo.fullName,
      cloneUrl: apiForgejoRepo.cloneUrl,
      sshUrl: apiForgejoRepo.sshUrl,
      tags: ["production"],
      gatedBranches: ["main"],
    })

    // 4. Register dependency: api depends on types
    await dependencyRepo.register({
      repoId: apiRepo.id,
      repoName: apiRepo.name,
      dependsOnRepoId: typesRepo.id,
      dependsOnRepoName: typesRepo.name,
      cascade: true,
      contractTest: true,
    })

    // 5. Push .gittan.yaml to api-service
    const gittanYaml = [
      "steps:",
      "  - name: lint",
      "    image: node:22-slim",
      "    run: npm run lint",
      "  - name: test",
      "    image: node:22-slim",
      "    run: npm test",
      "    needs: [lint]",
      "  - name: deploy",
      "    image: gittan/deploy:1",
      "    run: ./deploy.sh",
      "    needs: [test]",
      "    only: main",
      "    secrets: [DEPLOY_TOKEN]",
      "",
      "depends:",
      "  - repo: shared-types",
      "    cascade: true",
      "    contractTest: true",
      "",
      "gated:",
      "  - main",
    ].join("\n")

    await createOrUpdateFile(
      config.forgejoUrl,
      TOKEN,
      E2E_ORG,
      "api-service",
      ".gittan.yaml",
      gittanYaml,
    )

    // Also push a package.json for policy matching
    await createOrUpdateFile(
      config.forgejoUrl,
      TOKEN,
      E2E_ORG,
      "api-service",
      "package.json",
      JSON.stringify({ name: "api-service", version: "1.0.0" }),
    )

    // 6. Load .gittan.yaml from Forgejo
    const repoConfig = await yamlLoader.load(E2E_ORG, "api-service")
    expect(repoConfig).toBeDefined()
    expect(repoConfig!.steps).toHaveLength(3)
    expect(repoConfig!.depends).toHaveLength(1)
    expect(repoConfig!.depends![0].repo).toBe("shared-types")

    // 7. List root files for policy matching
    const rootFiles = await yamlLoader.listRootFiles(E2E_ORG, "api-service")
    expect(rootFiles).toContain("package.json")
    expect(rootFiles).toContain(".gittan.yaml")

    // 8. Resolve pipeline with org policy
    const resolved = resolvePipeline({
      repoConfig: { steps: repoConfig!.steps as any },
      policies: [
        {
          id: "policy-1",
          orgId: E2E_ORG,
          name: "security-baseline",
          match: { files: ["package.json"] },
          inject: {
            after: [
              { name: "trivy", use: "platform/trivy", timeout: "5m" },
            ],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
      template: undefined,
      repoFiles: rootFiles,
      teamName: team.name,
      repoName: apiRepo.name,
      repoTags: apiRepo.tags as string[],
    })

    // 9. Verify resolved pipeline
    expect(resolved.steps).toHaveLength(4)
    expect(resolved.steps[0].name).toBe("lint")
    expect(resolved.steps[0].source).toBe("repo")
    expect(resolved.steps[1].name).toBe("test")
    expect(resolved.steps[2].name).toBe("deploy")
    expect(resolved.steps[3].name).toBe("trivy")
    expect(resolved.steps[3].source).toBe("policy")
    expect(resolved.steps[3].policyName).toBe("security-baseline")
    expect(resolved.resolvedFrom.policies).toEqual(["security-baseline"])

    // 10. Verify cascade: types → api
    const dependents = await dependencyRepo.getDependents(typesRepo.id)
    expect(dependents).toHaveLength(1)
    expect(dependents[0].dependentRepoId).toBe(apiRepo.id)
    expect(dependents[0].cascade).toBe(true)
    expect(dependents[0].contractTest).toBe(true)

    // 11. Simulate cascade: types passes → triggers api
    const cascadeEvents: unknown[] = []
    const cascadeSub = nats.subscribe("gittan.push.cascade")
    const cascadePromise = (async () => {
      for await (const msg of cascadeSub) {
        cascadeEvents.push(JSON.parse(sc.decode(msg.data)))
        cascadeSub.unsubscribe()
        return
      }
    })()

    startCascadeSubscriber({
      nats,
      dependencyRepo,
      repoMetadata,
    })

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-types-e2e",
          repoId: typesRepo.id,
          branch: "main",
          isGated: true,
          status: "passed",
        }),
      ),
    )

    await cascadePromise

    expect(cascadeEvents).toHaveLength(1)
    const cascadeEvent = cascadeEvents[0] as any
    expect(cascadeEvent.repoId).toBe(apiRepo.id)
    expect(cascadeEvent.repoName).toBe("api-service")
    expect(cascadeEvent.isCascade).toBe(true)
    expect(cascadeEvent.sourceRepoId).toBe(typesRepo.id)
    expect(cascadeEvent.contractTest).toBe(true)

    // Cleanup Forgejo repos
    await forgejo.deleteRepo(E2E_ORG, "api-service")
    await forgejo.deleteRepo(E2E_ORG, "shared-types")
  })
})
