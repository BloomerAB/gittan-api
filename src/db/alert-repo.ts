import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export const createAlertRepo = (client: Client) => ({
  hasBeenSent: async (orgId: string, month: string, resource: string, threshold: number): Promise<boolean> => {
    const result = await client.execute(
      `SELECT sent_at FROM ${KEYSPACE}.usage_alerts WHERE org_id = ? AND month = ? AND resource = ? AND threshold = ?`,
      [orgId, month, resource, threshold],
      { prepare: true },
    )

    return result.rowLength > 0
  },

  markSent: async (orgId: string, month: string, resource: string, threshold: number): Promise<void> => {
    await client.execute(
      `INSERT INTO ${KEYSPACE}.usage_alerts (org_id, month, resource, threshold, sent_at) VALUES (?, ?, ?, ?, ?)`,
      [orgId, month, resource, threshold, new Date().toISOString()],
      { prepare: true },
    )
  },
})

export type TAlertRepo = ReturnType<typeof createAlertRepo>
