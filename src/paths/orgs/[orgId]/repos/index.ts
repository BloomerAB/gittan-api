import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { checkResourceLimit } from "../../../../limits.js"

const CreateRepoBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  teamId: z.string().min(1),
  description: z.string().max(256).optional(),
  private: z.boolean().default(true),
  gatedBranches: z.array(z.string()).default(["main"]),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { repoMetadata, teamRepo, usageRepo, forgejo, config } = deps()
  const parsed = CreateRepoBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const orgId = param(req, "orgId")
  const { name, teamId, description, gatedBranches } = parsed.data
  const isPrivate = parsed.data.private

  const team = await teamRepo.getTeam(orgId, teamId)
  if (!team) {
    res.status(404).json({ error: "Team not found" })
    return
  }

  const usage = await usageRepo.getUsage(orgId)
  const limitCheck = await checkResourceLimit(usageRepo, orgId, "repoLimit", usage?.repoCount ?? 0)
  if (!limitCheck.allowed) {
    res.status(403).json({ error: limitCheck.reason })
    return
  }

  let forgejoOrg = await forgejo.getOrg(orgId)
  if (!forgejoOrg) {
    forgejoOrg = await forgejo.createOrg(orgId)
  }

  const forgejoRepo = await forgejo.createRepo(orgId, {
    name,
    description,
    private: isPrivate,
  })

  const webhookBaseUrl = `http://localhost:${config.port}`
  await forgejo.createWebhook(orgId, name, `${webhookBaseUrl}/hooks/push`, [
    "push",
  ])

  const repoId = randomUUID()
  const metadata = await repoMetadata.create({
    id: repoId,
    orgId,
    teamId,
    name,
    forgejoFullName: forgejoRepo.fullName,
    cloneUrl: forgejoRepo.cloneUrl,
    sshUrl: forgejoRepo.sshUrl,
    gatedBranches,
  })

  res.status(201).json(metadata)
}
