import type { Client } from "cassandra-driver"
import type { TTeam, TTeamMember, TTopology } from "@bloomerab/gittan-types"

import { KEYSPACE } from "./schema.js"

export type TCreateTeamInput = {
  readonly id: string
  readonly orgId: string
  readonly name: string
  readonly displayName: string
  readonly topology?: TTopology
  readonly slackChannel?: string
}

export type TAddMemberInput = {
  readonly teamId: string
  readonly userId: string
  readonly role: "team-admin" | "writer" | "reader"
  readonly addedBy: string
}

export const createTeamRepo = (client: Client) => ({
  createTeam: async (input: TCreateTeamInput): Promise<TTeam> => {
    const now = new Date().toISOString()

    const existing = await client.execute(
      `SELECT team_id FROM ${KEYSPACE}.teams_by_name WHERE org_id = ? AND name = ?`,
      [input.orgId, input.name],
      { prepare: true },
    )

    if (existing.rowLength > 0) {
      throw new Error(`Team "${input.name}" already exists in this org`)
    }

    const topology = input.topology ?? "stream-aligned"

    const batch = [
      {
        query: `INSERT INTO ${KEYSPACE}.teams (id, org_id, name, display_name, topology, slack_channel, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [input.id, input.orgId, input.name, input.displayName, topology, input.slackChannel ?? null, now, now],
      },
      {
        query: `INSERT INTO ${KEYSPACE}.teams_by_name (org_id, name, team_id, topology)
                VALUES (?, ?, ?, ?)`,
        params: [input.orgId, input.name, input.id, topology],
      },
    ]

    await client.batch(batch, { prepare: true })

    return {
      id: input.id,
      orgId: input.orgId,
      name: input.name,
      displayName: input.displayName,
      topology,
      slackChannel: input.slackChannel,
      createdAt: now,
      updatedAt: now,
    }
  },

  getTeam: async (orgId: string, teamId: string): Promise<TTeam | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.teams WHERE org_id = ? AND id = ?`,
      [orgId, teamId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const row = result.first()
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      displayName: row.display_name,
      topology: row.topology ?? "stream-aligned",
      slackChannel: row.slack_channel ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  },

  getTeamByName: async (orgId: string, name: string): Promise<TTeam | undefined> => {
    const lookup = await client.execute(
      `SELECT team_id FROM ${KEYSPACE}.teams_by_name WHERE org_id = ? AND name = ?`,
      [orgId, name],
      { prepare: true },
    )

    if (lookup.rowLength === 0) return undefined

    const teamId = lookup.first().team_id
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.teams WHERE org_id = ? AND id = ?`,
      [orgId, teamId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const row = result.first()
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      displayName: row.display_name,
      topology: row.topology ?? "stream-aligned",
      slackChannel: row.slack_channel ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  },

  listTeams: async (orgId: string): Promise<ReadonlyArray<TTeam>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.teams WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      displayName: row.display_name,
      topology: row.topology ?? "stream-aligned",
      slackChannel: row.slack_channel ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }))
  },

  addMember: async (input: TAddMemberInput): Promise<TTeamMember> => {
    const now = new Date().toISOString()

    await client.execute(
      `INSERT INTO ${KEYSPACE}.team_members (team_id, user_id, role, added_at, added_by)
       VALUES (?, ?, ?, ?, ?)`,
      [input.teamId, input.userId, input.role, now, input.addedBy],
      { prepare: true },
    )

    return {
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
      addedAt: now,
      addedBy: input.addedBy,
    }
  },

  listMembers: async (teamId: string): Promise<ReadonlyArray<TTeamMember>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.team_members WHERE team_id = ?`,
      [teamId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      teamId: row.team_id,
      userId: row.user_id,
      role: row.role as TTeamMember["role"],
      addedAt: row.added_at.toISOString(),
      addedBy: row.added_by,
    }))
  },

  removeMember: async (teamId: string, userId: string): Promise<void> => {
    await client.execute(
      `DELETE FROM ${KEYSPACE}.team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId],
      { prepare: true },
    )
  },
})

export type TTeamRepo = ReturnType<typeof createTeamRepo>
