import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TPipelineRunRow = {
  readonly id: string
  readonly repoId: string
  readonly pushEventId: string
  readonly orgId: string
  readonly teamId: string
  readonly branch: string
  readonly status: string
  readonly steps: ReadonlyArray<TPipelineStepRow>
  readonly startedAt: string
  readonly finishedAt: string
  readonly resolvedFrom?: string
}

export type TPipelineStepRow = {
  readonly stepName: string
  readonly status: string
  readonly durationMs: number
  readonly source?: string
  readonly exitCode?: number
  readonly output?: string
  readonly error?: string
}

export type TPipelineRunSummary = {
  readonly runId: string
  readonly repoId: string
  readonly branch: string
  readonly status: string
  readonly startedAt: string
}

const rowToRun = (row: Record<string, unknown>): TPipelineRunRow => ({
  id: row.id as string,
  repoId: row.repo_id as string,
  pushEventId: row.push_event_id as string,
  orgId: row.org_id as string,
  teamId: row.team_id as string,
  branch: row.branch as string,
  status: row.status as string,
  steps: JSON.parse((row.steps as string) || "[]") as ReadonlyArray<TPipelineStepRow>,
  startedAt: (row.started_at as Date).toISOString(),
  finishedAt: (row.finished_at as Date).toISOString(),
  resolvedFrom: (row.resolved_from as string) ?? undefined,
})

const rowToSummary = (row: Record<string, unknown>): TPipelineRunSummary => ({
  runId: row.run_id as string,
  repoId: row.repo_id as string,
  branch: row.branch as string,
  status: row.status as string,
  startedAt: (row.started_at as Date).toISOString(),
})

export const createPipelineRepo = (client: Client) => ({
  save: async (run: TPipelineRunRow): Promise<void> => {
    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.pipeline_runs (id, repo_id, push_event_id, org_id, team_id, branch, status, steps, started_at, finished_at, resolved_from)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            run.id,
            run.repoId,
            run.pushEventId,
            run.orgId,
            run.teamId,
            run.branch,
            run.status,
            JSON.stringify(run.steps),
            run.startedAt,
            run.finishedAt,
            run.resolvedFrom ?? null,
          ],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.pipeline_runs_by_team (team_id, started_at, run_id, repo_id, branch, status)
                  VALUES (?, ?, ?, ?, ?, ?)`,
          params: [
            run.teamId,
            run.startedAt,
            run.id,
            run.repoId,
            run.branch,
            run.status,
          ],
        },
      ],
      { prepare: true },
    )
  },

  listByRepo: async (repoId: string, limit: number = 20): Promise<ReadonlyArray<TPipelineRunRow>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.pipeline_runs WHERE repo_id = ? LIMIT ?`,
      [repoId, limit],
      { prepare: true },
    )

    return result.rows.map(rowToRun)
  },

  getById: async (repoId: string, runId: string): Promise<TPipelineRunRow | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.pipeline_runs WHERE repo_id = ? AND id = ?`,
      [repoId, runId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToRun(result.first())
  },

  listByTeam: async (teamId: string, limit: number = 50): Promise<ReadonlyArray<TPipelineRunSummary>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.pipeline_runs_by_team WHERE team_id = ? LIMIT ?`,
      [teamId, limit],
      { prepare: true },
    )

    return result.rows.map(rowToSummary)
  },
})

export type TPipelineRepo = ReturnType<typeof createPipelineRepo>
