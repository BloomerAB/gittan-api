import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { KEYSPACE } from "../../../../db/schema.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { db } = deps()
  const orgId = param(req, "orgId")
  const query = ((req.query.q as string) ?? "").toLowerCase().trim()

  const result = await db.execute(
    `SELECT user_id, email, name FROM ${KEYSPACE}.users_by_org WHERE org_id = ?`,
    [orgId],
    { prepare: true },
  )

  const matches = result.rows
    .filter((row) => {
      if (!query) return true
      const email = (row.email as string ?? "").toLowerCase()
      const name = (row.name as string ?? "").toLowerCase()
      return email.includes(query) || name.includes(query)
    })
    .slice(0, 10)
    .map((row) => ({
      id: row.user_id as string,
      email: row.email as string,
      name: row.name as string,
    }))

  res.json(matches)
}
