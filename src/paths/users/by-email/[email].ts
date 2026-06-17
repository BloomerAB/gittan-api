import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { KEYSPACE } from "../../../db/schema.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { db } = deps()

  const lookup = await db.execute(
    `SELECT user_id FROM ${KEYSPACE}.users_by_email WHERE email = ?`,
    [param(req, "email")],
    { prepare: true },
  )

  if (lookup.rowLength === 0) {
    res.status(404).json(null)
    return
  }

  const result = await db.execute(
    `SELECT * FROM ${KEYSPACE}.users WHERE id = ?`,
    [lookup.first().user_id],
    { prepare: true },
  )

  if (result.rowLength === 0) {
    res.status(404).json(null)
    return
  }

  const row = result.first()
  res.json({
    id: row.id as string,
    company_id: (row.org_id as string) ?? "",
    email: row.email as string,
    name: row.name as string,
    role: row.role as string,
    is_active: row.is_active as boolean,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  })
}
