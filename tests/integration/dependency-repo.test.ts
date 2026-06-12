import type { Client } from "cassandra-driver"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { createDependencyRepo } from "../../src/db/dependency-repo.js"
import { cleanupTestDb, setupTestDb } from "./db-setup.js"

describe("dependencyRepo", () => {
  let client: Client
  let depRepo: ReturnType<typeof createDependencyRepo>

  beforeAll(async () => {
    client = await setupTestDb()
    depRepo = createDependencyRepo(client)
  })

  afterEach(async () => {
    await cleanupTestDb(client)
  })

  afterAll(async () => {
    await client.shutdown()
  })

  it("registers a dependency and creates both directions", async () => {
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "types",
      dependsOnRepoName: "shared-types",
      cascade: true,
      contractTest: true,
    })

    const deps = await depRepo.getDependencies("api")
    expect(deps).toHaveLength(1)
    expect(deps[0].dependsOnRepoId).toBe("types")
    expect(deps[0].cascade).toBe(true)

    const dependents = await depRepo.getDependents("types")
    expect(dependents).toHaveLength(1)
    expect(dependents[0].dependentRepoId).toBe("api")
    expect(dependents[0].dependentRepoName).toBe("api-service")
  })

  it("supports multiple dependents", async () => {
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "types",
      dependsOnRepoName: "shared-types",
      cascade: true,
      contractTest: true,
    })
    await depRepo.register({
      repoId: "runner",
      repoName: "gittan-runner",
      dependsOnRepoId: "types",
      dependsOnRepoName: "shared-types",
      cascade: true,
      contractTest: false,
    })

    const dependents = await depRepo.getDependents("types")
    expect(dependents).toHaveLength(2)

    const names = dependents.map((d) => d.dependentRepoName).sort()
    expect(names).toEqual(["api-service", "gittan-runner"])
  })

  it("supports multiple dependencies", async () => {
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "types",
      dependsOnRepoName: "shared-types",
      cascade: true,
      contractTest: true,
    })
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "utils",
      dependsOnRepoName: "shared-utils",
      cascade: false,
      contractTest: false,
    })

    const deps = await depRepo.getDependencies("api")
    expect(deps).toHaveLength(2)
  })

  it("removes all dependencies for a repo", async () => {
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "types",
      dependsOnRepoName: "shared-types",
      cascade: true,
      contractTest: true,
    })
    await depRepo.register({
      repoId: "api",
      repoName: "api-service",
      dependsOnRepoId: "utils",
      dependsOnRepoName: "shared-utils",
      cascade: true,
      contractTest: true,
    })

    await depRepo.removeDependencies("api")

    const deps = await depRepo.getDependencies("api")
    expect(deps).toEqual([])

    const typeDeps = await depRepo.getDependents("types")
    expect(typeDeps).toEqual([])

    const utilDeps = await depRepo.getDependents("utils")
    expect(utilDeps).toEqual([])
  })

  it("returns empty for repo with no dependencies", async () => {
    const deps = await depRepo.getDependencies("nonexistent")
    expect(deps).toEqual([])
  })

  it("returns empty for repo with no dependents", async () => {
    const deps = await depRepo.getDependents("nonexistent")
    expect(deps).toEqual([])
  })
})
