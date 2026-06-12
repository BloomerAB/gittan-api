import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TRepoMetadata = {
  readonly id: string
  readonly orgId: string
  readonly teamId: string
  readonly name: string
  readonly forgejoFullName: string
  readonly cloneUrl: string
  readonly sshUrl: string
  readonly tags: ReadonlyArray<string>
  readonly gatedBranches: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
}

export type TCreateRepoMetadataInput = {
  readonly id: string
  readonly orgId: string
  readonly teamId: string
  readonly name: string
  readonly forgejoFullName: string
  readonly cloneUrl: string
  readonly sshUrl: string
  readonly tags?: ReadonlyArray<string>
  readonly gatedBranches?: ReadonlyArray<string>
}

export const createRepoMetadataRepo = (client: Client) => ({
  create: async (input: TCreateRepoMetadataInput): Promise<TRepoMetadata> => {
    const now = new Date().toISOString()
    const tags = input.tags ?? []
    const gatedBranches = input.gatedBranches ?? ["main"]

    await client.execute(
      `INSERT INTO ${KEYSPACE}.repos (
        id, org_id, team_id, name, forgejo_full_name, clone_url, ssh_url,
        tags, gated_branches, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id, input.orgId, input.teamId, input.name,
        input.forgejoFullName, input.cloneUrl, input.sshUrl,
        tags, gatedBranches, now, now,
      ],
      { prepare: true },
    )

    return {
      id: input.id,
      orgId: input.orgId,
      teamId: input.teamId,
      name: input.name,
      forgejoFullName: input.forgejoFullName,
      cloneUrl: input.cloneUrl,
      sshUrl: input.sshUrl,
      tags,
      gatedBranches,
      createdAt: now,
      updatedAt: now,
    }
  },

  getById: async (orgId: string, repoId: string): Promise<TRepoMetadata | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.repos WHERE org_id = ? AND id = ?`,
      [orgId, repoId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToRepo(result.first())
  },

  listByTeam: async (teamId: string): Promise<ReadonlyArray<TRepoMetadata>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.repos_by_team WHERE team_id = ?`,
      [teamId],
      { prepare: true },
    )

    return result.rows.map(rowToRepo)
  },
})

const rowToRepo = (row: Record<string, unknown>): TRepoMetadata => ({
  id: row.id as string,
  orgId: row.org_id as string,
  teamId: row.team_id as string,
  name: row.name as string,
  forgejoFullName: row.forgejo_full_name as string,
  cloneUrl: row.clone_url as string,
  sshUrl: row.ssh_url as string,
  tags: (row.tags as string[]) ?? [],
  gatedBranches: (row.gated_branches as string[]) ?? ["main"],
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
})

export type TRepoMetadataRepo = ReturnType<typeof createRepoMetadataRepo>
