import type { Request, Response } from "express"
import { z } from "zod"

import { PLAN_LIMITS, PlanTypeSchema } from "@bloomerab/gittan-types"

import { assertOrgAccess, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

const UpdatePlanBody = z.object({
  plan: PlanTypeSchema.optional(),
  ciBlocks: z.number().int().min(0).optional(),
  billingEmail: z.string().email().optional(),
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
      ciBlocks: 0,
      billingEmail: null,
      ...defaults,
    })
    return
  }

  const limits = PLAN_LIMITS[plan.plan]
  const effectiveCiLimit = limits.ciMinutesLimit + plan.ciBlocks * 10_000

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

  const plan = await usageRepo.setPlan(
    orgId,
    parsed.data.plan ?? existing?.plan ?? "personal",
    parsed.data.ciBlocks ?? existing?.ciBlocks ?? 0,
    parsed.data.billingEmail,
  )

  const limits = PLAN_LIMITS[plan.plan]
  const effectiveCiLimit = limits.ciMinutesLimit + plan.ciBlocks * 10_000

  res.json({
    ...plan,
    ...limits,
    ciMinutesLimit: effectiveCiLimit,
  })
}
