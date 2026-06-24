import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const CreateInviteBody = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { inviteRepo } = deps()
  const orgId = param(req, "orgId")

  const invites = await inviteRepo.getByOrg(orgId)

  res.json(
    invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    })),
  )
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const user = getAuthUser(req)
  const { inviteRepo, memberRepo } = deps()
  const orgId = param(req, "orgId")

  const membership = await memberRepo.getMembership(orgId, user.id)
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    res.status(403).json({ error: "Only org owners and admins can invite members" })
    return
  }

  const parsed = CreateInviteBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const invite = await inviteRepo.create({
    id: randomUUID(),
    orgId,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: user.id,
  })

  res.status(201).json({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  })
}
