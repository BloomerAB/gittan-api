import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TUser = {
  readonly id: string
  readonly email: string
  readonly passwordHash: string
  readonly orgId?: string
  readonly role: "org-admin" | "member"
  readonly createdAt: string
}

export const createUserRepo = (client: Client) => ({
  create: async (id: string, email: string, passwordHash: string): Promise<TUser> => {
    const now = new Date().toISOString()

    const existing = await client.execute(
      `SELECT id FROM ${KEYSPACE}.users WHERE email = ?`,
      [email],
      { prepare: true },
    )

    if (existing.rowLength > 0) {
      throw new Error("User with this email already exists")
    }

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`,
          params: [id, email, passwordHash, "member", now],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.users_by_email (email, user_id) VALUES (?, ?)`,
          params: [email, id],
        },
      ],
      { prepare: true },
    )

    return { id, email, passwordHash, role: "member", createdAt: now }
  },

  getByEmail: async (email: string): Promise<TUser | undefined> => {
    const lookup = await client.execute(
      `SELECT user_id FROM ${KEYSPACE}.users_by_email WHERE email = ?`,
      [email],
      { prepare: true },
    )

    if (lookup.rowLength === 0) return undefined

    const userId = lookup.first().user_id
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.users WHERE id = ?`,
      [userId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const row = result.first()
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      orgId: row.org_id ?? undefined,
      role: row.role,
      createdAt: row.created_at.toISOString(),
    }
  },

  setOrg: async (userId: string, orgId: string, role: "org-admin" | "member"): Promise<void> => {
    await client.execute(
      `UPDATE ${KEYSPACE}.users SET org_id = ?, role = ? WHERE id = ?`,
      [orgId, role, userId],
      { prepare: true },
    )
  },
})

export type TUserRepo = ReturnType<typeof createUserRepo>
