import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TOrg = {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly oidcIssuer?: string
  readonly oidcClientId?: string
  readonly slackClientId?: string
  readonly slackClientSecret?: string
  readonly slackBotToken?: string
  readonly slackTeamName?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type TCreateOrgInput = {
  readonly id: string
  readonly name: string
  readonly displayName: string
}

export type TUpdateOrgInput = {
  readonly displayName?: string
  readonly oidcIssuer?: string | null
  readonly oidcClientId?: string | null
  readonly slackClientId?: string | null
  readonly slackClientSecret?: string | null
  readonly slackBotToken?: string | null
  readonly slackTeamName?: string | null
}

const rowToOrg = (row: Record<string, unknown>): TOrg => ({
  id: row.id as string,
  name: row.name as string,
  displayName: row.display_name as string,
  oidcIssuer: (row.oidc_issuer as string | null) ?? undefined,
  oidcClientId: (row.oidc_client_id as string | null) ?? undefined,
  slackClientId: (row.slack_client_id as string | null) ?? undefined,
  slackClientSecret: (row.slack_client_secret as string | null) ?? undefined,
  slackBotToken: (row.slack_bot_token as string | null) ?? undefined,
  slackTeamName: (row.slack_team_name as string | null) ?? undefined,
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

  update: async (id: string, input: TUpdateOrgInput): Promise<TOrg | undefined> => {
    const existing = await client.execute(
      `SELECT * FROM ${KEYSPACE}.orgs WHERE id = ?`,
      [id],
      { prepare: true },
    )

    if (existing.rowLength === 0) return undefined

    const row = existing.first()
    const now = new Date()

    const resolve = (field: string, inputVal: string | null | undefined) =>
      inputVal !== undefined ? inputVal : (row[field] as string | null) ?? null

    const displayName = input.displayName ?? (row.display_name as string)
    const oidcIssuer = resolve("oidc_issuer", input.oidcIssuer)
    const oidcClientId = resolve("oidc_client_id", input.oidcClientId)
    const slackClientId = resolve("slack_client_id", input.slackClientId)
    const slackClientSecret = resolve("slack_client_secret", input.slackClientSecret)
    const slackBotToken = resolve("slack_bot_token", input.slackBotToken)
    const slackTeamName = resolve("slack_team_name", input.slackTeamName)

    await client.execute(
      `UPDATE ${KEYSPACE}.orgs
       SET display_name = ?, oidc_issuer = ?, oidc_client_id = ?,
           slack_client_id = ?, slack_client_secret = ?, slack_bot_token = ?, slack_team_name = ?,
           updated_at = ?
       WHERE id = ?`,
      [displayName, oidcIssuer, oidcClientId, slackClientId, slackClientSecret, slackBotToken, slackTeamName, now, id],
      { prepare: true },
    )

    return {
      id,
      name: row.name as string,
      displayName,
      oidcIssuer: oidcIssuer ?? undefined,
      oidcClientId: oidcClientId ?? undefined,
      slackClientId: slackClientId ?? undefined,
      slackClientSecret: slackClientSecret ?? undefined,
      slackBotToken: slackBotToken ?? undefined,
      slackTeamName: slackTeamName ?? undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: now.toISOString(),
    }
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
