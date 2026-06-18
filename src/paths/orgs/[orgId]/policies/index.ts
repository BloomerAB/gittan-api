import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { policyRepo } = deps()
  const policies = await policyRepo.list(param(req, "orgId"))
  res.json(policies)
}

const PolicyStepSchema = z.object({
  position: z.enum(["before", "after"]),
  name: z.string().min(1),
  use: z.string().min(1),
})

const CreatePolicyBody = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  matchFiles: z.string().optional(),
  matchTeam: z.string().optional(),
  matchName: z.string().optional(),
  steps: z.array(PolicyStepSchema).optional(),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const parsed = CreatePolicyBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const { policyRepo, auditRepo } = deps()
  const orgId = param(req, "orgId")

  const policy = await policyRepo.create({ orgId, ...parsed.data })

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "policy.create",
    resourceType: "policy",
    resourceId: policy.id,
    detail: `Created policy "${policy.name}"`,
  })

  res.status(201).json(policy)
}
