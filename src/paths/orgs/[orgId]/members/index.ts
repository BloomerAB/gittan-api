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

  const userIds = members.map((m) => m.userId)
  const userRows = await Promise.all(
    userIds.map((id) =>
      db.execute(
        `SELECT id, email FROM ${KEYSPACE}.users WHERE id = ?`,
        [id],
        { prepare: true },
      ),
    ),
  )

  const userMap = new Map(
    userRows
      .filter((r) => r.rowLength > 0)
      .map((r) => [r.first().id as string, r.first().email as string]),
  )

  const enriched = members.map((m) => ({
    userId: m.userId,
    email: userMap.get(m.userId) ?? "",
    role: m.role,
    joinedAt: m.joinedAt,
  }))

  res.json(enriched)
}
