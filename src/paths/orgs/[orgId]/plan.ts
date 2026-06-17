import type { Request, Response } from "express"
import { z } from "zod"

import { PLAN_LIMITS, PlanTypeSchema } from "@bloomerab/gittan-types"

import { assertOrgAccess, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

const SetPlanBody = z.object({
  plan: PlanTypeSchema,
  ciBlocks: z.number().int().min(0).default(0),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { usageRepo } = deps()
  const plan = await usageRepo.getPlan(param(req, "orgId"))

  if (!plan) {
    const defaults = PLAN_LIMITS.starter
    res.json({
      orgId: param(req, "orgId"),
      plan: "starter",
      ciBlocks: 0,
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
  if (!assertOrgAccess(req, res)) return

  const { usageRepo } = deps()
  const parsed = SetPlanBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const plan = await usageRepo.setPlan(
    param(req, "orgId"),
    parsed.data.plan,
    parsed.data.ciBlocks,
  )

  res.json(plan)
}
