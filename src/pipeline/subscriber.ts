import type { NatsConnection } from "nats"
import { StringCodec } from "nats"

import type { TRepoMetadataRepo } from "../db/repo-metadata.js"
import type { TUsageRepo } from "../db/usage-repo.js"
import { resolvePipeline, type TResolvedPipeline } from "./resolver.js"

export type TPushEventMessage = {
  readonly id: string
  readonly orgId: string
  readonly teamId: string
  readonly repoId: string
  readonly repoName: string
  readonly branch: string
  readonly commits: ReadonlyArray<{
    readonly sha: string
    readonly message: string
    readonly author: string
    readonly timestamp: string
  }>
  readonly pusher: string
  readonly timestamp: string
  readonly isGated: boolean
}

export type TPipelineEvent = {
  readonly pushEvent: TPushEventMessage
  readonly resolved: TResolvedPipeline
}

export type TSubscriberDeps = {
  readonly nats: NatsConnection
  readonly repoMetadata: TRepoMetadataRepo
  readonly usageRepo: TUsageRepo
  readonly getPolicies: (orgId: string) => Promise<ReadonlyArray<import("@bloomerab/gittan-types").TOrgPolicy>>
  readonly getTemplate: (teamId: string) => Promise<import("@bloomerab/gittan-types").TTeamTemplate | undefined>
  readonly getRepoFiles: (forgejoFullName: string) => Promise<ReadonlyArray<string>>
  readonly getRepoConfig: (forgejoFullName: string) => Promise<{ steps: ReadonlyArray<import("@bloomerab/gittan-types").TPipelineStep> } | undefined>
  readonly onPipelineResolved: (event: TPipelineEvent) => Promise<void>
}

export const startPipelineSubscriber = (deps: TSubscriberDeps): void => {
  const sc = StringCodec()

  const rejectOverQuota = (pushEvent: TPushEventMessage): void => {
    const now = new Date().toISOString()
    deps.nats.publish(
      "gittan.pipeline.result",
      sc.encode(
        JSON.stringify({
          pushEventId: pushEvent.id,
          orgId: pushEvent.orgId,
          teamId: pushEvent.teamId,
          repoId: pushEvent.repoId,
          branch: pushEvent.branch,
          isGated: pushEvent.isGated,
          status: "failed",
          steps: [
            {
              stepName: "quota-check",
              status: "failed",
              durationMs: 0,
              source: "policy",
              error: "CI minutes quota exceeded. Upgrade your plan or purchase additional CI blocks.",
            },
          ],
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
        }),
      ),
    )
  }

  const handlePush = async (data: Uint8Array): Promise<void> => {
    const pushEvent: TPushEventMessage = JSON.parse(sc.decode(data))

    const [ciLimit, usage] = await Promise.all([
      deps.usageRepo.getEffectiveCiLimit(pushEvent.orgId),
      deps.usageRepo.getUsage(pushEvent.orgId),
    ])

    if (usage && ciLimit > 0 && usage.ciMinutesUsed >= ciLimit) {
      console.warn(`Quota exceeded for org ${pushEvent.orgId}: ${usage.ciMinutesUsed}/${ciLimit} CI minutes`)
      rejectOverQuota(pushEvent)
      return
    }

    const repoMeta = await deps.repoMetadata.getById(
      pushEvent.orgId,
      pushEvent.repoId,
    )

    const [policies, template, repoConfig, repoFiles] = await Promise.all([
      deps.getPolicies(pushEvent.orgId),
      deps.getTemplate(pushEvent.teamId),
      repoMeta
        ? deps.getRepoConfig(repoMeta.forgejoFullName)
        : Promise.resolve(undefined),
      repoMeta
        ? deps.getRepoFiles(repoMeta.forgejoFullName)
        : Promise.resolve([]),
    ])

    const resolved = resolvePipeline({
      repoConfig,
      policies,
      template,
      repoFiles,
      teamName: pushEvent.teamId,
      repoName: pushEvent.repoName,
      repoTags: [],
    })

    await deps.onPipelineResolved({ pushEvent, resolved })

    deps.nats.publish(
      "gittan.pipeline.resolved",
      sc.encode(
        JSON.stringify({
          pushEventId: pushEvent.id,
          orgId: pushEvent.orgId,
          teamId: pushEvent.teamId,
          repoId: pushEvent.repoId,
          branch: pushEvent.branch,
          isGated: pushEvent.isGated,
          resolved,
        }),
      ),
    )
  }

  const sub = deps.nats.subscribe("gittan.push.*")
  ;(async () => {
    for await (const msg of sub) {
      try {
        await handlePush(msg.data)
      } catch (err) {
        console.error("Failed to handle push event:", err)
      }
    }
  })()
}
