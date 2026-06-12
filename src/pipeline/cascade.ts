import type { NatsConnection } from "nats"
import { StringCodec } from "nats"

import type { TDependencyRepo } from "../db/dependency-repo.js"
import type { TRepoMetadataRepo } from "../db/repo-metadata.js"

export type TCascadeResult = {
  readonly sourceRepoId: string
  readonly sourcePushEventId: string
  readonly triggered: ReadonlyArray<{
    readonly repoId: string
    readonly repoName: string
    readonly contractTest: boolean
  }>
}

export type TPipelineResultMessage = {
  readonly pushEventId: string
  readonly repoId: string
  readonly branch: string
  readonly isGated: boolean
  readonly status: "passed" | "failed"
}

export type TCascadeDeps = {
  readonly nats: NatsConnection
  readonly dependencyRepo: TDependencyRepo
  readonly repoMetadata: TRepoMetadataRepo
  readonly onCascade?: (result: TCascadeResult) => void
}

export const startCascadeSubscriber = (deps: TCascadeDeps): void => {
  const sc = StringCodec()

  const sub = deps.nats.subscribe("gittan.pipeline.result")
  ;(async () => {
    for await (const msg of sub) {
      try {
        const result: TPipelineResultMessage = JSON.parse(sc.decode(msg.data))

        if (result.status !== "passed") continue
        if (result.branch !== "main") continue

        const dependents = await deps.dependencyRepo.getDependents(result.repoId)
        const cascadeDependents = dependents.filter((d) => d.cascade)

        if (cascadeDependents.length === 0) continue

        const triggered: TCascadeResult["triggered"][number][] = []

        for (const dep of cascadeDependents) {
          const repoMeta = await deps.repoMetadata.getById(
            "",
            dep.dependentRepoId,
          )

          const cascadeEvent = {
            id: `cascade-${result.pushEventId}-${dep.dependentRepoId}`,
            orgId: repoMeta?.orgId ?? "unknown",
            teamId: repoMeta?.teamId ?? "unknown",
            repoId: dep.dependentRepoId,
            repoName: dep.dependentRepoName,
            branch: "main",
            commits: [
              {
                sha: "0".repeat(40),
                message: `cascade: dependency ${result.repoId} passed`,
                author: "gittan-cascade",
                timestamp: new Date().toISOString(),
              },
            ],
            pusher: "gittan-cascade",
            timestamp: new Date().toISOString(),
            isGated: false,
            isCascade: true,
            sourceRepoId: result.repoId,
            sourcePushEventId: result.pushEventId,
            contractTest: dep.contractTest,
          }

          deps.nats.publish(
            "gittan.push.cascade",
            sc.encode(JSON.stringify(cascadeEvent)),
          )

          triggered.push({
            repoId: dep.dependentRepoId,
            repoName: dep.dependentRepoName,
            contractTest: dep.contractTest,
          })
        }

        deps.onCascade?.({
          sourceRepoId: result.repoId,
          sourcePushEventId: result.pushEventId,
          triggered,
        })
      } catch (err) {
        console.error("Cascade trigger failed:", err)
      }
    }
  })()
}
