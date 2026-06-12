import type { TDependencyRepo, TRepoDependent } from "../db/dependency-repo.js"

export type TGraphNode = {
  readonly repoId: string
  readonly repoName: string
  readonly depth: number
  readonly cascade: boolean
  readonly contractTest: boolean
  readonly dependents: ReadonlyArray<TGraphNode>
}

export type TDependencyGraph = {
  readonly resolve: (repoId: string) => Promise<TGraphNode>
  readonly detectCycles: (repoId: string) => Promise<ReadonlyArray<string> | undefined>
  readonly flattenCascadeOrder: (repoId: string) => Promise<ReadonlyArray<TCascadeTarget>>
}

export type TCascadeTarget = {
  readonly repoId: string
  readonly repoName: string
  readonly depth: number
  readonly contractTest: boolean
}

export const createDependencyGraph = (
  dependencyRepo: TDependencyRepo,
): TDependencyGraph => {
  const buildGraph = async (
    repoId: string,
    visited: Set<string> = new Set(),
    depth: number = 0,
  ): Promise<TGraphNode> => {
    visited.add(repoId)

    const dependents = await dependencyRepo.getDependents(repoId)
    const children: TGraphNode[] = []

    for (const dep of dependents) {
      if (visited.has(dep.dependentRepoId)) continue

      const child = await buildGraph(
        dep.dependentRepoId,
        new Set(visited),
        depth + 1,
      )
      children.push(child)
    }

    return {
      repoId,
      repoName: dependents.length > 0
        ? repoId
        : repoId,
      depth,
      cascade: true,
      contractTest: true,
      dependents: children,
    }
  }

  const detectCycles = async (
    repoId: string,
    visited: string[] = [],
  ): Promise<ReadonlyArray<string> | undefined> => {
    if (visited.includes(repoId)) {
      return [...visited, repoId]
    }

    const dependents = await dependencyRepo.getDependents(repoId)

    for (const dep of dependents) {
      const cycle = await detectCycles(dep.dependentRepoId, [
        ...visited,
        repoId,
      ])
      if (cycle) return cycle
    }

    return undefined
  }

  const flattenCascadeOrder = async (
    repoId: string,
  ): Promise<ReadonlyArray<TCascadeTarget>> => {
    const targets: TCascadeTarget[] = []
    const seen = new Set<string>()

    const walk = async (
      currentId: string,
      depth: number,
    ): Promise<void> => {
      const dependents = await dependencyRepo.getDependents(currentId)

      for (const dep of dependents) {
        if (!dep.cascade) continue
        if (seen.has(dep.dependentRepoId)) continue

        seen.add(dep.dependentRepoId)
        targets.push({
          repoId: dep.dependentRepoId,
          repoName: dep.dependentRepoName,
          depth,
          contractTest: dep.contractTest,
        })

        await walk(dep.dependentRepoId, depth + 1)
      }
    }

    await walk(repoId, 1)
    return targets
  }

  return {
    resolve: (repoId) => buildGraph(repoId),
    detectCycles,
    flattenCascadeOrder,
  }
}
