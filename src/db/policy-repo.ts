import { randomUUID } from "node:crypto"
import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TPolicyStep = {
  readonly position: "before" | "after"
  readonly name: string
  readonly use: string
}

export type TPolicy = {
  readonly orgId: string
  readonly id: string
  readonly name: string
  readonly description: string
  readonly matchFiles?: string
  readonly matchTeam?: string
  readonly matchName?: string
  readonly steps: ReadonlyArray<TPolicyStep>
  readonly createdAt: string
  readonly updatedAt: string
}

export type TCreatePolicyInput = {
  readonly orgId: string
  readonly name: string
  readonly description?: string
  readonly matchFiles?: string
  readonly matchTeam?: string
  readonly matchName?: string
  readonly steps?: ReadonlyArray<TPolicyStep>
}

const rowToPolicy = (row: Record<string, unknown>): TPolicy => ({
  orgId: row.org_id as string,
  id: row.id as string,
  name: row.name as string,
  description: (row.description as string | null) ?? "",
  matchFiles: (row.match_files as string | null) ?? undefined,
  matchTeam: (row.match_team as string | null) ?? undefined,
  matchName: (row.match_name as string | null) ?? undefined,
  steps: JSON.parse((row.steps as string | null) ?? "[]") as ReadonlyArray<TPolicyStep>,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
})

export const createPolicyRepo = (client: Client) => ({
  create: async (input: TCreatePolicyInput): Promise<TPolicy> => {
    const id = randomUUID()
    const now = new Date()
    const steps = JSON.stringify(input.steps ?? [])
    const description = input.description ?? ""

    await client.execute(
      `INSERT INTO ${KEYSPACE}.org_policies
       (org_id, id, name, description, match_files, match_team, match_name, steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orgId,
        id,
        input.name,
        description,
        input.matchFiles ?? null,
        input.matchTeam ?? null,
        input.matchName ?? null,
        steps,
        now,
        now,
      ],
      { prepare: true },
    )

    return {
      orgId: input.orgId,
      id,
      name: input.name,
      description,
      matchFiles: input.matchFiles,
      matchTeam: input.matchTeam,
      matchName: input.matchName,
      steps: input.steps ?? [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  },

  list: async (orgId: string): Promise<ReadonlyArray<TPolicy>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_policies WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    return result.rows.map((row) => rowToPolicy(row as Record<string, unknown>))
  },

  get: async (orgId: string, id: string): Promise<TPolicy | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_policies WHERE org_id = ? AND id = ?`,
      [orgId, id],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToPolicy(result.first() as Record<string, unknown>)
  },

  remove: async (orgId: string, id: string): Promise<void> => {
    await client.execute(
      `DELETE FROM ${KEYSPACE}.org_policies WHERE org_id = ? AND id = ?`,
      [orgId, id],
      { prepare: true },
    )
  },
})

export type TPolicyRepo = ReturnType<typeof createPolicyRepo>
