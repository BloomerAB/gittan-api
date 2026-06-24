import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { KEYSPACE } from "../../../../db/schema.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { memberRepo, db } = deps()
  const orgId = param(req, "orgId")

  const members = await memberRepo.getMembers(orgId)
  if (members.length === 0) {
    res.json([])
    return
  }

  const userRows = await db.execute(
    `SELECT user_id, email, name FROM ${KEYSPACE}.users_by_org WHERE org_id = ?`,
    [orgId],
    { prepare: true },
  )

  const userMap = new Map(
    userRows.rows.map((row) => [
      row.user_id as string,
      { email: row.email as string, name: row.name as string },
    ]),
  )

  const enriched = members.map((m) => {
    const user = userMap.get(m.userId)
    return {
      userId: m.userId,
      email: user?.email ?? "",
      name: user?.name ?? "",
      role: m.role,
      joinedAt: m.joinedAt,
    }
  })

  res.json(enriched)
}
