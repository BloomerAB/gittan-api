import { afterAll, afterEach, describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config/index.js"
import {
  createForgejoClient,
  type TForgejoClient,
} from "../../src/integrations/forgejo.js"

describe("forgejo client", () => {
  let forgejo: TForgejoClient
  const testOrgName = `test-org-${Date.now()}`
  const createdRepos: Array<{ org: string; repo: string }> = []

  afterAll(async () => {
    for (const { org, repo } of createdRepos) {
      try {
        await forgejo.deleteRepo(org, repo)
      } catch {
        // ignore cleanup errors
      }
    }
  })

  afterEach(() => {})

  it("initializes with config", () => {
    const config = loadConfig()
    forgejo = createForgejoClient({
      ...config,
      forgejoAdminToken: "ade423c36770237493edd2ff0eb7dd26ee909138",
    })
    expect(forgejo).toBeDefined()
  })

  it("reports healthy", async () => {
    const healthy = await forgejo.healthy()
    expect(healthy).toBe(true)
  })

  it("creates an org", async () => {
    const org = await forgejo.createOrg(testOrgName)
    expect(org.name).toBe(testOrgName)
  })

  it("gets an existing org", async () => {
    const org = await forgejo.getOrg(testOrgName)
    expect(org).toBeDefined()
    expect(org!.name).toBe(testOrgName)
  })

  it("returns undefined for non-existent org", async () => {
    const org = await forgejo.getOrg("nonexistent-org-xyz")
    expect(org).toBeUndefined()
  })

  it("creates a repo in the org", async () => {
    const repo = await forgejo.createRepo(testOrgName, {
      name: "test-repo",
      description: "Integration test repo",
      private: true,
    })

    createdRepos.push({ org: testOrgName, repo: "test-repo" })

    expect(repo.name).toBe("test-repo")
    expect(repo.fullName).toBe(`${testOrgName}/test-repo`)
    expect(repo.cloneUrl).toContain("test-repo.git")
    expect(repo.defaultBranch).toBe("main")
  })

  it("gets an existing repo", async () => {
    const repo = await forgejo.getRepo(testOrgName, "test-repo")
    expect(repo).toBeDefined()
    expect(repo!.name).toBe("test-repo")
  })

  it("returns undefined for non-existent repo", async () => {
    const repo = await forgejo.getRepo(testOrgName, "nonexistent")
    expect(repo).toBeUndefined()
  })

  it("lists repos in an org", async () => {
    const repos = await forgejo.listRepos(testOrgName)
    expect(repos.length).toBeGreaterThanOrEqual(1)
    expect(repos.some((r) => r.name === "test-repo")).toBe(true)
  })

  it("creates a webhook on a repo", async () => {
    const webhook = await forgejo.createWebhook(
      testOrgName,
      "test-repo",
      "http://localhost:4000/hooks/push",
      ["push"],
    )

    expect(webhook.active).toBe(true)
    expect(webhook.events).toContain("push")
  })

  it("lists webhooks on a repo", async () => {
    const hooks = await forgejo.listWebhooks(testOrgName, "test-repo")
    expect(hooks.length).toBeGreaterThanOrEqual(1)
  })

  it("deletes a repo", async () => {
    await forgejo.deleteRepo(testOrgName, "test-repo")
    createdRepos.pop()

    const repo = await forgejo.getRepo(testOrgName, "test-repo")
    expect(repo).toBeUndefined()
  })
})
