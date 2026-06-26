import { describe, it, expect, vi, beforeEach } from "vitest"

import { isConfigRepo, configRepoName, syncConfigRepo } from "../src/pipeline/config-repo.js"

describe("isConfigRepo", () => {
  it("matches the org config repo name exactly", () => {
    expect(isConfigRepo("org-pipelines")).toBe(true)
  })

  it("does not match other repos ending with -pipelines", () => {
    expect(isConfigRepo("my-team-pipelines")).toBe(false)
    expect(isConfigRepo("deploy-pipelines")).toBe(false)
  })

  it("does not match regular repos", () => {
    expect(isConfigRepo("gittan-api")).toBe(false)
    expect(isConfigRepo("pipelines")).toBe(false)
  })
})

describe("configRepoName", () => {
  it("returns org-pipelines for org scope", () => {
    expect(configRepoName("org", "")).toBe("org-pipelines")
    expect(configRepoName("org", "anything")).toBe("org-pipelines")
  })

  it("returns <name>-pipelines for team scope", () => {
    expect(configRepoName("team", "frontend")).toBe("frontend-pipelines")
    expect(configRepoName("team", "platform")).toBe("platform-pipelines")
  })
})

describe("syncConfigRepo", () => {
  const createMockForgejo = () => ({
    listDirectory: vi.fn(),
    getFileContent: vi.fn(),
    getRepo: vi.fn(),
    createRepo: vi.fn(),
    createFileCommit: vi.fn(),
  })

  const createMockStepRegistry = () => ({
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn(),
  })

  const createMockPolicyRepo = () => ({
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
  })

  let forgejo: ReturnType<typeof createMockForgejo>
  let stepRegistry: ReturnType<typeof createMockStepRegistry>
  let policyRepo: ReturnType<typeof createMockPolicyRepo>

  beforeEach(() => {
    forgejo = createMockForgejo()
    stepRegistry = createMockStepRegistry()
    policyRepo = createMockPolicyRepo()
  })

  it("syncs step yaml files to step registry", async () => {
    forgejo.listDirectory
      .mockResolvedValueOnce([{ name: "node-test.yaml", type: "file" }])
      .mockResolvedValueOnce([])

    forgejo.getFileContent.mockResolvedValueOnce(
      "image: node:22-alpine\nrun: npm test\ndescription: Run tests\n",
    )

    const result = await syncConfigRepo(
      forgejo as any, "org-1", "org-pipelines",
      stepRegistry as any, policyRepo as any,
    )

    expect(result.steps.synced).toBe(1)
    expect(result.steps.errors).toHaveLength(0)
    expect(stepRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        name: "node-test",
        image: "node:22-alpine",
        run: "npm test",
      }),
    )
  })

  it("syncs policy yaml files to policy repo", async () => {
    forgejo.listDirectory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "security.yaml", type: "file" }])

    forgejo.getFileContent.mockResolvedValueOnce(
      "description: Security scan\nenabled: true\nmatch:\n  files:\n    - package.json\ninject:\n  before:\n    - name: trivy\n      use: trivy-scan\n  after: []\n",
    )
    policyRepo.list.mockResolvedValue([])

    const result = await syncConfigRepo(
      forgejo as any, "org-1", "org-pipelines",
      stepRegistry as any, policyRepo as any,
    )

    expect(result.policies.synced).toBe(1)
    expect(result.policies.errors).toHaveLength(0)
    expect(policyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        name: "security",
        matchFiles: "package.json",
      }),
    )
  })

  it("removes steps not present in config repo", async () => {
    forgejo.listDirectory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    stepRegistry.list.mockResolvedValue([
      { orgId: "org-1", name: "old-step" },
    ])

    await syncConfigRepo(
      forgejo as any, "org-1", "org-pipelines",
      stepRegistry as any, policyRepo as any,
    )

    expect(stepRegistry.remove).toHaveBeenCalledWith("org-1", "old-step")
  })

  it("reports errors for invalid yaml", async () => {
    forgejo.listDirectory
      .mockResolvedValueOnce([{ name: "bad.yaml", type: "file" }])
      .mockResolvedValueOnce([])

    forgejo.getFileContent.mockResolvedValueOnce("not: valid: step: format\n")

    const result = await syncConfigRepo(
      forgejo as any, "org-1", "org-pipelines",
      stepRegistry as any, policyRepo as any,
    )

    expect(result.steps.synced).toBe(0)
    expect(result.steps.errors).toHaveLength(1)
  })

  it("handles empty directories gracefully", async () => {
    forgejo.listDirectory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await syncConfigRepo(
      forgejo as any, "org-1", "org-pipelines",
      stepRegistry as any, policyRepo as any,
    )

    expect(result.steps.synced).toBe(0)
    expect(result.policies.synced).toBe(0)
    expect(result.steps.errors).toHaveLength(0)
    expect(result.policies.errors).toHaveLength(0)
  })
})
