import { Client } from "cassandra-driver"

import { KEYSPACE, CREATE_KEYSPACE, CREATE_TABLES } from "../../src/db/schema.js"

export const TEST_SCYLLA_HOST = "localhost:9043"

export const setupTestDb = async (): Promise<Client> => {
  const systemClient = new Client({
    contactPoints: [TEST_SCYLLA_HOST],
    localDataCenter: "datacenter1",
  })

  await systemClient.execute(CREATE_KEYSPACE)
  for (const table of CREATE_TABLES) {
    await systemClient.execute(table)
  }
  await systemClient.shutdown()

  const client = new Client({
    contactPoints: [TEST_SCYLLA_HOST],
    localDataCenter: "datacenter1",
    keyspace: KEYSPACE,
  })

  return client
}

export const cleanupTestDb = async (client: Client): Promise<void> => {
  const tables = [
    "teams",
    "teams_by_name",
    "team_members",
    "orgs",
    "orgs_by_name",
    "repos",
    "repos_by_team",
    "pipeline_runs",
    "pipeline_runs_by_team",
  ]

  for (const table of tables) {
    await client.execute(`TRUNCATE ${KEYSPACE}.${table}`)
  }
}
