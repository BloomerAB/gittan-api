import type { NatsConnection } from "nats"
import { StringCodec } from "nats"
import { BLOCK_ADDITIONS, PLAN_LIMITS, spendingCapToBlocks } from "@bloomerab/gittan-types"

import type { TAlertRepo } from "../db/alert-repo.js"
import type { TPolicyRepo } from "../db/policy-repo.js"
import type { TRepoMetadataRepo } from "../db/repo-metadata.js"
import type { TStepRegistry } from "../db/step-registry.js"
import type { TUsageRepo } from "../db/usage-repo.js"
import type { TEmailClient } from "../integrations/email.js"
import type { TForgejoClient } from "../integrations/forgejo.js"
import { checkUsageAlerts } from "../lib/usage-alerts.js"
import { isConfigRepo, syncConfigRepo } from "./config-repo.js"
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
  readonly alertRepo: TAlertRepo
  readonly email: TEmailClient
  readonly forgejo: TForgejoClient
  readonly stepRegistry: TStepRegistry
  readonly policyRepo: TPolicyRepo
  readonly getOrgName: (orgId: string) => Promise<string>
  readonly getReceiptEmail: (orgId: string) => Promise<string | undefined>
  readonly getPolicies: (orgId: string) => Promise<ReadonlyArray<import("@bloomerab/gittan-types").TOrgPolicy>>
  readonly getTemplate: (teamId: string) => Promise<import("@bloomerab/gittan-types").TTeamTemplate | undefined>
  readonly getRepoFiles: (forgejoFullName: string) => Promise<ReadonlyArray<string>>
  readonly getRepoConfig: (forgejoFullName: string) => Promise<{ steps: ReadonlyArray<import("@bloomerab/gittan-types").TPipelineStep> } | undefined>
  readonly onPipelineResolved: (event: TPipelineEvent) => Promise<void>
}

export const startPipelineSubscriber = (deps: TSubscriberDeps): void => {
  const sc = StringCodec()

  const rejectQuota = (pushEvent: TPushEventMessage, reason: string): void => {
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
              error: reason,
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

    if (isConfigRepo(pushEvent.repoName)) {
      try {
        const result = await syncConfigRepo(
          deps.forgejo, pushEvent.orgId, pushEvent.repoName,
          deps.stepRegistry, deps.policyRepo,
        )
        console.info(
          `Config repo synced for org ${pushEvent.orgId}: ` +
          `${result.steps.synced} steps, ${result.policies.synced} policies` +
          (result.steps.errors.length + result.policies.errors.length > 0
            ? `, errors: ${[...result.steps.errors, ...result.policies.errors].join("; ")}`
            : ""),
        )
        deps.nats.publish("gittan.config.synced", sc.encode(JSON.stringify({
          orgId: pushEvent.orgId,
          repoName: pushEvent.repoName,
          result,
        })))
      } catch (err) {
        console.error(`Failed to sync config repo for org ${pushEvent.orgId}:`, err)
      }
      return
    }

    const [ciLimit, usage] = await Promise.all([
      deps.usageRepo.getEffectiveCiLimit(pushEvent.orgId),
      deps.usageRepo.getUsage(pushEvent.orgId),
    ])

    if (usage && ciLimit > 0 && usage.ciMinutesUsed >= ciLimit) {
      console.warn(`CI quota exceeded for org ${pushEvent.orgId}: ${usage.ciMinutesUsed}/${ciLimit} CI minutes`)
      rejectQuota(pushEvent, "CI minutes quota exceeded. Upgrade your plan or purchase additional CI blocks.")
      return
    }

    const plan = await deps.usageRepo.getPlan(pushEvent.orgId)
    const planType = plan?.plan ?? "personal"
    const spendingCapEur = planType === "team" ? (plan?.spendingCapEur ?? 0) : 0
    const blocks = spendingCapToBlocks(spendingCapEur)
    const storageLimitGb = PLAN_LIMITS[planType].storageLimitGb + blocks * BLOCK_ADDITIONS.storageGb
    const storageLimitBytes = storageLimitGb * 1024 * 1024 * 1024

    let storageBytes = 0
    try {
      storageBytes = await deps.forgejo.getOrgStorageBytes(pushEvent.orgId)
      if (storageLimitBytes > 0 && storageBytes >= storageLimitBytes) {
        const usedGb = (storageBytes / (1024 * 1024 * 1024)).toFixed(1)
        console.warn(`Storage quota exceeded for org ${pushEvent.orgId}: ${usedGb}GB/${storageLimitGb}GB`)
        rejectQuota(pushEvent, `Storage quota exceeded (${usedGb}GB/${storageLimitGb}GB). Upgrade your plan to continue.`)
        return
      }
    } catch (err) {
      console.error(`Failed to check storage for org ${pushEvent.orgId}:`, err)
    }

    if (usage) {
      const [orgName, receiptEmail] = await Promise.all([
        deps.getOrgName(pushEvent.orgId),
        deps.getReceiptEmail(pushEvent.orgId),
      ])
      checkUsageAlerts({
        orgId: pushEvent.orgId,
        orgName,
        receiptEmail,
        plan: planType,
        spendingCapEur,
        usage: { ...usage, storageBytes },
        alertRepo: deps.alertRepo,
        email: deps.email,
      }).catch(err => console.error(`Failed to check usage alerts for org ${pushEvent.orgId}:`, err))
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

    const headCommit = pushEvent.commits.at(-1)

    deps.nats.publish(
      "gittan.pipeline.resolved",
      sc.encode(
        JSON.stringify({
          pushEventId: pushEvent.id,
          orgId: pushEvent.orgId,
          teamId: pushEvent.teamId,
          repoId: pushEvent.repoId,
          repoName: pushEvent.repoName,
          forgejoFullName: repoMeta?.forgejoFullName ?? `${pushEvent.orgId}/${pushEvent.repoName}`,
          branch: pushEvent.branch,
          isGated: pushEvent.isGated,
          commitSha: headCommit?.sha,
          commitMessage: headCommit?.message,
          pusher: pushEvent.pusher,
          resolved,
        }),
      ),
    )
  }

  const sub = deps.nats.subscribe("gittan.push.*", { queue: "pipeline-resolver" })
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
