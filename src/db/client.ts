import { Client } from "cassandra-driver"

import type { TConfig } from "../config/index.js"
import { CREATE_KEYSPACE, CREATE_TABLES, MIGRATIONS } from "./schema.js"

export const createDbClient = (config: TConfig): Client =>
  new Client({
    contactPoints: config.scyllaHosts,
    localDataCenter: "datacenter1",
    keyspace: config.scyllaKeyspace,
  })

export const initializeSchema = async (config: TConfig): Promise<void> => {
  const systemClient = new Client({
    contactPoints: config.scyllaHosts,
    localDataCenter: "datacenter1",
  })

  try {
    await systemClient.execute(CREATE_KEYSPACE)
    for (const table of CREATE_TABLES) {
      await systemClient.execute(table)
    }
    for (const migration of MIGRATIONS) {
      await systemClient.execute(migration).catch(() => {})
    }
  } finally {
    await systemClient.shutdown()
  }
}
