import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TOrg = {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type TCreateOrgInput = {
  readonly id: string
  readonly name: string
  readonly displayName: string
}

const rowToOrg = (row: Record<string, unknown>): TOrg => ({
  id: row.id as string,
  name: row.name as string,
  displayName: row.display_name as string,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
})

export const createOrgRepo = (client: Client) => ({
  create: async (input: TCreateOrgInput): Promise<TOrg> => {
    const now = new Date()

    const existing = await client.execute(
      `SELECT org_id FROM ${KEYSPACE}.orgs_by_name WHERE name = ?`,
      [input.name],
      { prepare: true },
    )

    if (existing.rowLength > 0) {
      throw new Error(`Organization "${input.name}" already exists`)
    }

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.orgs (id, name, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          params: [input.id, input.name, input.displayName, now, now],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.orgs_by_name (name, org_id) VALUES (?, ?)`,
          params: [input.name, input.id],
        },
      ],
      { prepare: true },
    )

    return {
      id: input.id,
      name: input.name,
      displayName: input.displayName,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  },

  getById: async (id: string): Promise<TOrg | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.orgs WHERE id = ?`,
      [id],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToOrg(result.first())
  },

  getByUserId: async (userId: string): Promise<TOrg[]> => {
    const userResult = await client.execute(
      `SELECT org_id FROM ${KEYSPACE}.users WHERE id = ?`,
      [userId],
      { prepare: true },
    )

    if (userResult.rowLength === 0) return []

    const orgId = userResult.first().org_id
    if (!orgId) return []

    const orgResult = await client.execute(
      `SELECT * FROM ${KEYSPACE}.orgs WHERE id = ?`,
      [orgId],
      { prepare: true },
    )

    if (orgResult.rowLength === 0) return []
    return [rowToOrg(orgResult.first())]
  },
})

export type TOrgRepo = ReturnType<typeof createOrgRepo>
