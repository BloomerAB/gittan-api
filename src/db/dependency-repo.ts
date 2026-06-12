import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TRepoDependency = {
  readonly repoId: string
  readonly dependsOnRepoId: string
  readonly dependsOnRepoName: string
  readonly cascade: boolean
  readonly contractTest: boolean
  readonly createdAt: string
}

export type TRepoDependent = {
  readonly dependsOnRepoId: string
  readonly dependentRepoId: string
  readonly dependentRepoName: string
  readonly cascade: boolean
  readonly contractTest: boolean
}

export type TRegisterDependencyInput = {
  readonly repoId: string
  readonly repoName: string
  readonly dependsOnRepoId: string
  readonly dependsOnRepoName: string
  readonly cascade: boolean
  readonly contractTest: boolean
}

export const createDependencyRepo = (client: Client) => ({
  register: async (input: TRegisterDependencyInput): Promise<void> => {
    const now = new Date().toISOString()

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.repo_dependencies
                  (repo_id, depends_on_repo_id, depends_on_repo_name, cascade, contract_test, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
          params: [
            input.repoId, input.dependsOnRepoId, input.dependsOnRepoName,
            input.cascade, input.contractTest, now,
          ],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.repo_dependents
                  (depends_on_repo_id, dependent_repo_id, dependent_repo_name, cascade, contract_test)
                  VALUES (?, ?, ?, ?, ?)`,
          params: [
            input.dependsOnRepoId, input.repoId, input.repoName,
            input.cascade, input.contractTest,
          ],
        },
      ],
      { prepare: true },
    )
  },

  getDependencies: async (repoId: string): Promise<ReadonlyArray<TRepoDependency>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.repo_dependencies WHERE repo_id = ?`,
      [repoId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      repoId: row.repo_id,
      dependsOnRepoId: row.depends_on_repo_id,
      dependsOnRepoName: row.depends_on_repo_name,
      cascade: row.cascade,
      contractTest: row.contract_test,
      createdAt: row.created_at.toISOString(),
    }))
  },

  getDependents: async (repoId: string): Promise<ReadonlyArray<TRepoDependent>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.repo_dependents WHERE depends_on_repo_id = ?`,
      [repoId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      dependsOnRepoId: row.depends_on_repo_id,
      dependentRepoId: row.dependent_repo_id,
      dependentRepoName: row.dependent_repo_name,
      cascade: row.cascade,
      contractTest: row.contract_test,
    }))
  },

  removeDependencies: async (repoId: string): Promise<void> => {
    const existing = await client.execute(
      `SELECT depends_on_repo_id FROM ${KEYSPACE}.repo_dependencies WHERE repo_id = ?`,
      [repoId],
      { prepare: true },
    )

    const batch = existing.rows.flatMap((row) => [
      {
        query: `DELETE FROM ${KEYSPACE}.repo_dependencies WHERE repo_id = ? AND depends_on_repo_id = ?`,
        params: [repoId, row.depends_on_repo_id],
      },
      {
        query: `DELETE FROM ${KEYSPACE}.repo_dependents WHERE depends_on_repo_id = ? AND dependent_repo_id = ?`,
        params: [row.depends_on_repo_id, repoId],
      },
    ])

    if (batch.length > 0) {
      await client.batch(batch, { prepare: true })
    }
  },
})

export type TDependencyRepo = ReturnType<typeof createDependencyRepo>
