import { describe, expect, it, vi } from "vitest"

import type { TDependencyRepo, TRepoDependent } from "../src/db/dependency-repo.js"
import { createDependencyGraph } from "../src/pipeline/dependency-graph.js"

const createMockDepRepo = (
  graph: Record<string, TRepoDependent[]>,
): TDependencyRepo => ({
  register: vi.fn(),
  getDependencies: vi.fn(),
  getDependents: vi.fn().mockImplementation(async (repoId: string) =>
    graph[repoId] ?? [],
  ),
  removeDependencies: vi.fn(),
})

const dep = (
  from: string,
  to: string,
  cascade = true,
  contractTest = true,
): TRepoDependent => ({
  dependsOnRepoId: from,
  dependentRepoId: to,
  dependentRepoName: to,
  cascade,
  contractTest,
})

describe("dependency graph", () => {
  describe("flattenCascadeOrder", () => {
    it("returns direct dependents", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [dep("types", "api"), dep("types", "runner")],
        }),
      )

      const targets = await graph.flattenCascadeOrder("types")
      expect(targets).toHaveLength(2)
      expect(targets.map((t) => t.repoId).sort()).toEqual(["api", "runner"])
      expect(targets.every((t) => t.depth === 1)).toBe(true)
    })

    it("returns transitive dependents in order", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [dep("types", "api")],
          api: [dep("api", "gateway")],
          gateway: [dep("gateway", "web")],
        }),
      )

      const targets = await graph.flattenCascadeOrder("types")
      expect(targets).toHaveLength(3)
      expect(targets[0]).toEqual(
        expect.objectContaining({ repoId: "api", depth: 1 }),
      )
      expect(targets[1]).toEqual(
        expect.objectContaining({ repoId: "gateway", depth: 2 }),
      )
      expect(targets[2]).toEqual(
        expect.objectContaining({ repoId: "web", depth: 3 }),
      )
    })

    it("deduplicates diamond dependencies", async () => {
      // types → api, types → worker, api → gateway, worker → gateway
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [dep("types", "api"), dep("types", "worker")],
          api: [dep("api", "gateway")],
          worker: [dep("worker", "gateway")],
        }),
      )

      const targets = await graph.flattenCascadeOrder("types")
      const gatewayTargets = targets.filter((t) => t.repoId === "gateway")
      expect(gatewayTargets).toHaveLength(1)
    })

    it("handles circular dependency without infinite loop", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          a: [dep("a", "b")],
          b: [dep("b", "a")],
        }),
      )

      const targets = await graph.flattenCascadeOrder("a")
      expect(targets).toHaveLength(2)
      expect(targets[0].repoId).toBe("b")
      expect(targets[1].repoId).toBe("a")
    })

    it("skips non-cascade dependencies", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [
            dep("types", "api", true),
            dep("types", "docs", false),
          ],
        }),
      )

      const targets = await graph.flattenCascadeOrder("types")
      expect(targets).toHaveLength(1)
      expect(targets[0].repoId).toBe("api")
    })

    it("returns empty for repo with no dependents", async () => {
      const graph = createDependencyGraph(createMockDepRepo({}))
      const targets = await graph.flattenCascadeOrder("isolated")
      expect(targets).toEqual([])
    })

    it("preserves contractTest flag per edge", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [
            dep("types", "api", true, true),
            dep("types", "runner", true, false),
          ],
        }),
      )

      const targets = await graph.flattenCascadeOrder("types")
      const api = targets.find((t) => t.repoId === "api")!
      const runner = targets.find((t) => t.repoId === "runner")!
      expect(api.contractTest).toBe(true)
      expect(runner.contractTest).toBe(false)
    })
  })

  describe("detectCycles", () => {
    it("returns undefined for acyclic graph", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          types: [dep("types", "api")],
          api: [dep("api", "web")],
        }),
      )

      const cycle = await graph.detectCycles("types")
      expect(cycle).toBeUndefined()
    })

    it("detects direct cycle", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          a: [dep("a", "b")],
          b: [dep("b", "a")],
        }),
      )

      const cycle = await graph.detectCycles("a")
      expect(cycle).toBeDefined()
      expect(cycle).toContain("a")
      expect(cycle).toContain("b")
    })

    it("detects indirect cycle", async () => {
      const graph = createDependencyGraph(
        createMockDepRepo({
          a: [dep("a", "b")],
          b: [dep("b", "c")],
          c: [dep("c", "a")],
        }),
      )

      const cycle = await graph.detectCycles("a")
      expect(cycle).toBeDefined()
      expect(cycle![cycle!.length - 1]).toBe("a")
    })

    it("returns undefined for isolated repo", async () => {
      const graph = createDependencyGraph(createMockDepRepo({}))
      const cycle = await graph.detectCycles("isolated")
      expect(cycle).toBeUndefined()
    })
  })
})
