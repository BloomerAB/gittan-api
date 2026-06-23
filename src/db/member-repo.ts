import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TOrgMembership = {
  readonly orgId: string
  readonly userId: string
  readonly role: "owner" | "admin" | "member"
  readonly joinedAt: string
}

export const createMemberRepo = (client: Client) => ({
  addMember: async (orgId: string, userId: string, role: string): Promise<TOrgMembership> => {
    const now = new Date()

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.org_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
          params: [orgId, userId, role, now],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.user_orgs (user_id, org_id, role, joined_at) VALUES (?, ?, ?, ?)`,
          params: [userId, orgId, role, now],
        },
      ],
      { prepare: true },
    )

    return {
      orgId,
      userId,
      role: role as TOrgMembership["role"],
      joinedAt: now.toISOString(),
    }
  },

  removeMember: async (orgId: string, userId: string): Promise<void> => {
    await client.batch(
      [
        {
          query: `DELETE FROM ${KEYSPACE}.org_members WHERE org_id = ? AND user_id = ?`,
          params: [orgId, userId],
        },
        {
          query: `DELETE FROM ${KEYSPACE}.user_orgs WHERE user_id = ? AND org_id = ?`,
          params: [userId, orgId],
        },
      ],
      { prepare: true },
    )
  },

  getMembers: async (orgId: string): Promise<TOrgMembership[]> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_members WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      orgId: row.org_id as string,
      userId: row.user_id as string,
      role: (row.role as TOrgMembership["role"]) ?? "member",
      joinedAt: (row.joined_at as Date).toISOString(),
    }))
  },

  getUserOrgIds: async (userId: string): Promise<Array<{ orgId: string; role: string }>> => {
    const result = await client.execute(
      `SELECT org_id, role FROM ${KEYSPACE}.user_orgs WHERE user_id = ?`,
      [userId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      orgId: row.org_id as string,
      role: (row.role as string) ?? "member",
    }))
  },

  getMembership: async (orgId: string, userId: string): Promise<TOrgMembership | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_members WHERE org_id = ? AND user_id = ?`,
      [orgId, userId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const row = result.first()
    return {
      orgId: row.org_id as string,
      userId: row.user_id as string,
      role: (row.role as TOrgMembership["role"]) ?? "member",
      joinedAt: (row.joined_at as Date).toISOString(),
    }
  },
})

export type TMemberRepo = ReturnType<typeof createMemberRepo>
