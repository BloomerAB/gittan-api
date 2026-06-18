import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { stepRegistry } = deps()
  const steps = await stepRegistry.list(param(req, "orgId"))
  res.json(steps)
}

const RegisterStepBody = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  image: z.string().min(1),
  run: z.string().min(1),
  defaults: z.record(z.string()).optional(),
  cache: z.array(z.string()).optional(),
  description: z.string().optional(),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const parsed = RegisterStepBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const { stepRegistry, auditRepo } = deps()
  const orgId = param(req, "orgId")

  const step = await stepRegistry.register({ orgId, ...parsed.data })

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "step.register",
    resourceType: "step",
    resourceId: step.name,
    detail: `Registered step "${step.name}"`,
  })

  res.status(201).json(step)
}
