import type { Request, Response } from "express"
import { z } from "zod"

import { PLAN_LIMITS, PlanTypeSchema } from "@bloomerab/gittan-types"

import type { TPlanType } from "@bloomerab/gittan-types"

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
  const { memberRepo, teamRepo, repoMetadata } = deps()
  const existing = await usageRepo.getPlan(orgId)

  const newPlan: TPlanType = parsed.data.plan ?? existing?.plan ?? "personal"

  if (parsed.data.plan && parsed.data.plan !== existing?.plan) {
    const newLimits = PLAN_LIMITS[newPlan]
    const [members, teams] = await Promise.all([
      memberRepo.getMembers(orgId),
      teamRepo.listTeams(orgId),
    ])
    const repoCounts = await Promise.all(teams.map(t => repoMetadata.listByTeam(t.id)))
    const totalRepos = repoCounts.reduce((sum, repos) => sum + repos.length, 0)

    const { forgejo } = deps()
    let storageBytes = 0
    try {
      storageBytes = await forgejo.getOrgStorageBytes(orgId)
    } catch { /* org may not exist in forgejo yet */ }

    const violations: string[] = []
    if (newLimits.userLimit > 0 && members.length > newLimits.userLimit) {
      violations.push(`${members.length} members exceeds limit of ${newLimits.userLimit}`)
    }
    if (newLimits.teamLimit > 0 && teams.length > newLimits.teamLimit) {
      violations.push(`${teams.length} teams exceeds limit of ${newLimits.teamLimit}`)
    }
    if (newLimits.repoLimit > 0 && totalRepos > newLimits.repoLimit) {
      violations.push(`${totalRepos} repos exceeds limit of ${newLimits.repoLimit}`)
    }
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

  const plan = await usageRepo.setPlan(
    orgId,
    newPlan,
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
