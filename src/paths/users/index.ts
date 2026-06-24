import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { deps } from "../../deps.js"
import { KEYSPACE } from "../../db/schema.js"

const CreateUserBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(128),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  const { db } = deps()
  const parsed = CreateUserBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const { email, name } = parsed.data

  const existing = await db.execute(
    `SELECT user_id FROM ${KEYSPACE}.users_by_email WHERE email = ?`,
    [email],
    { prepare: true },
  )

  if (existing.rowLength > 0) {
    const result = await db.execute(
      `SELECT * FROM ${KEYSPACE}.users WHERE id = ?`,
      [existing.first().user_id],
      { prepare: true },
    )
    res.json(rowToUser(result.first()))
    return
  }

  const id = randomUUID()
  const now = new Date()

  await db.batch(
    [
      {
        query: `INSERT INTO ${KEYSPACE}.users (id, email, name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [id, email, name, "member", true, now, now],
      },
      {
        query: `INSERT INTO ${KEYSPACE}.users_by_email (email, user_id) VALUES (?, ?)`,
        params: [email, id],
      },
    ],
    { prepare: true },
  )

  res.status(201).json({
    id,
    company_id: "",
    email,
    name,
    role: "member",
    is_active: true,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
}

const rowToUser = (row: Record<string, unknown>) => ({
  id: row.id as string,
  company_id: (row.org_id as string) ?? "",
  email: row.email as string,
  name: row.name as string,
  role: row.role as string,
  is_active: row.is_active as boolean,
  created_at: (row.created_at as Date).toISOString(),
  updated_at: (row.updated_at as Date).toISOString(),
})
