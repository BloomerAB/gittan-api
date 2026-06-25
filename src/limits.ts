import { PLAN_LIMITS, type TPlanType } from "@bloomerab/gittan-types"

import type { TUsageRepo } from "./db/usage-repo.js"

export type TLimitCheck = {
  readonly allowed: boolean
  readonly reason?: string
  readonly current: number
  readonly limit: number
}

const getLimit = (plan: TPlanType, resource: keyof typeof PLAN_LIMITS.personal): number => {
  const limits = PLAN_LIMITS[plan]
  return limits[resource]
}

export const checkResourceLimit = async (
  usageRepo: TUsageRepo,
  orgId: string,
  resource: "userLimit" | "teamLimit" | "repoLimit",
  currentCount: number,
): Promise<TLimitCheck> => {
  const plan = await usageRepo.getPlan(orgId)
  const planType = plan?.plan ?? "personal"
  const limit = getLimit(planType, resource)

  if (limit === 0) {
    return { allowed: true, current: currentCount, limit: 0 }
  }

  if (currentCount >= limit) {
    const resourceName = resource.replace("Limit", "s")
    return {
      allowed: false,
      reason: `Plan limit reached: ${currentCount}/${limit} ${resourceName}. Upgrade your plan to add more.`,
      current: currentCount,
      limit,
    }
  }

  return { allowed: true, current: currentCount, limit }
}

export const getQuotaStatus = (used: number, limit: number): "ok" | "warning" | "critical" | "blocked" => {
  if (limit === 0) return "ok"
  const ratio = used / limit
  if (ratio >= 1) return "blocked"
  if (ratio >= 0.95) return "critical"
  if (ratio >= 0.80) return "warning"
  return "ok"
}
