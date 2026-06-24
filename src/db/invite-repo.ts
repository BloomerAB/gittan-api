import { randomBytes } from "node:crypto"

import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TInvite = {
  readonly id: string
  readonly orgId: string
  readonly email: string
  readonly role: "owner" | "member"
  readonly token: string
  readonly invitedBy: string
  readonly createdAt: string
  readonly expiresAt: string
}

export type TCreateInviteInput = {
  readonly id: string
  readonly orgId: string
  readonly email: string
  readonly role: "owner" | "member"
  readonly invitedBy: string
  readonly expiresInDays?: number
}

const generateToken = (): string => randomBytes(32).toString("base64url")

const rowToInvite = (row: Record<string, unknown>): TInvite => ({
  id: row.id as string,
  orgId: row.org_id as string,
  email: row.email as string,
  role: (row.invite_role as TInvite["role"]) ?? "member",
  token: row.invite_token as string,
  invitedBy: row.invited_by as string,
  createdAt: (row.created_at as Date).toISOString(),
  expiresAt: (row.expires_at as Date).toISOString(),
})

export const createInviteRepo = (client: Client) => ({
  create: async (input: TCreateInviteInput): Promise<TInvite> => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000)
    const token = generateToken()

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.org_invites (id, org_id, email, invite_role, invite_token, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [input.id, input.orgId, input.email, input.role, token, input.invitedBy, now, expiresAt],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.invites_by_token (invite_token, invite_id, org_id) VALUES (?, ?, ?)`,
          params: [token, input.id, input.orgId],
        },
      ],
      { prepare: true },
    )

    return {
      id: input.id,
      orgId: input.orgId,
      email: input.email,
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }
  },

  getByOrg: async (orgId: string): Promise<TInvite[]> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_invites WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    return result.rows
      .map((row) => rowToInvite(row))
      .filter((invite) => new Date(invite.expiresAt) > new Date())
  },

  getByToken: async (token: string): Promise<TInvite | undefined> => {
    const lookup = await client.execute(
      `SELECT invite_id, org_id FROM ${KEYSPACE}.invites_by_token WHERE invite_token = ?`,
      [token],
      { prepare: true },
    )

    if (lookup.rowLength === 0) return undefined

    const row = lookup.first()
    const invite_id = row.invite_id as string
    const org_id = row.org_id as string

    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_invites WHERE org_id = ? AND id = ?`,
      [org_id, invite_id],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const invite = rowToInvite(result.first())
    if (new Date(invite.expiresAt) <= new Date()) return undefined

    return invite
  },

  delete: async (orgId: string, id: string): Promise<void> => {
    const result = await client.execute(
      `SELECT invite_token FROM ${KEYSPACE}.org_invites WHERE org_id = ? AND id = ?`,
      [orgId, id],
      { prepare: true },
    )

    const token = result.rowLength > 0 ? (result.first().invite_token as string) : undefined

    const queries = [
      {
        query: `DELETE FROM ${KEYSPACE}.org_invites WHERE org_id = ? AND id = ?`,
        params: [orgId, id],
      },
    ]

    if (token) {
      queries.push({
        query: `DELETE FROM ${KEYSPACE}.invites_by_token WHERE invite_token = ?`,
        params: [token],
      })
    }

    await client.batch(queries, { prepare: true })
  },
})

export type TInviteRepo = ReturnType<typeof createInviteRepo>
