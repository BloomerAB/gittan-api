import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { syncOidcProvider } from "../../../integrations/auth-server.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { orgRepo } = deps()
  const org = await orgRepo.getById(param(req, "orgId"))

  if (!org) {
    res.status(404).json({ error: "Organization not found" })
    return
  }

  res.json(org)
}

const UpdateOrgBody = z.object({
  displayName: z.string().min(1).max(128).optional(),
  oidcIssuer: z.string().url().nullable().optional(),
  oidcClientId: z.string().nullable().optional(),
  oidcClientSecret: z.string().nullable().optional(),
  mandatorySso: z.boolean().optional(),
  ssoEmailDomain: z.string().nullable().optional(),
  slackClientId: z.string().nullable().optional(),
  slackClientSecret: z.string().nullable().optional(),
  slackBotToken: z.string().nullable().optional(),
  slackTeamName: z.string().nullable().optional(),
})

export const PUT = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const parsed = UpdateOrgBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const { orgRepo, auditRepo } = deps()
  const orgId = param(req, "orgId")

  const org = await orgRepo.update(orgId, parsed.data)
  if (!org) {
    res.status(404).json({ error: "Organization not found" })
    return
  }

  if (org.oidcIssuer && org.oidcClientId && org.oidcClientSecret) {
    await syncOidcProvider({
      id: orgId,
      issuer: org.oidcIssuer,
      clientId: org.oidcClientId,
      clientSecret: org.oidcClientSecret,
      displayName: org.displayName,
    })
  }

  const user = getAuthUser(req)
  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "org.update",
    resourceType: "org",
    resourceId: orgId,
    detail: `Updated organization settings`,
  })

  res.json(org)
}
