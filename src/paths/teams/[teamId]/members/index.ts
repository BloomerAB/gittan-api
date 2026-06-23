import type { Request, Response } from "express"
import { z } from "zod"

import { getAuthUser, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { KEYSPACE } from "../../../../db/schema.js"

const AddMemberBody = z.object({
  userId: z.string().min(1),
})

const assertTeamInUserOrg = async (
  req: Request,
  res: Response,
): Promise<string | false> => {
  const { db, memberRepo } = deps()
  const user = getAuthUser(req)
  const teamId = param(req, "teamId")

  const memberships = await memberRepo.getUserOrgIds(user.id)

  for (const m of memberships) {
    const result = await db.execute(
      `SELECT id FROM ${KEYSPACE}.teams WHERE org_id = ? AND id = ?`,
      [m.orgId, teamId],
      { prepare: true },
    )
    if (result.rowLength > 0) return m.orgId
  }

  res.status(403).json({ error: "Access denied to this team" })
  return false
}

const resolveEmails = async (
  userIds: ReadonlyArray<string>,
): Promise<Map<string, string>> => {
  const { db } = deps()
  const emailMap = new Map<string, string>()
  if (userIds.length === 0) return emailMap

  const results = await Promise.all(
    userIds.map((id) =>
      db.execute(
        `SELECT id, email FROM ${KEYSPACE}.users WHERE id = ?`,
        [id],
        { prepare: true },
      ),
    ),
  )

  for (const result of results) {
    const row = result.first?.() ?? result.rows[0]
    if (row?.email) emailMap.set(row.id, row.email)
  }

  return emailMap
}

export const GET = async (req: Request, res: Response): Promise<void> => {
  const orgId = await assertTeamInUserOrg(req, res)
  if (orgId === false) return

  const { teamRepo } = deps()
  const members = await teamRepo.listMembers(param(req, "teamId"))

  const emailMap = await resolveEmails(members.map((m) => m.userId))

  res.json(
    members.map((m) => ({
      userId: m.userId,
      email: emailMap.get(m.userId) ?? null,
      addedAt: m.addedAt,
    })),
  )
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  const orgId = await assertTeamInUserOrg(req, res)
  if (orgId === false) return

  const { teamRepo, auditRepo } = deps()
  const parsed = AddMemberBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const teamId = param(req, "teamId")
  const user = getAuthUser(req)

  const member = await teamRepo.addMember({
    teamId,
    addedBy: user.id,
    userId: parsed.data.userId,
    role: "team-admin",
  })

  await auditRepo.log({
    orgId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.add",
    resourceType: "team_member",
    resourceId: `${teamId}/${parsed.data.userId}`,
    detail: `Added user ${parsed.data.userId} to team ${teamId}`,
  })

  res.status(201).json(member)
}
