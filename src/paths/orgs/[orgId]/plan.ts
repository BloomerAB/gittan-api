import type { Request, Response } from "express"
import { z } from "zod"

import { BLOCK_ADDITIONS, PLAN_LIMITS, PlanTypeSchema, spendingCapToBlocks } from "@bloomerab/gittan-types"

import type { TPlanType } from "@bloomerab/gittan-types"

import { assertOrgAccess, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

const UpdatePlanBody = z.object({
  plan: PlanTypeSchema.optional(),
  spendingCapEur: z.number().int().min(0).optional(),
  receiptEmail: z.string().email().optional(),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { usageRepo } = deps()
  const plan = await usageRepo.getPlan(param(req, "orgId"))

  if (!plan) {
    const defaults = PLAN_LIMITS.personal
    res.json({
      orgId: param(req, "orgId"),
      plan: "personal",
      spendingCapEur: 0,
      receiptEmail: null,
      ...defaults,
    })
    return
  }

  const limits = PLAN_LIMITS[plan.plan]
  const effectiveCiLimit = limits.ciMinutesLimit + spendingCapToBlocks(plan.spendingCapEur) * BLOCK_ADDITIONS.ciMinutes

  res.json({
    ...plan,
    ...limits,
    ciMinutesLimit: effectiveCiLimit,
  })
}

export const PUT = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { usageRepo } = deps()
  const parsed = UpdatePlanBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const orgId = param(req, "orgId")
  const existing = await usageRepo.getPlan(orgId)

  const newPlan: TPlanType = parsed.data.plan ?? existing?.plan ?? "personal"

  if (parsed.data.spendingCapEur && parsed.data.spendingCapEur > 0 && newPlan !== "team") {
    res.status(400).json({ error: "Spending cap is only available on the Team plan" })
    return
  }

  if (parsed.data.plan && parsed.data.plan !== existing?.plan) {
    const newLimits = PLAN_LIMITS[newPlan]

    const { forgejo } = deps()
    let storageBytes = 0
    try {
      storageBytes = await forgejo.getOrgStorageBytes(orgId)
    } catch { /* org may not exist in forgejo yet */ }

    const violations: string[] = []
    const storageLimitBytes = newLimits.storageLimitGb * 1024 * 1024 * 1024
    if (storageLimitBytes > 0 && storageBytes > storageLimitBytes) {
      const usedGb = (storageBytes / (1024 * 1024 * 1024)).toFixed(1)
      violations.push(`${usedGb}GB storage exceeds limit of ${newLimits.storageLimitGb}GB`)
    }
    if (violations.length > 0) {
      res.status(409).json({ error: "Cannot downgrade plan", violations })
      return
    }
  }

  const effectiveSpendingCap = newPlan === "team"
    ? (parsed.data.spendingCapEur ?? existing?.spendingCapEur ?? 0)
    : 0

  const plan = await usageRepo.setPlan(
    orgId,
    newPlan,
    effectiveSpendingCap,
    parsed.data.receiptEmail,
  )

  const limits = PLAN_LIMITS[plan.plan]
  const effectiveCiLimit = limits.ciMinutesLimit + spendingCapToBlocks(plan.spendingCapEur) * BLOCK_ADDITIONS.ciMinutes

  res.json({
    ...plan,
    ...limits,
    ciMinutesLimit: effectiveCiLimit,
  })
}
