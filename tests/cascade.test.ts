import { connect, type NatsConnection, StringCodec } from "nats"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { TDependencyRepo } from "../src/db/dependency-repo.js"
import type { TRepoMetadataRepo } from "../src/db/repo-metadata.js"
import {
  startCascadeSubscriber,
  type TCascadeResult,
} from "../src/pipeline/cascade.js"

describe("cascade subscriber", () => {
  let nats: NatsConnection
  const sc = StringCodec()

  beforeAll(async () => {
    nats = await connect({ servers: "nats://localhost:4222" })
  })

  afterAll(async () => {
    await nats.drain()
  })

  it("triggers cascade pipelines for dependents on success", async () => {
    const cascadeResults: TCascadeResult[] = []
    const cascadeEvents: unknown[] = []

    const cascadeSub = nats.subscribe("gittan.push.cascade")
    const cascadeCollector = (async () => {
      for await (const msg of cascadeSub) {
        cascadeEvents.push(JSON.parse(sc.decode(msg.data)))
        if (cascadeEvents.length >= 2) {
          cascadeSub.unsubscribe()
          return
        }
      }
    })()

    const mockDependencyRepo: TDependencyRepo = {
      register: vi.fn(),
      getDependencies: vi.fn(),
      getDependents: vi.fn().mockResolvedValue([
        {
          dependsOnRepoId: "types-repo",
          dependentRepoId: "api-repo",
          dependentRepoName: "api-service",
          cascade: true,
          contractTest: true,
        },
        {
          dependsOnRepoId: "types-repo",
          dependentRepoId: "runner-repo",
          dependentRepoName: "gittan-runner",
          cascade: true,
          contractTest: false,
        },
      ]),
      removeDependencies: vi.fn(),
    }

    const mockRepoMetadata: TRepoMetadataRepo = {
      create: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "api-repo",
        orgId: "org-1",
        teamId: "team-1",
        name: "api-service",
        forgejoFullName: "org-1/api-service",
        cloneUrl: "",
        sshUrl: "",
        tags: [],
        gatedBranches: ["main"],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      }),
      getByForgejoName: vi.fn(),
      listByTeam: vi.fn(),
    }

    startCascadeSubscriber({
      nats,
      dependencyRepo: mockDependencyRepo,
      repoMetadata: mockRepoMetadata,
      onCascade: (result) => cascadeResults.push(result),
    })

    nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-types-123",
          repoId: "types-repo",
          branch: "main",
          isGated: true,
          status: "passed",
        }),
      ),
    )

    await cascadeCollector

    expect(cascadeResults).toHaveLength(1)
    expect(cascadeResults[0].sourceRepoId).toBe("types-repo")
    expect(cascadeResults[0].triggered).toHaveLength(2)
    expect(cascadeResults[0].triggered[0].repoName).toBe("api-service")
    expect(cascadeResults[0].triggered[0].contractTest).toBe(true)
    expect(cascadeResults[0].triggered[1].repoName).toBe("gittan-runner")
    expect(cascadeResults[0].triggered[1].contractTest).toBe(false)

    expect(cascadeEvents).toHaveLength(2)
    const apiEvent = cascadeEvents.find(
      (e: any) => e.repoName === "api-service",
    ) as any
    expect(apiEvent.isCascade).toBe(true)
    expect(apiEvent.sourceRepoId).toBe("types-repo")
    expect(apiEvent.contractTest).toBe(true)
  })

  it("does not cascade on failed pipeline", async () => {
    const nats2 = await connect({ servers: "nats://localhost:4222" })
    const cascadeResults: TCascadeResult[] = []

    const mockDeps: TDependencyRepo = {
      register: vi.fn(),
      getDependencies: vi.fn(),
      getDependents: vi.fn(),
      removeDependencies: vi.fn(),
    }

    startCascadeSubscriber({
      nats: nats2,
      dependencyRepo: mockDeps,
      repoMetadata: {
        create: vi.fn(),
        getById: vi.fn(),
        getByForgejoName: vi.fn(),
        listByTeam: vi.fn(),
      },
      onCascade: (result) => cascadeResults.push(result),
    })

    nats2.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-fail",
          repoId: "types-repo",
          branch: "main",
          isGated: true,
          status: "failed",
        }),
      ),
    )

    await nats2.flush()
    await new Promise((r) => setTimeout(r, 100))

    expect(mockDeps.getDependents).not.toHaveBeenCalled()
    expect(cascadeResults).toHaveLength(0)

    await nats2.drain()
  })

  it("does not cascade on non-main branch", async () => {
    const nats3 = await connect({ servers: "nats://localhost:4222" })
    const cascadeResults: TCascadeResult[] = []

    const mockDeps: TDependencyRepo = {
      register: vi.fn(),
      getDependencies: vi.fn(),
      getDependents: vi.fn().mockResolvedValue([
        {
          dependsOnRepoId: "types-repo",
          dependentRepoId: "api-repo",
          dependentRepoName: "api-service",
          cascade: true,
          contractTest: true,
        },
      ]),
      removeDependencies: vi.fn(),
    }

    startCascadeSubscriber({
      nats: nats3,
      dependencyRepo: mockDeps,
      repoMetadata: {
        create: vi.fn(),
        getById: vi.fn(),
        getByForgejoName: vi.fn(),
        listByTeam: vi.fn(),
      },
      onCascade: (result) => cascadeResults.push(result),
    })

    nats3.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: "push-feat",
          repoId: "types-repo",
          branch: "feat/something",
          isGated: false,
          status: "passed",
        }),
      ),
    )

    await nats3.flush()
    await new Promise((r) => setTimeout(r, 200))

    expect(cascadeResults).toHaveLength(0)

    await nats3.drain()
  })
})
