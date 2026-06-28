import { BLOCK_ADDITIONS, PLAN_LIMITS, spendingCapToBlocks, type TPlanType } from "@gittan/types"

import type { TAlertRepo } from "../db/alert-repo.js"
import type { TOrgUsageRow } from "../db/usage-repo.js"
import type { TEmailClient } from "../integrations/email.js"

const THRESHOLDS = [80, 95] as const

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export const checkUsageAlerts = async (input: {
  readonly orgId: string
  readonly orgName: string
  readonly receiptEmail: string | undefined
  readonly plan: TPlanType
  readonly spendingCapEur: number
  readonly usage: TOrgUsageRow
  readonly alertRepo: TAlertRepo
  readonly email: TEmailClient
}): Promise<void> => {
  const { orgId, plan, spendingCapEur, usage, alertRepo, email } = input
  const month = currentMonth()
  const limits = PLAN_LIMITS[plan]
  const blocks = spendingCapToBlocks(spendingCapEur)

  const ciLimit = limits.ciMinutesLimit + blocks * BLOCK_ADDITIONS.ciMinutes
  const storageLimitGb = limits.storageLimitGb + blocks * BLOCK_ADDITIONS.storageGb

  const to = input.receiptEmail
  if (!to) return

  for (const threshold of THRESHOLDS) {
    if (ciLimit > 0) {
      const ratio = (usage.ciMinutesUsed / ciLimit) * 100
      if (ratio >= threshold) {
        const alreadySent = await alertRepo.hasBeenSent(orgId, month, "ci_minutes", threshold)
        if (!alreadySent) {
          try {
            await email.sendUsageWarning({
              to,
              orgName: input.orgName,
              resource: `CI Minutes (${threshold}%)`,
              currentValue: usage.ciMinutesUsed,
              limit: ciLimit,
              plan,
              threshold,
            })
            await alertRepo.markSent(orgId, month, "ci_minutes", threshold)
            console.log(`Usage alert sent: org=${orgId} ci_minutes ${threshold}% (${usage.ciMinutesUsed}/${ciLimit})`)
          } catch (err) {
            console.error(`Failed to send CI usage alert for org ${orgId}:`, err)
          }
        }
      }
    }

    if (storageLimitGb > 0) {
      const storageGb = usage.storageBytes / (1024 * 1024 * 1024)
      const ratio = (storageGb / storageLimitGb) * 100
      if (ratio >= threshold) {
        const alreadySent = await alertRepo.hasBeenSent(orgId, month, "storage", threshold)
        if (!alreadySent) {
          try {
            await email.sendUsageWarning({
              to,
              orgName: input.orgName,
              resource: `Storage (${threshold}%)`,
              currentValue: Math.round(storageGb * 10) / 10,
              limit: storageLimitGb,
              plan,
              threshold,
            })
            await alertRepo.markSent(orgId, month, "storage", threshold)
            console.log(`Usage alert sent: org=${orgId} storage ${threshold}% (${storageGb.toFixed(1)}GB/${storageLimitGb}GB)`)
          } catch (err) {
            console.error(`Failed to send storage usage alert for org ${orgId}:`, err)
          }
        }
      }
    }
  }
}
